// Captures every screen and state of the UI (empty, loading, evaluating, error, results, mobile) into contact sheets for design review.
// Run:  UI_TAG=before node qa/run.mjs qa/screenshots.mjs        → qa/results/ui-before/*.png and sheet-*.png
// The Gemini content is the stand-in's canned text (marked "(stub)"): this reviews layout and states, not real model output.
import { mkdirSync } from 'node:fs'
import { SHOTS, reporter, stub } from './lib/stack.mjs'
import { ANSWER, VIEWPORTS, click, configure, finishInterview, goto, launch, newPage, setValue, sleep, startInterview, text, typeAnswer, waitText } from './lib/browser.mjs'

const TAG = process.env.UI_TAG ?? 'review'
const DIR = `${SHOTS}ui-${TAG}/`
mkdirSync(DIR, { recursive: true })
const t = reporter('screenshots')
const taken = []
const shot = async (page, name, fullPage = false) => {
  await sleep(450) // let entrance transitions settle
  await page.screenshot({ path: `${DIR}${name}.png`, fullPage })
  taken.push(name)
}
const err = (status, code, message) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:5173' }, body: JSON.stringify({ error: { code, message, details: null } }) })

const browser = await launch()
await stub.reset()

/* ---- desktop: empty states and static screens ---- */
{
  const { page } = await newPage(browser)
  await goto(page, '/'); await shot(page, 'd01-dashboard-empty')
  await goto(page, '/interview/new'); await shot(page, 'd02-setup')
  await click(page, 'button', 'Start interview'); await shot(page, 'd03-setup-errors')
  await goto(page, '/history'); await shot(page, 'd04-history-empty')
  await goto(page, '/performance'); await shot(page, 'd05-performance-empty')
  await goto(page, '/settings'); await shot(page, 'd06-settings')
  await goto(page, '/nope'); await shot(page, 'd07-not-found')
  await goto(page, '/interview/abc'); await shot(page, 'd08-room-unavailable')
  await goto(page, '/results/abc'); await shot(page, 'd09-report-not-found')
  await page.close()
}

