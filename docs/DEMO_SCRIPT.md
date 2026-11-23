# InterviewIQ: five-minute demo script

Audience: someone seeing the product for the first time (a stakeholder, hiring manager or investor). Aim to finish in about five minutes, with time left for questions.

## Before you start (do this 10 minutes ahead)

1. Put a real key in `backend/.env` (`GEMINI_API_KEY=...`). Start both apps as described in the [README](../README.md#running-the-app).
2. Check `curl http://localhost:8000/api/health`. It must say `"ai_configured": true`. If it says `false`, the demo will stop at the first step.
3. **Do one full dry run** with the same role you will demo. This is the first time real Gemini output has been used end to end (see the note at the bottom). Check that the questions and scores look sensible.
4. Open http://localhost:5173 in a fresh tab at full width, with a clean state. Do not refresh during the demo, because the interview lives in the open tab.
5. Prepare one decent answer to read out (3 to 5 sentences with a concrete example) for the role you pick. Keep it in a note next to the browser.

Gemini calls take a few seconds each (writing questions, scoring an answer, the final summary). The script has talking points to fill those moments. If one fails, the app shows a clear message and a retry button, so say so and retry.

## Script

### 0:00 to 0:30: the problem and the dashboard

> "Most people prepare for interviews by reading lists of questions. They never get feedback on their own answers. InterviewIQ is a practice interviewer: it asks role-specific questions, scores your answers, and tells you what to study next."

Show the **Dashboard**. Point at the empty state and the three steps: set up, answer, improve.

> "This is a clean slate. There is no login and every number on this screen will come from real practice."

### 0:30 to 1:15: set up the interview

Click **Start Interview**. Enter a name, pick a role (for example Python Developer), experience (Mid-level), difficulty (Medium) and type (Mixed).

> "Role, level, difficulty and type change what Gemini asks. Mixed gives three technical questions and two behavioural ones. Every interview is five questions with no time limit."

Click **Start interview**. While the loading screen shows "Preparing your questions":

> "Gemini is writing five questions for this exact role. Nothing is pre-written."

### 1:15 to 2:30: the interview room

Read the first question aloud. Point out the header progress, the question navigator, the timer and the character counter.

> "Candidates move between questions freely, and can skip."

Click **Submit answer** with your prepared answer. While the "Gemini is reviewing your answer" placeholder shows, say:

> "Each answer is scored by Gemini against the question's expected concepts, not by keyword matching."

When the feedback appears, walk down it: the score ring, the four criteria (technical accuracy, relevance, clarity, completeness), strengths, improvement areas, the **ideal answer**, then the **practice follow-up** and **Study next**.

> "This is the part that matters. You see what you did well, what was missing, and a model answer to compare against."

Click **Continue to question 2**. Skip questions 2 to 5 (or answer one more if you are ahead of time), to keep the demo moving.

### 2:30 to 3:00: finishing

Click **Finish**, and show the confirmation dialog, which says how many questions will be marked skipped and score 0, and that answers can't be changed afterwards.

> "Nothing happens by accident. The dialog tells you exactly what finishing will do."

Click **See my summary**.

### 3:00 to 4:00: the results report

While the loading screen shows:

> "The overall score is calculated by our backend from the four criteria averages. Gemini is only asked to write a summary from those evaluations."

On the results page, show:

- The overall score ring, and the sentence written by Gemini beside it
- **Skills**: the four criteria with strongest and weakest highlighted
- **Question-wise performance**: scored and skipped questions
- Strengths, improvement areas and recommendations
- **Review Answers**, which opens the full per-question feedback

> "A skipped question counts as zero in the overall score. We say so on the page rather than hiding it."

### 4:00 to 4:40: progress over time

Click **Back to Dashboard**, then **Interview History** and **Performance**.

> "Each finished interview is saved in this session. History lets you reopen any report, and Performance shows the trend across attempts. There is no fake history: if you have one interview, it says so."

### 4:40 to 5:00: close

> "Everything you saw was generated live. The Gemini key lives only on the server, the browser never sees it, and if Gemini is unavailable the app says so instead of inventing feedback. Next steps would be accounts and saved history."

## If something goes wrong

| What you see | What to say and do |
|---|---|
| "The AI service isn't set up yet" | The key is missing. Stop, fix `backend/.env`, restart the backend |
| "The AI service is busy" or rate-limited | Wait a few seconds and click **Try again**. This is Gemini's quota, not the app |
| "We couldn't reach the InterviewIQ server" | The backend stopped. Restart it. The current interview is lost, so start a new one |
| "Your interview session has expired" | The backend restarted. Click **Start a new interview** |
| "The AI summary could not be written" | Scores and feedback are intact. Click **Try again** on the summary |
| Page refreshed by accident | The interview is lost. Start a new one |

## What has and has not been verified

- The complete journey above (setup, questions, scoring, skip, finish, results, history, performance, errors, mobile layout) was driven in a real browser against the real backend with a **local stand-in for Gemini**. Layout, states, error handling and the 5 + 2 request pattern are verified, and all 232 backend, 124 frontend and the browser QA checks passed.
- **Not yet verified:** the real Gemini API. The build environment had no key, so question quality, scoring quality, the model name `gemini-2.5-flash` and real-world latency are unproven. That is why the dry run in step 3 is essential. The live test suite (`cd backend && python -m pytest -m live -s`) also needs your key.
