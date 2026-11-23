from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Progress


class EvaluationRequest(BaseModel):
    """Ask for the evaluation of one submitted answer."""

    model_config = ConfigDict(extra="forbid")

    question_number: int = Field(strict=True, ge=1, description="Number of the question to evaluate (1-based).", examples=[1])


class AnswerEvaluation(BaseModel):
    """The stored evaluation of one answer. Criteria are scored 0–10."""

    technical_accuracy: int = Field(ge=0, le=10, description="For HR questions: accuracy / appropriateness.")
    relevance: int = Field(ge=0, le=10)
    clarity: int = Field(ge=0, le=10)
    completeness: int = Field(ge=0, le=10)
    overall_score: float = Field(ge=0, le=10, description="Average of the four criteria, 1 decimal.")
    strengths: list[str] = Field(min_length=3, max_length=3, description="Three things the answer did well.")
    weaknesses: list[str] = Field(min_length=3, max_length=3, description="Three improvement areas.")
    missing_concepts: list[str] = Field(description="Important concepts the answer left out (may be empty).")
    improved_answer: str = Field(description="The ideal answer.")
    follow_up_question: str = Field(description="For practice only; not scored.")
    recommended_topic: str = Field(description="The most useful topic to study next.")
    evaluated_at: datetime


class EvaluationResponse(AnswerEvaluation):
    session_id: str
    question_number: int
    progress: Progress