/* ---- desktop: the whole journey with slow API calls so loading states can be captured ---- */
{
  const { page } = await newPage(browser, { latency: 2200 })
  await configure(page)
  await click(page, 'button', 'Start interview')
  await sleep(700); await shot(page, 'd10-loading-start')
  await page.waitForSelector('#question-text', { timeout: 30000 })
  await shot(page, 'd11-room-question')
  await typeAnswer(page, 'A decorator wraps a function to add behaviour around it without changing its code. I would use it for logging or timing.')
  await shot(page, 'd12-room-draft')
  await click(page, 'button', 'Submit answer')
  await sleep(700); await shot(page, 'd13-room-evaluating')
  await waitText(page, 'Ideal answer', 30000)
  await shot(page, 'd14-feedback'); await shot(page, 'd15-feedback-full', true)
  await click(page, 'button', 'Continue to question 2')
  await sleep(200)
  await click(page, 'button', 'Skip')
  await sleep(2600)
  await click(page, 'nav[aria-label="Questions"] button', 'Question 2')
  await shot(page, 'd16-room-skipped')
  await click(page, 'header button', 'Finish')
  await sleep(200); await shot(page, 'd17-finish-modal')
  await click(page, '[role=dialog] button', 'See my summary')
  await sleep(900); await shot(page, 'd18-loading-summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 30000 })
  await waitText(page, 'Interview results', 30000)
  await sleep(1300); await shot(page, 'd19-results-top'); await shot(page, 'd20-results-full', true)
  await click(page, 'header button', 'Review Answers'); await sleep(900); await shot(page, 'd21-results-review')
  await click(page, 'header a', 'Back to Dashboard'); await sleep(500); await shot(page, 'd22-dashboard-data', true)
  await click(page, 'aside nav a', 'Interview History'); await sleep(400); await shot(page, 'd23-history-data')
  await click(page, 'aside nav a', 'Performance'); await sleep(900); await shot(page, 'd24-performance-data')
  await page.close()
}

/* ---- desktop: error states ---- */
{
  const { page, log } = await newPage(browser)
  await configure(page)
  log.intercept = (req, path) => (path.endsWith('/start') && req.method() === 'POST' ? err(429, 'AI_RATE_LIMITED', 'busy') : null)
  await click(page, 'button', 'Start interview'); await sleep(900); await shot(page, 'd25-setup-start-error')
  log.intercept = null
  await click(page, 'button', 'Start interview'); await page.waitForSelector('#question-text', { timeout: 15000 })
  await typeAnswer(page, ANSWER)
  log.intercept = (req, path) => (path.endsWith('/evaluate') ? err(503, 'AI_UNAVAILABLE', 'down') : null)
  await click(page, 'button', 'Submit answer'); await waitText(page, 'has not been scored'); await shot(page, 'd26-room-unscored')
  log.intercept = (req, path) => (path.endsWith('/submit-answer') ? err(404, 'SESSION_NOT_FOUND', 'gone') : null)
  await click(page, 'button', 'Continue to question 2').catch(() => {})
  await click(page, 'nav[aria-label="Questions"] button', 'Question 2'); await sleep(200)
  await typeAnswer(page, ANSWER); await click(page, 'button', 'Submit answer'); await waitText(page, 'session has expired'); await shot(page, 'd27-session-expired')
  await page.close()
}
{
  const { page, log } = await newPage(browser)
  await startInterview(page)
  log.intercept = (req, path) => (path.endsWith('/results') ? err(503, 'AI_UNAVAILABLE', 'down') : null)
  await click(page, 'header button', 'Finish'); await sleep(150); await click(page, '[role=dialog] button', 'See my summary')
  await waitText(page, "couldn't reach").catch(() => {}); await sleep(600); await shot(page, 'd28-room-finish-error')
  await page.close()
}
{
  await stub.reset()
  const { page, log } = await newPage(browser)
  await startInterview(page)
  await typeAnswer(page, ANSWER); await click(page, 'button', 'Submit answer'); await waitText(page, 'Ideal answer')
  await stub.script([{ kind: 'http', code: 429, status: 'RESOURCE_EXHAUSTED' }])
  await click(page, 'header button', 'Finish'); await sleep(150); await click(page, '[role=dialog] button', 'See my summary')
  await waitText(page, 'The AI summary could not be written'); await sleep(900); await shot(page, 'd29-results-summary-failed')
  await page.close()
}

/* ---- mobile ---- */
{
  const { page } = await newPage(browser, { viewport: VIEWPORTS.mobile })
  await goto(page, '/'); await shot(page, 'm01-dashboard-empty')
  await click(page, 'button', 'Open menu'); await shot(page, 'm02-drawer')
  await page.keyboard.press('Escape')
  await goto(page, '/interview/new'); await shot(page, 'm03-setup', true)
  await startInterview(page)
  await shot(page, 'm04-room-question')
  await typeAnswer(page, ANSWER); await click(page, 'button', 'Submit answer'); await waitText(page, 'Ideal answer')
  await shot(page, 'm05-feedback', true)
  await finishInterview(page)
  await sleep(1200); await shot(page, 'm06-results-top'); await shot(page, 'm07-results-full', true)
  await click(page, 'main header a', 'Back to Dashboard'); await sleep(500); await shot(page, 'm08-dashboard-data', true)
  await page.close()
}

/* ---- contact sheets: several screens per image, so a review needs a handful of looks instead of dozens ---- */
const sheet = async (names, file, columns, width) => {
  const html = `<body style="margin:0;background:#05070f;font:12px system-ui;color:#94a3b8"><div style="display:grid;grid-template-columns:repeat(${columns},${width}px);gap:10px;padding:10px">${names
    .map((n) => `<figure style="margin:0"><figcaption style="padding:2px 0 4px">${n}</figcaption><img src="file://${DIR}${n}.png" style="width:${width}px;border:1px solid #243049;display:block"></figure>`)
    .join('')}</div></body>`
  const page = await browser.newPage()
  await page.setViewport({ width: columns * (width + 10) + 10, height: 800 })
  await page.setContent(html)
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = r))))))
  await page.screenshot({ path: `${DIR}${file}.png`, fullPage: true })
  await page.close()
}
const by = (prefix, from, to) => taken.filter((n) => n.startsWith(prefix) && Number(n.slice(1, 3)) >= from && Number(n.slice(1, 3)) <= to)
await sheet(by('d', 1, 9).filter((n) => !n.includes('full')), 'sheet-1-static', 3, 520)
await sheet(by('d', 10, 16).filter((n) => !n.includes('full')), 'sheet-2-room', 3, 520)
await sheet(['d17-finish-modal', 'd18-loading-summary', 'd19-results-top', 'd21-results-review', 'd23-history-data', 'd24-performance-data'], 'sheet-3-results', 3, 520)
await sheet(['d25-setup-start-error', 'd26-room-unscored', 'd27-session-expired', 'd28-room-finish-error', 'd29-results-summary-failed'], 'sheet-4-errors', 3, 520)
await sheet(['m01-dashboard-empty', 'm02-drawer', 'm04-room-question', 'm06-results-top'], 'sheet-5-mobile', 4, 300)
t.expect(taken.length >= 35, `${taken.length} screens captured into ${DIR}`)
await browser.close()
process.exit(t.done() ? 1 : 0)
