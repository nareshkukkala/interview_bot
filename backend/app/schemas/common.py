from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    """Shape of every error response (documented in Swagger)."""

    error: ErrorBody


class SessionStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Progress(BaseModel):
    total: int
    answered: int
    skipped: int
    evaluated: int
    pending_evaluation: int = Field(description="Answered but not evaluated yet.")
    remaining: int = Field(description="Questions that are neither answered nor skipped.")
    percent: int = Field(description="Share of questions answered or skipped, 0–100.")
    status: SessionStatus
