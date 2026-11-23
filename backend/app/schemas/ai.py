"""Structured-output schemas: what Gemini must return. Gemini is asked for JSON in exactly this shape,
and the reply is validated against these models before anything is stored or sent to React.
"""

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.interview import QuestionCategory, QuestionLevel

# Short text items (a concept, a strength, a criterion...)
Item = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]


class GeneratedQuestion(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=15, max_length=500)] = Field(
        description="The interview question, phrased as a real interviewer would ask it."
    )
    category: QuestionCategory = Field(description="'technical' for role-specific skills, 'hr' for behavioural / HR questions.")
    difficulty: QuestionLevel = Field(description="beginner, intermediate or advanced.")
    topic: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)] = Field(
        description="A short topic label, 2-4 words."
    )
    expected_concepts: list[Item] = Field(
        min_length=2, max_length=6, description="Key ideas or terms a strong answer covers. For HR questions: the elements of a strong answer."
    )
    evaluation_criteria: list[Item] = Field(
        min_length=2, max_length=5, description="Short statements a grader checks the answer against."
    )


class GeneratedQuestionSet(BaseModel):
    questions: list[GeneratedQuestion]


class GeminiEvaluation(BaseModel):
    """Gemini's evaluation of one answer. The overall score is NOT asked for: the backend calculates it."""

    technical_accuracy: int = Field(ge=0, le=10, description="Correctness of the content. For HR questions: appropriateness of the content.")
    relevance: int = Field(ge=0, le=10, description="How directly the answer addresses the question asked.")
    clarity: int = Field(ge=0, le=10, description="How clear, structured and easy to follow the answer is.")
    completeness: int = Field(ge=0, le=10, description="How fully the answer covers what a strong answer should.")
    strengths: list[Item] = Field(min_length=3, max_length=3, description="Exactly three specific things the answer did well.")
    improvement_areas: list[Item] = Field(min_length=3, max_length=3, description="Exactly three specific ways to improve the answer.")
    missing_concepts: list[Item] = Field(
        max_length=8, description="Important concepts a strong answer would include that this answer left out. Empty if nothing is missing."
    )
    ideal_answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=40, max_length=2000)] = Field(
        description="A model answer for this candidate's level, in the first person, as it would be spoken in an interview."
    )
    follow_up_question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=300)] = Field(
        description="One follow-up question an interviewer might ask next."
    )
    recommended_topic: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)] = Field(
        description="The single most useful topic for this candidate to study next."
    )


class GeminiSummary(BaseModel):
    """The concise final summary of an interview, written from its evaluations."""

    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=40, max_length=700)] = Field(
        description="2-4 sentences, second person: what went well, the main area to improve, and one concrete next step."
    )
