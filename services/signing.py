"""Stateless signatures for exported reports and mock-drive links.

The server keeps nothing: it signs a canonical JSON payload with a secret key
and can later verify that the payload has not been edited. A placement cell
can therefore trust a report file a student hands over without VARS ever
storing that report.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json

import config


def canonical(payload) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign(payload, purpose: str) -> str:
    mac = hmac.new(config.SIGNING_KEY.encode(), purpose.encode() + b"|" + canonical(payload), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()[:24]).decode().rstrip("=")


def verify(payload, signature: str, purpose: str) -> bool:
    if not signature:
        return False
    return hmac.compare_digest(sign(payload, purpose), signature)


def encode_link(payload: dict) -> str:
    raw = canonical(payload)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_link(token: str) -> dict:
    padded = token + "=" * (-len(token) % 4)
    return json.loads(base64.urlsafe_b64decode(padded.encode()).decode("utf-8"))
