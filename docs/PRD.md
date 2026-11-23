# InterviewIQ — MVP Product Requirements Document

**Product:** InterviewIQ — Your Personal AI Interview Coach
**Version:** MVP v1.0 (2-hour build)
**Status:** Draft — awaiting approval
**Date:** 2026-11-22

---

## 1. Overview

InterviewIQ is a web app that runs a short AI mock interview for a selected job role, evaluates each text answer, and produces a results report with scores, strengths, weaknesses, and learning recommendations.

### 1.1 Goal of this MVP
Prove the core loop works end-to-end in a single browser session:

**Setup → 5 AI questions (one at a time) → AI evaluation per answer → Results report**

### 1.2 Target users
- College students preparing for placements
- Fresh graduates
- Job seekers

### 1.3 Build constraints (2-hour scope)
| Constraint | Decision |
|---|---|
| Authentication | None |
| Payments | None |
| Database | None — in-memory only |
| Admin panel | None |
| Deployment | None — runs locally |
| State | React state (frontend) + in-memory session store (backend) |
| Answers | Text only |
| Question count | Fixed at 5 |

---

## 2. Scope Summary (MoSCoW)

| Priority | Features |
|---|---|
| **Must** | Setup form, 5 AI-generated questions shown one at a time, text answers, AI evaluation per answer, results page, input validation, loading + error states, API key kept server-side |
| **Should** | Progress indicator ("Question 2 of 5"), character counter, retry on AI failure, "Start new interview" button, answer word-limit guidance |
| **Could** | Skip question, show follow-up question as optional practice, copy/print results, dark mode, per-criterion score bars |
| **Won't (MVP)** | Login, database, history across sessions, voice/video, coding editor, resume upload, payments, admin panel, deployment, multi-language, PDF export |

---

## 3. User Journey

```
[Landing / Setup Page]
   │  Enter name, role, experience, difficulty, interview type
   │  Click "Start Interview"
   ▼
[Interview Page]
   │  Q1 shown → user types answer → "Submit Answer"
   │  AI evaluates → feedback shown for Q1
   │  "Next Question" → Q2 ... repeat until Q5
   ▼
[Results Page]
   │  Overall score, per-question scores, strengths,
   │  weaknesses, learning recommendations
   │  "Start New Interview" → back to Setup
```

### 3.1 Step-by-step
1. User opens the app and sees the setup form.
2. User fills in all fields and clicks **Start Interview**.
3. System creates an in-memory session and requests Question 1 from the AI.
4. User reads the question, types an answer, and clicks **Submit Answer**.
5. System sends the question + answer to the AI for evaluation.
6. System displays the evaluation (scores, strengths, weaknesses, improved answer, follow-up question).
7. User clicks **Next Question**. Steps 4–6 repeat until 5 questions are complete.
8. After Question 5, user clicks **View Results**.
9. System shows the final results report.
10. User may click **Start New Interview**, which clears the session.

---

## 4. Functional Requirements

### 4.1 Interview Setup
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | System shall display a setup form with: Candidate Name, Job Role, Experience Level, Difficulty, Interview Type. | Must |
| FR-02 | Job Role dropdown shall contain exactly: Python Developer, Java Developer, Frontend Developer, Backend Developer, Full Stack Developer, Data Analyst, Machine Learning Engineer. | Must |
| FR-03 | Experience dropdown shall contain: Fresher (0 yrs), 0–1 yrs, 1–3 yrs, 3+ yrs. | Must |
| FR-04 | Difficulty dropdown shall contain: Easy, Medium, Hard. | Must |
| FR-05 | Interview Type shall offer: Technical, HR, Mixed. | Must |
| FR-06 | "Start Interview" button shall be disabled until all fields are valid. | Must |
| FR-07 | On start, system shall create an in-memory session with a unique session ID. | Must |

### 4.2 Interview Flow
| ID | Requirement | Priority |
|---|---|---|
| FR-08 | System shall generate questions using AI based on role, experience, difficulty, and type. | Must |
| FR-09 | System shall present exactly 5 questions per interview, one at a time. | Must |
| FR-10 | System shall not repeat a question within the same session. | Must |
| FR-11 | For Mixed interviews, system shall ask 3 technical and 2 HR questions. | Must |
| FR-12 | User shall answer each question in a multi-line text box. | Must |
| FR-13 | System shall show a progress indicator ("Question X of 5"). | Should |
| FR-14 | System shall show a character counter on the answer box. | Should |
| FR-15 | User may skip a question; a skipped question scores 0. | Could |
| FR-16 | User cannot go back to edit a submitted answer. | Must |

