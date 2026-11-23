// Frontend QA in a real browser against the running app (React :5173 → FastAPI :8000 → real SDK → stand-in Gemini).
// Run:  node qa/run.mjs qa/browser-frontend.mjs
import { reporter, stub } from './lib/stack.mjs'
import {
  ANSWER, VIEWPORTS, click, configure, countCalls, finishInterview, findButton, goto, hasHorizontalScroll, isDisabled, launch, newPage, overflowingElements,
  questionText, setValue, sleep, startInterview, text, typeAnswer, unexpectedConsole, waitText,
} from './lib/browser.mjs'

const t = reporter('browser-frontend')
const { expect, section, note } = t
const browser = await launch()
await stub.reset()

/* =========================================================================================
   1. Dashboard, navigation and responsiveness, at desktop / tablet / mobile
   ========================================================================================= */
const ROUTES = [['/', 'Welcome to InterviewIQ'], ['/interview/new', 'Set up your interview'], ['/history', 'Interview history'], ['/performance', 'Performance'], ['/settings', 'Settings'], ['/nope', 'Page not found']]
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  section(`1. Navigation and layout: ${name} (${viewport.width}px)`)
  const { page, log } = await newPage(browser, { viewport })
  for (const [route, heading] of ROUTES) {
    await goto(page, route)
    const body = await text(page)
    const overflow = await hasHorizontalScroll(page)
    expect(body.includes(heading) && !overflow, `${route} renders "${heading}" with no horizontal scrolling${overflow ? ` (overflowing: ${(await overflowingElements(page)).join(', ')})` : ''}`)
  }
  const nav = await page.evaluate(() => ({ title: document.title, current: [...document.querySelectorAll('nav[aria-label="Main"] a[aria-current="page"]')].length }))
  await goto(page, '/history')
  const titles = await page.evaluate(() => document.title)
  expect(titles === 'Interview history | InterviewIQ', `document title follows the route (${titles})`)

  if (viewport.width >= 1024) {
    await goto(page, '/')
    const links = await page.$$eval('aside nav a', (as) => as.filter((a) => a.offsetParent).map((a) => a.innerText.trim()))
    expect(JSON.stringify(links) === JSON.stringify(['Dashboard', 'Start Interview', 'Interview History', 'Performance', 'Settings']), `sidebar shows the 5 required items (${links.join(', ')})`)
    for (const [label, heading] of [['Start Interview', 'Set up your interview'], ['Interview History', 'Interview history'], ['Performance', 'Performance'], ['Settings', 'Settings'], ['Dashboard', 'Welcome to InterviewIQ']]) {
      await click(page, 'aside nav a', label)
      await sleep(250)
      const current = await page.$$eval('aside nav a[aria-current="page"]', (as) => as.map((a) => a.innerText.trim()))
      expect((await text(page)).includes(heading) && current.length === 1 && current[0] === label, `sidebar → ${label}: page changes and exactly that item is marked current`)
    }
  } else {
    await goto(page, '/')
    const menu = await page.$('button[aria-label="Open menu"]')
    expect(menu !== null && (await page.$$eval('aside', (a) => a.filter((x) => x.offsetParent).length)) === 0, 'sidebar is hidden and a menu button is shown')
    await click(page, 'button', 'Open menu')
    await sleep(150)
    expect((await page.$$eval('div.fixed aside nav a', (a) => a.length)) === 5, 'the menu button opens a drawer with the 5 navigation items')
    await page.keyboard.press('Escape')
    await sleep(150)
    expect((await page.$$eval('div.fixed aside nav a', (a) => a.length)) === 0, 'Escape closes the drawer')
    await click(page, 'button', 'Open menu')
    await click(page, 'div.fixed aside nav a', 'Performance')
    await sleep(250)
    expect((await text(page)).includes('Performance') && (await page.$$eval('div.fixed aside', (a) => a.length)) === 0, 'choosing an item navigates and closes the drawer')
  }
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, `no console errors or warnings across all screens (${log.console.length} messages, ${log.pageErrors.length} uncaught errors)`)
  await page.close()
}

/* =========================================================================================
   2. Interview configuration and form validation
   ========================================================================================= */
