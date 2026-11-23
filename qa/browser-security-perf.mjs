// Performance, security and responsive/accessibility QA against the PRODUCTION build (vite build + vite preview).
// Run:  node qa/run.mjs qa/browser-security-perf.mjs
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { API, ROOT, SHOTS, TEST_KEY, freePort, reporter, startBackend, stub, waitFor } from './lib/stack.mjs'
import { ANSWER, VIEWPORTS, click, countCalls, launch, newPage, sleep, text, typeAnswer, unexpectedConsole, waitText } from './lib/browser.mjs'

const t = reporter('security-perf')
const { expect, section, note } = t
const FRONTEND = `${ROOT}frontend`

/* ------------------------------------------------------------------ build and serve the production bundle */
section('Setup: production build served by vite preview (a different port: the backend CORS origin is pointed at it)')
execFileSync(`${FRONTEND}/node_modules/.bin/vite`, ['build'], { cwd: FRONTEND, stdio: 'pipe' })
const port = await freePort()
const WEB = `http://localhost:${port}`
const preview = spawn(`${FRONTEND}/node_modules/.bin/vite`, ['preview', '--port', String(port), '--strictPort'], { cwd: FRONTEND, stdio: 'ignore' })
const stopPreview = () => { try { preview.kill('SIGTERM') } catch { /* gone */ } }
process.on('exit', stopPreview)
await waitFor(() => fetch(WEB).then((r) => r.ok).catch(() => false))
await startBackend({ mode: 'stub', timeoutSeconds: 5, extraEnv: { FRONTEND_ORIGIN: WEB } })
note(`preview ${WEB}  ·  backend ${API}`)

const goto = (page, path = '/') => page.goto(`${WEB}${path}`, { waitUntil: 'networkidle0' })
const browser = await launch()

/* ------------------------------------------------------------------ bundle size */
section('P1. Bundle size')
const dist = `${FRONTEND}/dist/assets`
const files = readdirSync(dist).map((f) => ({ f, raw: statSync(`${dist}/${f}`).size, gz: gzipSync(readFileSync(`${dist}/${f}`)).length }))
for (const x of files) note(`${x.f}  ${(x.raw / 1024).toFixed(1)} KB  (${(x.gz / 1024).toFixed(1)} KB gzip)`)
const jsGz = files.filter((x) => x.f.endsWith('.js')).reduce((n, x) => n + x.gz, 0)
const cssGz = files.filter((x) => x.f.endsWith('.css')).reduce((n, x) => n + x.gz, 0)
expect(jsGz < 150 * 1024, `JavaScript is ${(jsGz / 1024).toFixed(1)} KB gzip (budget 150 KB)`)
expect(cssGz < 20 * 1024, `CSS is ${(cssGz / 1024).toFixed(1)} KB gzip (budget 20 KB)`)