### 4.3 AI Evaluation (per answer)
| ID | Requirement | Priority |
|---|---|---|
| FR-17 | System shall evaluate each answer and return scores (0–10) for: Technical Accuracy, Relevance, Clarity, Completeness. | Must |
| FR-18 | System shall return an Overall Score (0–10) for the answer. | Must |
| FR-19 | System shall return 1–3 Strengths and 1–3 Weaknesses. | Must |
| FR-20 | System shall return an Improved Answer (model answer). | Must |
| FR-21 | System shall return one Follow-up Question (displayed for practice; not scored). | Must |
| FR-22 | For HR questions, "Technical Accuracy" shall be evaluated as "Accuracy / Appropriateness" of content. | Should |
| FR-23 | AI response shall be in a fixed structured JSON format so the UI can render it reliably. | Must |

### 4.4 Results
| ID | Requirement | Priority |
|---|---|---|
| FR-24 | System shall display the Overall Interview Score (0–100). | Must |
| FR-25 | System shall display each question with its score. | Must |
| FR-26 | System shall display consolidated Strengths and Weaknesses across all answers. | Must |
| FR-27 | System shall display 3–5 Learning Recommendations (topics/actions to study). | Must |
| FR-28 | System shall show a performance label based on score (see Business Rules). | Should |
| FR-29 | User shall be able to expand each question to see full feedback and improved answer. | Should |
| FR-30 | "Start New Interview" shall clear the current session and return to setup. | Should |
| FR-31 | User may copy or print the results. | Could |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement | Priority |
|---|---|---|---|
| NFR-01 | Performance | Question generation should complete within 10 seconds. | Must |
| NFR-02 | Performance | Answer evaluation should complete within 15 seconds. | Must |
| NFR-03 | Usability | Show a loading indicator during every AI call. | Must |
| NFR-04 | Usability | UI must be usable on desktop and mobile browsers (responsive). | Should |
| NFR-05 | Usability | A first-time user should complete an interview without instructions. | Must |
| NFR-06 | Reliability | One failed AI call must not crash the app; user can retry. | Must |
| NFR-07 | Reliability | Malformed AI JSON must be handled gracefully. | Must |
| NFR-08 | Compatibility | Works on latest Chrome, Edge, Firefox, Safari. | Should |
| NFR-09 | Maintainability | AI prompts kept in one place, separate from UI code. | Should |
| NFR-10 | Accessibility | Form fields have labels; buttons are keyboard accessible. | Should |
| NFR-11 | Cost | Each interview should use no more than ~11 AI calls (5 questions + 5 evaluations + 1 summary). | Should |

---

## 6. Business Rules

| ID | Rule |
|---|---|
| BR-01 | Every interview has exactly 5 questions. |
| BR-02 | Questions must match the selected role, experience, difficulty, and type. |
| BR-03 | Mixed interview = 3 technical + 2 HR questions. |
| BR-04 | Per-answer criteria scores are integers 0–10. |
| BR-05 | Per-question overall score = average of the 4 criteria, rounded to 1 decimal. |
| BR-06 | Overall interview score (0–100) = average of the 5 question scores × 10, rounded to whole number. |
| BR-07 | Skipped or empty-after-trim answers score 0 on all criteria (if skip is enabled). |
| BR-08 | Performance labels: 0–39 = Needs Improvement, 40–59 = Average, 60–79 = Good, 80–100 = Excellent. |
| BR-09 | The follow-up question is for practice only and does not affect the score. |
| BR-10 | Submitted answers cannot be edited. |
| BR-11 | A session exists only while the browser tab is open / server is running. Refresh = session lost. |
| BR-12 | The AI must act as a strict, fair interviewer — no inflated scores for vague answers. |
| BR-13 | Answers that are off-topic or nonsense must score low on Relevance. |

---

## 7. Input Validation

| Field | Type | Rules | Error Message |
|---|---|---|---|
| Candidate Name | Text | Required; 2–50 characters; letters, spaces, `.`, `'`, `-` only; trimmed | "Please enter a valid name (2–50 letters)." |
| Job Role | Dropdown | Required; must be one of the 7 listed roles | "Please select a job role." |
| Experience | Dropdown | Required; must be one of the listed options | "Please select your experience level." |
| Difficulty | Dropdown | Required; Easy / Medium / Hard | "Please select a difficulty level." |
| Interview Type | Radio/Dropdown | Required; Technical / HR / Mixed | "Please select an interview type." |
| Answer | Textarea | Required; min 10 characters after trim; max 2,000 characters | "Answer must be at least 10 characters." / "Answer cannot exceed 2,000 characters." |

**Validation rules:**
- Validate on the frontend for instant feedback **and** on the backend before calling the AI.
- Trim leading/trailing whitespace before validating.
- Reject dropdown values not in the allowed list (prevents tampered requests).

---

## 8. Error Scenarios