section('2. Interview configuration and validation')
{
  const { page, log } = await newPage(browser)
  await goto(page, '/interview/new')
  await click(page, 'button', 'Start interview')
  await sleep(150)
  expect((await text(page)).includes('Enter a name of 2–50 letters') && (await page.evaluate(() => document.activeElement?.id)) === 'candidateName', 'empty form: name error shown and focus moves to the name field')
  expect(log.calls.length === 0, 'an invalid form sends no request to the server')

  const nameCases = [
    ['José Álvarez', true], ['Nguyễn Văn An', true], ['李雷', true], ['O’Neil', true], ["Mary-Jane O'Neil Jr.", true], ['  Priya  ', true],
    ['A', false], ['Priya2', false], ['Priya<script>', false], ['Priya 😀', false], ['   ', false], ['x'.repeat(51), false], ['-Priya', false],
  ]
  for (const [name, ok] of nameCases) {
    await setValue(page, '#candidateName', name)
    await click(page, 'button', 'Start interview')
    await sleep(100)
    const hasError = (await text(page)).includes('Enter a name of 2–50 letters')
    expect(hasError !== ok, `name ${JSON.stringify(name.length > 20 ? name.slice(0, 12) + '…' : name)} is ${ok ? 'accepted' : 'rejected'}`)
    if (ok) { await goto(page, '/interview/new'); await click(page, 'button', 'Start interview'); await sleep(50) }
  }
  await setValue(page, '#candidateName', 'Priya')
  await sleep(100)
  expect(!(await text(page)).includes('Enter a name of 2–50 letters'), 'the error clears as soon as the name becomes valid (live re-validation)')

  await page.select('#jobRole', 'data_analyst')
  await click(page, 'label', 'Hard')
  await click(page, 'label', 'Technical')
  const summary = await text(page)
  expect(summary.includes('Data Analyst') && summary.includes('Hard (Advanced)') && summary.includes('5 role-specific technical questions'), 'the summary panel follows role, difficulty and type')
  const count = await page.$eval('#questionCount', (e) => ({ value: e.value, readOnly: e.readOnly }))
  expect(count.readOnly && count.value === '5 questions', 'question count is shown and locked at 5 (approved scope)')
  const options = await page.$$eval('#jobRole option:not([disabled])', (o) => o.map((x) => x.textContent))
  expect(JSON.stringify(options) === JSON.stringify(['Python Developer', 'Java Developer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Analyst', 'Machine Learning Engineer']), 'all 7 roles are offered, in the specified order')
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, 'no console errors on the setup screen')
  await page.close()
}

/* =========================================================================================
   3. Interview room: navigation, answers, editing, skipping, timer, progress
   ========================================================================================= */
