# InterviewIQ: your personal AI interview coach

Practice interviews for the role you are applying to. You choose a role, experience level, difficulty and interview type. Gemini writes five questions, scores each answer on four criteria, writes an ideal answer, a follow-up question and a study topic, and finishes with a report and an AI-written summary.

There is no login and no database. Sessions live in the backend's memory, and every score, summary and piece of feedback comes from Gemini. If Gemini cannot answer, the app shows an error. It never makes up content.

Docs: [Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Testing report](docs/TESTING_REPORT.md) · [Five-minute demo script](docs/DEMO_SCRIPT.md)

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4, React Router 7, Axios, Lucide icons (port **5173**) |
| Backend | Python 3.11+, FastAPI, Pydantic 2, Uvicorn, python-dotenv (port **8000**) |
| AI | Google Gemini through the `google-genai` SDK, structured JSON validated with Pydantic |
| Tests | pytest (backend), Vitest and oxlint (frontend), puppeteer-core browser QA in `qa/` |

## Folder structure

```
InterviewIQ/
├── backend/
│   ├── app/
│   │   ├── core/        config, errors, in-memory session store, security middleware
│   │   ├── routes/      health, interviews, evaluations
│   │   ├── schemas/     Pydantic request, response and AI-output models
│   │   ├── services/    interview, question, evaluation, gemini_service, prompts
│   │   └── main.py      FastAPI app, CORS, error handlers
│   ├── tests/           pytest suite (includes a local stand-in for Gemini)
│   ├── requirements.txt / requirements-dev.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/         Axios client, API calls, error mapping
│   │   ├── components/  ui, layout, interview, results
│   │   ├── features/    interview session model (state machine)
│   │   ├── hooks/       session workflow, timer, dialogs
│   │   ├── pages/       Dashboard, NewInterview, InterviewRoom, Results, History, Performance, Settings
│   │   └── utils/       scoring, validation, stats, formatting
│   └── .env.example
├── docs/                PRD, architecture, testing report, demo script
└── qa/                  browser and API QA scripts (see qa/README.md)
```

## Installation

You need **Python 3.11+**, **Node.js 20+** with npm, and a Gemini API key (see [Gemini API setup](#gemini-api-setup)).

**Backend**

```bash
cd InterviewIQ/backend
python3.12 -m venv .venv             # any Python 3.11+; check with: python3 --version
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # then add your key, see below
```

**Frontend**

```bash
cd InterviewIQ/frontend
npm install
cp .env.example .env
```

## Environment configuration

**`backend/.env`** is secret and git-ignored.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | none | Your Gemini key. Required for any AI feature |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model name. Change it if you see `AI_MODEL_NOT_FOUND` |
| `GEMINI_TIMEOUT_SECONDS` | `30` | Timeout per Gemini request (one retry on failure) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | The only origin CORS allows |
| `SESSION_TTL_MINUTES` | `120` | In-memory session expiry |
| `MAX_SESSIONS` | `500` | Oldest sessions are evicted beyond this |
| `MAX_AI_CALLS_PER_SESSION` | `10` | Cap on Gemini requests per interview (a normal one uses 7) |

**`frontend/.env`** is public, because Vite bundles it into the browser. Never put a secret in it.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend root URL (request paths include `/api`) |

## Gemini API setup

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Set it in `backend/.env`: `GEMINI_API_KEY=your-key`. The key stays on the server and is never sent to the browser or written to logs.
3. Start the backend and check `curl http://localhost:8000/api/health`. It should report `"ai_configured": true`.
4. Optional: check the real integration with `cd backend && python -m pytest -m live -s`. It uses about 11 requests and skips itself when no key is set.

## Running the app

Use two terminals.

```bash
# Terminal 1: backend
cd InterviewIQ/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2: frontend
cd InterviewIQ/frontend
npm run dev
```

Open **http://localhost:5173**.

## API documentation

The backend generates its own documentation:

- Swagger UI: **http://localhost:8000/docs** (use "Try it out")
- ReDoc: http://localhost:8000/redoc
- OpenAPI schema: http://localhost:8000/openapi.json

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service status and whether a Gemini key is configured |
| POST | `/api/interviews/start` | Create a session and ask Gemini for five questions |
| POST | `/api/interviews/{session_id}/submit-answer` | Save an answer, or `{"skipped": true}` |
| POST | `/api/interviews/{session_id}/evaluate` | Score one saved answer with Gemini |
| GET | `/api/interviews/{session_id}/results` | Final report plus a Gemini-written summary |

Errors always use `{"error": {"code", "message", "details"}}`. Codes such as `AI_NOT_CONFIGURED`, `AI_AUTH_FAILED`, `AI_RATE_LIMITED` and `AI_TIMEOUT` say what went wrong. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tests

```bash
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest                     # 232 tests (live Gemini tests excluded)

cd ../frontend
npm test                             # 124 Vitest tests
npm run lint
```

Browser QA scripts live in [qa/](qa/README.md). They run against a local stand-in for Gemini, so they check the app's behaviour rather than the quality of real Gemini output.

## Troubleshooting

| Problem | Fix |
|---|---|
| "We couldn't reach the InterviewIQ server" | Start the backend on port 8000. After editing `frontend/.env`, restart `npm run dev` |
| "The AI service isn't set up yet" | Add a real key to `backend/.env` and restart the backend |
| "The AI service rejected the API key" | Check the key, and that the Gemini API is enabled for it |
| "Your interview session has expired" | The backend restarted or the session timed out. Start a new interview |
| Refreshed the page mid-interview | The interview state lives in the open tab, so a refresh loses it (the browser warns first). Start a new one |
| `Address already in use` | Find the process with `lsof -ti tcp:8000 -sTCP:LISTEN` (or 5173) and stop it |
| `ModuleNotFoundError: app` | Run uvicorn from inside `backend/` |

## Security notes

- The Gemini key lives only in `backend/.env`. `/api/health` reports only whether one is set.
- CORS allows only `FRONTEND_ORIGIN`. Request bodies are capped at 64 KB.
- The candidate's name is never sent to Google, and prompts and answers are never logged.

# interview_bot
