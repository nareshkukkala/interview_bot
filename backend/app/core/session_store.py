"""In-memory interview session storage (no database, per the MVP scope).

Sessions live in a dict guarded by a lock. They expire after SESSION_TTL_MINUTES of
inactivity and the oldest are evicted once MAX_SESSIONS is reached. Everything is lost
when the server restarts. The small interface (create / get / touch / clear) means a
database-backed store can replace this later without touching the services.
"""

import asyncio
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.errors import SessionNotFoundError
from app.schemas.common import Progress, SessionStatus
from app.schemas.evaluation import AnswerEvaluation
from app.schemas.interview import (
    InterviewQuestion,
    InterviewRequest,
    InterviewResult,
    QuestionCategory,
    QuestionLevel,
    QuestionStatus,
)


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class StoredQuestion:
    """A question plus everything stored about the candidate's response to it."""

    id: str
    number: int
    text: str
    category: QuestionCategory
    level: QuestionLevel
    topic: str
    expected_concepts: list[str]  # internal: generated with the question and given to the evaluator, never sent to the client
    evaluation_criteria: list[str]  # internal: same
    answer: str | None = None
    skipped: bool = False
    answered_at: datetime | None = None
    evaluation: AnswerEvaluation | None = None

    @property
    def status(self) -> QuestionStatus:
        if self.answer is not None:
            return QuestionStatus.ANSWERED
        if self.skipped:
            return QuestionStatus.SKIPPED
        return QuestionStatus.UNANSWERED

    @property
    def resolved(self) -> bool:
        return self.status != QuestionStatus.UNANSWERED

    def to_public(self) -> InterviewQuestion:
        return InterviewQuestion(
            number=self.number, id=self.id, text=self.text, category=self.category, level=self.level, topic=self.topic
        )


@dataclass
class StoredSession:
    config: InterviewRequest
    questions: list[StoredQuestion]
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: SessionStatus = SessionStatus.IN_PROGRESS
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
    completed_at: datetime | None = None
    result: InterviewResult | None = None
    ai_calls: int = 0  # Gemini requests used by this interview (capped by MAX_AI_CALLS_PER_SESSION)
    # Held (as an async lock) while an answer is being evaluated, so a duplicate request waits and
    # then finds the stored evaluation instead of calling Gemini twice
    eval_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False, compare=False)

    def question(self, number: int) -> StoredQuestion | None:
        return self.questions[number - 1] if 1 <= number <= len(self.questions) else None

    def next_unresolved(self, after: int = 0) -> StoredQuestion | None:
        """First question that is neither answered nor skipped, searching onward from `after` and wrapping."""
        total = len(self.questions)
        for step in range(total):
            candidate = self.questions[(after + step) % total]
            if not candidate.resolved:
                return candidate
        return None

    def progress(self) -> Progress:
        total = len(self.questions)
        answered = sum(q.status == QuestionStatus.ANSWERED for q in self.questions)
        skipped = sum(q.status == QuestionStatus.SKIPPED for q in self.questions)
        evaluated = sum(q.evaluation is not None for q in self.questions)
        return Progress(
            total=total,
            answered=answered,
            skipped=skipped,
            evaluated=evaluated,
            pending_evaluation=answered - evaluated,
            remaining=total - answered - skipped,
            percent=round((answered + skipped) / total * 100),
            status=self.status,
        )


class SessionStore:
    def __init__(self, ttl_minutes: int, max_sessions: int) -> None:
        self._sessions: dict[str, StoredSession] = {}
        self._ttl = timedelta(minutes=ttl_minutes)
        self._max_sessions = max_sessions
        # Re-entrant lock: services hold it while reading and changing a session
        self.lock = threading.RLock()

    def create(self, session: StoredSession) -> StoredSession:
        with self.lock:
            self._purge_expired()
            while len(self._sessions) >= self._max_sessions:
                oldest = min(self._sessions.values(), key=lambda s: s.updated_at)
                del self._sessions[oldest.id]
            self._sessions[session.id] = session
            return session

    def get(self, session_id: str) -> StoredSession:
        """Returns the session or raises SessionNotFoundError (unknown, malformed or expired id)."""
        with self.lock:
            self._purge_expired()
            session = self._sessions.get(session_id)
            if session is None:
                raise SessionNotFoundError(session_id)
            return session

    def touch(self, session: StoredSession) -> None:
        session.updated_at = utcnow()

    def clear(self) -> None:
        with self.lock:
            self._sessions.clear()

    def __len__(self) -> int:
        with self.lock:
            return len(self._sessions)

    def _purge_expired(self) -> None:
        cutoff = utcnow() - self._ttl
        for session_id in [sid for sid, s in self._sessions.items() if s.updated_at < cutoff]:
            del self._sessions[session_id]


store = SessionStore(ttl_minutes=settings.session_ttl_minutes, max_sessions=settings.max_sessions)
