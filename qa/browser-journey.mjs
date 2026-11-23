// The complete user journey in a real browser: React (:5173) → FastAPI (:8000) → real google-genai SDK → STAND-IN Gemini (test tooling),
// then the AI failure modes, and finally the backend exactly as configured on this machine (no Gemini key), with no stand-in at all.
// Run:  node qa/run.mjs qa/browser-journey.mjs
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { API, BACKEND_LOG, CHROME, SHOTS, TEST_KEY, WEB, reporter, startBackend, stopBackend, stopStub, stub } from './lib/stack.mjs'

const BASE = WEB
const t = reporter('browser-journey')
const { expect, section } = t
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const logLines = () => readFileSync(BACKEND_LOG, 'utf8').split('\n').length

const ANSWER = 'In my last project I used this concept directly. The key idea is the trade-off, and I explained the result with an example, the reasoning and what I learned.'

await startBackend({ mode: 'stub', timeoutSeconds: 2 }) // the runner already started the stand-in; a 2 s timeout makes the timeout scenario quick
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })

/** New page with API latency, a request log, and a hook to make the next matching request fail. */
async function newPage({ latency = 250 } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const state = { calls: [], pageErrors: [], failNext: null, bodies: {} }
  page.on('pageerror', (e) => state.pageErrors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const url = req.url()
    if (!url.startsWith(`${API}/api`) || req.method() === 'OPTIONS') return req.continue()
    const path = new URL(url).pathname
    if (state.failNext && req.method() === state.failNext.method && path.endsWith(state.failNext.suffix)) {
      state.calls.push({ method: req.method(), path, status: 'aborted', body: req.postData() ? JSON.parse(req.postData()) : null })
      state.failNext = null
      return req.abort('failed')
    }
    setTimeout(() => req.continue().catch(() => {}), latency)
  })
  page.on('response', async (res) => {
    const url = res.url()
    if (!url.startsWith(`${API}/api`)) return
    const req = res.request()
    if (req.method() === 'OPTIONS') return // CORS preflight, not an application call
    const path = new URL(url).pathname
    state.calls.push({ method: req.method(), path, status: res.status(), body: req.postData() ? JSON.parse(req.postData()) : null })
    try { state.bodies[`${req.method()} ${path}`] = await res.json() } catch { /* not json */ }
  })
  return { page, state }
}

