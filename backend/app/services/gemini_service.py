"""The only module that talks to Google Gemini (official `google-genai` SDK, async client).

`generate_structured` sends a prompt and asks Gemini for JSON in the shape of a Pydantic model
(`response_mime_type="application/json"` + `response_schema`). The reply is validated against that model
before it is returned, so callers only ever see well-formed data. Every failure becomes a typed
`AIError` (see core/errors.py) with a message that is safe to show: there is no fallback and no
made-up output.

Secrets: the API key is read from backend/.env, is never returned by any endpoint, and is redacted from
log output. Prompts (which contain candidate answers) are never logged.
"""

import asyncio
import logging
import re
import time
from collections.abc import Callable
from functools import lru_cache
from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.core.errors import (
    AIAuthError,
    AIBadResponseError,
    AIContentBlockedError,
    AIModelNotFoundError,
    AINotConfiguredError,
    AIRateLimitedError,
    AIRequestRejectedError,
    AITimeoutError,
    AIUnavailableError,
    AppError,
)

logger = logging.getLogger("interviewiq.gemini")

T = TypeVar("T", bound=BaseModel)

MAX_ATTEMPTS = 2  # one retry, for transient failures and unusable output only
RETRY_DELAY_SECONDS = 1.0
_RETRYABLE = (AITimeoutError, AIUnavailableError, AIBadResponseError)
_BLOCKED_FINISH_REASONS = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"}
_KEY_SHAPE = re.compile(r"AIza[0-9A-Za-z_\-]{20,}")
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


# --------------------------------------------------------------------------------- configuration


def is_configured() -> bool:
    return settings.ai_configured


def ensure_configured() -> None:
    if not settings.ai_configured:
        raise AINotConfiguredError()


@lru_cache(maxsize=1)
def get_client() -> genai.Client:
    """The Gemini client, created once on first use. `timeout` is in milliseconds."""
    ensure_configured()
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_seconds * 1000)),
    )


# --------------------------------------------------------------------------------- secrets


def redact(text: str) -> str:
    """Removes the configured API key (and anything shaped like a Google API key) from text."""
    key = settings.gemini_api_key
    if key and settings.ai_configured:
        text = text.replace(key, "[redacted]")
    return _KEY_SHAPE.sub("[redacted]", text)


