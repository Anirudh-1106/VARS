"""Runtime configuration, read once from the environment.

Nothing in here points at a database or an upload folder: VARS keeps no
user data on the server. Every document, recording and transcript is
processed in memory for the duration of one request and then dropped.
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# Ordered fallbacks: if a hosted model is retired, the next one is tried.
MODELS_SMART = _list("VARS_MODELS_SMART", "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b")
MODELS_FAST = _list("VARS_MODELS_FAST", "openai/gpt-oss-20b,qwen/qwen3.8-27b,openai/gpt-oss-120b")

# Speech-to-text: "groq" (hosted Whisper), "local" (Whisper large-v3 on this
# machine's GPU/CPU), or "auto" (hosted first, local if hosted fails).
STT_BACKEND = os.environ.get("VARS_STT", "auto").lower()
STT_MODEL = os.environ.get("VARS_STT_MODEL", "whisper-large-v3-turbo")
STT_TRANSLATE_MODEL = os.environ.get("VARS_STT_TRANSLATE_MODEL", "whisper-large-v3")

# Text-to-speech chain for the interviewer's voice.
TTS_CHAIN = _list("VARS_TTS", "orpheus,edge")

# Server-side execution of Java / C++ (and Python as a fallback) for the
# coding round. Runs in throwaway temp folders with timeouts. Turn off on
# shared public hosting where you cannot trust submitted code.
NATIVE_RUNNERS = _flag("VARS_NATIVE_RUNNERS", True)

# Key used to sign exported reports and mock-drive links so a placement
# cell can verify them. Set it in .env to keep signatures valid across
# restarts; otherwise a random one is generated per process.
SIGNING_KEY = os.environ.get("VARS_SIGNING_KEY") or secrets.token_hex(32)
SIGNING_KEY_EPHEMERAL = "VARS_SIGNING_KEY" not in os.environ

MAX_UPLOAD_MB = int(os.environ.get("VARS_MAX_UPLOAD_MB", "12"))
DEBUG = _flag("VARS_DEBUG", False)
HOST = os.environ.get("VARS_HOST", "127.0.0.1")
PORT = int(os.environ.get("VARS_PORT", "5000"))
