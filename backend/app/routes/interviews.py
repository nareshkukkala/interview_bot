from fastapi import APIRouter, status

from app.schemas.common import ErrorResponse
from app.schemas.interview import (
    AnswerSubmission,
    InterviewRequest,
    InterviewResult,
    StartInterviewResponse,
    SubmitAnswerResponse,
)
from app.services import interview_service

router = APIRouter(prefix="/interviews", tags=["interviews"])

_NOT_FOUND = {404: {"model": ErrorResponse, "description": "Session (or question) not found"}}


@router.post(
    "/start",
    response_model=StartInterviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start an interview",
    responses={
        413: {"model": ErrorResponse, "description": "Request body too large (REQUEST_TOO_LARGE)"},
        422: {"model": ErrorResponse, "description": "Invalid configuration"},
        429: {"model": ErrorResponse, "description": "AI rate limit or quota reached (AI_RATE_LIMITED)"},
        502: {"model": ErrorResponse, "description": "The AI returned unusable output (AI_BAD_RESPONSE)"},
        503: {"model": ErrorResponse, "description": "AI not configured, key rejected, or service unavailable (AI_*)"},
        504: {"model": ErrorResponse, "description": "The AI timed out (AI_TIMEOUT)"},
    },
)
async def start_interview(request: InterviewRequest) -> StartInterviewResponse:
    """Stores the candidate configuration, has Gemini write 5 relevant questions and returns the new `session_id`."""
    return await interview_service.start_interview(request)


@router.post(
    "/{session_id}/submit-answer",
    response_model=SubmitAnswerResponse,
    summary="Submit or skip an answer",
    responses={
        **_NOT_FOUND,
        409: {"model": ErrorResponse, "description": "Answer already submitted, or the interview is completed"},
        413: {"model": ErrorResponse, "description": "Request body too large (REQUEST_TOO_LARGE)"},
        422: {"model": ErrorResponse, "description": "Invalid or missing answer"},
    },
)
def submit_answer(session_id: str, submission: AnswerSubmission) -> SubmitAnswerResponse:
    """Stores the answer to one question and returns the updated progress and the next open question.

    Answers must be 10–2,000 characters. Set `skipped: true` to skip; a skipped question can be answered later.
    """
    return interview_service.submit_answer(session_id, submission)


@router.get(
    "/{session_id}/results",
    response_model=InterviewResult,
    summary="Get the interview results",
    responses={
        **_NOT_FOUND,
        409: {"model": ErrorResponse, "description": "Some questions are unanswered or not evaluated yet"},
        422: {"model": ErrorResponse, "description": "Invalid request"},
    },
)
async def get_results(session_id: str) -> InterviewResult:
    """Final report: overall score (out of 100, from the stored evaluations), the four criterion averages with the
    strongest and weakest skill, per-question scores and feedback, strengths, improvement areas, learning
    recommendations and a concise summary written by Gemini from those evaluations.

    Available once every question is either answered **and evaluated**, or skipped. The first successful call
    completes the interview; later calls return the same report. If the AI summary could not be generated the
    report is still returned (200) with `summary: null` and `summary_error`; call again to retry only the summary.
    """
    return await interview_service.get_results(session_id)
