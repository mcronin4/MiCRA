from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Optional, TypeVar

from dotenv import load_dotenv
from google import genai
from google.genai.errors import APIError, ClientError

# Load .env from the backend directory (parent of app/)
_backend_dir = Path(__file__).parent.parent.parent
_env_path = _backend_dir / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()

logger = logging.getLogger(__name__)

T = TypeVar("T")

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_ROTATION_MAX_WAIT_SECONDS = 60.0
DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 15.0
DAILY_QUOTA_COOLDOWN_SECONDS = 24 * 60 * 60
GEMINI_RATE_LIMIT_MESSAGE = "Gemini is temporarily rate-limited. Please try again in a minute."
GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE = (
    "All configured Gemini providers are temporarily rate-limited. Please try again in a minute."
)

_RETRY_DELAY_PATTERN = re.compile(
    r"(?:retry(?:ing)?(?: in)?|retryDelay['\": ]+)(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)?",
    re.IGNORECASE,
)
_DURATION_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)?", re.IGNORECASE)


@dataclass(frozen=True)
class GeminiApiKeySlot:
    slot_id: int
    env_name: str
    api_key: str


class GeminiRequestError(RuntimeError):
    """Sanitized Gemini error safe to surface to the UI."""


class GeminiConfigurationError(GeminiRequestError):
    """Raised when no Gemini API keys are configured."""


class GeminiProvidersExhaustedError(GeminiRequestError):
    """Raised when every configured Gemini provider is cooling down."""


def load_gemini_api_key_slots_from_env(
    environ: Optional[Dict[str, str]] = None,
) -> tuple[GeminiApiKeySlot, ...]:
    env = environ or os.environ
    slots: list[GeminiApiKeySlot] = []
    seen_keys: set[str] = set()

    for idx in range(1, 6):
        env_name = f"GEMINI_API_KEY_{idx}"
        raw_value = env.get(env_name, "")
        api_key = raw_value.strip()
        if not api_key or api_key in seen_keys:
            continue
        slots.append(GeminiApiKeySlot(slot_id=idx, env_name=env_name, api_key=api_key))
        seen_keys.add(api_key)

    if slots:
        return tuple(slots)

    legacy_key = (env.get("GEMINI_API_KEY") or "").strip()
    if legacy_key:
        return (GeminiApiKeySlot(slot_id=1, env_name="GEMINI_API_KEY", api_key=legacy_key),)

    return ()


def has_configured_gemini_api_keys() -> bool:
    return bool(load_gemini_api_key_slots_from_env())


def _parse_rotation_max_wait_seconds(raw_value: Optional[str]) -> float:
    if raw_value is None:
        return DEFAULT_ROTATION_MAX_WAIT_SECONDS
    try:
        parsed = float(raw_value)
    except (TypeError, ValueError):
        return DEFAULT_ROTATION_MAX_WAIT_SECONDS
    return max(0.0, parsed)


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _extract_retry_delay_seconds_from_text(text: str) -> float | None:
    if not text:
        return None

    match = _RETRY_DELAY_PATTERN.search(text)
    if not match:
        return None

    amount = float(match.group(1))
    unit = (match.group(2) or "s").lower()
    if unit == "ms":
        return max(amount / 1000.0, 0.0)
    return max(amount, 0.0)