section('3. Interview room')
{
  const { page, log } = await newPage(browser, { latency: 50 })
  await startInterview(page)
  const header = await text(page)
  expect(header.includes('Question 1 of 5') && header.includes('0 answered, 0 skipped, 5 left') && header.includes('Python Developer') && header.includes('Medium'), 'room opens on question 1 with role, difficulty and progress')
  expect((await page.$$eval('nav[aria-label="Questions"] li', (l) => l.length)) === 5, 'the question navigator has 5 entries')
  expect((await isDisabled(page, 'Previous')) === true, 'Previous is disabled on question 1')

  const q1 = await questionText(page)
  await typeAnswer(page, 'First draft for question one')
  await click(page, 'button', 'Next')
  await sleep(100)
  const q2 = await questionText(page)
  expect((await text(page)).includes('Question 2 of 5') && q2 !== q1, 'Next moves to question 2')
  await typeAnswer(page, 'Draft for question two, longer than the first one')
  await click(page, 'nav[aria-label="Questions"] button', 'Question 4')
  await sleep(100)
  expect((await text(page)).includes('Question 4 of 5'), 'clicking the navigator jumps to question 4')
  await click(page, 'button', 'Previous')
  await sleep(100)
  await click(page, 'nav[aria-label="Questions"] button', 'Question 1')
  await sleep(100)
  expect((await questionText(page)) === q1 && (await page.$eval('#answer', (e) => e.value)) === 'First draft for question one', 'a draft survives navigating away and back')
  await typeAnswer(page, 'First draft, edited before submitting')
  expect((await page.$eval('#answer', (e) => e.value)) === 'First draft, edited before submitting' && (await text(page)).includes('37 / 2,000'), 'a draft can be edited freely before submission; the counter updates (37 / 2,000)')

  // empty / short / boundary
  await typeAnswer(page, '')
  expect((await isDisabled(page, 'Submit answer')) === true, 'Submit is disabled for an empty answer')
  await page.type('#answer', '          ')
  expect((await isDisabled(page, 'Submit answer')) === true, 'Submit is disabled for a whitespace-only answer')
  await typeAnswer(page, 'nine char')
  await click(page, 'button', 'Submit answer')
  await sleep(100)
  expect((await text(page)).includes('at least 10 characters') && countCalls(log, 'POST', '/submit-answer') === 0, 'a 9-character answer is refused with a message and nothing is sent')

  // skip and revisit
  await click(page, 'button', 'Skip')
  await sleep(300)
  expect((await text(page)).includes('Question 2 of 5') && (await text(page)).includes('0 answered, 1 skipped, 4 left'), 'Skip records the skip and moves to the next open question')
  expect(countCalls(log, 'POST', '/submit-answer') === 1 && log.calls.find((c) => c.path.endsWith('/submit-answer')).body.skipped === true, 'the skip was stored on the server')
  await click(page, 'nav[aria-label="Questions"] button', 'Question 1')
  await sleep(100)
  expect((await text(page)).includes('You skipped this question'), 'a skipped question can be reopened')
  await typeAnswer(page, 'EXACTLY10!')
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control')
  await waitText(page, 'Ideal answer')
  const afterAnswer = await text(page)
  expect(afterAnswer.includes('1 answered, 0 skipped, 4 left') && !(await page.$('#answer')), 'a 10-character answer is accepted via Ctrl+Enter, the skip becomes an answer, and the editor locks')

  // timer: visiting a question for ~200 ms must not credit it with a whole second (BUG-8).
  // Deterministic: find the moment a tick lands, then visit another question across the NEXT tick (900 ms later).
  const clock0 = () => page.$eval('[aria-label^="Time on this question"]', (e) => e.innerText.trim())
  await click(page, 'nav[aria-label="Questions"] button', 'Question 5')
  const first = await clock0()
  while ((await clock0()) === first) await sleep(15) // returns right after a tick (within ~15 ms)
  const tickSeen = Date.now()
  await sleep(900 - (Date.now() - tickSeen)) // the next tick is due in ~100 ms
  await click(page, 'nav[aria-label="Questions"] button', 'Question 4')
  await sleep(250) // spans the next tick of the OLD (shared) interval
  const visited = await clock0()
  expect(visited === '0:00', `a ~250 ms visit that spans a tick credits no time to the question (shows ${visited}; the old shared interval showed 0:01)`)

  // timer
  await click(page, 'nav[aria-label="Questions"] button', 'Question 3')
  await sleep(150)
  const clock = () => page.$eval('[aria-label^="Time on this question"]', (e) => e.innerText.trim())
  const t0 = await clock()
  await sleep(2300)
  const t1 = await clock()
  expect(t0 === '0:00' && ['0:02', '0:03'].includes(t1), `timer starts at 0:00 and counts up (${t0} → ${t1})`)
  await click(page, 'nav[aria-label="Questions"] button', 'Question 4')
  await sleep(1300)
  await click(page, 'nav[aria-label="Questions"] button', 'Question 3')
  await sleep(150)
  const back = await clock()
  expect(back >= t1 && back !== '0:00', `returning to a question keeps its time instead of resetting (${back})`)
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
  const hiddenStart = await clock()
  await sleep(2200)
  const hiddenEnd = await clock()
  expect(hiddenStart === hiddenEnd, `the timer pauses while the tab is hidden (${hiddenStart} → ${hiddenEnd})`)
  await page.evaluate(() => delete document.visibilityState)
  await click(page, 'nav[aria-label="Questions"] button', 'Question 1')
  await sleep(150)
  const frozenA = await clock()
  await sleep(2100)
  expect(frozenA === (await clock()), `the timer stops once the answer is submitted (${frozenA})`)

  // exit
  await click(page, 'header button', 'Exit')
  await sleep(150)
  expect((await text(page)).includes('Exit this interview?'), 'Exit asks for confirmation')
  await page.keyboard.press('Escape')
  await sleep(150)
  expect(!(await text(page)).includes('Exit this interview?'), 'Escape dismisses the confirmation and keeps the interview')
  await click(page, 'header button', 'Exit')
  await click(page, '[role=dialog] button', 'Exit interview')
  await sleep(300)
  const dash = await text(page)
  expect(new URL(page.url()).pathname === '/' && !dash.includes('Resume your'), 'confirming Exit returns to the dashboard and the interview is no longer offered for resume')
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, 'no console errors in the room')
  await page.close()
}

/* =========================================================================================
   4. Edge cases
   ========================================================================================= */
