"""Answer evaluation with Gemini, plus scoring and result building.

Gemini scores four criteria (0-10) and writes the feedback as structured JSON. The overall score is
calculated here, never taken from the model. If Gemini cannot evaluate an answer the error is returned:
nothing is scored from made-up feedback.

Scoring rules (PRD BR-04 – BR-08):
  question score (0–10)   = average of the 4 criteria, 1 decimal; skipped = 0
  overall score (0–100)   = average of the question scores × 10, rounded
  performance label       = 0–39 Needs improvement · 40–59 Average · 60–79 Good · 80–100 Excellent
"""

import math
import re

from app.core.config import settings
from app.core.errors import (
    AICallLimitError,
    AnswerRequiredError,
    QuestionNotFoundError,
    QuestionSkippedError,
)
from app.core.session_store import StoredQuestion, StoredSession, store, utcnow
from app.schemas.ai import GeminiEvaluation, GeminiSummary
from app.schemas.evaluation import AnswerEvaluation, EvaluationResponse
from app.schemas.interview import (
    CriteriaAverages,
    InterviewRequest,
    InterviewResult,
    PerformanceLabel,
    QuestionResult,
    QuestionStatus,
)
from app.services import gemini_service, prompts

CRITERIA = ("technical_accuracy", "relevance", "clarity", "completeness")


def _round_half_up(value: float) -> int:
    """Rounds .5 upwards (Python's round() rounds half to even, which would differ from the frontend)."""
    return math.floor(value + 0.5)


def _round1(value: float) -> float:
    return _round_half_up(value * 10) / 10


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


# ---------------------------------------------------------------- evaluating one answer


def to_answer_evaluation(gemini: GeminiEvaluation) -> AnswerEvaluation:
    """Maps Gemini's output to the stored/API model and calculates the overall score (out of 10)."""
    average = (gemini.technical_accuracy + gemini.relevance + gemini.clarity + gemini.completeness) / 4
    return AnswerEvaluation(
        technical_accuracy=gemini.technical_accuracy,
        relevance=gemini.relevance,
        clarity=gemini.clarity,
        completeness=gemini.completeness,
        overall_score=_round1(average),
        strengths=gemini.strengths,
        weaknesses=gemini.improvement_areas,
        missing_concepts=gemini.missing_concepts,
        improved_answer=gemini.ideal_answer,
        follow_up_question=gemini.follow_up_question,
        recommended_topic=gemini.recommended_topic,
        evaluated_at=utcnow(),
    )


async def request_evaluation(config: InterviewRequest, question: StoredQuestion, answer: str) -> AnswerEvaluation:
    """One Gemini call: evaluates `answer` against `question` in the interview's context."""
    gemini = await gemini_service.generate_structured(
        purpose="evaluation",
        system_instruction=prompts.EVALUATION_SYSTEM_INSTRUCTION,
        prompt=prompts.build_evaluation_prompt(config, question, answer),
        response_model=GeminiEvaluation,
        temperature=0.2,  # consistent scoring
    )
    return to_answer_evaluation(gemini)


def reserve_ai_call(session: StoredSession) -> None:
    """Counts a Gemini request against this interview's budget (cost and abuse control, PRD SEC-10)."""
    if session.ai_calls >= settings.max_ai_calls_per_session:
        raise AICallLimitError(settings.max_ai_calls_per_session)
    session.ai_calls += 1


def _response(session: StoredSession, question: StoredQuestion) -> EvaluationResponse:
    return EvaluationResponse(
        session_id=session.id,
        question_number=question.number,
        progress=session.progress(),
        **question.evaluation.model_dump(),
    )


