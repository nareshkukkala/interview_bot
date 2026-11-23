from fastapi import APIRouter

from app.schemas.common import ErrorResponse
from app.schemas.evaluation import EvaluationRequest, EvaluationResponse
from app.services import evaluation_service

router = APIRouter(prefix="/interviews", tags=["evaluations"])


@router.post(
    "/{session_id}/evaluate",
    response_model=EvaluationResponse,
    summary="Evaluate a submitted answer",
    responses={
        404: {"model": ErrorResponse, "description": "Session (or question) not found"},
        409: {"model": ErrorResponse, "description": "The question has no answer yet, or it was skipped"},
        413: {"model": ErrorResponse, "description": "Request body too large (REQUEST_TOO_LARGE)"},
        422: {"model": ErrorResponse, "description": "Invalid request, or the AI blocked the content (AI_CONTENT_BLOCKED)"},
        429: {"model": ErrorResponse, "description": "AI rate limit, or this interview's AI request budget is used up"},
        502: {"model": ErrorResponse, "description": "The AI returned unusable output (AI_BAD_RESPONSE)"},
        503: {"model": ErrorResponse, "description": "AI not configured, key rejected, or service unavailable (AI_*)"},
        504: {"model": ErrorResponse, "description": "The AI timed out (AI_TIMEOUT)"},
    },
)
async def evaluate_answer(session_id: str, request: EvaluationRequest) -> EvaluationResponse:
    """Has Gemini evaluate the submitted answer: accuracy, relevance, clarity and completeness out of 10 (the overall
    score is calculated by the backend), three strengths, three improvement areas, missing concepts, an ideal answer,
    a follow-up question and a recommended topic. The evaluation is stored.

    Calling it again for the same question returns the stored evaluation without another AI request.
    """
    return await evaluation_service.evaluate_question(session_id, request.question_number)