section('4a. Very long answers, and hostile text')
{
  const { page, log } = await newPage(browser, { latency: 50 })
  await startInterview(page)
  await page.focus('#answer')
  await page.keyboard.type('a'.repeat(2100), { delay: 0 })
  expect((await page.$eval('#answer', (e) => e.value.length)) === 2000, 'typing 2,100 characters stops at the 2,000-character limit')
  await setValue(page, '#answer', 'b'.repeat(2500))
  await click(page, 'button', 'Submit answer')
  await sleep(150)
  expect((await text(page)).includes('Keep your answer under 2,000') && countCalls(log, 'POST', '/submit-answer') === 0, 'a 2,500-character answer set by script is refused client-side and nothing is sent')

  // one unbroken 2,000-character word must not break the layout
  await setValue(page, '#answer', 'x'.repeat(2000))
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  const roomOverflow = await hasHorizontalScroll(page)
  expect(!roomOverflow, `a 2,000-character unbroken answer does not break the room layout${roomOverflow ? ' (overflowing: ' + (await overflowingElements(page)).join(', ') + ')' : ''}`)
  for (const [name, viewport] of [['mobile', VIEWPORTS.mobile]]) note(`(${name} is re-checked on the results page in section 7)`)

  // markup in an answer is shown as text and never executed
  const xss = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>bold?</b> and a normal sentence.'
  await click(page, 'button', 'Continue to question 2')
  await sleep(150)
  await setValue(page, '#answer', xss)
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  await sleep(300)
  const shown = await page.$eval('section[aria-labelledby="your-answer"] p', (e) => e.innerText)
  expect(shown === xss && (await page.evaluate(() => window.__xss)) === undefined && (await page.$$eval('#root img[src="x"], #root b', (e) => e.length)) === 0, 'HTML/script in an answer is displayed as literal text; nothing executes and no elements are injected')

  // emoji / RTL / CJK round trip
  await click(page, 'button', 'Continue to question 3')
  await sleep(150)
  const unicode = '🙂 مرحبا بالعالم 你好，世界 — naïve café résumé'
  await setValue(page, '#answer', unicode)
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  expect((await page.$eval('section[aria-labelledby="your-answer"] p', (e) => e.innerText)) === unicode, 'emoji, Arabic and Chinese text round-trip intact')

  // the same answers in the report
  await click(page, 'header button', 'Finish interview')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 20000 })
  await waitText(page, 'Interview results')
  await click(page, 'button', 'Expand all')
  await sleep(300)
  const resultsOverflow = await hasHorizontalScroll(page)
  expect(!resultsOverflow, `the long and hostile answers do not break the results page${resultsOverflow ? ' (overflowing: ' + (await overflowingElements(page)).join(', ') + ')' : ''}`)
  expect((await page.evaluate(() => window.__xss)) === undefined && (await text(page)).includes('<img src=x onerror="window.__xss=1">'), 'the review shows the markup as text too')
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, 'no console errors')
  await page.close()
}

