"""HTTP hardening for the API (pure ASGI middleware, no framework hooks).

- Request bodies larger than MAX_BODY_BYTES are refused with 413 *before* they are read into memory.
  The largest legitimate request is an answer of 2,000 characters (at most ~8 KB in UTF-8), so 64 KB is generous.
  A declared Content-Length is checked up front; a body sent without one (chunked) is counted as it arrives.
- Every response gets `X-Content-Type-Options: nosniff`, and API responses get `Cache-Control: no-store`
  (session data, answers and results must not be kept by browsers or proxies).
"""

from fastapi import HTTPException
from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import RequestTooLargeError

MAX_BODY_BYTES = 64 * 1024


def _too_large_response() -> JSONResponse:
    error = RequestTooLargeError(MAX_BODY_BYTES)
    return JSONResponse(
        status_code=error.status_code,
        content={"error": {"code": error.code, "message": error.message, "details": error.details}},
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"},
    )


class SecurityMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            await _too_large_response()(scope, receive, send)
            return

        received = 0

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > MAX_BODY_BYTES:  # chunked body without a Content-Length
                    # FastAPI turns any other exception raised while reading the body into a generic 400;
                    # an HTTPException passes through, and main.py renders it in the standard error shape
                    raise HTTPException(status_code=413, detail=RequestTooLargeError(MAX_BODY_BYTES).message)
            return message

        is_api = scope["path"].startswith("/api")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                if is_api:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, counting_receive, send_with_headers)
