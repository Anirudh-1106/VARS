"""Thin wrapper around the Groq chat API.

* ``json()`` returns a parsed dict using JSON mode, with a tolerant parser
  as a safety net.
* ``stream()`` yields text deltas for the resume chat.
* Every call walks an ordered list of models, so a retired or overloaded
  model degrades to the next one instead of breaking the app.

Prompts and responses are never logged.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Iterable, Iterator

from groq import Groq

import config

log = logging.getLogger("vars.llm")

_client: Groq | None = None
_dead_models: set[str] = set()


class LLMError(RuntimeError):
    """Raised when no configured model could answer."""


def client() -> Groq:
    global _client
    if _client is None:
        if not config.GROQ_API_KEY:
            raise LLMError("GROQ_API_KEY is not set. Add it to the .env file.")
        _client = Groq(api_key=config.GROQ_API_KEY, max_retries=2, timeout=90)
    return _client


def _model_kwargs(model: str, effort: str) -> dict:
    if model.startswith("openai/gpt-oss"):
        return {"reasoning_effort": effort}
    if model.startswith("qwen/"):
        return {"reasoning_format": "hidden"}
    return {}


def _is_model_gone(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(
        marker in text
        for marker in ("model_not_found", "decommissioned", "does not exist", "model_terms_required", "not supported")
    )


def _models(tier: str) -> list[str]:
    models = config.MODELS_SMART if tier == "smart" else config.MODELS_FAST
    alive = [m for m in models if m not in _dead_models]
    return alive or models


def parse_json(text: str) -> dict:
    """Parse the best JSON object out of model output."""
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.S).strip()
    try:
        value = json.loads(cleaned)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    best: dict | None = None
    idx = 0
    while idx < len(cleaned):
        if cleaned[idx] != "{":
            idx += 1
            continue
        try:
            obj, end = decoder.raw_decode(cleaned[idx:])
            if isinstance(obj, dict) and (best is None or len(obj) > len(best)):
                best = obj
            idx += max(end, 1)
        except json.JSONDecodeError:
            idx += 1
    if best is None:
        raise LLMError("The model returned an unreadable answer. Please try again.")
    return best


def json_call(
    system: str,
    user: str,
    *,
    tier: str = "smart",
    effort: str = "low",
    temperature: float = 0.3,
    max_tokens: int = 6000,
) -> dict:
    last_exc: Exception | None = None
    for model in _models(tier):
        try:
            response = client().chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={"type": "json_object"},
                temperature=temperature,
                max_completion_tokens=max_tokens,
                **_model_kwargs(model, effort),
            )
            return parse_json(response.choices[0].message.content or "")
        except LLMError as exc:
            last_exc = exc
            continue
        except Exception as exc:  # network, rate limit, retired model
            last_exc = exc
            if _is_model_gone(exc):
                _dead_models.add(model)
            log.warning("model %s failed: %s", model, type(exc).__name__)
            continue
    raise LLMError(_friendly(last_exc))


def stream(messages: list[dict], *, tier: str = "smart", effort: str = "low", temperature: float = 0.5) -> Iterator[str]:
    last_exc: Exception | None = None
    for model in _models(tier):
        try:
            chunks: Iterable = client().chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_completion_tokens=4000,
                stream=True,
                **_model_kwargs(model, effort),
            )
            started = False
            in_think = False
            for chunk in chunks:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if not delta:
                    continue
                # Strip any inline reasoning a model might emit.
                if "<think>" in delta:
                    in_think = True
                    delta = delta.split("<think>", 1)[0]
                if in_think:
                    if "</think>" in delta:
                        in_think = False
                        delta = delta.split("</think>", 1)[1]
                    else:
                        continue
                if delta:
                    started = True
                    yield delta
            if started:
                return
        except Exception as exc:
            last_exc = exc
            if _is_model_gone(exc):
                _dead_models.add(model)
            log.warning("stream model %s failed: %s", model, type(exc).__name__)
            continue
    raise LLMError(_friendly(last_exc))


def _friendly(exc: Exception | None) -> str:
    if exc is None:
        return "No language model is configured."
    text = str(exc).lower()
    if "rate" in text and "limit" in text:
        return "The AI service is busy (rate limit). Wait a few seconds and try again."
    if "api key" in text or "401" in text or "invalid_api_key" in text:
        return "The AI service rejected the API key. Check GROQ_API_KEY in .env."
    if "timed out" in text or "timeout" in text or "connect" in text:
        return "Could not reach the AI service. Check your internet connection."
    if isinstance(exc, LLMError):
        return str(exc)
    return "The AI service could not answer right now. Please try again."