section('4b. Network disconnection, refresh, back button, multiple sessions')
{
  const { page, log } = await newPage(browser, { latency: 0 })
  const client = await page.createCDPSession()
  await startInterview(page)
  await typeAnswer(page, 'An answer typed just before the connection drops.')
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await click(page, 'button', 'Submit answer')
  await waitText(page, "couldn't reach the InterviewIQ server")
  expect((await page.$eval('#answer', (e) => e.value)) === 'An answer typed just before the connection drops.' && (await isDisabled(page, 'Submit answer')) === false, 'browser offline: friendly error, the draft is kept and Submit is usable again')
  expect((await text(page)).includes('0 answered'), 'browser offline: nothing is counted as answered')
  await click(page, 'button', 'Skip').catch(() => {})
  await sleep(500)
  expect((await text(page)).includes('0 skipped') || (await text(page)).includes("couldn't reach"), 'browser offline: Skip is refused with an error and is not recorded')
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  expect(countCalls(log, 'POST', '/submit-answer') === 1 && countCalls(log, 'POST', '/evaluate') === 1, 'back online: the retry works and the server received exactly one submission')

  // refresh in the middle of an interview
  await click(page, 'button', 'Continue to question 2')
  await sleep(150)
  await typeAnswer(page, 'A half-finished answer that will be lost.')
  log.dialogs.length = 0
  await page.reload({ waitUntil: 'networkidle0' })
  expect(log.dialogs.some((d) => d.type === 'beforeunload'), 'refreshing mid-interview triggers the browser\'s "leave site?" warning')
  const afterRefresh = await text(page)
  expect(afterRefresh.includes('This interview is no longer available') && afterRefresh.includes('Set up an interview'), 'after a refresh the app shows a clear message and a way to start again (progress is not restored: known limitation)')
  expect(log.pageErrors.length === 0, 'refresh causes no uncaught errors')
  await page.close()
}
{
  const { page, log } = await newPage(browser, { latency: 0 })
  await startInterview(page)
  await typeAnswer(page, 'A draft that must survive using the back button.')
  const roomUrl = page.url()
  await page.goBack({ waitUntil: 'networkidle0' })
  const setup = await text(page)
  expect(new URL(page.url()).pathname === '/interview/new' && setup.includes('You have an interview in progress'), 'browser Back from the room lands on the setup page (the previous history entry), which warns that an interview is in progress')
  await click(page, 'aside nav a', 'Dashboard')
  await sleep(250)
  expect((await text(page)).includes('Resume your Python Developer interview'), 'the dashboard offers to resume the interview in progress')
  await click(page, 'a', 'Resume your')
  await sleep(300)
  expect(page.url() === roomUrl && (await page.$eval('#answer', (e) => e.value)) === 'A draft that must survive using the back button.', 'Resume returns to the same question with the draft intact')
  await page.goBack(); await sleep(250); await page.goForward(); await sleep(300)
  expect(page.url() === roomUrl && (await text(page)).includes('Question 1 of 5'), 'Back then Forward returns to the interview')
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, 'no console errors using Back/Forward')
  await page.close()
}
{
  section('4c. Multiple interview sessions at once (two tabs, different roles)')
  await stub.reset() // count only the requests made by this section
  // two separate browsers = two different users (tabs of one headless browser throttle each other when driven at once)
  const browserB = await launch()
  const a = await newPage(browser, { latency: 30 })
  const b = await newPage(browserB, { latency: 30 })
  await Promise.all([startInterview(a.page, { name: 'Alice Smith', role: 'python_developer' }), startInterview(b.page, { name: 'Bob Jones', role: 'data_analyst', difficulty: 'Hard', type: 'Technical' })])
  const idA = new URL(a.page.url()).pathname.split('/').pop()
  const idB = new URL(b.page.url()).pathname.split('/').pop()
  expect(idA !== idB && idA.length === 36 && idB.length === 36, 'two tabs get two different server sessions')
  await Promise.all([typeAnswer(a.page, 'EXCELLENT answer from Alice with detail and an example.'), typeAnswer(b.page, 'POOR answer from Bob.')])
  await Promise.all([click(a.page, 'button', 'Submit answer'), click(b.page, 'button', 'Submit answer')])
  await Promise.all([waitText(a.page, 'Ideal answer'), waitText(b.page, 'Ideal answer')])
  await Promise.all([finishInterview(a.page), finishInterview(b.page)])
  const [ta, tb] = [await text(a.page), await text(b.page)]
  expect(ta.includes('Alice, you scored 18 out of 100') && ta.includes('Python Developer') && tb.includes('Bob, you scored 4 out of 100') && tb.includes('Data Analyst'), 'each tab shows its own candidate, role and score (18 and 4): sessions do not mix')
  const answersLeak = (await a.page.evaluate(() => document.body.innerText)).includes('Bob') || tb.includes('Alice')
  expect(!answersLeak, "neither report contains the other candidate's name")
  const seen = await stub.requests()
  expect(seen.filter((r) => r.schema_properties.includes('summary')).length === 2, 'each interview made exactly one summary request')
  await a.page.close(); await b.page.close(); await browserB.close()
}

