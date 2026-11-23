# InterviewIQ: QA Testing Report

**Date:** 2026-11-22 · **Build tested:** the current working tree (React 19 + Vite frontend, FastAPI backend, `google-genai` 3.6.1)
**Environment:** macOS 27.0.1 · Node 22.22 · Python 3.12.7 · Chrome 157 (headless) · backend on `:8000`, frontend on `:5173`

---

## 1. Verdict

| | |
|---|---|
| **Overall** | **Not yet fully verified. One blocking gap: the real Gemini API has not been tested.** Everything else that could be tested here passes. |
| **Bugs found** | 9 application bugs (0 Critical, 1 High, 3 Medium, 5 Low) + 1 dependency issue + 1 environment observation. **All 9 application bugs are fixed and retested.** |
| **Checks executed** | 779 automated checks across 9 suites, plus 4 live-Gemini tests that were **skipped** (no API key) |
| **Readiness** | Ready for **local/demo use once the live Gemini tests pass**. **Not ready for a public deployment** (see §9). |

### The most important caveat

**No Gemini API key was available** (`GEMINI_API_KEY` is empty in `backend/.env`; checked, and no `GEMINI_API_KEY` / `GOOGLE_API_KEY` in the environment). So:

- **NOT EXECUTED:** real question generation, whether the questions suit the chosen role, evaluation accuracy and consistency, the quality of strengths / ideal answers / recommendations, real rate limits and timeouts, whether Google accepts the configured model name and the structured-output schemas, and real Gemini latency.
- **Executed against a stand-in:** everything else about the Gemini integration. The stand-in (`backend/tests/stub_gemini.py`) is a small local server that mimics Google's `generateContent` endpoint. The application's real `google-genai` SDK code talks real HTTP to it, so the request format, auth header, response parsing, validation, retries and every error mapping are genuinely exercised. **It proves my integration code; it does not prove Gemini.** Its output is canned and marked `(stub)`. The application never imports it (enforced by a test).
- **Executed for real:** the application exactly as configured on this machine (no key, no stand-in): 16 checks, all pass.

To close the gap: add `GEMINI_API_KEY` to `backend/.env`, then in `backend/` run `python -m pytest -m live -s`.

---

## 2. Method

Tested the running application, not a design of it: a real Chrome driven by Puppeteer against the real React app, real FastAPI server and real SDK; plus black-box HTTP probes, pytest suites, an OpenAPI contract test, a production-build performance run, secret scans and dependency audits.

Every defect was recorded when found (the failing run is saved), fixed minimally without rewriting working components or changing approved scope, covered by a regression test, and retested. Where a check failed because **my test was wrong**, that is recorded too (§7).

**Severity:** *Critical* = data loss, security breach or the app is unusable for everyone · *High* = a main flow breaks or the UI is lost, with no recovery · *Medium* = a real user is blocked or a resource is exposed to abuse · *Low* = minor inaccuracy, hardening or documentation.

---

## 3. Results at a glance

| Suite | What it covers | Executed | Passed | Failed |
|---|---|---|---|---|
| Backend `pytest` | API flow, validation, errors, Gemini integration, OpenAPI contract, no-fake-data guards, regressions | 232 | 232 | 0 (3 consecutive runs, no flakiness) |
| Frontend unit (`vitest`) | API service, response guards, errors, session logic, validation | 124 | 124 | 0 |
| `qa/api-probes.mjs` | Live HTTP: methods, malformed bodies, types, hostile ids, limits, headers, CORS, concurrency, latency, real expiry | 126 | 126 | 0 (first run: 120 checks, **17 failed**) |
| `qa/browser-frontend.mjs` | Screens, forms, room, timer, edge cases, bad API responses | 123 | 123 | 0 (first complete run: 119 checks, **7 failed**) |
| `qa/browser-journey.mjs` | Full journey, every AI failure mode, retake | 105 | 105 | 0 |
| `qa/browser-security-perf.mjs` | Production build, performance, secrets, responsive, accessibility | 47 | 47 | 0 |
| `qa/no-key.mjs` (real config) | The app as configured here, nothing simulated | 16 | 16 | 0 |
| Diagnostics | Overflow fix, switch accessible names | 6 | 6 | 0 |
| **Live Gemini** (`pytest -m live`) | Real Google API | 4 | : | **4 skipped: no key** |
| Dependency audits | npm production, npm all, pip (all installed incl. transitive) | 3 | 3 | 0 (npm-all failed first: 3 dev-only advisories, fixed by upgrading, DEP-1) |