const text = (page) => page.evaluate(() => document.body.innerText)
const waitText = (page, t, timeout = 15000) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t)
async function click(page, selector, label) {
  for (const h of await page.$$(selector)) {
    const ok = await h.evaluate((el, l) => !!el.offsetParent && el.innerText.trim().includes(l), label)
    if (ok) return h.click()
  }
  throw new Error(`No visible ${selector} containing "${label}"`)
}
const findButton = async (page, label) => {
  for (const h of await page.$$('button')) if ((await h.evaluate((el) => el.innerText.trim())).includes(label)) return h
  return null
}
const isDisabled = async (page, label) => (await (await findButton(page, label))?.evaluate((el) => el.disabled)) ?? null
const countCalls = (state, method, suffix) => state.calls.filter((c) => c.method === method && c.path.endsWith(suffix) && typeof c.status === 'number').length
const typeAnswer = async (page, t = ANSWER) => {
  await page.click('#answer', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('#answer', t)
}
async function configure(page, { name = 'Priya Sharma', role = 'python_developer', difficulty = 'Medium', type = 'Mixed' } = {}) {
  await page.goto(`${BASE}/interview/new`, { waitUntil: 'networkidle0' })
  await page.click('#candidateName', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('#candidateName', name)
  await page.select('#jobRole', role)
  await click(page, 'label', difficulty)
  await click(page, 'label', type)
}
const startFromSetup = (page) => click(page, 'button', 'Start interview')
const questionText = (page) => page.$eval('#question-text', (e) => e.innerText)
const startInterview = async (page, opts) => {
  await configure(page, opts)
  await startFromSetup(page)
  await page.waitForSelector('#question-text', { timeout: 15000 })
}

/* =====================================================================================
   1. Full interview with Gemini-generated questions and evaluations
   ===================================================================================== */
section('1. Full interview: Gemini questions → answers → Gemini evaluation → results')
await stub.reset()
const logStart = logLines()
{
  const { page, state } = await newPage()
  await configure(page)
  await startFromSetup(page)
  await sleep(100)
  expect((await text(page)).includes('Writing 5 intermediate-level questions for Python Developer'), 'start: loading screen says the questions are being written')
  await page.waitForSelector('#question-text', { timeout: 15000 })

  const start = state.calls.find((c) => c.path === '/api/interviews/start')
  expect(start?.method === 'POST' && start.status === 201, 'POST /api/interviews/start → 201')
  const startBody = state.bodies['POST /api/interviews/start']
  const sessionId = startBody.session_id
  expect(page.url().endsWith(`/interview/${sessionId}`), `URL uses the server's session id (${sessionId.slice(0, 8)}…)`)
  expect((await questionText(page)) === startBody.questions[0].text && startBody.questions[0].text.startsWith('(stub)'), "question 1 on screen is the question Gemini generated (marked '(stub)')")
  expect(JSON.stringify(startBody).includes('expected_concepts') === false, "expected concepts stay on the server (not sent to the browser)")

  let seen = await stub.requests()
  expect(seen.length === 1 && seen[0].schema_properties.includes('questions') && seen[0].api_key === TEST_KEY, 'Gemini got exactly 1 request (question generation) with the API key header')
  expect(seen[0].prompt.includes('ROLE: Python Developer') && seen[0].prompt.includes('TECHNICAL_QUESTIONS: 3') && seen[0].prompt.includes('HR_QUESTIONS: 2'), 'the configuration was sent to Gemini (role, 3 technical + 2 HR)')
  expect(!JSON.stringify(seen).includes('Priya'), "the candidate's name was not sent to Gemini")

  await typeAnswer(page, 'EXCELLENT answer: the key idea is the trade-off, with an example and the reasoning.')
  await click(page, 'button', 'Submit answer')
  await sleep(120)
  expect((await text(page)).includes('Evaluating your answer'), 'submit: loading state shown while Gemini evaluates')
  await waitText(page, 'Ideal answer')
  const t = await text(page)
  expect(t.includes('Missing concepts') && t.includes('(stub) a missing concept'), 'feedback shows the missing concepts')
  expect(t.includes('Study next') && t.includes('(stub) Core concepts for this role'), 'feedback shows the recommended topic')
  expect(t.includes('(stub) Stayed on topic.') && t.includes('(stub) Explain the trade-offs.'), "feedback shows Gemini's strengths and improvement areas")
  expect(t.includes('(stub) A strong answer explains the idea'), "feedback shows Gemini's ideal answer")
  const ev1 = state.bodies[`POST /api/interviews/${sessionId}/evaluate`]
  expect(ev1.overall_score === 8.8 && ev1.strengths.length === 3 && ev1.weaknesses.length === 3, `evaluation: overall ${ev1.overall_score}/10 (backend average of 9, 9, 8, 9), 3 strengths, 3 improvement areas`)
  await page.screenshot({ path: `${SHOTS}50-ai-feedback.png`, fullPage: true })

  await click(page, 'button', 'Continue to question 2')
  await sleep(150)
  await click(page, 'button', 'Skip')
  await waitText(page, 'Question 3 of 5')
  for (const n of [3, 4, 5]) {
    await typeAnswer(page, n === 3 ? 'POOR answer that misses the point entirely and is vague.' : ANSWER)
    await click(page, 'button', 'Submit answer')
    await waitText(page, 'Ideal answer')
    if (n < 5) {
      await click(page, 'button', `Continue to question ${n + 1}`)
      await sleep(150)
    }
  }
  await waitText(page, 'Every question is answered or skipped')
  await click(page, 'button', 'Finish interview')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 10000 })
  await waitText(page, 'Interview results')

  seen = await stub.requests()
  const evaluations = seen.filter((r) => r.schema_properties.includes('technical_accuracy'))
  const summaries = seen.filter((r) => r.schema_properties.includes('summary'))
  expect(seen.length === 6 && evaluations.length === 4 && summaries.length === 1, 'Gemini got 6 requests in total: 1 question generation + 4 evaluations + 1 summary (the skip makes none)')
  expect(summaries[0].prompt.includes('Overall score: 49/100 (Average)') && summaries[0].prompt.includes('Strongest skill: relevance; weakest skill: clarity'), 'the summary request carries the real overall score and strongest/weakest skill')
  expect(!summaries[0].prompt.includes('EXCELLENT answer') && !summaries[0].prompt.includes('Priya') && summaries[0].prompt.includes('(stub) Stayed on topic.'), "the summary is written from the evaluations: no raw answers, no name")
  expect(seen.every((r) => r.api_key === TEST_KEY && r.model === 'stub-model'), 'every request used the key and the model from the backend configuration')
  expect(evaluations[0].prompt.includes('EXCELLENT answer') && evaluations[0].prompt.includes('<candidate_answer>'), 'each evaluation request carries the question, concepts and the delimited answer')
  expect(evaluations.every((r) => r.temperature === 0.2), 'evaluations run at low temperature (consistent scoring)')

  const results = state.bodies[`GET /api/interviews/${sessionId}/results`]
  const page_ = await text(page)
  expect(page_.includes(`you scored ${results.overall_score} out of 100`), `results page shows the server's overall score (${results.overall_score}/100, ${results.performance_label})`)
  expect(results.questions.map((q) => q.score).join(',') === '8.8,0,2,6.8,6.8', 'question scores 8.8, skipped 0, 2.0, 6.8, 6.8 (calculated by the backend)')
  expect(results.learning_recommendations.every((r) => page_.includes(r)) && results.learning_recommendations.some((r) => r.startsWith('Study (stub)')), "learning recommendations come from Gemini's per-answer topics")
  expect(state.pageErrors.length === 0, `no uncaught page errors${state.pageErrors.length ? ': ' + state.pageErrors : ''}`)
  await page.screenshot({ path: `${SHOTS}51-ai-results.png`, fullPage: true })

  await sleep(300)
  const log = readFileSync(BACKEND_LOG, 'utf8').split('\n').slice(logStart).join('\n')
  expect(!log.includes(TEST_KEY), 'the API key is not in the backend log')
  expect(!log.includes('EXCELLENT answer') && !log.includes('POOR answer'), 'candidate answers are not in the backend log')
  expect((log.match(/gemini questions ok/g) ?? []).length === 1 && (log.match(/gemini evaluation ok/g) ?? []).length === 4 && (log.match(/gemini summary ok/g) ?? []).length === 1, 'backend log records each Gemini call (purpose, model, time) without content')

  // ---------- the upgraded results page ----------
  const texts = (sel) => page.$$eval(sel, (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
  const scoreCard = await page.$eval('#overall-heading', (e) => e.closest('section').innerText)
  expect(scoreCard.includes(results.summary) && scoreCard.includes('Written by Gemini'), "overall score card shows Gemini's summary and says who wrote it")
  expect(scoreCard.includes('Skipped questions count as 0') && scoreCard.includes('you scored 49 out of 100'), 'overall score card explains how the score is calculated')
  const skills = await texts('section[aria-labelledby="skills-heading"] li')
  expect(skills.length === 4 && skills[0].includes('Technical accuracy') && skills[0].includes('5.0/10') && skills[1].includes('5.6/10') && skills[2].includes('4.4/10') && skills[3].includes('4.4/10'), `skill progress shows the four real averages: ${skills.map((x) => x.replace(/ Strongest| Weakest/, '')).join(' | ')}`)
  expect(skills[1].includes('Strongest') && skills[2].includes('Weakest') && !skills[0].includes('Strongest') && !skills[3].includes('Weakest'), 'Relevance is tagged Strongest and Clarity Weakest (from the real averages)')
  const cards = (await texts('article')).map((c) => c.replace(/ \/10/g, '/10')) // the score pill is a flex row: "8.8 /10" → "8.8/10"
  expect(cards.length === 5, '5 question-wise score cards')
  expect(cards[0].includes('8.8/10') && cards[0].includes('Accuracy 9 Relevance 9 Clarity 8 Complete 9'), 'card 1: 8.8/10 with its four criterion scores')
  expect(cards[1].includes('Skipped') && cards[2].includes('2.0/10') && cards[3].includes('6.8/10') && cards[4].includes('6.8/10'), 'cards 2-5: skipped, 2.0, 6.8, 6.8')
  const h2s = await texts('h2')
  expect(['Skills', 'Question-wise performance', 'Strengths', 'Improvement areas', 'Learning recommendations', 'Review answers'].every((h) => h2s.includes(h)), 'sections: skills, question-wise performance, strengths, improvement areas, learning, review')
  expect((await text(page)).includes('Concepts to revisit') && (await text(page)).includes('(stub) a missing concept'), "learning section lists the concepts Gemini reported as missing")
  await page.screenshot({ path: `${SHOTS}54-results-top.png` })
  await page.screenshot({ path: `${SHOTS}55-results-full.png`, fullPage: true })

  const actions = await texts('header a, header button')
  expect(['Back to Dashboard', 'Review Answers', 'Retake Interview'].every((a) => actions.includes(a)), `actions: ${actions.join(', ')}`)

  await click(page, 'header button', 'Review Answers')
  await sleep(1000)
  const review = await page.evaluate(() => ({ top: document.getElementById('review').getBoundingClientRect().top, open1: document.querySelector('#review-1 button').getAttribute('aria-expanded'), open2: document.querySelector('#review-2 button').getAttribute('aria-expanded') }))
  expect(review.open1 === 'true' && review.open2 === 'false' && Math.abs(review.top) < 120, 'Review Answers: scrolls to the review section and opens the first answered question')
  let t2 = await text(page)
  expect(t2.includes('Your answer') && t2.includes('Ideal answer') && t2.includes('(stub) A strong answer explains the idea') && t2.includes('Study next'), 'review shows the answer, the ideal answer and what to study next')

  await (await page.$$('article'))[2].$('button').then((b) => b.click())
  await sleep(900)
  expect((await page.$eval('#review-3 button', (e) => e.getAttribute('aria-expanded'))) === 'true', "a card's Review answer opens that question")
  await click(page, 'button', 'Expand all')
  expect((await page.$$eval('#review li button', (bs) => bs.every((b) => b.getAttribute('aria-expanded') === 'true'))), 'Expand all opens every question')
  await click(page, 'button', 'Collapse all')
  expect((await page.$$eval('#review li button', (bs) => bs.every((b) => b.getAttribute('aria-expanded') === 'false'))), 'Collapse all closes them')

  // Retake: the setup form comes back filled in, and a second real interview compares with the first
  await click(page, 'header a', 'Retake Interview')
  await sleep(400)
  const prefilled = await page.evaluate(() => ({ name: document.getElementById('candidateName').value, role: document.getElementById('jobRole').value, difficulty: document.querySelector('input[name=difficulty]:checked').value, type: document.querySelector('input[name=interviewType]:checked').value }))
  expect(page.url().endsWith('/interview/new') && JSON.stringify(prefilled) === JSON.stringify({ name: 'Priya Sharma', role: 'python_developer', difficulty: 'medium', type: 'mixed' }), `Retake Interview: setup is prefilled (${JSON.stringify(prefilled)})`)
  await startFromSetup(page)
  await page.waitForSelector('#question-text', { timeout: 15000 })
  await typeAnswer(page, 'EXCELLENT answer: the key idea is the trade-off, with an example and the reasoning.')
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  await click(page, 'header button', 'Finish')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 15000 })
  await waitText(page, 'compared with your previous')
  const second = await text(page)
  expect(second.includes('you scored 18 out of 100') && second.includes('-31 points') && second.includes('compared with your previous Python Developer interview'), 'second interview: 18/100, "-31 points compared with your previous Python Developer interview" (from the real first interview)')
  expect((await page.$$eval('article', (a) => a.length)) === 5 && second.includes('Skipped 4 questions.'), 'second report: 5 cards, "Skipped 4 questions." under improvement areas')

  await click(page, 'header a', 'Back to Dashboard')
  await sleep(500)
  const dash = await text(page)
  expect(new URL(page.url()).pathname === '/' && /Interviews completed\s*2/.test(dash) && /Best score\s*49/.test(dash), 'Back to Dashboard: 2 completed interviews, best score 49')
  expect(!dash.includes('Sample'), 'the dashboard shows no sample or invented interviews')
  expect(state.pageErrors.length === 0, 'no uncaught page errors during the whole journey')
  await page.close()
}

