// The application exactly as configured in backend/.env (no Gemini key) and NO stand-in Gemini. Nothing here is simulated.
// Run:  node qa/run.mjs --real qa/no-key.mjs
import { readFileSync } from 'node:fs'
import { API, BACKEND_LOG, SHOTS, reporter } from './lib/stack.mjs'
import { click, configure, goto, launch, newPage, sleep, text, unexpectedConsole, waitText } from './lib/browser.mjs'

const t = reporter('no-key')
const { expect, section, note } = t
const CONFIG = { candidate_name: 'Priya Sharma', job_role: 'python_developer', experience: 'fresher', difficulty: 'medium', interview_type: 'mixed', question_count: 5 }
const post = (path, body) => fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, text: await r.text() }))
const logStart = readFileSync(BACKEND_LOG, 'utf8').split('\n').length

section('1. The API with no key')
const health = await (await fetch(`${API}/api/health`)).json()
expect(health.status === 'ok' && health.ai_configured === false, `GET /api/health → ok, ai_configured: ${health.ai_configured}, model: ${health.model}`)
expect(!JSON.stringify(health).match(/AIza|key":/i), 'health reveals whether a key exists, never the key')

let r = await post('/api/interviews/start', CONFIG)
let body = JSON.parse(r.text)
expect(r.status === 503 && body.error.code === 'AI_NOT_CONFIGURED' && body.error.message.includes('GEMINI_API_KEY') && body.error.message.includes('backend/.env'), `POST start → 503 AI_NOT_CONFIGURED naming exactly what to fix (${body.error?.message})`)
expect(!/"questions"|"session_id"/.test(r.text), 'no questions and no session are returned: nothing is made up')
r = await post('/api/interviews/start', { ...CONFIG, candidate_name: 'Pr1ya' })
expect(r.status === 422, 'invalid input is still rejected first (422), so validation does not depend on the AI')
for (const [label, path, payload] of [['submit-answer', '/api/interviews/abc/submit-answer', { question_number: 1, skipped: true }], ['evaluate', '/api/interviews/abc/evaluate', { question_number: 1 }]]) {
  r = await post(path, payload)
  expect(r.status === 404, `${label} for a session that cannot exist (none can be created without AI) → 404`)
}
r = await fetch(`${API}/api/interviews/abc/results`)
expect(r.status === 404, 'results for such a session → 404')

section('2. The UI with no key')
const browser = await launch()
const { page, log } = await newPage(browser)
await configure(page)
await click(page, 'button', 'Start interview')
await waitText(page, "The AI service isn't set up yet")
const shown = await text(page)
expect(shown.includes('GEMINI_API_KEY') && shown.includes('backend/.env'), 'the page tells the user exactly what to do: add GEMINI_API_KEY to backend/.env')
expect(!page.url().includes('/interview/') || page.url().endsWith('/new'), 'the user stays on the setup form; no interview room opens')
expect(!(await page.$('#question-text')) && !/\(stub\)|Question 1 of 5/.test(shown), 'no question of any kind is shown')
expect(shown.includes('Python Developer'), 'the form keeps the user\'s choices so they can retry after fixing the key')
await page.screenshot({ path: `${SHOTS}no-key.png` })
expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, 'no uncaught errors or console warnings (the browser logs only its own note about the 503)')
await goto(page, '/')
expect((await text(page)).includes('No interviews yet'), 'the dashboard shows no interviews, no averages and no sample data')
await browser.close()

section('3. The backend log')
await sleep(300)
const log2 = readFileSync(BACKEND_LOG, 'utf8').split('\n').slice(logStart).join('\n')
expect(/GEMINI_API_KEY is not set/.test(log2) || log2.length > 0, 'the backend logs a startup warning that the key is missing')
expect(!/AIza|GEMINI_API_KEY=\S/.test(log2), 'the log never contains a key')
note('Real Gemini behaviour (question quality, scoring, ideal answers) cannot be tested without a key: run `python -m pytest -m live -s` in backend/ after adding GEMINI_API_KEY.')
process.exit(t.done() ? 1 : 0)
