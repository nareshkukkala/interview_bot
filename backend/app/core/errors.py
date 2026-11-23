"""Application errors. Every error reaches the client in one shape:

    {"error": {"code": "SESSION_NOT_FOUND", "message": "...", "details": null}}

so the frontend can handle all failures in one place.
"""

from typing import Any


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str, *, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class RequestTooLargeError(AppError):
    status_code = 413
    code = "REQUEST_TOO_LARGE"

    def __init__(self, max_bytes: int) -> None:
        super().__init__(f"The request is too large. The limit is {max_bytes // 1024} KB.", details={"max_bytes": max_bytes})


class SessionNotFoundError(AppError):
    status_code = 404
    code = "SESSION_NOT_FOUND"

    def __init__(self, session_id: str) -> None:
        super().__init__(
            "Interview session not found. It may have expired or the server may have restarted. Start a new interview.",
            details={"session_id": session_id[:64]},  # never echo an arbitrarily long, attacker-chosen value back
        )


class QuestionNotFoundError(AppError):
    status_code = 404
    code = "QUESTION_NOT_FOUND"

    def __init__(self, number: int, total: int) -> None:
        super().__init__(
            f"Question {number} does not exist in this interview. Valid question numbers are 1 to {total}.",
            details={"question_number": number, "total_questions": total},
        )


class AnswerAlreadySubmittedError(AppError):
    status_code = 409
    code = "ANSWER_ALREADY_SUBMITTED"

    def __init__(self, number: int) -> None:
        super().__init__(
            f"Question {number} already has a submitted answer. Submitted answers cannot be changed.",
            details={"question_number": number},
        )


class InterviewCompletedError(AppError):
    status_code = 409
    code = "INTERVIEW_COMPLETED"

    def __init__(self) -> None:
        super().__init__("This interview is already completed and can no longer be changed. Fetch the results instead.")


class AnswerRequiredError(AppError):
    status_code = 409
    code = "ANSWER_REQUIRED"

    def __init__(self, number: int, session_id: str) -> None:
        super().__init__(
            f"Question {number} has no answer yet. Submit one with POST /api/interviews/{session_id}/submit-answer first.",
            details={"question_number": number},
        )


class QuestionSkippedError(AppError):
    status_code = 409
    code = "QUESTION_SKIPPED"

    def __init__(self, number: int) -> None:
        super().__init__(
            f"Question {number} was skipped, so there is nothing to evaluate. Submit an answer to it first.",
            details={"question_number": number},
        )


class ResultsNotReadyError(AppError):
    status_code = 409
    code = "RESULTS_NOT_READY"

    def __init__(self, unanswered: list[int], unevaluated: list[int]) -> None:
        parts = []
        if unanswered:
            parts.append(f"questions {unanswered} have no answer (submit an answer or mark them skipped)")
        if unevaluated:
            parts.append(f"questions {unevaluated} are not evaluated yet (call /evaluate)")
        super().__init__(
            "Results are not ready: " + " and ".join(parts) + ".",
            details={"unanswered": unanswered, "unevaluated": unevaluated},
        )




# ---------------------------------------------------------------------------------------------
# AI (Gemini) errors. Messages are safe to show to users and never contain credentials.
# ---------------------------------------------------------------------------------------------


class AIError(AppError):
    """Base class for failures of the AI service."""


class AINotConfiguredError(AIError):
    status_code = 503
    code = "AI_NOT_CONFIGURED"

    def __init__(self) -> None:
        super().__init__("The AI service is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend.")


class AIAuthError(AIError):
    status_code = 503
    code = "AI_AUTH_FAILED"

    def __init__(self) -> None:
        super().__init__(
            "The AI service rejected the API key. Check GEMINI_API_KEY in backend/.env "
            "(and that the Gemini API is enabled for it), then restart the backend."
        )


class AIModelNotFoundError(AIError):
    status_code = 503
    code = "AI_MODEL_NOT_FOUND"

    def __init__(self, model: str) -> None:
        super().__init__(f"The AI model '{model}' is not available. Check GEMINI_MODEL in backend/.env.", details={"model": model})


class AIRateLimitedError(AIError):
    status_code = 429
    code = "AI_RATE_LIMITED"

    def __init__(self) -> None:
        super().__init__("The AI service is receiving too many requests, or its quota is used up. Wait a minute and try again.")


class AITimeoutError(AIError):
    status_code = 504
    code = "AI_TIMEOUT"

    def __init__(self) -> None:
        super().__init__("The AI service took too long to respond. Please try again.")


class AIUnavailableError(AIError):
    status_code = 503
    code = "AI_UNAVAILABLE"

    def __init__(self) -> None:
        super().__init__("The AI service is temporarily unavailable or could not be reached. Please try again in a moment.")


class AIBadResponseError(AIError):
    status_code = 502
    code = "AI_BAD_RESPONSE"

    def __init__(self) -> None:
        super().__init__("The AI returned a response in an unexpected format. Please try again.")


class AIContentBlockedError(AIError):
    status_code = 422
    code = "AI_CONTENT_BLOCKED"

    def __init__(self) -> None:
        super().__init__("The AI service's safety filters blocked this content, so it could not be processed. Try rewording and submit again.")


class AIRequestRejectedError(AIError):
    status_code = 502
    code = "AI_REQUEST_REJECTED"

    def __init__(self) -> None:
        super().__init__("The AI service rejected the request. Check the backend log for details.")


class AICallLimitError(AIError):
    status_code = 429
    code = "AI_CALL_LIMIT_REACHED"

    def __init__(self, limit: int) -> None:
        super().__init__(
            f"This interview has used its limit of {limit} AI requests. Start a new interview to continue.", details={"limit": limit}
        )