Evidence: `qa/results/*.txt` (raw output of each run; `*.before-fixes.txt` are the runs that found the bugs) and screenshots in the same folder.

---

## 4. Test cases and results

Legend: ✅ executed and passed · 🔧 found a bug, fixed and retested · ⛔ **not executed** · ⚠ executed against the stand-in, not real Gemini

### 4.1 Frontend

| # | Test case | Result |
|---|---|---|
| F1 | All 6 routes render at **desktop 1440 / tablet 768 / mobile 390** with no horizontal scroll | ✅ |
| F2 | Sidebar has the 5 required items; exactly one marked current; title follows route | ✅ |
| F3 | Tablet/mobile: menu button, drawer opens/closes (Escape, selecting an item) | ✅ |
| F4 | No console errors or warnings on any screen, any viewport (production and dev build) | ✅ |
| F5 | Setup: empty form → error, focus moves to the name, **no request sent** | ✅ |
| F6 | Name validation (13 cases: unicode, curly apostrophe, digits, emoji, 50/51 chars…) | 🔧 BUG-1 |
| F7 | Live re-validation clears the error; summary panel follows role/difficulty/type; question count locked at 5; all 7 roles | ✅ |
| F8 | Room: Previous/Next/navigator, drafts survive navigation, edit before submit, counter | ✅ |
| F9 | Empty and whitespace-only answers cannot be submitted; 9 chars refused with a message; 10 chars accepted; Ctrl+Enter | ✅ |
| F10 | Skip is stored on the server, reopens, and can be answered later | ✅ |
| F11 | **Timer:** starts 0:00, counts, keeps a question's time, pauses on submit and when the tab is hidden | 🔧 BUG-8 |
| F12 | Progress text and navigator state; Exit confirmation (Escape dismisses; confirm discards; no resume offered) | ✅ |
| F13 | Results page: score card, skills, 5 question cards, strengths, improvement areas, learning, review, Expand/Collapse all | ✅ |
| F14 | Actions: Back to Dashboard, Review Answers (scrolls + opens), card → Review answer, Retake (prefilled) | ✅ |
| F15 | Loading states (start, evaluate, finish) and disabled buttons while requests run | ✅ |
| F16 | Error messages: network, timeout, each AI error, expired session, client-side validation (server-side field-error mapping is covered by unit tests) | ✅ |

### 4.2 Backend API (live HTTP + pytest + contract)

| # | Test case | Result |
|---|---|---|
| B1 | All 5 endpoints: success path, status codes (200/201/404/409/422/429/502/503/504) | ✅ |
| B2 | **Every response body validated against the published OpenAPI schema**, including all error responses (24 contract tests) | 🔧 BUG-9 |
| B3 | Invalid inputs: missing fields, wrong types, unknown fields, boundaries (name 1/2/50/51, answer 9/10/2000/2001), NUL bytes, RTL, emoji, HTML | 🔧 BUG-1, 4 |
| B4 | Malformed bodies: none, `null`, `[]`, truncated JSON, invalid UTF-8, 10,000-level nesting, wrong content-type: all 4xx in the standard shape, never 5xx | ✅ |
| B5 | Hostile session ids (unknown, traversal, SQL-like, `<script>`, NUL, unicode, 10,000 chars): all 404, never 5xx | 🔧 BUG-5 |
| B6 | **Expired session**: real 65 s idle expiry over HTTP; activity keeps a session alive; writes to an expired session refused; eviction at the cap | ✅ |
| B7 | Duplicate answers: second submit → 409; 20 simultaneous submits → exactly one 200 and nineteen 409 | ✅ |
| B8 | Progress tracking (answered/skipped/remaining/percent/next question); incomplete interview → 409 listing exactly what is missing | ✅ |
| B9 | Result retrieval: built once, cached, idempotent; locked after completion; 20 simultaneous requests → one Gemini request | ✅ |
| B10 | Methods/routes: 405/404 in the standard shape | ✅ |
| B11 | Oversized bodies (1 / 10 / 64 MB) | 🔧 BUG-2 |

### 4.3 Gemini