/* ------------------------------------------------------------------ load performance */
section('P2. Page load (production build, cache disabled, median of 5)')
const runs = []
for (let i = 0; i < 5; i++) {
  const { page } = await newPage(browser)
  await page.setCacheEnabled(false)
  await goto(page, '/')
  await sleep(300)
  runs.push(await page.evaluate(async () => {
    const nav = performance.getEntriesByType('navigation')[0]
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]))
    const lcp = await new Promise((resolve) => {
      new PerformanceObserver((list) => resolve(list.getEntries().at(-1)?.startTime ?? null)).observe({ type: 'largest-contentful-paint', buffered: true })
      setTimeout(() => resolve(null), 800)
    })
    const resources = performance.getEntriesByType('resource')
    const own = resources.filter((r) => r.name.startsWith(location.origin))
    return { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp: paints['first-contentful-paint'] ?? null, lcp, requests: resources.length, ownRequests: own.length, ownBytes: own.reduce((n, r) => n + r.transferSize, 0) }
  }))
  await page.close()
}
const median = (k) => { const v = runs.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
const m = Object.fromEntries(['ttfb', 'dcl', 'load', 'fcp', 'lcp', 'requests', 'ownRequests', 'ownBytes'].map((k) => [k, median(k)]))
note(`TTFB ${Math.round(m.ttfb)} ms · DOMContentLoaded ${Math.round(m.dcl)} ms · load ${Math.round(m.load)} ms · FCP ${Math.round(m.fcp)} ms · LCP ${m.lcp ? Math.round(m.lcp) + ' ms' : 'n/a'} · ${m.requests} requests (${m.ownRequests} from the app, ${(m.ownBytes / 1024).toFixed(0)} KB transferred)`)
expect(m.fcp !== null && m.fcp < 1500, `first contentful paint ${Math.round(m.fcp)} ms < 1500 ms (local server: measures the app, not a real network)`)
expect(m.load < 2500, `load event ${Math.round(m.load)} ms < 2500 ms`)
writeFileSync(new URL('./results/perf.json', import.meta.url), JSON.stringify({ bundle: files, medianLoad: m, note: 'localhost, production build, cache disabled; not a real-network measurement' }, null, 2))

/* ------------------------------------------------------------------ API call efficiency + a full production journey */
section('P3. API calls: no polling, no duplicates, and the complete journey works in the production build')
await stub.reset()
{
  const { page, log } = await newPage(browser, { latency: 20 })
  await goto(page, '/')
  await sleep(4000)
  expect(log.calls.length === 0, 'an idle dashboard makes no API calls (no polling)')
  await goto(page, '/interview/new')
  await page.type('#candidateName', 'Priya Sharma')
  await click(page, 'button', 'Start interview')
  await page.waitForSelector('#question-text', { timeout: 15000 })
  await sleep(4500)
  expect(log.calls.length === 1 && log.calls[0].path === '/api/interviews/start', `an idle interview room (timer running 4.5 s) makes no API calls beyond the start request (${log.calls.length} total)`)
  for (let n = 1; n <= 5; n++) {
    await typeAnswer(page, ANSWER)
    await click(page, 'button', 'Submit answer')
    await waitText(page, 'Ideal answer')
    if (n < 5) { await click(page, 'button', `Continue to question ${n + 1}`); await sleep(100) }
  }
  await click(page, 'header button', 'Finish interview')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 20000 })
  await waitText(page, 'Interview results')
  await sleep(1500)
  const before = log.calls.length
  await sleep(4000)
  const byEndpoint = (m, s) => countCalls(log, m, s)
  expect(byEndpoint('POST', '/start') === 1 && byEndpoint('POST', '/submit-answer') === 5 && byEndpoint('POST', '/evaluate') === 5 && byEndpoint('GET', '/results') === 1, `a full 5-answer interview makes exactly 12 API calls: 1 start, 5 submit, 5 evaluate, 1 results (made ${log.calls.length})`)
  expect(log.calls.length === before, 'the results page makes no further calls while idle')
  expect(log.calls.every((c) => c.status === 200 || c.status === 201), 'every call succeeded')
  const seen = await stub.requests()
  expect(seen.length === 7, `Gemini received exactly 7 requests: 1 questions + 5 evaluations + 1 summary (received ${seen.length})`)
  const heap = await page.metrics()
  note(`JS heap after the journey: ${(heap.JSHeapUsedSize / 1048576).toFixed(1)} MB · DOM nodes ${heap.Nodes} · listeners ${heap.JSEventListeners}`)
  expect(heap.JSHeapUsedSize < 60 * 1048576, 'JS heap stays under 60 MB after a full interview')
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, `no console errors or warnings in the production build (${log.console.length} messages)`)

  /* -------------------------------------------------------------- security in the browser, same journey */
  section('S1. What the browser received and stored')
  const everything = JSON.stringify(log.bodies)
  expect(!everything.includes(TEST_KEY) && !(await text(page)).includes(TEST_KEY), 'the API key never appears in any API response or on the page')
  expect(!everything.includes('expected_concepts') && !everything.includes('evaluation_criteria'), 'expected concepts and criteria (answer hints) never reach the browser')
  const stored = await page.evaluate(() => ({ cookie: document.cookie, local: Object.keys(localStorage).length, session: Object.keys(sessionStorage).length, dbs: indexedDB.databases ? undefined : null }))
  expect(stored.cookie === '' && stored.local === 0 && stored.session === 0, 'nothing is stored in cookies, localStorage or sessionStorage (answers stay in memory)')
  const hosts = [...log.hosts].sort()
  note(`hosts contacted by the browser: ${hosts.join(', ')}`)
  expect(hosts.every((h) => [`localhost:${port}`, 'localhost:8000', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(h)), 'the browser only talks to the app, the API and Google Fonts: it never contacts a Gemini endpoint')
  expect(![...log.hosts].some((h) => /generativelanguage|aiplatform/.test(h)), 'no request from the browser goes to Google\'s AI endpoints (Gemini is only called by the backend)')
  note('INFO: the page loads the Geist typeface from fonts.googleapis.com / fonts.gstatic.com, which tells Google the visitor\'s IP address. Self-host the font to avoid this.')
  await page.close()
}

