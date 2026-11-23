# InterviewIQ QA tooling

Reproducible end-to-end tests that drive the **running application**: a real Chrome browser against the real React app, the real
FastAPI backend and the real `google-genai` SDK. Results of the last full run, and the bugs they found, are in
[../docs/TESTING_REPORT.md](../docs/TESTING_REPORT.md). Raw output of each run is in `results/`.

## What "Gemini" means in these tests

The sandbox this was built in had **no Gemini API key**. The scripts therefore use `backend/tests/stub_gemini.py`: a small local
stand-in for Google's `generateContent` endpoint. The app's real SDK code talks real HTTP to it, so request format, parsing,
validation, retries and error handling are exercised. **It cannot tell you whether Google accepts your model name or schema, or how
good real Gemini's questions and scores are.** For that, add `GEMINI_API_KEY` to `backend/.env` and run, in `backend/`:

```bash
python -m pytest -m live -s
```

## Prerequisites

- The frontend dev server running: `cd frontend && npm run dev` (port 5173)
- `cd qa && npm install` (installs `puppeteer-core` only; it uses your installed Chrome)
- Chrome at the macOS default path, or set `CHROME_PATH=/path/to/chrome`

## Running

From the project root (`InterviewIQ/`):

```bash
node qa/run.mjs qa/api-probes.mjs                 # ~150 s: 126 live HTTP probes (incl. a real 65 s session-expiry test)
node qa/run.mjs qa/browser-frontend.mjs           # ~2 min: navigation, forms, room, timer, edge cases, malformed API responses
node qa/run.mjs qa/browser-journey.mjs            # ~3 min: the full journey, every AI failure mode, retake
node qa/run.mjs qa/browser-security-perf.mjs      # ~2 min: production build, performance, secrets, responsive, accessibility
node qa/run.mjs --real qa/no-key.mjs              # the backend exactly as configured in backend/.env (no stand-in)
```

`run.mjs` starts the stand-in Gemini on a free port, starts the backend pointed at it, runs the scripts, then restarts the backend
in its real configuration. It only ever kills processes it started, or a listener on port 8000 whose command line it has verified
is this project's `uvicorn app.main:app`.

## Files

| File | Purpose |
|---|---|
| `lib/stack.mjs` | starts/stops the stand-in and the backend; test reporter |
| `lib/browser.mjs` | Chrome launch, a page that records console/network, common actions |
| `api-probes.mjs` | black-box HTTP probes: methods, malformed bodies, types, hostile ids, size limits, CORS, concurrency, latency, expiry |
| `browser-frontend.mjs` | screens, validation, room workflow, timer, long/hostile text, offline, refresh, back button, two users, bad API responses |
| `browser-journey.mjs` | the complete user journey and the Gemini failure scenarios through the UI |
| `browser-security-perf.mjs` | bundle size, load timing, API-call efficiency, secret scans, file exposure, responsive matrix, accessibility basics |
| `no-key.mjs` | behaviour with no key, nothing simulated |
| `probe-*.mjs` | small diagnostics used to confirm individual findings |

The backend's own tests (`backend/tests/`) and the frontend's (`frontend/src/**/*.test.js`) are run with `pytest` and `npm test`.