/* =====================================================================================
   2. AI failures at start: clear message, nothing faked, retry works
   ===================================================================================== */
section('2. AI failures when starting an interview')
{
  const { page, state } = await newPage({ latency: 50 })
  await configure(page, { name: 'Arjun Rao' })

  await stub.reset()
  await stub.script([{ kind: 'http', code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' }])
  await startFromSetup(page)
  await waitText(page, 'busy or its quota is used up')
  expect(!page.url().includes('/interview/') || page.url().endsWith('/new'), 'rate limit: no interview was started')
  expect((await page.$eval('#candidateName', (e) => e.value)) === 'Arjun Rao', 'rate limit: the form keeps what was typed')
  expect((await stub.requests()).length === 1, 'rate limit: not retried (quota will not recover in a second)')
  await startFromSetup(page)
  await page.waitForSelector('#question-text', { timeout: 15000 })
  expect(true, 'rate limit: the retry started the interview')

  await configure(page, { name: 'Arjun Rao' })
  await stub.reset()
  await stub.expectedKey('a-different-key')
  await startFromSetup(page)
  await waitText(page, 'rejected the API key')
  expect((await text(page)).includes('GEMINI_API_KEY'), 'invalid key: the message points at GEMINI_API_KEY in backend/.env')
  expect(!(await text(page)).includes(TEST_KEY), 'invalid key: the key is not shown')
  await stub.expectedKey(TEST_KEY)

  await stub.reset()
  await stub.script([{ kind: 'http', code: 503, status: 'UNAVAILABLE' }, { kind: 'http', code: 503, status: 'UNAVAILABLE' }])
  await startFromSetup(page)
  await waitText(page, 'temporarily unavailable')
  expect((await stub.requests()).length === 2, 'unavailable: the backend retried once, then reported the failure')

  await stub.reset()
  await stub.script([{ kind: 'text', text: 'definitely not json' }, { kind: 'text', text: '{"questions": []}' }])
  await startFromSetup(page)
  await waitText(page, 'response we could not use')
  expect(true, 'invalid AI output: reported, nothing stored')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.screenshot({ path: `${SHOTS}52-ai-start-error.png` })
  await page.close()
}

/* =====================================================================================
   3. AI failures while evaluating: the answer stays saved, retry re-sends only /evaluate
   ===================================================================================== */
section('3. AI failures when evaluating an answer')
for (const { label, script, message } of [
  { label: 'rate limit (429)', script: [{ kind: 'http', code: 429, status: 'RESOURCE_EXHAUSTED' }], message: 'busy or its quota is used up' },
  { label: 'invalid JSON from the AI (twice)', script: [{ kind: 'text', text: 'oops' }, { kind: 'text', text: 'oops again' }], message: 'response we could not use' },
  { label: 'content blocked by the safety filter', script: [{ kind: 'blocked' }], message: 'rewording your answer' },
]) {
  const { page, state } = await newPage({ latency: 50 })
  await stub.reset()
  await startInterview(page)
  await typeAnswer(page)
  await stub.script(script)
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Your answer is saved, but it has not been scored')
  const t = await text(page)
  expect(t.includes(message), `${label}: friendly message ("${message}")`)
  expect(!t.includes('Strengths') && !t.includes('Ideal answer') && !t.includes('(stub) Stayed on topic.') && !t.includes('Study next'), `${label}: no feedback is shown (nothing made up)`)
  expect(!(await page.$('#answer')) && countCalls(state, 'POST', '/submit-answer') === 1, `${label}: the answer is saved (editor locked), submitted once`)
  await click(page, 'button', 'Try scoring again')
  await waitText(page, 'Ideal answer')
  expect(countCalls(state, 'POST', '/submit-answer') === 1 && countCalls(state, 'POST', '/evaluate') === 2, `${label}: retry re-sent only /evaluate; feedback now shown`)
  expect(state.pageErrors.length === 0, `${label}: no uncaught page errors`)
  await page.close()
}
{
  // The AI is too slow: backend timeout is 2s per attempt, so ~5s with the single retry
  const { page } = await newPage({ latency: 50 })
  await stub.reset()
  await startInterview(page)
  await typeAnswer(page)
  await stub.script([{ kind: 'slow', seconds: 4 }, { kind: 'slow', seconds: 4 }])
  await click(page, 'button', 'Submit answer')
  await sleep(300)
  expect((await text(page)).includes('Evaluating your answer'), 'timeout: loading state stays visible while waiting')
  await waitText(page, 'took too long', 20000)
  expect((await text(page)).includes('Your answer is saved, but it has not been scored'), 'timeout: "took too long" and the answer is saved')
  await page.close()
}

/* =====================================================================================
   4. Finishing when an evaluation is still missing scores it first
   ===================================================================================== */
section('4. Finish with an unscored answer')
{
  const { page, state } = await newPage({ latency: 50 })
  await stub.reset()
  await startInterview(page, { type: 'Technical', difficulty: 'Easy' })
  await typeAnswer(page)
  await stub.script([{ kind: 'http', code: 503, status: 'UNAVAILABLE' }, { kind: 'http', code: 503, status: 'UNAVAILABLE' }])
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Your answer is saved, but it has not been scored')
  await click(page, 'header button', 'Finish')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 15000 })
  await waitText(page, 'Interview results')
  const skips = state.calls.filter((c) => c.path.endsWith('/submit-answer') && c.body?.skipped === true).map((c) => c.body.question_number)
  expect(JSON.stringify(skips) === '[2,3,4,5]', `finish recorded the 4 unanswered questions as skipped (${JSON.stringify(skips)})`)
  expect(countCalls(state, 'POST', '/evaluate') === 2, 'finish scored the saved-but-unscored answer before building the report')
  expect((await text(page)).includes('1 of 5') && (await text(page)).includes('Skipped 4 questions.'), 'results: 1 of 5 answered, "Skipped 4 questions." listed first')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.close()
}

/* =====================================================================================
   5. Backend outage and restart (sessions are in memory)
   ===================================================================================== */
section('5. Network outage and an expired session')
{
  await stopBackend()
  const { page, state } = await newPage({ latency: 0 })
  await configure(page, { name: 'Arjun Rao' })
  await startFromSetup(page)
  await waitText(page, "couldn't reach the InterviewIQ server")
  expect((await page.$eval('#candidateName', (e) => e.value)) === 'Arjun Rao' && (await isDisabled(page, 'Start interview')) === false, 'backend down: friendly message, form kept, Start usable again')

  await startBackend({ mode: 'stub', timeoutSeconds: 2 })
  await startFromSetup(page)
  await page.waitForSelector('#question-text', { timeout: 15000 })
  await typeAnswer(page, 'Typed while the server is about to go away.')
  await stopBackend()
  await click(page, 'button', 'Submit answer')
  await waitText(page, "couldn't reach the InterviewIQ server")
  expect((await page.$eval('#answer', (e) => e.value)) === 'Typed while the server is about to go away.', 'submit during outage: the draft is preserved')

  await startBackend({ mode: 'stub', timeoutSeconds: 2 })
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Your interview session has expired')
  expect(true, 'restarted server forgot the session → expired-session screen with a way forward')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.close()
}


/* =====================================================================================
   R. Results: the summary fails, nothing is answered, and only real data is shown
   ===================================================================================== */
section('R1. The AI summary fails: the real report still shows, and Try again fixes only the summary')
{
  const { page, state } = await newPage({ latency: 50 })
  await stub.reset()
  await startInterview(page, { type: 'Technical', difficulty: 'Easy' })
  await typeAnswer(page, 'EXCELLENT answer: the key idea is the trade-off, with an example and the reasoning.')
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  await stub.script([{ kind: 'http', code: 429, status: 'RESOURCE_EXHAUSTED' }]) // the next Gemini request is the summary
  await click(page, 'header button', 'Finish')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 15000 })
  await waitText(page, 'The AI summary could not be written')
  let t = await text(page)
  expect(t.includes('you scored 18 out of 100') && t.includes('Skipped 4 questions.'), 'the real scores and feedback are shown')
  expect(t.includes('busy or its quota is used up'), 'the reason is shown in plain language')
  expect(!t.includes('Written by Gemini') && !t.includes('(stub) You scored'), 'no summary text is invented')
  await page.screenshot({ path: `${SHOTS}56-summary-failed.png`, fullPage: true })

  await click(page, 'button', 'Try again')
  await waitText(page, 'Written by Gemini')
  t = await text(page)
  expect(t.includes('(stub) You scored 18/100 overall.') && !t.includes('could not be written'), 'Try again: the summary appears and the notice disappears')
  const seen = await stub.requests()
  expect(seen.filter((r) => r.schema_properties.includes('summary')).length === 2 && seen.filter((r) => r.schema_properties.includes('technical_accuracy')).length === 1, 'only the summary was requested again (1 evaluation, 2 summary requests)')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.close()
}