| # | Test case | Result |
|---|---|---|
| G1 | Real question generation | ⛔ no key |
| G2 | Generated questions suit the selected job role | ⛔ no key. ⚠ Verified only that the role, experience, difficulty, type and the technical/HR split **are sent** to Gemini |
| G3 | Evaluation accuracy and consistency | ⛔ no key |
| G4 | **Scoring calculations:** overall = average of 4 criteria (1 decimal), question score, overall /100, label bands, skipped = 0, criterion averages, strongest/weakest | ✅ (arithmetic is the backend's, tested with known inputs) |
| G5 | Strengths (3), improvement areas (3), missing concepts, ideal answer, follow-up, recommended topic: **structure, validation and display** | ⚠ ✅ against the stand-in. ⛔ content quality not tested |
| G6 | Gemini-written summary: built from evaluations only (no answers, no name); a quoted score that is not in the report is rejected | ⚠ ✅ |
| G7 | **Missing API key** | ✅ **real configuration**: 503 `AI_NOT_CONFIGURED`, UI says exactly what to do |
| G8 | Rate limit (429), timeout, 5xx, unreachable, invalid key, unknown model, safety block, empty/truncated/invalid JSON, schema-violating output, wrong question count/duplicates | ⚠ ✅ real SDK + real HTTP against the stand-in; each maps to the right typed error; one retry only where sensible |
| G9 | **No fake evaluation data**: no endpoint returns questions, scores or feedback when Gemini fails; a failed summary returns no text; static guard fails if a fallback/heuristic/canned content is added or the app imports test tooling | ✅ |
| G10 | Secrets: key never in responses, logs (incl. tracebacks), or the browser; prompts and answers never logged; candidate name never sent to Google | ✅ |
| G11 | Concurrency: duplicate evaluate/results requests make one Gemini call | ✅ |
| G12 | AI request budget per interview (7 normal, cap 10); missing key does not consume it | ✅ |
| G13 | Prompt injection in an answer: delimiter breakout neutralised | ⚠ ✅ (prompt construction). ⛔ whether the real model resists it (live test exists) |

### 4.4 End-to-end journey (`qa/browser-journey.mjs`, 105 checks, all pass)

Candidate configuration → interview creation → question generation → answers (one skipped) → evaluation → results → review answers → retake (setup prefilled; a second real interview shows "−31 points vs your previous Python Developer interview") → back to dashboard (2 real interviews, no sample data). ⚠ Gemini = stand-in. Also executed: start/evaluate/summary failures and recovery, finish with an unscored answer, backend outage then restart (expired-session screen), results with and without a summary, nothing answered.

### 4.5 Edge cases

| # | Case | Result |
|---|---|---|
| E1 | Empty / whitespace / too-short answers | ✅ |
| E2 | Very long answers: typing stops at 2,000; 2,500 set by script refused; **a 2,000-character unbroken word** | 🔧 BUG-6 |
| E3 | Hostile text (HTML, `<script>`, `onerror`): shown as text, nothing executes, no elements injected; emoji/Arabic/Chinese round-trip | ✅ |
| E4 | Network disconnection (browser offline): friendly error, draft kept, Skip refused, retry works, server sees exactly one submission | ✅ |
| E5 | Backend unavailable at start and mid-answer; server restarts and forgets the session | ✅ |
| E6 | Gemini failure at start / evaluate / summary: message shown, answer kept, retry re-sends only what failed | ✅ ⚠ |
| E7 | **Browser refresh mid-interview**: "leave site?" warning fires; afterwards a clear message and a way to restart; **progress is not restored** | ✅ behaviour as designed → known limitation L2 |
| E8 | Back/Forward: Back returns to setup (warns an interview is in progress), dashboard offers Resume, draft intact | ✅ |
| E9 | **Multiple sessions**: two separate browsers, different roles, at once: results never mix; 20 simultaneous interviews → 20 distinct sessions | ✅ |
| E10 | Incomplete interviews (finish early → unanswered recorded as skipped; Exit discards) | ✅ |
| E11 | **Unexpected API responses** (empty object, `null`, HTML 200, 204, missing/mistyped fields, scores out of range) for start / evaluate / submit / results: 15 browser cases + 31 unit cases | 🔧 BUG-7 |
| E12 | A render exception shows a recovery screen, not a blank page (a real exception was injected) | ✅ (after BUG-7 fix) |

### 4.6 Security

| # | Check | Result |
|---|---|---|
| S1 | Gemini key never in frontend source, production bundle, any API response, the page, storage, or **123 scanned project files** | ✅ |
| S2 | Key, answers and names never in the backend log slices captured during the API probes and the journey run, and a unit test proves a key-leaking error message and traceback are redacted | ✅ |
| S3 | Only `GEMINI_API_KEY`-free `VITE_*` variables; `.gitignore` excludes `.env`/`.env.*` and keeps `.env.example` | ✅ |
| S4 | **CORS:** only `localhost:5173` / `127.0.0.1:5173`; 7 look-alike origins (`…5173.evil.com`, `null`, https, other port…) refused; no credentials; only GET/POST; no custom headers granted; 413 keeps CORS headers | ✅ |
| S5 | Browser contacts only the app, the API and Google Fonts; **never** a Gemini endpoint | ✅ |
| S6 | Dev server does not serve `.env`, `.env.local`, `../backend/.env`, `/@fs/…/backend/.env` | ✅ |
| S7 | Invalid sessions: 404 for unknown/malformed/expired ids; session data not cached | 🔧 BUG-3, 5 |
| S8 | Input handling: strict types, size limit, hostile strings | 🔧 BUG-2, 4 |
| S9 | Dependency audit: npm production **0**; npm all **3 → 0** after upgrade; pip (all installed incl. transitive) **0** | 🔧 DEP-1 |

### 4.7 Performance and compatibility

| Metric (production build, localhost, cache disabled) | Result |
|---|---|
| JavaScript | 416.0 KB raw, **129.8 KB gzip** (budget 150) ✅ |
| CSS | 37.9 KB raw, **7.2 KB gzip** ✅ |
| TTFB / DOMContentLoaded / load | 6 ms / 157 ms / 158 ms |
| First / largest contentful paint | **208 ms / 208 ms** (budget 1500) ✅ |
| Requests on first load | 3 (2 from the app, 138 KB) |
| JS heap after a full interview | 7.2 MB (budget 60) ✅ |
| API overhead, p50 / p95 (n = 25) | start 5.2 / 7.8 ms · submit 1.5 / 2.5 · evaluate 4.9 / 5.5 · results 4.3 / 5.5 ✅ |
| **API calls** | Idle dashboard, idle room (timer running) and idle results: **0 calls** (no polling). A full 5-answer interview: **exactly 12 calls** (1 start, 5 submit, 5 evaluate, 1 results). **Gemini: exactly 7 requests**. Double clicks and 20 simultaneous duplicates: 1 request ✅ |
| Responsive: 3 viewports × 8 screens | No horizontal scroll; every control named, every field labelled, one `h1`, `lang="en"` ✅ |

API latencies are **application overhead only** (the stand-in answers instantly), **not** real Gemini latency, which is untested.

---

## 5. Bugs found

| ID | Severity | Bug | How found | Fix |
|---|---|---|---|---|
| **BUG-7** | **High** | The UI **crashed to a blank white page** on an unexpected API response (empty object, 200 HTML from a proxy, partial evaluation, start with no questions…). No message, no way back. 6 of the 15 browser cases failed before the fix | Browser test 4d (`qa/results/browser-frontend.before-fixes.txt`) | Every endpoint now validates its response (`api/interviewApi.js`) and raises a clear, retryable `UNEXPECTED_RESPONSE`; a top-level `ErrorBoundary` shows a recovery screen for any other render error. 32 unit tests (31 malformed-response cases + the real shapes) and the 15 browser cases; the boundary was proven with an injected render exception |
| **BUG-1** | Medium | Legitimate names rejected: **José, Zoë, Nguyễn, 李雷, प्रिया, O’Neil** (the curly apostrophe phone keyboards insert). The error text gave no hint why. Rule was duplicated in 3 places | API probes | One shared Unicode-aware rule: starts with a letter; letters of any script, combining marks, space, `. ' ’ -`; NFC-normalised; counts characters. Backend `is_valid_name`, frontend `isValidName` (setup **and** Settings) |
| **BUG-2** | Medium | **No request size limit.** A 64 MB body was read fully into memory (backend 82 → 350 MB) before being rejected | API probes | `SecurityMiddleware`: 413 above 64 KB, by `Content-Length` and by counting chunked bodies, before parsing. Now 64 MB → 413 in 177 ms, memory flat. Legitimate worst case (2,000 emoji ≈ 8 KB) still fits |
| **BUG-6** | Medium | A long **unbroken word or URL** in an answer broke the layout: 2,000 characters made the paragraph **16,351 px wide** in a 782 px box; the page scrolled sideways by 16,000 px, and on a phone the browser zoomed everything out | Browser test 4a; `qa/probe-overflow.mjs` | `overflow-wrap:anywhere` on answers, AI-generated text and name headings. Retested: paragraph 782 px in a 782 px box; document = window width on desktop and phone |
| BUG-3 | Low | API responses lacked `X-Content-Type-Options` and `Cache-Control: no-store` (session data/answers could be cached) | API probes | Added by `SecurityMiddleware` |
| BUG-4 | Low | Lax typing: `question_number: true` and `"1"`, `skipped: "yes"` were silently accepted | API probes | `strict=True` on `question_number` and `skipped` |
| BUG-5 | Low | An attacker-chosen 10,000-character session id was echoed back in full in the error | API probes | Truncated to 64 characters |
| BUG-8 | Low | **Per-question timer mis-credits time.** One 1-second interval was shared across questions, so a tick landing while you were briefly on another question gave it a whole second it never had | A *flaky* test (`qa/results/final-api-and-frontend.txt`: `0:01 → 0:03`), investigated rather than re-run | Interval restarts on question change (`hooks/useSessionTimer.js`). Regression check proven both ways: **passes with the fix, fails (`0:01`) with it reverted** |
| BUG-9 | Low | Published OpenAPI contract was wrong: results' 422 documented as FastAPI's default `HTTPValidationError` (real body is `ErrorResponse`); 413 undocumented | Contract tests | Routes now document the real shapes; contract tests fail if the default shape reappears |
| DEP-1 | Low (dev-only) | Vitest 3.2.7 / `tinypool`: 3 advisories (2 rated critical, 1 moderate). Dev tooling only, never shipped | `npm audit` | Upgraded to Vitest 5.1.1. All 124 tests pass; **0 vulnerabilities** |
| ENV-1 | Observation | This machine's npm is configured with a **plaintext `http://` registry**, so `npm audit` failed (HTTP 426) until retried over https. Installs over http are a supply-chain risk (the lockfile's integrity hashes mitigate it) | `npm audit` | **Not changed** (global setting). Suggested: `npm config set registry https://registry.npmjs.org/` |

