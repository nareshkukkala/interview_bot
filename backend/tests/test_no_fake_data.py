"""Guards the rule "never return fake evaluation data": if Gemini cannot answer, the API fails with an AI_* error.

These tests fail if someone reintroduces a fallback (canned questions, heuristic scoring, default feedback) or makes the
application import test tooling.
"""

import ast
import dataclasses
import re
from pathlib import Path

import pytest

from app.services import gemini_service
from tests.conftest import CONFIG, GOOD_ANSWER, evaluate, submit

APP = Path(__file__).resolve().parents[1] / "app"
SOURCES = sorted(APP.rglob("*.py"))


def test_the_application_never_imports_test_tooling_or_the_stub():
    for path in SOURCES:
        for node in ast.walk(ast.parse(path.read_text())):
            names = [node.module] if isinstance(node, ast.ImportFrom) and node.module else [a.name for a in node.names] if isinstance(node, ast.Import) else []
            assert not any(n == "tests" or n.startswith("tests.") or "stub_gemini" in n for n in names), f"{path.name} imports test tooling: {names}"


def code_vocabulary(path: Path) -> set[str]:
    """Every identifier and every string literal in the file, lower-cased: comments and docstrings are NOT included
    (a docstring that says "there is no fallback" must not trip the guard)."""
    tree = ast.parse(path.read_text())
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                docstrings.add(id(first.value))
    words: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            words.add(node.id.lower())
        elif isinstance(node, ast.Attribute):
            words.add(node.attr.lower())
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            words.add(node.name.lower())
        elif isinstance(node, ast.arg):
            words.add(node.arg.lower())
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            words.add(node.value.lower())
    return words


@pytest.mark.parametrize("forbidden", ["heuristic", "question_bank", "model_answer", "fallback", "canned", "(stub)", "lorem ipsum", "mock_", "_mock", "mocked", "fake", "dummy"])  # "mock" alone is the product's own word (mock interviews)
def test_no_fallback_or_placeholder_content_exists_in_the_application_code(forbidden):
    offenders = [p.name for p in SOURCES if any(forbidden in word for word in code_vocabulary(p))]
    assert not offenders, f"'{forbidden}' used as an identifier or string in {offenders}"


def test_the_guard_itself_catches_a_reintroduced_fallback(tmp_path):
    """Proves the check above is not vacuous: code that defines a heuristic evaluator IS detected, a docstring is not."""
    bad = tmp_path / "bad.py"
    bad.write_text("def heuristic_evaluate(answer):\n    return {'overall_score': 5}\n")
    ok = tmp_path / "ok.py"
    ok.write_text('"""There is no fallback and no heuristic here."""\n\n\ndef evaluate(answer):\n    raise RuntimeError("AI unavailable")\n')
    assert any("heuristic" in w for w in code_vocabulary(bad))
    assert not any("heuristic" in w or "fallback" in w for w in code_vocabulary(ok))


def test_the_only_ai_call_site_is_the_gemini_service():
    for path in SOURCES:
        if path.name == "gemini_service.py":
            continue
        assert "google.genai" not in path.read_text() and "from google import genai" not in path.read_text(), f"{path.name} talks to the SDK directly"


def test_without_a_key_no_endpoint_produces_questions_scores_or_feedback(client, monkeypatch):
    sid = client.post("/api/interviews/start", json=CONFIG).json()["session_id"]  # created while a key is configured
    submit(client, sid, 1)
    monkeypatch.setattr(gemini_service, "settings", dataclasses.replace(gemini_service.settings, gemini_api_key=""))

    start = client.post("/api/interviews/start", json=CONFIG)
    assert start.status_code == 503 and start.json()["error"]["code"] == "AI_NOT_CONFIGURED"
    assert not re.search(r"questions|session_id|strengths|overall_score", start.text.replace("AI_NOT_CONFIGURED", ""))

    scored = evaluate(client, sid, 1)
    assert scored.status_code == 503 and scored.json()["error"]["code"] == "AI_NOT_CONFIGURED"
    assert not re.search(r"strengths|weaknesses|overall_score|improved_answer", scored.text)


@pytest.mark.parametrize("failure", ["rate_limit", "unavailable", "timeout", "bad_json", "blocked"])
def test_every_ai_failure_leaves_the_evaluation_empty_not_estimated(client, interview, gemini, failure):
    from tests.stub_gemini import http_error, raw_text

    sid, _ = interview
    submit(client, sid, 1)
    gemini.script.extend({"rate_limit": [http_error(429, "RESOURCE_EXHAUSTED")], "unavailable": [http_error(503, "UNAVAILABLE")] * 2, "timeout": [http_error(504, "DEADLINE_EXCEEDED")] * 2, "bad_json": [raw_text("{}")] * 2, "blocked": [("blocked",)]}[failure])
    response = evaluate(client, sid, 1)
    assert response.status_code >= 400 and "overall_score" not in response.text
    from app.core.session_store import store

    assert store.get(sid).question(1).evaluation is None
    assert client.get(f"/api/interviews/{sid}/results").status_code == 409  # an unscored answer never becomes a score


def test_a_failed_summary_returns_no_summary_text_at_all(client, interview, gemini):
    from tests.stub_gemini import http_error

    sid, _ = interview
    for n in range(1, 6):
        submit(client, sid, n, answer=GOOD_ANSWER)
        evaluate(client, sid, n)
    gemini.script.append(http_error(503, "UNAVAILABLE"))
    gemini.script.append(http_error(503, "UNAVAILABLE"))
    body = client.get(f"/api/interviews/{sid}/results").json()
    assert body["summary"] is None and body["summary_error"]["code"] == "AI_UNAVAILABLE"
