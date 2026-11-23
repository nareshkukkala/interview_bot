"""InterviewIQ FastAPI application entry point.

Run from the backend/ folder:
    uvicorn app.main:app --reload --port 8000
Swagger UI: http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import APP_NAME, APP_VERSION, settings
from app.core.errors import AppError
from app.core.security import MAX_BODY_BYTES, SecurityMiddleware
from app.routes import evaluations, health, interviews
from app.services.gemini_service import install_log_redaction

logger = logging.getLogger("uvicorn.error")
install_log_redaction("uvicorn.error")  # the API key must never reach the log, even inside a traceback


def _configure_app_logging() -> None:
    """Shows the app's own INFO logs (one line per Gemini call: purpose, model, attempt, time) next to uvicorn's.
    Python hides INFO by default. Prompts and answers are never logged, and the API key is redacted."""
    app_logger = logging.getLogger("interviewiq")
    app_logger.setLevel(logging.INFO)
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
        app_logger.addHandler(handler)


_configure_app_logging()

DESCRIPTION = """
Mock-interview API. Typical flow:

1. `POST /api/interviews/start` → get a `session_id` and 5 questions
2. `POST /api/interviews/{session_id}/submit-answer` → store an answer (or skip)
3. `POST /api/interviews/{session_id}/evaluate` → score the answer
4. `GET /api/interviews/{session_id}/results` → final report

Sessions are stored **in memory** and are lost when the server restarts. Every error uses
`{"error": {"code", "message", "details"}}`.
"""

TAGS = [
    {"name": "health", "description": "Service status"},
    {"name": "interviews", "description": "Create interviews, store answers, fetch results"},
    {"name": "evaluations", "description": "Score submitted answers"},
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.ai_configured:
        logger.warning("GEMINI_API_KEY is not set in backend/.env: starting an interview and evaluating answers will return AI_NOT_CONFIGURED.")
    yield


app = FastAPI(title=APP_NAME, version=APP_VERSION, description=DESCRIPTION, openapi_tags=TAGS, lifespan=lifespan)

# Added before CORS so CORS stays outermost: a 413 for an allowed origin still carries the CORS headers the browser needs
app.add_middleware(SecurityMiddleware)

# CORS: only the React dev server (localhost and 127.0.0.1 variants) may call the API from a browser
_origins = {settings.frontend_origin, settings.frontend_origin.replace("localhost", "127.0.0.1")}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router, prefix="/api")
app.include_router(interviews.router, prefix="/api")
app.include_router(evaluations.router, prefix="/api")


def error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message, "details": details}})


@app.exception_handler(AppError)
async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for err in exc.errors():
        location = [str(part) for part in err["loc"] if part not in ("body", "query", "path")]
        message = str(err["msg"]).removeprefix("Value error, ")
        details.append({"field": ".".join(location) or "body", "message": message})
    return error_response(422, "VALIDATION_ERROR", "The request is invalid. Fix the listed fields and try again.", details)


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 413: "REQUEST_TOO_LARGE"}
    details = {"max_bytes": MAX_BODY_BYTES} if exc.status_code == 413 else None
    return error_response(exc.status_code, codes.get(exc.status_code, "HTTP_ERROR"), str(exc.detail), details)


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error", exc_info=exc)  # details stay in the server log, never in the response
    return error_response(500, "INTERNAL_ERROR", "Something went wrong on the server. Please try again.")
