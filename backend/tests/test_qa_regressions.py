"""Regression tests for defects found during QA (see docs/TESTING_REPORT.md). Each test pins one fix."""

import json

import pytest

from app.core.security import MAX_BODY_BYTES
from tests.conftest import CONFIG, GOOD_ANSWER, evaluate, submit


def error_of(response):
    body = response.json()
    assert set(body["error"]) == {"code", "message", "details"}
    return body["error"]


# BUG-1: legitimate names (other scripts, accents, the typographic apostrophe) were rejected --------------------


@pytest.mark.parametrize(
    "name",
    ["José Álvarez", "Zoë Müller", "Nguyễn Văn An", "李雷", "प्रिया शर्मा", "O’Neil", "Mary-Jane O'Neil Jr.", "Ana-María", "élise"],
)
def test_real_names_in_any_script_are_accepted(client, name):
    response = client.post("/api/interviews/start", json={**CONFIG, "candidate_name": name})
    assert response.status_code == 201, response.text


def test_decomposed_accents_are_normalised(client):
    name = client.post("/api/interviews/start", json={**CONFIG, "candidate_name": "José"}).json()["config"]["candidate_name"]
    assert name == "José"  # NFC: one character, so the 2-50 length rule counts it once


@pytest.mark.parametrize("name", ["Priya2", "Priya<script>", "Priya 😀", "😀😀", "-Priya", "'Priya", "Priya_Sharma", "Pri\u0000ya", "A", "x" * 51])
def test_non_names_are_still_rejected(client, name):
    response = client.post("/api/interviews/start", json={**CONFIG, "candidate_name": name})
    assert response.status_code == 422 and error_of(response)["code"] == "VALIDATION_ERROR"


def test_fifty_non_latin_characters_fit_but_fifty_one_do_not(client):
    assert client.post("/api/interviews/start", json={**CONFIG, "candidate_name": "李" * 50}).status_code == 201
    assert client.post("/api/interviews/start", json={**CONFIG, "candidate_name": "李" * 51}).status_code == 422


# BUG-2: no request size limit: a 64 MB body was read fully into memory before being rejected ---------------------


def test_an_oversized_body_is_refused_with_413_before_it_is_parsed(client, gemini):
    huge = json.dumps({"question_number": 1, "answer": "x" * (MAX_BODY_BYTES + 1)})
    response = client.post("/api/interviews/anything/submit-answer", content=huge, headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    error = error_of(response)
    assert error["code"] == "REQUEST_TOO_LARGE" and error["details"] == {"max_bytes": MAX_BODY_BYTES}
    assert gemini.requests == []


def test_a_chunked_body_without_content_length_is_limited_too(client):
    def chunks():
        for _ in range(MAX_BODY_BYTES // 1024 + 8):
            yield b'{"a": "' + b"x" * 1000 + b'"}'

    response = client.post("/api/interviews/start", content=chunks(), headers={"Content-Type": "application/json"})
    assert response.status_code == 413 and error_of(response)["code"] == "REQUEST_TOO_LARGE"


def test_the_largest_legitimate_answer_still_fits_comfortably(client, interview):
    session_id, _ = interview
    worst_case = "😀" * 2000  # 4 bytes per character in UTF-8: 8 KB, far below the 64 KB limit
    assert len(json.dumps({"question_number": 1, "answer": worst_case}, ensure_ascii=False).encode()) < MAX_BODY_BYTES / 4
    assert submit(client, session_id, 1, answer=worst_case).status_code == 200


def test_a_413_still_carries_the_cors_headers_the_browser_needs(client):
    huge = json.dumps({"answer": "x" * (MAX_BODY_BYTES + 1)})
    response = client.post(
        "/api/interviews/start", content=huge, headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"}
    )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


# BUG-3: session data could be cached; no nosniff header ------------------------------------------------------------


def test_api_responses_are_not_cacheable_and_not_sniffable(client, interview):
    session_id, _ = interview
    for response in (client.get("/api/health"), client.get(f"/api/interviews/{session_id}/results"), client.post("/api/interviews/start", json={})):
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"


# BUG-4: lax types: true, "1" and "yes" were silently accepted ------------------------------------------------------


@pytest.mark.parametrize("value", ["1", True, 1.0, "one", None, [1]])
def test_question_number_must_be_a_real_integer(client, interview, value):
    session_id, _ = interview
    assert client.post(f"/api/interviews/{session_id}/submit-answer", json={"question_number": value, "answer": GOOD_ANSWER}).status_code == 422
    assert client.post(f"/api/interviews/{session_id}/evaluate", json={"question_number": value}).status_code == 422


@pytest.mark.parametrize("value", ["yes", "true", 1, 0, "false"])
def test_skipped_must_be_a_real_boolean(client, interview, value):
    session_id, _ = interview
    assert client.post(f"/api/interviews/{session_id}/submit-answer", json={"question_number": 1, "skipped": value}).status_code == 422


def test_real_integers_and_booleans_still_work(client, interview):
    session_id, _ = interview
    assert submit(client, session_id, 1).status_code == 200
    assert submit(client, session_id, 2, skipped=True).status_code == 200
    assert evaluate(client, session_id, 1).status_code == 200


# BUG-5: an attacker-chosen session id was echoed back in full ------------------------------------------------------


def test_a_long_session_id_is_not_reflected_in_full(client):
    response = client.get(f"/api/interviews/{'a' * 5000}/results")
    assert response.status_code == 404 and error_of(response)["code"] == "SESSION_NOT_FOUND"
    assert len(response.text) < 1000
