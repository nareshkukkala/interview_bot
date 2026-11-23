"""Interview workflow: create a session (questions from Gemini), store answers, track progress, produce results."""

from app.core.errors import (
    AIError,
    AnswerAlreadySubmittedError,
    InterviewCompletedError,
    QuestionNotFoundError,
    ResultsNotReadyError,
)
from app.core.session_store import StoredQuestion, StoredSession, store, utcnow
from app.schemas.common import SessionStatus
from app.schemas.interview import (
    AnswerSubmission,
    InterviewRequest,
    InterviewResult,
    QuestionStatus,
    StartInterviewResponse,
    SubmitAnswerResponse,
    SummaryError,
)
from app.services import evaluation_service, gemini_service, question_service


async def start_interview(request: InterviewRequest) -> StartInterviewResponse:
    """Stores the candidate configuration, has Gemini write the questions and opens a new session.

    If question generation fails, nothing is stored and the error is returned to the client.
    """
    generated = await question_service.generate_questions(request)
    session = StoredSession(
        config=request,
        questions=[
            StoredQuestion(
                id=f"q{number}",  # unique within the interview
                number=number,
                text=q.text,
                category=q.category,
                level=q.difficulty,
                topic=q.topic,
                expected_concepts=list(q.expected_concepts),
                evaluation_criteria=list(q.evaluation_criteria),
            )
            for number, q in enumerate(generated, start=1)
        ],
        ai_calls=1,  # the question-generation request
    )
    store.create(session)
    return StartInterviewResponse(
        session_id=session.id,
        config=session.config,
        questions=[q.to_public() for q in session.questions],
        progress=session.progress(),
        created_at=session.created_at,
    )


def submit_answer(session_id: str, submission: AnswerSubmission) -> SubmitAnswerResponse:
    """Stores an answer (or a skip) for one question.

    - A submitted answer is final (409 if you submit again, PRD BR-10).
    - A skipped question can still be answered later; skipping it again is a no-op.
    """
    with store.lock:
        session = store.get(session_id)
        if session.status == SessionStatus.COMPLETED:
            raise InterviewCompletedError()

        question = session.question(submission.question_number)
        if question is None:
            raise QuestionNotFoundError(submission.question_number, len(session.questions))
        if question.status == QuestionStatus.ANSWERED:
            raise AnswerAlreadySubmittedError(question.number)

        if submission.skipped:
            question.skipped = True
        else:
            question.answer = submission.answer
            question.skipped = False
            question.answered_at = utcnow()
        store.touch(session)

        next_question = session.next_unresolved(after=question.number)  # searches from the question after this one
        return SubmitAnswerResponse(
            session_id=session.id,
            question_number=question.number,
            status=question.status,
            progress=session.progress(),
            next_question=next_question.to_public() if next_question else None,
        )


async def get_results(session_id: str) -> InterviewResult:
    """Returns the final report.

    The report itself (scores, skills, strengths, recommendations) is built once from the stored evaluations,
    when every question is answered+evaluated or skipped. A concise summary is then written by Gemini from
    those evaluations. If the summary cannot be generated the report is still returned, with `summary` null
    and `summary_error` saying why; calling this again retries only the summary. Nothing is made up.
    """
    with store.lock:
        session = store.get(session_id)
        if session.result is None:
            unanswered = [q.number for q in session.questions if not q.resolved]
            unevaluated = [q.number for q in session.questions if q.status == QuestionStatus.ANSWERED and q.evaluation is None]
            if unanswered or unevaluated:
                raise ResultsNotReadyError(unanswered, unevaluated)

            result = evaluation_service.build_result(session)
            session.result = result
            session.status = SessionStatus.COMPLETED
            session.completed_at = result.completed_at
            store.touch(session)

        has_evaluations = any(q.evaluation is not None for q in session.questions)
        if session.result.summary is not None or not has_evaluations:
            return session.result  # already summarised, or there is nothing to summarise (nothing was answered)

    # Same per-session lock as evaluations: concurrent requests make one Gemini call and share the result
    async with session.eval_lock:
        with store.lock:
            if session.result.summary is not None:
                return session.result
            try:
                gemini_service.ensure_configured()
                evaluation_service.reserve_ai_call(session)
            except AIError as error:
                session.result = session.result.model_copy(update={"summary_error": SummaryError(code=error.code, message=error.message)})
                return session.result
            snapshot, config = session.result, session.config

        try:
            update = {"summary": await evaluation_service.request_summary(config, snapshot), "summary_error": None}
        except AIError as error:
            update = {"summary_error": SummaryError(code=error.code, message=error.message)}

        with store.lock:
            session.result = session.result.model_copy(update=update)
            store.touch(session)
            return session.result
