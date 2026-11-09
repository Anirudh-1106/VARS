"""Speech in and out, entirely in memory.

Speech-to-text
    ``transcribe(audio, mode)`` returns text plus timing segments used for
    delivery analytics (pace, pauses). Hosted Whisper is tried first; the
    local Whisper large-v3 pipeline is used when configured or as a fallback.
    Audio never touches the disk: ffmpeg decodes through pipes.

Text-to-speech
    ``tts_stream(text, persona)`` yields audio bytes for the interviewer's
    voice, walking the configured chain (hosted Orpheus, Edge neural voices).
    When every engine fails the caller tells the browser to use its own
    speech synthesis.
"""

from __future__ import annotations

import asyncio
import io
import logging
import queue
import re
import subprocess
import threading
import wave
from dataclasses import dataclass, field

import config
from services import llm

log = logging.getLogger("vars.speech")

# Whisper drops filler words unless the prompt shows them. Keeping them lets
# the report count "um", "uh" and friends honestly.
FILLER_PROMPT = "Umm, so, uh, I think, like, you know, I mean, basically, hmm, okay."


@dataclass
class Transcript:
    text: str
    duration: float = 0.0
    segments: list[dict] = field(default_factory=list)
    engine: str = ""

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "duration": round(self.duration, 2),
            "segments": self.segments,
            "engine": self.engine,
        }


class SpeechError(RuntimeError):
    pass


# ── Speech-to-text ────────────────────────────────────────────────────────────

def _as_dict(resp) -> dict:
    if hasattr(resp, "model_dump"):
        return resp.model_dump()
    if isinstance(resp, dict):
        return resp
    return {"text": getattr(resp, "text", "")}


def _hosted(audio: bytes, filename: str, mode: str) -> Transcript:
    client = llm.client()
    file = (filename or "audio.webm", audio)
    if mode == "translate":
        resp = client.audio.translations.create(
            file=file,
            model=config.STT_TRANSLATE_MODEL,
            response_format="verbose_json",
            prompt="Resume details: name, college, projects, internships, skills.",
            temperature=0,
        )
    else:
        resp = client.audio.transcriptions.create(
            file=file,
            model=config.STT_MODEL,
            language="en",
            response_format="verbose_json",
            prompt=FILLER_PROMPT,
            temperature=0,
        )
    data = _as_dict(resp)
    segments = [
        {"start": round(float(s.get("start", 0)), 2), "end": round(float(s.get("end", 0)), 2), "text": (s.get("text") or "").strip()}
        for s in (data.get("segments") or [])
        if isinstance(s, dict)
    ]
    duration = float(data.get("duration") or (segments[-1]["end"] if segments else 0))
    return Transcript(text=(data.get("text") or "").strip(), duration=duration, segments=segments, engine="hosted")


_local_pipe = None
_local_lock = threading.Lock()


def _decode_pcm(audio: bytes):
    import numpy as np

    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"],
        input=audio,
        capture_output=True,
        timeout=60,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise SpeechError("Could not decode the recording. Is ffmpeg installed?")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def _local(audio: bytes, mode: str) -> Transcript:
    global _local_pipe
    try:
        import torch
        from transformers import pipeline
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise SpeechError("Local Whisper is not installed (torch/transformers missing).") from exc

    with _local_lock:
        if _local_pipe is None:
            log.info("Loading local Whisper large-v3 (first use only)…")
            device = 0 if torch.cuda.is_available() else -1
            _local_pipe = pipeline(
                "automatic-speech-recognition",
                model="openai/whisper-large-v3",
                device=device,
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            )
        samples = _decode_pcm(audio)
        kwargs = {"task": "translate"} if mode == "translate" else {"task": "transcribe", "language": "en"}
        result = _local_pipe({"raw": samples, "sampling_rate": 16000}, return_timestamps=True, generate_kwargs=kwargs)

    chunks = result.get("chunks") or []
    segments = []
    for chunk in chunks:
        start, end = (chunk.get("timestamp") or (0, 0))
        segments.append({"start": round(float(start or 0), 2), "end": round(float(end or start or 0), 2), "text": (chunk.get("text") or "").strip()})
    return Transcript(text=(result.get("text") or "").strip(), duration=len(samples) / 16000, segments=segments, engine="local")