class RedactSecretsFilter(logging.Filter):
    """Defence in depth: scrubs the API key from every record, including exception tracebacks."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = None
        if record.exc_info:
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
            record.exc_info = None
        return True


def install_log_redaction(*logger_names: str) -> None:
    for name in logger_names:
        target = logging.getLogger(name)
        if not any(isinstance(f, RedactSecretsFilter) for f in target.filters):
            target.addFilter(RedactSecretsFilter())


install_log_redaction("interviewiq.gemini")


# --------------------------------------------------------------------------------- the call


async def generate_structured(
    *,
    purpose: str,
    system_instruction: str,
    prompt: str,
    response_model: type[T],
    temperature: float,
    validator: Callable[[T], T] | None = None,
) -> T:
    """Asks Gemini for JSON matching `response_model` and returns the validated result.

    `validator` may raise ValueError for output that is well-formed but unusable (wrong number of
    questions, duplicates...): that is treated like any other bad response.
    Raises an AIError subclass on failure.
    """
    ensure_configured()
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        response_mime_type="application/json",
        response_schema=response_model,
    )

    error: AppError | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(model=settings.gemini_model, contents=prompt, config=config),
                timeout=settings.gemini_timeout_seconds + 5,  # outer guard in case the SDK's own timeout does not fire
            )
            result = _parse(response, response_model)
            if validator is not None:
                result = _apply_validator(validator, result, purpose)
        except AppError as known:
            error = known
        except Exception as exc:  # noqa: BLE001 - translated below; unknown errors are re-raised
            error = _translate(exc, purpose)
        else:
            logger.info("gemini %s ok: model=%s attempt=%d time=%.1fs", purpose, settings.gemini_model, attempt, time.perf_counter() - started)
            return result

        logger.warning(
            "gemini %s failed: code=%s attempt=%d/%d time=%.1fs", purpose, error.code, attempt, MAX_ATTEMPTS, time.perf_counter() - started
        )
        if attempt < MAX_ATTEMPTS and isinstance(error, _RETRYABLE):
            await asyncio.sleep(RETRY_DELAY_SECONDS)
            continue
        break

    assert error is not None
    raise error


# --------------------------------------------------------------------------------- reply handling


def _parse(response, response_model: type[T]) -> T:
    feedback = getattr(response, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        raise AIContentBlockedError()

    try:
        text = response.text
    except Exception:  # noqa: BLE001 - the SDK can raise when the reply has no usable text part
        text = None

    if not text or not text.strip():
        candidates = getattr(response, "candidates", None) or []
        reason = getattr(candidates[0], "finish_reason", None) if candidates else None
        if reason is not None and getattr(reason, "name", str(reason)) in _BLOCKED_FINISH_REASONS:
            raise AIContentBlockedError()
        logger.warning("gemini returned no text (finish_reason=%s)", getattr(reason, "name", reason))
        raise AIBadResponseError()

    text = text.strip()
    fenced = _FENCE.match(text)
    if fenced:
        text = fenced.group(1)

    try:
        return response_model.model_validate_json(text)
    except ValidationError as exc:
        # Log where and why it failed, never the content
        problems = [f"{'.'.join(str(p) for p in e['loc'])}:{e['type']}" for e in exc.errors()[:6]]
        logger.warning("gemini output failed validation against %s: %s", response_model.__name__, problems)
        raise AIBadResponseError() from exc


def _apply_validator(validator: Callable[[T], T], result: T, purpose: str) -> T:
    try:
        return validator(result)
    except ValueError as exc:
        logger.warning("gemini %s output rejected: %s", purpose, exc)
        raise AIBadResponseError() from exc


# --------------------------------------------------------------------------------- error mapping


_HTTP_LIBRARIES = {"httpx", "httpx2", "httpcore", "aiohttp"}


def _http_layer_failure(exc: Exception) -> str | None:
    """'timeout' or 'network' if `exc` comes from the SDK's HTTP layer, else None.

    Classified by module rather than by importing one library: the installed SDK ships its own
    `httpx2`, other releases use `httpx` or `aiohttp`, and its exceptions are not subclasses of each other.
    """
    classes = type(exc).__mro__
    if not any(cls.__module__.split(".")[0] in _HTTP_LIBRARIES for cls in classes):
        return None
    return "timeout" if any("Timeout" in cls.__name__ for cls in classes) else "network"


def _translate(exc: Exception, purpose: str) -> AppError:
    if isinstance(exc, TimeoutError):  # includes our own asyncio.wait_for guard
        return AITimeoutError()
    if isinstance(exc, errors.APIError):
        return _from_api_error(exc)
    failure = _http_layer_failure(exc)
    if failure == "timeout":
        return AITimeoutError()
    if failure == "network" or isinstance(exc, OSError):  # connection refused, DNS, TLS...
        logger.warning("gemini %s network error: %s", purpose, type(exc).__name__)
        return AIUnavailableError()
    logger.exception("gemini %s: unexpected %s", purpose, type(exc).__name__)
    raise exc  # a bug, not an AI failure: do not disguise it


def _from_api_error(exc: errors.APIError) -> AppError:
    code = int(getattr(exc, "code", 0) or 0)
    status = str(getattr(exc, "status", "") or "")
    message = redact(str(getattr(exc, "message", "") or ""))
    logger.warning("gemini API error: http=%s status=%s message=%s", code, status, message[:300])

    lowered = f"{status} {message}".lower()
    if "api key not valid" in lowered or "api_key_invalid" in lowered or code in (401, 403):
        if "location is not supported" in lowered:
            return AIRequestRejectedError()
        return AIAuthError()
    if code == 404 or status == "NOT_FOUND":
        return AIModelNotFoundError(settings.gemini_model)
    if code == 429 or status == "RESOURCE_EXHAUSTED":
        return AIRateLimitedError()
    if code in (408, 504) or status == "DEADLINE_EXCEEDED":
        return AITimeoutError()
    if code >= 500:
        return AIUnavailableError()
    return AIRequestRejectedError()
