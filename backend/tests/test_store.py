from datetime import timedelta

import pytest

from app.core.errors import SessionNotFoundError
from app.core.session_store import SessionStore, StoredSession, utcnow
from app.schemas.interview import InterviewRequest


def make_session():
    config = InterviewRequest(
        candidate_name="Priya Sharma", job_role="python_developer", experience="fresher", difficulty="easy", interview_type="hr"
    )
    return StoredSession(config=config, questions=[])


def test_create_and_get():
    store = SessionStore(ttl_minutes=10, max_sessions=5)
    session = store.create(make_session())
    assert store.get(session.id) is session
    with pytest.raises(SessionNotFoundError):
        store.get("missing")


def test_expired_sessions_are_removed():
    store = SessionStore(ttl_minutes=10, max_sessions=5)
    session = store.create(make_session())
    session.updated_at = utcnow() - timedelta(minutes=11)
    with pytest.raises(SessionNotFoundError):
        store.get(session.id)
    assert len(store) == 0


def test_oldest_session_is_evicted_at_capacity():
    store = SessionStore(ttl_minutes=10, max_sessions=2)
    first, second = store.create(make_session()), store.create(make_session())
    first.updated_at = utcnow() - timedelta(minutes=5)
    third = store.create(make_session())
    assert len(store) == 2
    with pytest.raises(SessionNotFoundError):
        store.get(first.id)
    assert store.get(second.id) and store.get(third.id)