def transcribe(audio: bytes, filename: str = "audio.webm", mode: str = "transcribe") -> Transcript:
    if not audio:
        raise SpeechError("No audio was received.")
    backend = config.STT_BACKEND
    errors: list[str] = []
    order = ["local"] if backend == "local" else ["hosted"] if backend == "groq" else ["hosted", "local"]
    for engine in order:
        try:
            return _hosted(audio, filename, mode) if engine == "hosted" else _local(audio, mode)
        except Exception as exc:
            errors.append(f"{engine}: {type(exc).__name__}")
            log.warning("STT engine %s failed: %s", engine, type(exc).__name__)
    raise SpeechError("Speech recognition is unavailable right now. You can type your answer instead.")


# ── Delivery analytics ───────────────────────────────────────────────────────

FILLERS = [
    "um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mm",
    "you know", "i mean", "basically", "actually", "literally", "kind of", "sort of", "like i said",
]
_FILLER_RE = re.compile(r"\b(" + "|".join(re.escape(f) for f in sorted(FILLERS, key=len, reverse=True)) + r")\b", re.I)


def delivery_stats(transcript: Transcript) -> dict:
    words = re.findall(r"[A-Za-z0-9']+", transcript.text)
    count = len(words)
    fillers: dict[str, int] = {}
    for match in _FILLER_RE.finditer(transcript.text):
        key = match.group(1).lower()
        fillers[key] = fillers.get(key, 0) + 1

    speaking = transcript.duration
    pauses = []
    segs = transcript.segments
    for prev, cur in zip(segs, segs[1:]):
        gap = cur["start"] - prev["end"]
        if gap >= 2.0:
            pauses.append(round(gap, 1))
    lead_in = segs[0]["start"] if segs else 0.0
    wpm = round(count / (speaking / 60), 0) if speaking >= 3 else None
    return {
        "words": count,
        "seconds": round(speaking, 1),
        "wpm": wpm,
        "fillers": fillers,
        "filler_total": sum(fillers.values()),
        "long_pauses": pauses,
        "lead_in": round(lead_in, 1),
    }


# ── Text-to-speech ───────────────────────────────────────────────────────────

PERSONAS = {
    "meera": {"edge": "en-IN-NeerjaNeural", "orpheus": "diana", "rate": "-4%"},
    "arjun": {"edge": "en-IN-PrabhatNeural", "orpheus": "troy", "rate": "-4%"},
    "daniel": {"edge": "en-GB-RyanNeural", "orpheus": "daniel", "rate": "-6%"},
    "ava": {"edge": "en-US-AvaNeural", "orpheus": "hannah", "rate": "-6%"},
}

_disabled_tts: set[str] = set()


def _sentences(text: str, limit: int = 190) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    out: list[str] = []
    buf = ""
    for part in parts:
        if len(buf) + len(part) + 1 <= limit:
            buf = f"{buf} {part}".strip()
        else:
            if buf:
                out.append(buf)
            while len(part) > limit:
                cut = part.rfind(" ", 0, limit)
                cut = cut if cut > 40 else limit
                out.append(part[:cut])
                part = part[cut:].strip()
            buf = part
    if buf:
        out.append(buf)
    return out


def _orpheus(text: str, voice: str) -> tuple[bytes, str]:
    client = llm.client()
    frames = io.BytesIO()
    params = None
    for piece in _sentences(text):
        resp = client.audio.speech.create(model="canopylabs/orpheus-v1-english", voice=voice, input=piece, response_format="wav")
        data = resp.read()
        with wave.open(io.BytesIO(data)) as wav:
            if params is None:
                params = wav.getparams()
            frames.write(wav.readframes(wav.getnframes()))
    if params is None:
        raise SpeechError("empty")
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setparams(params)
        wav.writeframes(frames.getvalue())
    return out.getvalue(), "audio/wav"


