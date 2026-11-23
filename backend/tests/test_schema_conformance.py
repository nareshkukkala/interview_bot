"""Contract tests: every response the API actually sends must validate against the OpenAPI schema it publishes
(the schema Swagger UI shows and the frontend relies on), including every error response."""

import pytest
from jsonschema import Draft202012Validator

from app.main import app
from app.services import gemini_service
from tests.conftest import CONFIG, GOOD_ANSWER, evaluate, submit
from tests.stub_gemini import http_error, raw_text

SPEC = app.openapi()
START, SUBMIT, EVALUATE, RESULTS = "/api/interviews/start", "/api/interviews/{session_id}/submit-answer", "/api/interviews/{session_id}/evaluate", "/api/interviews/{session_id}/results"
CHECKED: set[tuple[str, str, int]] = set()


def check(response, template: str, method: str = "post") -> None:
    """Validates the response body against the published schema for (path, method, status)."""
    documented = SPEC["paths"][template][method]["responses"]
    status = str(response.status_code)
    assert status in documented, f"{method.upper()} {template} → {status} is not documented in OpenAPI (documented: {sorted(documented)})"
    schema = documented[status]["content"]["application/json"]["schema"]
    Draft202012Validator({**schema, "components": SPEC["components"]}).validate(response.json())
    CHECKED.add((method, template, response.status_code))


def test_the_spec_itself_is_valid():
    Draft202012Validator.check_schema({"components": SPEC["components"]})
    assert set(SPEC["paths"]) == {"/api/health", START, SUBMIT, EVALUATE, RESULTS}


def test_every_success_response_matches_its_schema(client, gemini):
    check(client.get("/api/health"), "/api/health", "get")
    started = client.post(START, json=CONFIG)
    check(started, START)
    sid = started.json()["session_id"]

    check(submit(client, sid, 1), SUBMIT)
    check(submit(client, sid, 2, skipped=True), SUBMIT)
    check(evaluate(client, sid, 1), EVALUATE)
    for n in (3, 4, 5):
        submit(client, sid, n)
        evaluate(client, sid, n)
    report = client.get(f"/api/interviews/{sid}/results")
    check(report, RESULTS, "get")
    assert report.json()["summary"] and report.json()["summary_error"] is None


def test_a_report_without_a_summary_matches_its_schema_too(client, gemini):
    sid = client.post(START, json=CONFIG).json()["session_id"]
    for n in range(1, 6):
        submit(client, sid, n)
        evaluate(client, sid, n)
    gemini.script.append(http_error(429, "RESOURCE_EXHAUSTED"))
    report = client.get(f"/api/interviews/{sid}/results")
    check(report, RESULTS, "get")
    assert report.json()["summary"] is None and report.json()["summary_error"]["code"] == "AI_RATE_LIMITED"


@pytest.mark.parametrize(
    "make_request,template,method",
    [
        (lambda c, sid: c.post(START, json={}), START, "post"),
        (lambda c, sid: c.post(START, content="{bad", headers={"Content-Type": "application/json"}), START, "post"),
        (lambda c, sid: c.post(f"/api/interviews/{sid}/submit-answer", json={"question_number": 1, "answer": "short"}), SUBMIT, "post"),
        (lambda c, sid: c.post("/api/interviews/00000000-0000-0000-0000-000000000000/submit-answer", json={"question_number": 1, "skipped": True}), SUBMIT, "post"),
        (lambda c, sid: c.post(f"/api/interviews/{sid}/submit-answer", json={"question_number": 9, "skipped": True}), SUBMIT, "post"),
        (lambda c, sid: c.post(f"/api/interviews/{sid}/evaluate", json={}), EVALUATE, "post"),
        (lambda c, sid: c.post("/api/interviews/nope/evaluate", json={"question_number": 1}), EVALUATE, "post"),
        (lambda c, sid: c.post(f"/api/interviews/{sid}/evaluate", json={"question_number": 1}), EVALUATE, "post"),  # no answer yet → 409
        (lambda c, sid: c.get("/api/interviews/nope/results"), RESULTS, "get"),
        (lambda c, sid: c.get(f"/api/interviews/{sid}/results"), RESULTS, "get"),  # not ready → 409
    ],
    ids=["start-422", "start-bad-json", "submit-422", "submit-404", "submit-no-question", "evaluate-422", "evaluate-404", "evaluate-409", "results-404", "results-409"],
)
def test_every_client_error_matches_the_published_error_schema(client, interview, make_request, template, method):
    sid, _ = interview
    response = make_request(client, sid)
    assert 400 <= response.status_code < 500
    check(response, template, method)


@pytest.mark.parametrize(
    "script,status",
    [([http_error(429, "RESOURCE_EXHAUSTED")], 429), ([http_error(503, "UNAVAILABLE")] * 2, 503), ([http_error(504, "DEADLINE_EXCEEDED")] * 2, 504), ([raw_text("x")] * 2, 502), ([("blocked",)], 422)],
)
def test_every_ai_failure_matches_the_published_error_schema(client, interview, gemini, script, status):
    sid, _ = interview
    submit(client, sid, 1)
    gemini.script.extend(script)
    response = evaluate(client, sid, 1)
    assert response.status_code == status
    check(response, EVALUATE)


def test_ai_failures_when_starting_match_the_published_error_schema(client, gemini, monkeypatch):
    import dataclasses

    for script, status in [([http_error(429, "RESOURCE_EXHAUSTED")], 429), ([http_error(503, "UNAVAILABLE")] * 2, 503), ([http_error(504, "DEADLINE_EXCEEDED")] * 2, 504), ([raw_text("x")] * 2, 502)]:
        gemini.script[:] = script
        response = client.post(START, json=CONFIG)
        assert response.status_code == status
        check(response, START)
    monkeypatch.setattr(gemini_service, "settings", dataclasses.replace(gemini_service.settings, gemini_api_key=""))
    response = client.post(START, json=CONFIG)
    assert response.status_code == 503
    check(response, START)


@pytest.mark.parametrize("template,method", [(START, "post"), (SUBMIT, "post"), (EVALUATE, "post")])
def test_an_oversized_request_matches_the_published_413_schema(client, interview, template, method):
    from app.core.security import MAX_BODY_BYTES

    sid, _ = interview
    response = client.post(template.replace("{session_id}", sid), content="x" * (MAX_BODY_BYTES + 1), headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    check(response, template, method)


def test_no_operation_documents_the_framework_default_validation_schema():
    """Our 422 is ErrorResponse, never FastAPI's default HTTPValidationError: the spec must say so."""
    for template, ops in SPEC["paths"].items():
        for method, op in ops.items():
            for status, documented in op["responses"].items():
                ref = documented.get("content", {}).get("application/json", {}).get("schema", {}).get("$ref", "")
                assert not ref.endswith("HTTPValidationError"), f"{method.upper()} {template} {status} documents the wrong error shape"


def test_the_documented_error_codes_for_each_operation_were_all_exercised():
    """Guards against documenting a response that no test ever checks (the checks above must have run first)."""
    if not CHECKED:
        pytest.skip("run the whole module: this test reads what the others recorded")
    exercised = {(method, template) for method, template, _ in CHECKED}
    assert {("get", "/api/health"), ("post", START), ("post", SUBMIT), ("post", EVALUATE), ("get", RESULTS)} <= exercised
