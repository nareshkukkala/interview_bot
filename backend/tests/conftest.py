import dataclasses

import pytest
from fastapi.testclient import TestClient

from app.core.session_store import store
from app.main import app
from app.routes import health
from app.services import evaluation_service, gemini_service
from tests.stub_gemini import TEST_KEY, StubServer

CONFIG = {
    "candidate_name": "Priya Sharma",
    "job_role": "python_developer",
    "experience": "fresher",
    "difficulty": "medium",
    "interview_type": "mixed",
    "question_count": 5,
}

GOOD_ANSWER = (
    "In my last project I used this concept directly. The key idea is the trade-off, and I explained "
    "the result with an example, the reasoning and what I learned."
)


@pytest.fixture(scope="session")
def stub_server():
    """A local stand-in for Google's API (tests/stub_gemini.py); the real google-genai SDK talks HTTP to it."""
    server = StubServer().start()
    yield server
    server.stop()


@pytest.fixture()
def gemini(stub_server, monkeypatch):
    """Configures the app with a test key and points the real SDK at the stub. Returns the stub's state."""
    stub_server.state.reset()
    monkeypatch.setenv("GOOGLE_GEMINI_BASE_URL", stub_server.url)
    configured = dataclasses.replace(gemini_service.settings, gemini_api_key=TEST_KEY, gemini_model="stub-model", gemini_timeout_seconds=5)
    monkeypatch.setattr(gemini_service, "settings", configured)
    monkeypatch.setattr(evaluation_service, "settings", configured)
    monkeypatch.setattr(health, "settings", configured)
    monkeypatch.setattr(gemini_service, "RETRY_DELAY_SECONDS", 0.0)
    gemini_service.get_client.cache_clear()
    yield stub_server.state
    getattr(gemini_service.get_client, "cache_clear", lambda: None)()  # a test may have swapped get_client for a stub


@pytest.fixture()
def client(gemini):
    store.clear()
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    store.clear()


@pytest.fixture()
def interview(client):
    """A freshly started interview: (session_id, response_json)."""
    response = client.post("/api/interviews/start", json=CONFIG)
    assert response.status_code == 201, response.text
    body = response.json()
    return body["session_id"], body


def submit(client, session_id, number, answer=GOOD_ANSWER, skipped=False):
    payload = {"question_number": number, "skipped": skipped}
    if not skipped:
        payload["answer"] = answer
    return client.post(f"/api/interviews/{session_id}/submit-answer", json=payload)


def evaluate(client, session_id, number):
    return client.post(f"/api/interviews/{session_id}/evaluate", json={"question_number": number})