def _edge_stream(text: str, voice: str, rate: str):
    import edge_tts

    q: queue.Queue = queue.Queue(maxsize=64)
    done = object()

    async def produce():
        comm = edge_tts.Communicate(text, voice, rate=rate)
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                q.put(chunk["data"])

    def runner():
        try:
            asyncio.run(produce())
        except Exception as exc:  # surfaced to the consumer
            q.put(exc)
        finally:
            q.put(done)

    threading.Thread(target=runner, daemon=True).start()

    first = q.get(timeout=20)
    if first is done:
        raise SpeechError("edge produced no audio")
    if isinstance(first, Exception):
        raise first

    def gen():
        yield first
        while True:
            item = q.get(timeout=30)
            if item is done:
                return
            if isinstance(item, Exception):
                return
            yield item

    return gen()


def _edge_marked(text: str, voice: str, rate: str) -> tuple[bytes, list[dict]]:
    import edge_tts

    async def run():
        comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
        audio = bytearray()
        words = []
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                audio.extend(chunk["data"])
            elif chunk.get("type") == "WordBoundary":
                # offsets and durations arrive in 100-nanosecond ticks
                words.append({
                    "w": str(chunk.get("text") or ""),
                    "t": round(chunk.get("offset", 0) / 1e7, 3),
                    "d": round(chunk.get("duration", 0) / 1e7, 3),
                })
        return bytes(audio), words

    audio, words = asyncio.run(run())
    if not audio:
        raise SpeechError("edge produced no audio")
    return audio, words


def tts_marked(text: str, persona: str = "meera") -> dict:
    """Audio plus word timings (for lip-sync). Word list is empty when the engine has none."""
    text = re.sub(r"\s+", " ", (text or "")).strip()[:1500]
    if not text:
        raise SpeechError("Nothing to say.")
    spec = PERSONAS.get(persona, PERSONAS["meera"])
    for engine in config.TTS_CHAIN:
        if engine in _disabled_tts:
            continue
        try:
            if engine == "orpheus":
                data, mime = _orpheus(text, spec["orpheus"])
                return {"mime": mime, "audio": data, "words": []}
            if engine == "edge":
                data, words = _edge_marked(text, spec["edge"], spec["rate"])
                return {"mime": "audio/mpeg", "audio": data, "words": words}
        except Exception as exc:
            message = str(exc).lower()
            if engine == "orpheus" and ("terms" in message or "not_found" in message or "decommissioned" in message or "permission" in message):
                _disabled_tts.add("orpheus")
            log.warning("TTS engine %s failed: %s", engine, type(exc).__name__)
    raise SpeechError("No neural voice is available; the browser voice will be used.")


def tts(text: str, persona: str = "meera"):
    """Return ``(mimetype, iterator_of_bytes)`` or raise SpeechError."""
    text = re.sub(r"\s+", " ", (text or "")).strip()[:1500]
    if not text:
        raise SpeechError("Nothing to say.")
    spec = PERSONAS.get(persona, PERSONAS["meera"])
    for engine in config.TTS_CHAIN:
        if engine in _disabled_tts:
            continue
        try:
            if engine == "orpheus":
                data, mime = _orpheus(text, spec["orpheus"])
                return mime, iter([data])
            if engine == "edge":
                return "audio/mpeg", _edge_stream(text, spec["edge"], spec["rate"])
        except Exception as exc:
            message = str(exc).lower()
            if engine == "orpheus" and ("terms" in message or "not_found" in message or "decommissioned" in message or "permission" in message):
                _disabled_tts.add("orpheus")
            log.warning("TTS engine %s failed: %s", engine, type(exc).__name__)
    raise SpeechError("No neural voice is available; the browser voice will be used.")
