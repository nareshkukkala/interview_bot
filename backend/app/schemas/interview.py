import unicodedata
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import Progress, SessionStatus
from app.schemas.evaluation import AnswerEvaluation

QUESTION_COUNT = 5  # fixed for the MVP (PRD BR-01)
ANSWER_MIN = 10
ANSWER_MAX = 2000

_NAME_PUNCTUATION = " .'’-"  # space, dot, apostrophe (straight and typographic) and hyphen


def is_valid_name(value: str) -> bool:
    """2-50 characters: starts with a letter, then letters (any script), combining marks, and . ' ’ - or space.
    Accepts names like José, Nguyễn, O’Neil and प्रिया; rejects digits, symbols and emoji."""
    if not 2 <= len(value) <= 50 or unicodedata.category(value[0])[0] != "L":
        return False
    return all(unicodedata.category(ch)[0] in ("L", "M") or ch in _NAME_PUNCTUATION for ch in value)


class JobRole(StrEnum):
    PYTHON_DEVELOPER = "python_developer"
    JAVA_DEVELOPER = "java_developer"
    FRONTEND_DEVELOPER = "frontend_developer"
    BACKEND_DEVELOPER = "backend_developer"
    FULL_STACK_DEVELOPER = "full_stack_developer"
    DATA_ANALYST = "data_analyst"
    ML_ENGINEER = "ml_engineer"


class ExperienceLevel(StrEnum):
    FRESHER = "fresher"
    ZERO_TO_ONE = "0_1_years"
    ONE_TO_THREE = "1_3_years"
    THREE_PLUS = "3_plus_years"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InterviewType(StrEnum):
    TECHNICAL = "technical"
    HR = "hr"
    MIXED = "mixed"


class QuestionCategory(StrEnum):
    TECHNICAL = "technical"
    HR = "hr"


class QuestionLevel(StrEnum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class QuestionStatus(StrEnum):
    UNANSWERED = "unanswered"
    ANSWERED = "answered"
    SKIPPED = "skipped"


class PerformanceLabel(StrEnum):
    NEEDS_IMPROVEMENT = "Needs improvement"
    AVERAGE = "Average"
    GOOD = "Good"
    EXCELLENT = "Excellent"


class InterviewRequest(BaseModel):
    """Candidate configuration used to start an interview."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    candidate_name: str = Field(examples=["Priya Sharma"])
    job_role: JobRole
    experience: ExperienceLevel
    difficulty: Difficulty
    interview_type: InterviewType
    question_count: int = Field(default=QUESTION_COUNT, examples=[QUESTION_COUNT])

    @field_validator("candidate_name")
    @classmethod
    def _check_name(cls, value: str) -> str:
        value = unicodedata.normalize("NFC", value)  # é typed as e + combining accent becomes one character
        if not is_valid_name(value):
            raise ValueError("Enter a name of 2–50 letters. Spaces, dots, apostrophes and hyphens are allowed.")
        return value

    @field_validator("question_count")
    @classmethod
    def _check_count(cls, value: int) -> int:
        if value != QUESTION_COUNT:
            raise ValueError(f"Interviews have exactly {QUESTION_COUNT} questions in this version.")
        return value


class InterviewQuestion(BaseModel):
    """A question as shown to the candidate (no model answer or keywords)."""

    number: int = Field(description="1-based position in the interview.")
    id: str
    text: str
    category: QuestionCategory
    level: QuestionLevel
    topic: str


class StartInterviewResponse(BaseModel):
    session_id: str
    config: InterviewRequest
    questions: list[InterviewQuestion]
    progress: Progress
    created_at: datetime


class AnswerSubmission(BaseModel):
    """Submit (or skip) the answer to one question."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    question_number: int = Field(strict=True, ge=1, examples=[1])
    answer: str | None = Field(default=None, examples=["Lists are mutable while tuples are immutable and hashable."])
    skipped: bool = Field(default=False, strict=True, description="Set true to skip the question; `answer` is then ignored.")

    @model_validator(mode="after")
    def _check_answer(self) -> "AnswerSubmission":
        if self.skipped:
            self.answer = None
            return self
        if not self.answer:
            raise ValueError("An answer is required unless skipped is true.")
        if len(self.answer) < ANSWER_MIN:
            raise ValueError(f"Answer must be at least {ANSWER_MIN} characters.")
        if len(self.answer) > ANSWER_MAX:
            raise ValueError(f"Answer cannot exceed {ANSWER_MAX:,} characters.")
        return self


class SubmitAnswerResponse(BaseModel):
    session_id: str
    question_number: int
    status: QuestionStatus
    progress: Progress
    next_question: InterviewQuestion | None = Field(
        description="The next question that is neither answered nor skipped, or null when none are left."
    )


class QuestionResult(BaseModel):
    number: int
    id: str
    text: str
    category: QuestionCategory
    level: QuestionLevel
    topic: str
    status: QuestionStatus
    answer: str | None
    score: float = Field(ge=0, le=10, description="Question score; 0 for skipped questions.")
    evaluation: AnswerEvaluation | None


class CriteriaAverages(BaseModel):
    technical_accuracy: float
    relevance: float
    clarity: float
    completeness: float


class SummaryError(BaseModel):
    """Why the AI summary is missing. The scores and feedback in the report are still real."""

    code: str
    message: str


class InterviewResult(BaseModel):
    """Final report for a completed interview."""

    session_id: str
    candidate_name: str
    job_role: JobRole
    experience: ExperienceLevel
    difficulty: Difficulty
    interview_type: InterviewType
    overall_score: int = Field(ge=0, le=100)
    performance_label: PerformanceLabel
    criteria_averages: CriteriaAverages
    strongest_skill: str | None = Field(
        default=None, description="Criterion with the highest average, or null when nothing was answered or all are equal."
    )
    weakest_skill: str | None = Field(default=None, description="Criterion with the lowest average (same rules).")
    answered_count: int
    skipped_count: int
    questions: list[QuestionResult]
    strengths: list[str]
    weaknesses: list[str]
    learning_recommendations: list[str]
    summary: str | None = Field(default=None, description="Gemini's concise summary, written from the stored evaluations.")
    summary_error: SummaryError | None = Field(default=None, description="Set when the summary could not be generated; retry with GET.")
    started_at: datetime
    completed_at: datetime
    duration_seconds: int