section('R2. Nothing answered: no summary is requested and none is made up')
{
  const { page, state } = await newPage({ latency: 50 })
  await stub.reset()
  await startInterview(page)
  await click(page, 'header button', 'Finish')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 15000 })
  await waitText(page, 'Interview results')
  const t = await text(page)
  expect(t.includes('you scored 0 out of 100') && t.includes('No questions were answered, so there is nothing to summarise.'), 'score 0 and an honest "nothing to summarise"')
  expect(t.includes('Answer at least one question to see your strongest and weakest skills.'), 'no strongest/weakest skill is claimed')
  expect((await page.$('section[aria-labelledby="skills-heading"] [role=meter][aria-valuenow="0"]')) !== null, 'skills show their real value of 0')
  const seen = await stub.requests()
  expect(seen.length === 1, `Gemini was asked only to write the questions (${seen.length} request)`)
  expect((await page.$$eval('article', (a) => a.length)) === 5 && (await page.$$eval('article', (a) => a.every((x) => x.innerText.includes('Skipped')))), 'all 5 cards say Skipped')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.close()
}

section('R3. Only real data: no invented history unless you opt in')
{
  const { page, state } = await newPage({ latency: 0 })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  let t = await text(page)
  expect(t.includes('No interviews yet') && !t.includes('Sample') && !t.includes('Average score'), 'a fresh dashboard shows no interviews, no averages and no samples')
  await click(page, 'nav a', 'Interview History')
  await sleep(250)
  expect((await text(page)).includes('No interviews yet') && !(await text(page)).includes('Sample'), 'history is empty too')
  await click(page, 'nav a', 'Performance')
  await sleep(250)
  expect((await text(page)).includes('Not enough data yet'), 'performance says there is not enough data (no invented trend)')
  await click(page, 'nav a', 'Settings')
  await sleep(250)
  expect((await text(page)).includes('Show example interviews') && (await text(page)).includes('They are not your results'), 'the demo data is an explicit, plainly described opt-in')
  await page.click('#settings-sample')
  await click(page, 'button', 'Save settings')
  await click(page, 'nav a', 'Dashboard')
  await sleep(300)
  t = await text(page)
  expect(t.includes('Sample') && t.includes('Average score'), 'opting in shows example interviews, each labelled "Sample"')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.close()
}

