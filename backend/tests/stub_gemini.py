"""TEST-ONLY stand-in for Google's Gemini REST API (`POST /{v1|v1beta}/models/{model}:generateContent`).

It lets the real `google-genai` SDK talk real HTTP to a local server (the SDK honours the
GOOGLE_GEMINI_BASE_URL environment variable), so the tests and the browser integration run exercise the
app's actual Gemini code path: request format, auth header, structured-output schema, response parsing and
HTTP error mapping.

What it does NOT prove: that Google accepts the configured model or schema, or how good real Gemini's
answers are. Only a run with a real key (`python -m pytest -m live`) does that.
The output it generates is canned and clearly marked "(stub)". The application never imports this module.

Run standalone (used by the browser integration test):  python -m tests.stub_gemini --port 8765
"""

import argparse
import asyncio
import json
import re
import threading
import time
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

TEST_KEY = "stub-test-key-not-a-real-credential"


class StubState:
    """What the stub saw, and how it should behave next. Shared with tests when run in-process."""

    def __init__(self) -> None:
        self.expected_key = TEST_KEY
        self.requests: list[dict[str, Any]] = []
        self.script: list[Any] = []  # one behaviour per upcoming request, consumed in order (see `_respond`)

    def reset(self) -> None:
        self.expected_key = TEST_KEY
        self.requests.clear()
        self.script.clear()


# ---- scripted behaviours (put these in `state.script`) -------------------------------------
def http_error(code: int, status: str, message: str = "stub error") -> tuple:
    return ("http", code, status, message)


def raw_text(text: str) -> tuple:
    return ("text", text)


def json_reply(obj: Any) -> tuple:
    return ("json", obj)


def blocked_prompt() -> tuple:
    return ("blocked",)


def finish_reason(reason: str) -> tuple:
    return ("finish", reason)


def slow(seconds: float) -> tuple:
    return ("slow", seconds)


# ---- canned model output -------------------------------------------------------------------
def _line(prompt: str, name: str, default: str = "") -> str:
    match = re.search(rf"^{name}: (.*)$", prompt, re.MULTILINE)
    return match.group(1).strip() if match else default


def canned_questions(prompt: str) -> dict:
    technical, hr = int(_line(prompt, "TECHNICAL_QUESTIONS", "0")), int(_line(prompt, "HR_QUESTIONS", "0"))
    role = _line(prompt, "ROLE", "the role")
    levels = ["beginner", "intermediate", "advanced"]
    questions = []
    for i in range(technical):
        questions.append({
            "text": f"(stub) Explain technical concept number {i + 1} that a {role} should understand.",
            "category": "technical",
            "difficulty": levels[min(i, 2)],
            "topic": f"Technical topic {i + 1}",
            "expected_concepts": [f"concept {i + 1}a", f"concept {i + 1}b", f"concept {i + 1}c"],
            "evaluation_criteria": ["Explains the idea correctly", "Gives a practical example"],
        })
    for i in range(hr):
        questions.append({
            "text": f"(stub) Tell me about behavioural situation number {i + 1} from your work or studies.",
            "category": "hr",
            "difficulty": levels[min(i, 2)],
            "topic": f"Behaviour {i + 1}",
            "expected_concepts": ["Situation", "Action", "Result"],
            "evaluation_criteria": ["Uses a concrete example", "Shows the result"],
        })
    return {"questions": questions}


def canned_evaluation(prompt: str) -> dict:
    match = re.search(r"<candidate_answer>\n(.*?)\n</candidate_answer>", prompt, re.DOTALL)
    answer = match.group(1) if match else ""
    if "EXCELLENT" in answer:
        scores = (9, 9, 8, 9)
    elif "POOR" in answer:
        scores = (2, 3, 2, 1)
    else:
        scores = (7, 8, 6, 6)
    return {
        "technical_accuracy": scores[0],
        "relevance": scores[1],
        "clarity": scores[2],
        "completeness": scores[3],
        "strengths": ["(stub) Stayed on topic.", "(stub) Used a concrete example.", "(stub) Clear opening sentence."],
        "improvement_areas": ["(stub) Explain the trade-offs.", "(stub) Add one more example.", "(stub) Close with a summary."],
        "missing_concepts": ["(stub) a missing concept"],
        "ideal_answer": "(stub) A strong answer explains the idea, gives a concrete example and states the trade-offs clearly.",
        "follow_up_question": "(stub) How would you apply this in a real project?",
        "recommended_topic": "(stub) Core concepts for this role",
    }


def canned_summary(prompt: str) -> dict:
    match = re.search(r"Overall score: (\d+)/100", prompt)
    score = match.group(1) if match else "?"
    return {"summary": f"(stub) You scored {score}/100 overall. Focus on the improvement areas in your feedback and revisit the recommended topics before you retake the interview."}


def _candidate(text: str | None, finish: str = "STOP") -> dict:
    candidate: dict[str, Any] = {"finishReason": finish, "index": 0}
    if text is not None:
        candidate["content"] = {"role": "model", "parts": [{"text": text}]}
    return {
        "candidates": [candidate],
        "usageMetadata": {"promptTokenCount": 50, "candidatesTokenCount": 50, "totalTokenCount": 100},
        "modelVersion": "stub-model",
    }