section('4d. Unexpected API responses: the UI must not crash or show a blank page')
{
  const json = (body, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:5173' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const html = (status = 502) => ({ status, contentType: 'text/html', headers: { 'access-control-allow-origin': 'http://localhost:5173' }, body: '<html><body>Bad Gateway</body></html>' })
  const goodStart = { session_id: 'abc', created_at: '2026-01-01T00:00:00Z', questions: [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, number: n, text: `Question ${n}?`, category: 'technical', level: 'beginner', topic: 'Topic' })) }
  const startCases = [
    ['an empty object', json({}, 201)], ['an HTML error page', html(200)], ['no questions', json({ ...goodStart, questions: [] }, 201)],
    ['questions missing their fields', json({ ...goodStart, questions: [{ id: 'q1' }] }, 201)], ['null', json('null', 201)], ['a 204 with no body', { status: 204, headers: { 'access-control-allow-origin': 'http://localhost:5173' } }],
  ]
  for (const [label, response] of startCases) {
    const { page, log } = await newPage(browser)
    log.intercept = (req, path) => (path.endsWith('/start') && req.method() === 'POST' ? response : null)
    await configure(page)
    await click(page, 'button', 'Start interview')
    await sleep(900)
    const rootEmpty = await page.$eval('#root', (e) => e.innerText.trim().length === 0)
    const onForm = (await text(page)).includes('Set up your interview')
    expect(!rootEmpty && onForm && log.pageErrors.length === 0, `start returns ${label}: the form stays usable with an error shown (blank page: ${rootEmpty}, uncaught: ${log.pageErrors.length})`)
    await page.close()
  }

  const evaluationCases = [
    ['an empty object', json({})], ['missing arrays', json({ technical_accuracy: 5, relevance: 5, clarity: 5, completeness: 5 })], ['scores as text', json({ technical_accuracy: 'high', relevance: 'high', clarity: 'high', completeness: 'high', strengths: [], weaknesses: [], improved_answer: 'x', follow_up_question: 'y' })],
    ['scores out of range', json({ technical_accuracy: 99, relevance: -5, clarity: 5, completeness: 5, strengths: ['a', 'b', 'c'], weaknesses: ['a', 'b', 'c'], improved_answer: 'x', follow_up_question: 'y' })], ['an HTML page', html(200)], ['null', json('null')],
  ]
  for (const [label, response] of evaluationCases) {
    await stub.reset()
    const { page, log } = await newPage(browser)
    await startInterview(page)
    log.intercept = (req, path) => (path.endsWith('/evaluate') ? response : null)
    await typeAnswer(page)
    await click(page, 'button', 'Submit answer')
    await sleep(1200)
    const rootEmpty = await page.$eval('#root', (e) => e.innerText.trim().length === 0)
    const body = await text(page)
    const bogus = /NaN|undefined|\[object/.test(body)
    expect(!rootEmpty && log.pageErrors.length === 0 && !bogus, `evaluate returns ${label}: no blank page, no uncaught error, no "NaN/undefined" shown (blank: ${rootEmpty}, uncaught: ${log.pageErrors.length}${bogus ? ', shows bogus text' : ''})`)
    await page.close()
  }

  const resultCases = [['an empty object', json({})], ['an HTML error page', html(500)], ['missing criteria', json({ overall_score: 50, performance_label: 'Average', questions: [] })]]
  for (const [label, response] of resultCases) {
    await stub.reset()
    const { page, log } = await newPage(browser)
    await startInterview(page)
    log.intercept = (req, path) => (path.endsWith('/results') ? response : null)
    await click(page, 'header button', 'Finish')
    await sleep(150)
    await click(page, '[role=dialog] button', 'See my summary')
    await sleep(1500)
    const rootEmpty = await page.$eval('#root', (e) => e.innerText.trim().length === 0)
    expect(!rootEmpty && log.pageErrors.length === 0, `results return ${label}: no blank page or uncaught error (blank: ${rootEmpty}, uncaught: ${log.pageErrors.length})`)
    await page.close()
  }
}

section('4e. A render failure shows a recovery screen, never a blank page')
{
  const { page, log } = await newPage(browser)
  await goto(page, '/interview/new')
  // make only the app's role list throw when mapped (React's own internals use Array.map too), then trigger a re-render by typing: a genuine rendering exception
  await page.evaluate(() => {
    window.__realMap = Array.prototype.map
    Array.prototype.map = function (...args) {
      if (this.some?.((x) => x && x.value === 'python_developer')) throw new Error('injected render failure')
      return window.__realMap.apply(this, args)
    }
  })
  await page.type('#candidateName', 'Priya').catch(() => {})
  await sleep(500)
  const body = await text(page)
  const rootEmpty = await page.$eval('#root', (e) => e.innerText.trim().length === 0)
  expect(!rootEmpty && body.includes('Something went wrong on this screen') && body.includes('Reload the page') && body.includes('Go to the dashboard'), 'a render exception shows the recovery screen with two ways out')
  await page.evaluate(() => { Array.prototype.map = window.__realMap })
  await click(page, 'button', 'Go to the dashboard')
  await page.waitForFunction(() => document.body.innerText.includes('Welcome to InterviewIQ'), { timeout: 10000 })
  expect(true, 'Go to the dashboard recovers the app')
  expect(log.console.filter((m) => m.type === 'error' && /injected render failure|InterviewIQ screen error/.test(m.text)).length >= 1, 'the failure is logged to the console (message only)')
  await page.close()
}

await browser.close()
process.exit(t.done() ? 1 : 0)