| ID | Scenario | System Behavior | User Message |
|---|---|---|---|
| ERR-01 | AI API is down or unreachable | Show error with Retry button; keep user's typed answer | "We couldn't reach the AI. Please try again." |
| ERR-02 | AI request times out (>30s) | Cancel request, allow retry | "This is taking longer than usual. Please retry." |
| ERR-03 | AI returns malformed / non-JSON response | Retry once automatically; if still bad, show retry button | "Something went wrong generating feedback. Please retry." |
| ERR-04 | Missing or invalid API key | Block interview start; log server error | "Service is not configured. Please contact the administrator." |
| ERR-05 | AI rate limit reached | Show wait-and-retry message | "Too many requests. Please wait a moment and try again." |
| ERR-06 | Session not found (server restarted) | Redirect to setup | "Your session expired. Please start a new interview." |
| ERR-07 | User refreshes mid-interview | Progress is lost; return to setup | (Optional) warn before leaving: "Your progress will be lost." |
| ERR-08 | Invalid input sent to backend | Return 400 with field errors | Show field-level validation messages |
| ERR-09 | Duplicate question generated | Regenerate once | (Silent to user) |
| ERR-10 | User double-clicks Submit | Disable button while request is in progress | (Silent to user) |
| ERR-11 | No internet connection | Show offline message | "You appear to be offline. Check your connection." |

---

## 9. Security Requirements

| ID | Requirement | Priority |
|---|---|---|
| SEC-01 | AI API key must be stored in a server-side `.env` file and never sent to the browser. | Must |
| SEC-02 | `.env` must be excluded from version control (`.gitignore`). | Must |
| SEC-03 | All AI calls go through the backend, never directly from React. | Must |
| SEC-04 | Validate and sanitize all inputs on the backend. | Must |
| SEC-05 | Render AI output as plain text (no raw HTML injection) to prevent XSS. | Must |
| SEC-06 | Protect against prompt injection: wrap user answers in clear delimiters and instruct the AI to treat them as answer text only, never as instructions. | Must |
| SEC-07 | Enforce answer length limit (2,000 chars) to control cost and abuse. | Must |
| SEC-08 | Do not log candidate answers or names to the console in production mode. | Should |
| SEC-09 | Restrict CORS to the local frontend origin. | Should |
| SEC-10 | Basic per-session rate limit (e.g., max 15 AI calls per session). | Could |
| SEC-11 | Do not collect personal data beyond first name; show a note that data is not stored. | Should |

---

## 10. Data Model (in-memory, conceptual)

**Session**
- Session ID
- Candidate: name, role, experience, difficulty, interview type
- Current question number (1–5)
- Questions list: question text, category (Technical/HR), answer, evaluation
- Status: in-progress / completed
- Created time

**Evaluation (per answer)**
- Technical Accuracy, Relevance, Clarity, Completeness (0–10 each)
- Overall score (0–10)
- Strengths (1–3), Weaknesses (1–3)
- Improved answer
- Follow-up question

**Results**
- Overall interview score (0–100) + performance label
- Per-question scores
- Consolidated strengths and weaknesses
- Learning recommendations (3–5)

---

## 11. MVP Limitations

1. **No persistence** — refreshing the page or restarting the server loses the interview.
2. **No user accounts** — no history, no progress tracking across sessions.
3. **Text only** — no voice, video, or body-language analysis.
4. **No coding round** — technical questions are conceptual/explanatory, not live coding.
5. **Fixed 5 questions** — no custom length.
6. **Follow-up questions are not interactive** — shown for practice only, not answered or scored.
7. **AI scoring can vary** — the same answer may receive slightly different scores on different runs.
8. **AI may occasionally be wrong** — model answers should be treated as guidance, not absolute truth.
9. **English only.**
10. **Local only** — not deployed; single user per running instance.
11. **No resume or job description upload.**

---

## 12. Acceptance Criteria (MVP Done = all true)

- [ ] User can complete setup with valid inputs; invalid inputs show clear errors.
- [ ] Exactly 5 relevant, non-repeating questions are shown one at a time.
- [ ] Each submitted answer gets 4 criteria scores, overall score, strengths, weaknesses, improved answer, and follow-up question.
- [ ] Results page shows overall score (0–100), per-question scores, strengths, weaknesses, and learning recommendations.
- [ ] Loading indicators appear during every AI call.
- [ ] AI failures show a friendly message and a working Retry.
- [ ] API key is never visible in the browser (network tab / source).
- [ ] "Start New Interview" fully resets the flow.

---

## 13. Future Roadmap (post-MVP)

- User accounts + database for interview history and progress tracking
- Interactive follow-up questions
- Voice answers (speech-to-text)
- Resume / JD upload for personalized questions
- Coding round with in-browser editor
- PDF report export
- Deployment and freemium pricing
- College / placement-cell dashboard (B2B)

---

## 14. Approval

| Item | Status |
|---|---|
| MVP feature scope (Section 2) | ⬜ Pending approval |
| Business rules (Section 6) | ⬜ Pending approval |
| Limitations accepted (Section 11) | ⬜ Pending approval |
