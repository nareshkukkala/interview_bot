"""Question generation with Gemini.

The interview configuration (role, experience, difficulty, interview type, question count) is sent to
Gemini, which returns the questions with their category, difficulty, expected concepts and evaluation
criteria as structured JSON. This module then checks the set is usable (exact count, exact technical/HR
split, no duplicates) and puts it in a stable order. A set that fails these checks is treated like any
other bad AI response; there is no fallback question list.
"""

import math
import re

from app.schemas.ai import GeneratedQuestion, GeneratedQuestionSet
from app.schemas.interview import InterviewRequest, InterviewType, QuestionCategory, QuestionLevel
from app.services import gemini_service, prompts

LEVEL_ORDER = [QuestionLevel.BEGINNER, QuestionLevel.INTERMEDIATE, QuestionLevel.ADVANCED]
CATEGORY_ORDER = [QuestionCategory.TECHNICAL, QuestionCategory.HR]


def question_split(interview_type: InterviewType, count: int) -> tuple[int, int]:
    """(technical, hr) question counts. Mixed 5 = 3 technical + 2 HR (PRD BR-03)."""
    if interview_type == InterviewType.TECHNICAL:
        return count, 0
    if interview_type == InterviewType.HR:
        return 0, count
    technical = math.ceil(count * 0.6)
    return technical, count - technical


def _fingerprint(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def check_and_order(generated: GeneratedQuestionSet, technical: int, hr: int) -> GeneratedQuestionSet:
    """Raises ValueError if the set is unusable; otherwise returns it ordered technical → HR, easiest first."""
    questions = generated.questions
    if len(questions) != technical + hr:
        raise ValueError(f"expected {technical + hr} questions, got {len(questions)}")
    got_technical = sum(q.category == QuestionCategory.TECHNICAL for q in questions)
    if got_technical != technical:
        raise ValueError(f"expected {technical} technical questions, got {got_technical}")
    if len({_fingerprint(q.text) for q in questions}) != len(questions):
        raise ValueError("duplicate questions")

    ordered = sorted(questions, key=lambda q: (CATEGORY_ORDER.index(q.category), LEVEL_ORDER.index(q.difficulty)))  # stable
    return GeneratedQuestionSet(questions=ordered)


async def generate_questions(config: InterviewRequest) -> list[GeneratedQuestion]:
    """Asks Gemini for the interview's questions. Raises an AIError subclass on failure."""
    technical, hr = question_split(config.interview_type, config.question_count)
    result = await gemini_service.generate_structured(
        purpose="questions",
        system_instruction=prompts.QUESTION_SYSTEM_INSTRUCTION,
        prompt=prompts.build_question_prompt(config, technical, hr),
        response_model=GeneratedQuestionSet,
        temperature=0.8,  # some variety between interviews
        validator=lambda generated: check_and_order(generated, technical, hr),
    )
    return result.questions
