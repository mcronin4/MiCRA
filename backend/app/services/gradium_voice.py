"""
Gradium voice helpers for MicrAI:
- Speech-to-text via websocket streaming API
- Text-to-speech via HTTP API
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any

import httpx
import websockets

logger = logging.getLogger(__name__)


class GradiumVoiceError(RuntimeError):
    """Raised when Gradium voice operations fail."""


def _require_api_key() -> str:
    key = (os.getenv("GRADIUM_API_KEY") or "").strip()
    if not key:
        raise GradiumVoiceError(
            "Missing GRADIUM_API_KEY. Set it in backend/.env to enable MicrAI voice."
        )
    return key


def infer_stt_input_format(content_type: str | None, filename: str | None) -> str:
    ctype = (content_type or "").lower()
    name = (filename or "").lower()
    if "wav" in ctype or name.endswith(".wav"):
        return "wav"
    if (
        "ogg" in ctype
        or "opus" in ctype
        or "webm" in ctype
        or name.endswith(".ogg")
        or name.endswith(".opus")
        or name.endswith(".webm")
    ):
        return "opus"
    return "wav"


def _parse_ws_payload(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    data = json.loads(raw)
    if not isinstance(data, dict):
        return {}
    return data


def _is_debug_enabled() -> bool:
    return (os.getenv("GRADIUM_STT_DEBUG") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


_TRANSCRIPT_TEXT_KEYS = (
    "text",
    "transcript",
    "utterance",
    "final_text",
    "final_transcript",
    "partial_text",
    "partial_transcript",
)
_TRANSCRIPT_CONTAINER_KEYS = (
    "result",
    "results",
    "data",
    "output",
    "outputs",
    "alternative",
    "alternatives",
    "segment",
    "segments",
    "item",
    "items",
    "message",
    "messages",
)
_TRANSCRIPT_MESSAGE_TYPES = {
    "text",
    "transcript",
    "partial",
    "final",
    "result",
    "segment",
    "hypothesis",
}
_CONTROL_MESSAGE_TYPES = {
    "ready",
    "setup",
    "audio",
    "step",
    "end_text",
    "end_of_stream",
    "start",
    "ping",
    "pong",
}
_CONTROL_TEXT_TOKENS = {
    "step",
    "end",
    "text",
    "ready",
    "setup",
    "audio",
    "stream",
    "of",
    "start",
    "done",
    "ok",
    "success",
}
_CONTROL_TEXT_EXACT = {
    "step",
    "stepstep",
    "endtext",
    "end_of_stream",
    "ready",
    "setup",
    "audio",
    "ok",
    "success",
}


def _collect_text_from_known_fields(value: Any, *, depth: int = 0) -> list[str]:
    """
    Collect text only from transcript-bearing fields.
    This intentionally avoids scanning arbitrary payload keys, which can include
    protocol control events (e.g., "step", "end_text").
    """
    if depth > 6:
        return []
    candidates: list[str] = []
    if isinstance(value, dict):
        for key in _TRANSCRIPT_TEXT_KEYS:
            field_value = value.get(key)
            if isinstance(field_value, str):
                candidates.append(field_value)
        for key in _TRANSCRIPT_CONTAINER_KEYS:
            if key in value:
                candidates.extend(
                    _collect_text_from_known_fields(value.get(key), depth=depth + 1)
                )
        return candidates
    if isinstance(value, list):
        for item in value:
            candidates.extend(_collect_text_from_known_fields(item, depth=depth + 1))
    return candidates


def _looks_like_control_text(text: str) -> bool:
    normalized = "".join(ch for ch in text.lower().strip() if ch.isalnum() or ch in {"_", " ", "-"})
    condensed = normalized.replace("-", "_").replace(" ", "_").strip("_")
    if not condensed:
        return True
    if condensed in _CONTROL_TEXT_EXACT:
        return True
    tokens = [tok for tok in condensed.split("_") if tok]
    return bool(tokens) and all(tok in _CONTROL_TEXT_TOKENS for tok in tokens)


def _extract_transcript_text(payload: dict[str, Any]) -> str:
    if not payload:
        return ""
    msg_type = str(payload.get("type") or "").strip().lower()
    if msg_type in _CONTROL_MESSAGE_TYPES:
        return ""

    candidates = _collect_text_from_known_fields(payload)
    if msg_type in _TRANSCRIPT_MESSAGE_TYPES and isinstance(payload.get("text"), str):
        candidates.append(str(payload.get("text")))
    if not candidates:
        return ""

    normalized: list[str] = []
    seen: set[str] = set()
    for text in candidates:
        cleaned = " ".join(str(text).split()).strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        if _looks_like_control_text(cleaned):
            continue
        seen.add(lowered)
        normalized.append(cleaned)

    if not normalized:
        return ""

    # Prefer richer hypotheses (more tokens, then longer text).
    return max(normalized, key=lambda item: (item.count(" "), len(item))).strip()


def _finalize_transcript(text_events: list[tuple[float, str]], fallback_events: list[str]) -> str:
    if text_events:
        text_events.sort(key=lambda item: item[0])
        ordered = [text for _, text in text_events if text]
        joined = " ".join(ordered).strip()
        longest = max(ordered, key=len).strip()
        # Gradium can return incremental full hypotheses; prefer the most complete one.
        if len(longest) >= int(len(joined) * 0.7):
            return longest
        return joined
    if fallback_events:
        return " ".join(fallback_events).strip()
    return ""


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    *,
    input_format: str = "wav",
    model_name: str | None = None,
) -> dict[str, Any]:
    if not audio_bytes:
        return {"text": "", "segments": 0}

    api_key = _require_api_key()
    ws_url = (
        os.getenv("GRADIUM_STT_WS_URL")
        or "wss://us.api.gradium.ai/api/speech/asr"
    )
    model = (model_name or os.getenv("GRADIUM_STT_MODEL") or "default").strip()
    chunk_size = int(os.getenv("GRADIUM_STT_CHUNK_BYTES") or "4096")

    setup_msg = {
        "type": "setup",
        "model_name": model,
        "input_format": input_format,
    }

    text_events: list[tuple[float, str]] = []
    fallback_events: list[str] = []
    debug = _is_debug_enabled()
    if debug:
        logger.info(
            "Gradium STT start | bytes=%s input_format=%s model=%s ws=%s",
            len(audio_bytes),
            input_format,
            model,
            ws_url,
        )

    try:
        async with websockets.connect(
            ws_url,
            additional_headers={"x-api-key": api_key},
            max_size=16 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=10,
        ) as ws:
            await ws.send(json.dumps(setup_msg))

            # Wait for setup ack (or immediate stream event).
            setup_ready = False
            for _ in range(6):
                raw = await asyncio.wait_for(ws.recv(), timeout=8)
                payload = _parse_ws_payload(raw)
                msg_type = str(payload.get("type") or "").lower()
                extracted = _extract_transcript_text(payload)
                if extracted:
                    text_events.append((float(len(text_events)), extracted))
                    fallback_events.append(extracted)
                if debug:
                    logger.info(
                        "Gradium STT setup msg | type=%s keys=%s extracted_len=%s",
                        msg_type or "<none>",
                        list(payload.keys()),
                        len(extracted),
                    )
                if msg_type == "error":
                    raise GradiumVoiceError(
                        f"Gradium STT setup error: {payload.get('message') or payload}"
                    )
                if msg_type == "ready":
                    setup_ready = True
                    break
                if extracted or msg_type in _TRANSCRIPT_MESSAGE_TYPES:
                    setup_ready = True
                    break
            if not setup_ready:
                raise GradiumVoiceError("Gradium STT did not acknowledge setup.")

            for idx in range(0, len(audio_bytes), chunk_size):
                chunk = audio_bytes[idx : idx + chunk_size]
                await ws.send(
                    json.dumps(
                        {
                            "type": "audio",
                            "audio": base64.b64encode(chunk).decode("ascii"),
                        }
                    )
                )

            await ws.send(json.dumps({"type": "end_of_stream"}))

            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=20)
                payload = _parse_ws_payload(raw)
                msg_type = str(payload.get("type") or "").lower()
                extracted = _extract_transcript_text(payload)
                if extracted:
                    start_s = payload.get("start_s")
                    try:
                        start = (
                            float(start_s)
                            if start_s is not None
                            else float(len(text_events))
                        )
                    except Exception:
                        start = float(len(text_events))
                    text_events.append((start, extracted))
                    fallback_events.append(extracted)
                if debug:
                    logger.info(
                        "Gradium STT stream msg | type=%s keys=%s extracted_len=%s",
                        msg_type or "<none>",
                        list(payload.keys()),
                        len(extracted),
                    )
                if msg_type == "error":
                    raise GradiumVoiceError(
                        f"Gradium STT stream error: {payload.get('message') or payload}"
                    )
                if msg_type == "end_of_stream":
                    break
    except GradiumVoiceError:
        raise
    except Exception as exc:
        raise GradiumVoiceError(f"Gradium STT request failed: {exc}") from exc

    text = _finalize_transcript(text_events, fallback_events)
    if debug:
        logger.info(
            "Gradium STT complete | segments=%s transcript_len=%s transcript_preview=%r",
            len(text_events),
            len(text),
            text[:120],
        )
    return {"text": text, "segments": len(text_events)}


async def synthesize_speech_bytes(
    *,
    text: str,
    voice_id: str | None = None,
    output_format: str = "wav",
    model_name: str | None = None,
) -> tuple[bytes, str]:
    cleaned = text.strip()
    if not cleaned:
        raise GradiumVoiceError("No text provided for TTS.")

    api_key = _require_api_key()
    url = (
        os.getenv("GRADIUM_TTS_URL")
        or "https://us.api.gradium.ai/api/post/speech/tts"
    )
    default_voice = (
        os.getenv("GRADIUM_TTS_VOICE_ID")
        or "YTpq7expH9539ERJ"
    )
    model = (model_name or os.getenv("GRADIUM_TTS_MODEL") or "default").strip()
    fmt = (output_format or os.getenv("GRADIUM_TTS_OUTPUT_FORMAT") or "wav").strip()

    payload: dict[str, Any] = {
        "text": cleaned,
        "voice_id": (voice_id or default_voice).strip(),
        "output_format": fmt,
        "only_audio": True,
        "model_name": model,
    }

    headers = {"x-api-key": api_key, "Content-Type": "application/json"}

    timeout = httpx.Timeout(90.0, connect=20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
    if response.status_code >= 400:
        detail = response.text[:500]
        raise GradiumVoiceError(
            f"Gradium TTS failed ({response.status_code}): {detail}"
        )
    media_type = response.headers.get("content-type") or "audio/wav"
    return response.content, media_type