def _extract_retry_delay_seconds_from_value(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return max(float(value), 0.0)

    if isinstance(value, str):
        text_value = value.strip()
        if not text_value:
            return None

        duration_match = _DURATION_PATTERN.fullmatch(text_value)
        if duration_match:
            amount = float(duration_match.group(1))
            unit = (duration_match.group(2) or "s").lower()
            if unit == "ms":
                return max(amount / 1000.0, 0.0)
            return max(amount, 0.0)

        try:
            return max(float(text_value), 0.0)
        except ValueError:
            return _extract_retry_delay_seconds_from_text(text_value)

    if isinstance(value, dict):
        for key, nested in value.items():
            lowered = str(key).lower()
            if lowered in {"retrydelay", "retry_delay", "retry-after", "retry_after"}:
                parsed = _extract_retry_delay_seconds_from_value(nested)
                if parsed is not None:
                    return parsed
        for nested in value.values():
            if not isinstance(nested, (dict, list, str)):
                continue
            parsed = _extract_retry_delay_seconds_from_value(nested)
            if parsed is not None:
                return parsed
        return None

    if isinstance(value, list):
        for item in value:
            if not isinstance(item, (dict, list, str)):
                continue
            parsed = _extract_retry_delay_seconds_from_value(item)
            if parsed is not None:
                return parsed

    return None


def _flatten_text_values(value: Any) -> list[str]:
    values: list[str] = []

    if value is None:
        return values

    if isinstance(value, dict):
        for key, nested in value.items():
            values.append(str(key))
            values.extend(_flatten_text_values(nested))
        return values

    if isinstance(value, list):
        for item in value:
            values.extend(_flatten_text_values(item))
        return values

    values.append(str(value))
    return values


def _looks_like_daily_quota_error(error: APIError) -> bool:
    haystack = " ".join(_flatten_text_values(getattr(error, "details", None))).lower()
    message = (getattr(error, "message", None) or "").lower()
    combined = f"{haystack} {message}"
    return any(
        token in combined
        for token in (
            "perday",
            "per day",
            "daily",
            "requestsperday",
            "rpd",
        )
    )


def _is_rate_limit_error(error: BaseException) -> bool:
    if isinstance(error, APIError):
        status = str(getattr(error, "status", "") or "").upper()
        message = (getattr(error, "message", None) or "").lower()
        details = " ".join(_flatten_text_values(getattr(error, "details", None))).lower()
        return (
            getattr(error, "code", None) == 429
            or status == "RESOURCE_EXHAUSTED"
            or "resource_exhausted" in details
            or "resource_exhausted" in message
            or "quota" in details
            or "quota" in message
        )

    lowered = str(error).lower()
    return "resource_exhausted" in lowered or "quota" in lowered


def _compute_rate_limit_cooldown_seconds(error: APIError) -> float:
    if _looks_like_daily_quota_error(error):
        return float(DAILY_QUOTA_COOLDOWN_SECONDS)

    retry_after = _extract_retry_delay_seconds_from_value(getattr(error, "details", None))
    if retry_after is None and getattr(error, "response", None) is not None:
        try:
            response_headers = getattr(error.response, "headers", {}) or {}
            retry_after = _extract_retry_delay_seconds_from_value(response_headers.get("Retry-After"))
        except Exception:
            retry_after = None

    if retry_after is None:
        retry_after = _extract_retry_delay_seconds_from_text(getattr(error, "message", None) or "")

    if retry_after is None:
        retry_after = DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS

    return max(retry_after, 0.0)


def _sanitize_gemini_error_message(error: BaseException) -> str:
    if isinstance(error, GeminiRequestError):
        return str(error)

    if isinstance(error, APIError):
        if _is_rate_limit_error(error):
            return GEMINI_RATE_LIMIT_MESSAGE

        message = _normalize_whitespace(getattr(error, "message", None) or "")
        if message:
            return message[:300]

        status = _normalize_whitespace(str(getattr(error, "status", "") or ""))
        if status:
            return f"Gemini request failed: {status}"

        return "Gemini request failed. Please try again."

    lowered = str(error).lower()
    if "resource_exhausted" in lowered or "quota" in lowered:
        return GEMINI_RATE_LIMIT_MESSAGE
    return _normalize_whitespace(str(error)) or "Gemini request failed. Please try again."


def format_exception_for_user(error: BaseException) -> str:
    if isinstance(error, (GeminiRequestError, APIError)) or _is_rate_limit_error(error):
        return _sanitize_gemini_error_message(error)

    return f"{type(error).__name__}: {error}"


class GeminiRotationManager:
    def __init__(
        self,
        slots: tuple[GeminiApiKeySlot, ...],
        *,
        max_wait_seconds: float = DEFAULT_ROTATION_MAX_WAIT_SECONDS,
        client_factory: Optional[Callable[[str], Any]] = None,
        time_fn: Optional[Callable[[], float]] = None,
        sleep_fn: Optional[Callable[[float], None]] = None,
    ) -> None:
        self._slots = slots
        self._max_wait_seconds = max(0.0, max_wait_seconds)
        self._client_factory = client_factory or (lambda api_key: genai.Client(api_key=api_key))
        self._time_fn = time_fn or time.monotonic
        self._sleep_fn = sleep_fn or time.sleep
        self._lock = threading.RLock()
        self._clients: dict[int, Any] = {}
        self._next_index_by_model: dict[str, int] = {}
        self._unavailable_until: dict[tuple[int, str], float] = {}

    @property
    def slots(self) -> tuple[GeminiApiKeySlot, ...]:
        return self._slots

    def execute(
        self,
        *,
        model: str,
        operation_name: str,
        request_fn: Callable[[Any], T],
    ) -> T:
        if not self._slots:
            raise GeminiConfigurationError(
                "No Gemini API keys configured. Set GEMINI_API_KEY_1 through GEMINI_API_KEY_5, or GEMINI_API_KEY for local fallback."
            )

        deadline = self._time_fn() + self._max_wait_seconds
        last_rate_limit_error: APIError | None = None

        while True:
            now = self._time_fn()
            selection = self._select_slot(model=model, now=now)
            if selection is None:
                remaining = deadline - now
                next_available = self._seconds_until_next_slot(model=model, now=now)
                if remaining <= 0 or next_available is None or next_available > remaining:
                    raise GeminiProvidersExhaustedError(GEMINI_ALL_PROVIDERS_RATE_LIMIT_MESSAGE) from last_rate_limit_error

                sleep_for = max(min(next_available, remaining), 0.05)
                logger.warning(
                    "All Gemini providers are cooling down for model %s; waiting %.2fs before retry.",
                    model,
                    sleep_for,
                )
                self._sleep_fn(sleep_for)
                continue

            slot = selection
            client = self._get_client(slot)

            try:
                return request_fn(client)
            except GeminiRequestError:
                raise
            except APIError as error:
                if _is_rate_limit_error(error):
                    cooldown_seconds = _compute_rate_limit_cooldown_seconds(error)
                    self._mark_slot_unavailable(slot=slot, model=model, cooldown_seconds=cooldown_seconds)
                    last_rate_limit_error = error
                    logger.warning(
                        "Gemini rate limit on slot %s for model %s during %s; cooldown %.2fs.",
                        slot.slot_id,
                        model,
                        operation_name,
                        cooldown_seconds,
                    )
                    continue

                logger.exception(
                    "Gemini request failed on slot %s for model %s during %s.",
                    slot.slot_id,
                    model,
                    operation_name,
                )
                raise GeminiRequestError(_sanitize_gemini_error_message(error)) from error

    def _get_client(self, slot: GeminiApiKeySlot) -> Any:
        with self._lock:
            client = self._clients.get(slot.slot_id)
            if client is None:
                client = self._client_factory(slot.api_key)
                self._clients[slot.slot_id] = client
            return client

    def _select_slot(self, *, model: str, now: float) -> GeminiApiKeySlot | None:
        with self._lock:
            slot_count = len(self._slots)
            start_index = self._next_index_by_model.get(model, 0) % slot_count

            for offset in range(slot_count):
                index = (start_index + offset) % slot_count
                slot = self._slots[index]
                unavailable_until = self._unavailable_until.get((slot.slot_id, model), 0.0)
                if unavailable_until > now:
                    continue
                self._next_index_by_model[model] = (index + 1) % slot_count
                return slot

            return None

    def _mark_slot_unavailable(
        self,
        *,
        slot: GeminiApiKeySlot,
        model: str,
        cooldown_seconds: float,
    ) -> None:
        with self._lock:
            unavailable_until = self._time_fn() + max(cooldown_seconds, 0.0)
            key = (slot.slot_id, model)
            self._unavailable_until[key] = max(unavailable_until, self._unavailable_until.get(key, 0.0))

    def _seconds_until_next_slot(self, *, model: str, now: float) -> float | None:
        with self._lock:
            waits = [
                unavailable_until - now
                for (slot_id, slot_model), unavailable_until in self._unavailable_until.items()
                if slot_model == model and unavailable_until > now and any(slot.slot_id == slot_id for slot in self._slots)
            ]
        if not waits:
            return None
        return max(min(waits), 0.0)


_rotation_manager_lock = threading.RLock()
_rotation_manager: GeminiRotationManager | None = None


def reset_gemini_rotation_manager() -> GeminiRotationManager:
    global _rotation_manager
    with _rotation_manager_lock:
        _rotation_manager = GeminiRotationManager(
            load_gemini_api_key_slots_from_env(),
            max_wait_seconds=_parse_rotation_max_wait_seconds(
                os.getenv("GEMINI_ROTATION_MAX_WAIT_SECONDS")
            ),
        )
        return _rotation_manager


def get_gemini_rotation_manager() -> GeminiRotationManager:
    global _rotation_manager
    with _rotation_manager_lock:
        if _rotation_manager is None:
            _rotation_manager = GeminiRotationManager(
                load_gemini_api_key_slots_from_env(),
                max_wait_seconds=_parse_rotation_max_wait_seconds(
                    os.getenv("GEMINI_ROTATION_MAX_WAIT_SECONDS")
                ),
            )
        return _rotation_manager


def run_with_gemini_client(
    *,
    model: str,
    operation_name: str,
    request_fn: Callable[[Any], T],
) -> T:
    return get_gemini_rotation_manager().execute(
        model=model,
        operation_name=operation_name,
        request_fn=request_fn,
    )


def generate_content_with_gemini(
    *,
    model: str,
    contents: Any,
    operation_name: str = "generate_content",
    **kwargs: Any,
) -> Any:
    return run_with_gemini_client(
        model=model,
        operation_name=operation_name,
        request_fn=lambda client: client.models.generate_content(
            model=model,
            contents=contents,
            **kwargs,
        ),
    )


def query_gemini(
    prompt: str,
    response_schema: Optional[Dict[str, Any]] = None,
    response_mime_type: Optional[str] = None,
    model: Optional[str] = None,
):
    """
    Query Gemini API with optional structured output support.

    Args:
        prompt: The prompt text
        response_schema: Optional JSON schema for structured output
        response_mime_type: Optional MIME type (for example "application/json")

    Returns:
        Generated text, or parsed JSON if schema is provided.
    """

    model_name = model or os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)

    def _request(client: Any) -> Any:
        if response_schema is not None:
            try:
                return client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    response_schema=response_schema,
                    response_mime_type=response_mime_type or "application/json",
                )
            except TypeError:
                json_prompt = (
                    f"{prompt}\n\nIMPORTANT: Output your response as valid JSON matching this schema: "
                    f"{json.dumps(response_schema)}"
                )
                return client.models.generate_content(
                    model=model_name,
                    contents=json_prompt,
                )

        return client.models.generate_content(
            model=model_name,
            contents=prompt,
        )

    response = run_with_gemini_client(
        model=model_name,
        operation_name="generate_content",
        request_fn=_request,
    )

    if response_schema is not None:
        response_text = response.text.strip()

        if response_text.startswith("```"):
            lines = response_text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            response_text = "\n".join(lines)

        try:
            parsed = json.loads(response_text)
            if isinstance(parsed, dict):
                return parsed
            return {"content": parsed}
        except json.JSONDecodeError:
            json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", response_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group())
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    pass

            return {"content": response_text}

    return response.text