/* ------------------------------------------------------------------ source and bundle secret scan */
section('S2. Secret scan of the frontend source, the production bundle and the repository')
const SECRET = [/AIza[0-9A-Za-z_-]{30,}/, /sk-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /GEMINI_API_KEY\s*=\s*(?!your-gemini-api-key-here)[A-Za-z0-9_-]{16,}/, new RegExp(TEST_KEY)]
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.venv', '.git', '__pycache__', 'results', '.pytest_cache'].includes(name)) continue
    const p = `${dir}/${name}`
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (s.size < 2_000_000 && !/\.(png|jpg|ico|woff2?)$/.test(name)) out.push(p)
  }
  return out
}
const hits = []
for (const file of walk(ROOT.replace(/\/$/, ''))) {
  if (file.endsWith('/stub_gemini.py') || file.includes('/qa/')) continue // the stand-in's clearly fake test key is allowed in test tooling
  const content = readFileSync(file, 'utf8')
  for (const re of SECRET) if (re.test(content)) hits.push(`${file.replace(ROOT, '')} matches ${re}`)
}
expect(hits.length === 0, `no API-key-shaped strings in ${walk(ROOT.replace(/\/$/, '')).length} project files (excluding dependencies)${hits.length ? ': ' + hits.join('; ') : ''}`)
const bundleText = files.map((x) => readFileSync(`${dist}/${x.f}`, 'utf8')).join('\n')
expect(!/GEMINI_API_KEY\s*[:=]\s*["'][^"']{8,}/.test(bundleText) && !/x-goog-api-key|generativelanguage\.googleapis/.test(bundleText), 'the production bundle contains no Gemini key, header or endpoint')
expect(!/VITE_GEMINI|VITE_.*KEY/i.test(readFileSync(`${FRONTEND}/.env`, 'utf8')) && !/VITE_.*KEY/i.test(bundleText), 'no VITE_* variable can carry a key (everything VITE_* is public in the bundle)')
for (const env of [`${ROOT}backend/.env`, `${FRONTEND}/.env`]) {
  const ignored = (() => { try { execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', env], { stdio: 'ignore' }); return true } catch { return null } })()
  note(`${env.replace(ROOT, '')} ${existsSync(env) ? 'exists' : 'missing'}; git ignore check ${ignored === null ? 'unavailable (not a git repository): .gitignore lists .env, verified below' : 'ok'}`)
}
const gitignore = readFileSync(`${ROOT}.gitignore`, 'utf8')
expect(/^\.env$/m.test(gitignore) && /^\.env\.\*$/m.test(gitignore) && /^!\.env\.example$/m.test(gitignore), '.gitignore excludes .env and .env.* but keeps the .env.example templates')
expect(!/your-gemini-api-key-here/.test('') && /GEMINI_API_KEY=your-gemini-api-key-here/.test(readFileSync(`${ROOT}backend/.env.example`, 'utf8')), 'backend/.env.example holds only a placeholder')

section('S3. Files the dev server must not serve')
for (const path of ['/.env', '/.env.local', '/.env.example', '/../backend/.env', `/@fs${ROOT}backend/.env`, `/@fs${ROOT}backend/.env.example`, '/@fs/etc/passwd']) {
  let body = ''
  let status = 0
  try {
    const out = execFileSync('curl', ['-s', '--path-as-is', '-o', '-', '-w', '\n%{http_code}', `http://localhost:5173${path}`], { timeout: 10000 }).toString()
    status = Number(out.trim().split('\n').pop())
    body = out
  } catch { /* connection problems count as not served */ }
  expect(!/VITE_API_BASE_URL|GEMINI_API_KEY|root:.*:0:0/.test(body) || path === '/.env.example', `dev server: ${path} does not expose file contents (HTTP ${status})`)
}

/* ------------------------------------------------------------------ responsive + accessibility matrix */
section('R. Responsive layout and basic accessibility: desktop 1440, tablet 768, mobile 390 (production build)')
const A11Y = () =>
  document.querySelectorAll('button, a, input, select, textarea').length &&
  ({
    unnamedControls: [...document.querySelectorAll('button, a[href], [role=switch]')].filter((e) => e.offsetParent && !(e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || e.labels?.length || '').toString().trim()).length, // a <label for> also names a control
    unlabelledFields: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((e) => e.offsetParent && !(e.labels?.length || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'))).length,
    h1: document.querySelectorAll('h1').length,
    lang: document.documentElement.lang,
    small: [...document.querySelectorAll('button, a[href], input, select, textarea, [role=switch]')].filter((e) => e.offsetParent).map((e) => ({ r: e.getBoundingClientRect(), n: (e.getAttribute('aria-label') || e.innerText || e.tagName).trim().slice(0, 30) })).filter(({ r }) => r.width > 2 && r.height > 2 && (r.height < 32 || r.width < 32)).map(({ r, n }) => `${n} (${Math.round(r.width)}x${Math.round(r.height)})`), // ignores visually hidden inputs
  })
const smallTargets = {}
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const { page, log } = await newPage(browser, { viewport })
  const views = []
  // pages that need no interview
  for (const route of ['/', '/interview/new', '/history', '/performance', '/settings']) {
    await goto(page, route)
    views.push([route, await page.evaluate(A11Y), await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)])
  }
  // the interview room, its feedback state, and the results (same page object: state stays in memory)
  await page.type('#candidateName', 'Priya Sharma').catch(() => {})
  await goto(page, '/interview/new')
  await page.type('#candidateName', 'Priya Sharma')
  await click(page, 'button', 'Start interview')
  await page.waitForSelector('#question-text', { timeout: 15000 })
  views.push(['room (question)', await page.evaluate(A11Y), await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)])
  await typeAnswer(page, ANSWER)
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  views.push(['room (feedback)', await page.evaluate(A11Y), await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)])
  await click(page, 'header button', 'Finish interview')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 20000 })
  await waitText(page, 'Interview results')
  await click(page, 'button', 'Expand all')
  await sleep(500)
  views.push(['results', await page.evaluate(A11Y), await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)])
  await page.screenshot({ path: `${SHOTS}responsive-results-${name}.png`, fullPage: true })

  const overflow = views.filter(([, , o]) => o).map(([v]) => v)
  expect(overflow.length === 0, `${name}: none of the ${views.length} screens scrolls horizontally${overflow.length ? ' (overflowing: ' + overflow.join(', ') + ')' : ''}`)
  const unnamed = views.filter(([, a]) => a && a.unnamedControls > 0).map(([v, a]) => `${v}: ${a.unnamedControls}`)
  expect(unnamed.length === 0, `${name}: every button and link has an accessible name${unnamed.length ? ' (unnamed: ' + unnamed.join('; ') + ')' : ''}`)
  const unlabelled = views.filter(([, a]) => a && a.unlabelledFields > 0).map(([v, a]) => `${v}: ${a.unlabelledFields}`)
  expect(unlabelled.length === 0, `${name}: every form field has a label${unlabelled.length ? ' (unlabelled: ' + unlabelled.join('; ') + ')' : ''}`)
  const h1s = views.filter(([, a]) => a && a.h1 !== 1).map(([v, a]) => `${v}: ${a.h1}`)
  expect(h1s.length === 0, `${name}: every screen has exactly one h1${h1s.length ? ' (' + h1s.join('; ') + ')' : ''}`)
  expect(views.every(([, a]) => a && a.lang === 'en'), `${name}: the page declares its language`)
  smallTargets[name] = [...new Set(views.flatMap(([v, a]) => (a?.small ?? []).map((x) => `${v}: ${x}`)))]
  expect(log.pageErrors.length === 0 && unexpectedConsole(log).length === 0, `${name}: no console errors across all screens`)
  await page.close()
}
for (const [name, list] of Object.entries(smallTargets)) note(`INFO ${name}: interactive elements under 32x32 px: ${list.join('; ') || 'none'}`)

await browser.close()
stopPreview()
await startBackend({ mode: 'stub', timeoutSeconds: 5 }) // restore the default test configuration
process.exit(t.done() ? 1 : 0)