async def evaluate_question(session_id: str, question_number: int) -> EvaluationResponse:
    """Evaluates a submitted answer with Gemini and stores the evaluation. Idempotent: an answer that already
    has an evaluation returns it without another Gemini call.

    The threading lock is only held for the quick reads and writes, never across the Gemini request
    (a thread lock does not exclude other coroutines). A per-session async lock serialises evaluations
    instead, so two identical requests make one Gemini call and the second reuses its result.
    """
    with store.lock:
        session = store.get(session_id)
        question = session.question(question_number)
        if question is None:
            raise QuestionNotFoundError(question_number, len(session.questions))
        if question.status == QuestionStatus.SKIPPED:
            raise QuestionSkippedError(question_number)
        if question.answer is None:
            raise AnswerRequiredError(question_number, session_id)
        if question.evaluation is not None:
            return _response(session, question)

    async with session.eval_lock:
        with store.lock:
            if question.evaluation is not None:  # a concurrent request finished while we waited
                return _response(session, question)
            gemini_service.ensure_configured()  # a missing key must not use up the interview's AI budget
            reserve_ai_call(session)
            config, answer = session.config, question.answer

        evaluation = await request_evaluation(config, question, answer)  # no lock held while waiting for Gemini

        with store.lock:
            question.evaluation = evaluation
            store.touch(session)
            return _response(session, question)


# ---------------------------------------------------------------- scoring and results


def question_score(question: StoredQuestion) -> float:
    if question.status != QuestionStatus.ANSWERED or question.evaluation is None:
        return 0.0
    return _round1(sum(getattr(question.evaluation, c) for c in CRITERIA) / len(CRITERIA))


def overall_score(questions: list[StoredQuestion]) -> int:
    if not questions:
        return 0
    return _round_half_up(sum(question_score(q) for q in questions) / len(questions) * 10)


def performance_label(score: int) -> PerformanceLabel:
    if score >= 80:
        return PerformanceLabel.EXCELLENT
    if score >= 60:
        return PerformanceLabel.GOOD
    if score >= 40:
        return PerformanceLabel.AVERAGE
    return PerformanceLabel.NEEDS_IMPROVEMENT


def criteria_averages(questions: list[StoredQuestion]) -> dict[str, float]:
    count = max(1, len(questions))
    return {
        c: _round1(sum(getattr(q.evaluation, c) if q.evaluation and q.status == QuestionStatus.ANSWERED else 0 for q in questions) / count)
        for c in CRITERIA
    }


def strongest_and_weakest(averages: dict[str, float], answered_count: int) -> tuple[str | None, str | None]:
    """The criteria with the highest and lowest average, from real scores only. None when nothing was
    answered or every criterion is equal (there is nothing to single out)."""
    if answered_count == 0:
        return None, None
    highest, lowest = max(averages.values()), min(averages.values())
    if highest == lowest:
        return None, None
    return next(c for c in CRITERIA if averages[c] == highest), next(c for c in CRITERIA if averages[c] == lowest)