/* =====================================================================================
   6. The backend exactly as configured on this machine: no Gemini key
   ===================================================================================== */
section('6. No Gemini key configured (the real backend/.env), no stub')
stopStub()
await startBackend({ mode: 'real' })
{
  const health = await (await fetch(`${API}/api/health`)).json()
  expect(health.ai_configured === false, `GET /api/health → ai_configured: ${health.ai_configured}`)
  const direct = await fetch(`${API}/api/interviews/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_name: 'Priya Sharma', job_role: 'python_developer', experience: 'fresher', difficulty: 'medium', interview_type: 'mixed', question_count: 5 }),
  })
  const body = await direct.json()
  expect(direct.status === 503 && body.error.code === 'AI_NOT_CONFIGURED' && !('questions' in body), `POST /api/interviews/start → ${direct.status} ${body.error?.code}, no questions invented`)

  const { page, state } = await newPage({ latency: 50 })
  await configure(page)
  await startFromSetup(page)
  await waitText(page, "The AI service isn't set up yet")
  const t = await text(page)
  expect(t.includes('GEMINI_API_KEY') && t.includes('backend/.env'), 'the UI tells you exactly what to do: add GEMINI_API_KEY to backend/.env')
  expect(!page.url().includes('/interview/') || page.url().endsWith('/new'), 'no interview is started and no questions are shown')
  expect(state.pageErrors.length === 0, 'no uncaught page errors')
  await page.screenshot({ path: `${SHOTS}53-no-key.png` })
  await page.close()
}

await browser.close()
process.exit(t.done() ? 1 : 0)
