"""Application settings loaded from backend/.env (secrets stay on the server)."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

APP_NAME = "InterviewIQ API"
APP_VERSION = "0.1.0"

_PLACEHOLDER_KEYS = {"", "your-gemini-api-key-here"}


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    gemini_timeout_seconds: int
    frontend_origin: str
    session_ttl_minutes: int
    max_sessions: int
    max_ai_calls_per_session: int

    @property
    def ai_configured(self) -> bool:
        return self.gemini_api_key not in _PLACEHOLDER_KEYS


def _load_settings() -> Settings:
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip(),
        gemini_timeout_seconds=int(os.getenv("GEMINI_TIMEOUT_SECONDS", "30")),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").strip(),
        session_ttl_minutes=int(os.getenv("SESSION_TTL_MINUTES", "120")),
        max_sessions=int(os.getenv("MAX_SESSIONS", "500")),
        max_ai_calls_per_session=int(os.getenv("MAX_AI_CALLS_PER_SESSION", "10")),
    )


settings = _load_settings()