def build_result(session: StoredSession) -> InterviewResult:
    """Builds the final report from the stored evaluations. Call only when every question is
    answered+evaluated or skipped.

    Strengths, weaknesses and learning recommendations are drawn from Gemini's own feedback on the
    individual answers (no extra AI call, nothing invented here): strengths from the best answers,
    weaknesses and topics to study from the weakest ones.
    """
    questions = session.questions
    averages = criteria_averages(questions)
    score = overall_score(questions)
    skipped = [q for q in questions if q.status == QuestionStatus.SKIPPED]
    answered = [q for q in questions if q.status == QuestionStatus.ANSWERED and q.evaluation is not None]
    best_first = sorted(answered, key=question_score, reverse=True)
    weakest_first = list(reversed(best_first))
    completed_at = utcnow()
    strongest, weakest = strongest_and_weakest(averages, len(answered))

    strengths = [q.evaluation.strengths[0] for q in best_first]
    if not strengths:
        strengths = ["No answers were submitted, so there are no strengths to report."]

    # Skipped questions come first: they are the most concrete fact and must survive the 4-item cap
    weaknesses = [f"Skipped {len(skipped)} question{'s' if len(skipped) > 1 else ''}."] if skipped else []
    weaknesses += [q.evaluation.weaknesses[0] for q in weakest_first]
    if not weaknesses:
        weaknesses = ["No answers were submitted."]

    recommendations = [f"Study {q.evaluation.recommended_topic}." for q in weakest_first if question_score(q) < 8]
    recommendations += [
        f"Practise explaining: {', '.join(q.evaluation.missing_concepts[:3])}." for q in weakest_first if q.evaluation.missing_concepts
    ]
    recommendations += [f"Revisit the skipped question on {q.topic.lower()}." for q in skipped]
    recommendations += [
        "Read the ideal answers for this interview and rewrite them in your own words.",
        "Retake this interview in a few days to measure your progress.",
    ]

    return InterviewResult(
        session_id=session.id,
        candidate_name=session.config.candidate_name,
        job_role=session.config.job_role,
        experience=session.config.experience,
        difficulty=session.config.difficulty,
        interview_type=session.config.interview_type,
        overall_score=score,
        performance_label=performance_label(score),
        criteria_averages=CriteriaAverages(**averages),
        strongest_skill=strongest,
        weakest_skill=weakest,
        answered_count=len(questions) - len(skipped),
        skipped_count=len(skipped),
        questions=[
            QuestionResult(
                number=q.number,
                id=q.id,
                text=q.text,
                category=q.category,
                level=q.level,
                topic=q.topic,
                status=q.status,
                answer=q.answer,
                score=question_score(q),
                evaluation=q.evaluation,
            )
            for q in questions
        ],
        strengths=_unique(strengths)[:4],
        weaknesses=_unique(weaknesses)[:4],
        learning_recommendations=_unique(recommendations)[:5],
        started_at=session.created_at,
        completed_at=completed_at,
        duration_seconds=int((completed_at - session.created_at).total_seconds()),
    )


# ---------------------------------------------------------------- the final summary (Gemini)

_OUT_OF_100 = re.compile(r"(\d+(?:\.\d+)?)\s*(?:/|out of)\s*100\b", re.IGNORECASE)
_OUT_OF_10 = re.compile(r"(\d+(?:\.\d+)?)\s*(?:/|out of)\s*10\b", re.IGNORECASE)


def _real_scores_out_of_10(result: InterviewResult) -> set[float]:
    """Every score out of 10 that exists in the report: question scores, criterion averages and criterion scores."""
    values = {q.score for q in result.questions}
    values |= {result.criteria_averages.technical_accuracy, result.criteria_averages.relevance,
               result.criteria_averages.clarity, result.criteria_averages.completeness}
    for q in result.questions:
        if q.evaluation is not None:
            values |= {q.evaluation.technical_accuracy, q.evaluation.relevance, q.evaluation.clarity, q.evaluation.completeness}
    return {float(v) for v in values}


def validate_summary(summary: GeminiSummary, result: InterviewResult) -> GeminiSummary:
    """Rejects a summary that quotes a score that is not in the report (a model may not invent scores).
    Raises ValueError, which the Gemini service treats as an unusable response (and retries once)."""
    for found in _OUT_OF_100.findall(summary.summary):
        if float(found) != float(result.overall_score):
            raise ValueError(f"summary quotes {found}/100 but the overall score is {result.overall_score}")
    real = _real_scores_out_of_10(result)
    for found in _OUT_OF_10.findall(summary.summary):
        if float(found) not in real:
            raise ValueError(f"summary quotes {found}/10, which is not a score in the report")
    return summary


async def request_summary(config: InterviewRequest, result: InterviewResult) -> str:
    """One Gemini request: a concise summary written from the stored evaluations (not from the raw answers)."""
    summary = await gemini_service.generate_structured(
        purpose="summary",
        system_instruction=prompts.SUMMARY_SYSTEM_INSTRUCTION,
        prompt=prompts.build_summary_prompt(config, result),
        response_model=GeminiSummary,
        temperature=0.4,
        validator=lambda generated: validate_summary(generated, result),
    )
    return summary.summary