No Critical bugs found.

---

## 6. Fixes implemented (files)

**Backend:** `app/core/security.py` (new: size limit + headers), `app/core/errors.py` (`RequestTooLargeError`, id truncation), `app/main.py` (middleware order, 413 mapping), `app/schemas/interview.py` and `evaluation.py` (name rule, strict types), `app/routes/*.py` (documented 413/422).
**Frontend:** `src/api/interviewApi.js` (response guards), `src/components/ErrorBoundary.jsx` + `main.jsx`, `src/utils/validation.js` + `pages/SettingsPage.jsx` (shared name rule), `src/hooks/useSessionTimer.js`, text-wrapping classes in `InterviewRoomPage`, `ReviewAnswers`, `FeedbackPanel`, `InsightCard`, `OverallScoreCard`, `DashboardPage`.
**Tests added:** `backend/tests/test_qa_regressions.py` (39), `test_schema_conformance.py` (24), `test_no_fake_data.py` (22); frontend: 49 (32 response-guard cases, 17 name cases); the whole `qa/` folder.
**Approved scope:** unchanged. No feature was removed.

---

## 7. Failures that were my tests being wrong (investigated, not bugs)

Recorded because a QA report that only lists wins hides how the conclusions were reached.

- Hostile ids containing `/` return `NOT_FOUND`, not `SESSION_NOT_FOUND`: the router never reaches the handler; 404 is correct (expectation too strict).
- 2 Settings toggles flagged as "unnamed": Chrome's accessibility tree computes their names from `<label for>` ("Show question timer", "Show example interviews"). The check was wrong.
- "mock" and "fallback" flagged in the no-fake-data guard: the product *is* a mock-interview app, and a docstring said "there is no fallback". The guard now inspects code, not prose, and a test proves it still catches a real `heuristic_evaluate`.
- "Back from the room lands on the dashboard": it lands on the setup page (the previous history entry).
- A role-list check counted the disabled "Select a role" placeholder.
- Two tabs of one headless Chrome stalled each other when driven simultaneously; the multi-user test uses two browsers.
- My first timer regression check **passed with the bug present**. I proved that by reverting the fix, then rewrote it to align with the tick and re-proved it fails without the fix.
- **My QA runner left a test-mode backend running** after the final regression (health showed `ai_configured: true, model: stub-model`, pointing at a stand-in that had already been shut down). Its recorded process id went stale when a script restarted the backend itself. I noticed it in the final state check, fixed the runner to always stop the verified listener on `:8000`, re-ran the scenario that exposed it, and confirmed the real configuration (`ai_configured: false`) is what is left running.
- My very first run of the browser-frontend script stopped after its first section for another wrong assumption; it was fixed before any conclusion was drawn from it.