def _error(code: int, status: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=code, content={"error": {"code": code, "message": message, "status": status}})


async def _respond(state: StubState, body: dict, prompt: str) -> JSONResponse:
    behaviour = state.script.pop(0) if state.script else None
    if callable(behaviour):
        behaviour = behaviour(body)
    kind = behaviour[0] if behaviour else "default"

    if kind == "http":
        return _error(behaviour[1], behaviour[2], behaviour[3])
    if kind == "text":
        return JSONResponse(_candidate(behaviour[1]))
    if kind == "json":
        return JSONResponse(_candidate(json.dumps(behaviour[1])))
    if kind == "blocked":
        return JSONResponse({"promptFeedback": {"blockReason": "SAFETY"}, "modelVersion": "stub-model"})
    if kind == "finish":
        return JSONResponse(_candidate(None, behaviour[1]))
    if kind == "slow":
        await asyncio.sleep(behaviour[1])

    properties = body.get("generationConfig", {}).get("responseSchema", {}).get("properties", {})
    if "questions" in properties:
        return JSONResponse(_candidate(json.dumps(canned_questions(prompt))))
    if "technical_accuracy" in properties:
        return JSONResponse(_candidate(json.dumps(canned_evaluation(prompt))))
    if "summary" in properties:
        return JSONResponse(_candidate(json.dumps(canned_summary(prompt))))
    return _error(400, "INVALID_ARGUMENT", "stub: unrecognised response schema")


def behaviour_from_json(item: dict | None):
    """Control-API form of the scripted behaviours, e.g. {"kind": "http", "code": 429, "status": "RESOURCE_EXHAUSTED"}."""
    if item is None:
        return None  # answer normally
    kind = item["kind"]
    if kind == "http":
        return http_error(item["code"], item["status"], item.get("message", "stub error"))
    if kind == "text":
        return raw_text(item["text"])
    if kind == "blocked":
        return blocked_prompt()
    if kind == "finish":
        return finish_reason(item["reason"])
    if kind == "slow":
        return slow(item["seconds"])
    raise ValueError(f"unknown behaviour {kind!r}")


def create_stub_app(state: StubState) -> FastAPI:
    app = FastAPI(title="Stub Gemini API (tests only)")

    # --- control API, used by the browser integration run (the pytest suite changes `state` directly) ---
    @app.get("/__requests")
    async def requests_seen() -> list[dict]:
        return [
            {
                "api_version": r["api_version"], "model": r["model"], "api_key": r["api_key"], "prompt": r["prompt"],
                "temperature": r["body"].get("generationConfig", {}).get("temperature"),
                "schema_properties": list(r["body"].get("generationConfig", {}).get("responseSchema", {}).get("properties", {})),
            }
            for r in state.requests
        ]

    @app.post("/__reset")
    async def reset() -> dict:
        state.reset()
        return {"ok": True}

    @app.post("/__script")
    async def set_script(request: Request) -> dict:
        state.script[:] = [behaviour_from_json(item) for item in await request.json()]
        return {"queued": len(state.script)}

    @app.post("/__expected_key")
    async def set_expected_key(request: Request) -> dict:
        state.expected_key = (await request.json())["key"]
        return {"ok": True}

    @app.post("/{api_version}/models/{rest:path}")  # the SDK picks the version (v1 by default in the installed release)
    async def generate_content(api_version: str, rest: str, request: Request) -> JSONResponse:
        body = await request.json()
        parts = (body.get("contents") or [{}])[0].get("parts") or [{}]
        prompt = parts[0].get("text", "")
        state.requests.append({
            "api_version": api_version,
            "model": rest.split(":")[0],
            "method": rest.split(":")[-1],
            "api_key": request.headers.get("x-goog-api-key"),
            "body": body,
            "prompt": prompt,
        })
        if request.headers.get("x-goog-api-key") != state.expected_key:
            return _error(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.")
        return await _respond(state, body, prompt)

    return app


class StubServer:
    """Runs the stub on a free local port in a background thread."""

    def __init__(self, port: int = 0) -> None:
        self.state = StubState()
        self._server = uvicorn.Server(uvicorn.Config(create_stub_app(self.state), host="127.0.0.1", port=port, log_level="error"))
        self._thread = threading.Thread(target=self._server.run, daemon=True)

    def start(self) -> "StubServer":
        self._thread.start()
        deadline = time.time() + 10
        while not self._server.started:
            if time.time() > deadline:
                raise RuntimeError("stub Gemini server did not start")
            time.sleep(0.02)
        return self

    def stop(self) -> None:
        self._server.should_exit = True
        self._thread.join(timeout=5)

    @property
    def port(self) -> int:
        return self._server.servers[0].sockets[0].getsockname()[1]

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    stub_state = StubState()
    print(f"stub Gemini API on http://127.0.0.1:{args.port} (test key: {TEST_KEY})", flush=True)
    uvicorn.run(create_stub_app(stub_state), host="127.0.0.1", port=args.port, log_level="warning")