---

## 8. Remaining known limitations

| # | Limitation | Impact |
|---|---|---|
| **L1** | **Real Gemini untested** (see §1) | **Blocking gate** |
| L2 | **Refreshing mid-interview loses progress.** The browser warns first; afterwards the app shows a clear "no longer available" screen. The server-side session stays until its 2 h TTL. No resume endpoint exists | Medium: expected by the PRD (BR-11), but users will hit it |
| L3 | Sessions are in memory: a backend restart ends every interview (users see the expired-session screen) | By design (MVP scope) |
| L4 | **No authentication and no per-client rate limit.** Anyone who can reach the API can start interviews; each start costs one Gemini request (the per-interview budget does not limit *starts*). Session ids (UUIDs) act as bearer tokens | **High for any public deployment**; N/A for local use |
| L5 | `/docs` and `/openapi.json` are public; no CSP or other security headers on the frontend host; `server: uvicorn` header | Low (local MVP) |
| L6 | The page loads the Geist font from Google Fonts, which tells Google the visitor's IP | Low privacy note; self-host the font to remove it |
| L7 | "Time taken" is the browser's in-room timer; the server does not track time | Informational |
| L8 | Tested in **Chrome only**; Firefox and Safari not tested. Tablet/mobile are emulated viewports with touch, not physical devices | Compatibility not fully verified |
| L9 | Performance is localhost, production build, no network throttling; API latency excludes real Gemini | Real-world numbers unknown |
| L10 | Accessibility: automated basics only (names, labels, headings, language). No screen-reader run, no colour-contrast audit. Settings switches are 44×24 px (meets WCAG 2.2 AA's 24 px minimum, below the 44 px touch guideline) | Low |
| L11 | Load testing was modest (25 sequential, 20 concurrent). No sustained or stress test | Unknown at scale |
| L12 | Question relevance is validated only structurally (count, technical/HR split, no duplicates), not by meaning | Needs the live run (G2) |

---

## 9. Readiness assessment

| Use | Assessment |
|---|---|
| **Local demo / personal practice, with a valid key** | ✅ **Ready after the live gate.** All functionality, error handling, security hygiene and responsive behaviour that could be tested here is solid. Run `python -m pytest -m live -s`; if it passes, ship it |
| **Supervised pilot (a few trusted users, one machine)** | ✅ Acceptable after the live gate, with L2 (refresh loses progress) explained to users |
| **Public internet deployment** | ❌ **Not ready.** Needs authentication or per-client rate limiting (L4), persistent storage (L3), HTTPS and security headers (L5), and resume-after-refresh (L2). Also run the live gate and a real-network performance test |

**Recommended next steps, in order:** (1) add a key and run the live tests; (2) fix whatever they find (model name, schema acceptance, real-output edge cases); (3) decide on L2 and L4 before sharing the app beyond yourself; (4) run the QA scripts in Firefox/Safari.

---

## 10. How to reproduce

```bash
# backend (232 tests; live Gemini tests excluded by default)
cd backend && source .venv/bin/activate && pip install -r requirements-dev.txt && python -m pytest
python -m pytest -m live -s          # REAL Gemini: needs GEMINI_API_KEY in backend/.env

# frontend (124 tests)
cd frontend && npm test && npm run lint && npm run build

# end-to-end (frontend dev server must be running: npm run dev)
cd qa && npm install && cd ..
node qa/run.mjs qa/api-probes.mjs qa/browser-frontend.mjs qa/browser-journey.mjs qa/browser-security-perf.mjs
node qa/run.mjs --real qa/no-key.mjs
```

See [qa/README.md](../qa/README.md) for details. The stand-in Gemini is test tooling only.
