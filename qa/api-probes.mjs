// Black-box HTTP probes of the live backend (real uvicorn, real google-genai SDK, stand-in Gemini).
// Run:  node qa/run.mjs qa/api-probes.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { API, BACKEND_LOG, TEST_KEY, reporter, startBackend, stub } from './lib/stack.mjs'

const t = reporter('api-probes')
const { expect, section, note } = t
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CONFIG = { candidate_name: 'Priya Sharma', job_role: 'python_developer', experience: 'fresher', difficulty: 'medium', interview_type: 'mixed', question_count: 5 }
const GOOD = 'In my last project I used this concept directly. The key idea is the trade-off, and I explained the result with an example.'

async function call(method, path, { body, headers = {}, raw, origin } = {}) {
  const init = { method, headers: { ...headers } }
  if (origin) init.headers.Origin = origin
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers['Content-Type'] ??= 'application/json'
  }
  const started = performance.now()
  const res = await fetch(`${API}${path}`, init)
  const ms = performance.now() - started
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers, ms }
}

const start = async (overrides = {}) => (await call('POST', '/api/interviews/start', { body: { ...CONFIG, ...overrides } }))
const newSession = async () => (await start()).json.session_id
const submit = (id, body) => call('POST', `/api/interviews/${id}/submit-answer`, { body })
const evaluate = (id, n) => call('POST', `/api/interviews/${id}/evaluate`, { body: { question_number: n } })
const results = (id) => call('GET', `/api/interviews/${id}/results`)
const shape = (r) => r.json && Object.keys(r.json).length === 1 && r.json.error && ['code', 'message', 'details'].every((k) => k in r.json.error)
const no5xx = (r) => r.status < 500
const backendRss = () => {
  const pid = execFileSync('lsof', ['-ti', 'tcp:8000', '-sTCP:LISTEN']).toString().trim().split('\n')[0]
  return Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', pid]).toString()) / 1024)
}

await stub.reset()
const logStart = readFileSync(BACKEND_LOG, 'utf8').split('\n').length

/* ---------------------------------------------------------------- A. routes and methods */
section('A. Routes and methods')
for (const [method, path, label] of [['GET', '/api/interviews/start', 'GET on a POST endpoint'], ['PUT', '/api/interviews/start', 'PUT'], ['DELETE', '/api/interviews/x/results', 'DELETE'], ['POST', '/api/health', 'POST on health']]) {
  const r = await call(method, path)
  expect(r.status === 405 && shape(r) && r.json.error.code === 'METHOD_NOT_ALLOWED', `${label} → 405 METHOD_NOT_ALLOWED in the standard error shape (got ${r.status})`)
}
let r = await call('GET', '/api/nope')
expect(r.status === 404 && shape(r), `unknown route → 404 in the standard error shape (got ${r.status})`)
r = await call('GET', '/')
expect(no5xx(r), `GET / → no server error (got ${r.status})`)
r = await call('POST', '/api/interviews/start/', { body: CONFIG })
expect(no5xx(r), `trailing slash on start → no server error (got ${r.status})`)
r = await call('GET', '/api/health')
expect(r.status === 200 && r.json.status === 'ok' && typeof r.json.ai_configured === 'boolean' && !JSON.stringify(r.json).includes(TEST_KEY), 'health → 200, reports ai_configured, never the key')

/* ---------------------------------------------------------------- B. malformed bodies */
section('B. Malformed request bodies (must be 4xx with the standard shape, never 5xx)')
const bad = [
  ['no body', { }],
  ['text/plain body holding valid JSON', { raw: JSON.stringify(CONFIG), headers: { 'Content-Type': 'text/plain' } }],
  ['JSON null', { raw: 'null', headers: { 'Content-Type': 'application/json' } }],
  ['JSON array', { raw: '[]', headers: { 'Content-Type': 'application/json' } }],
  ['truncated JSON', { raw: '{"candidate_name": "Priya', headers: { 'Content-Type': 'application/json' } }],
  ['invalid UTF-8 bytes', { raw: Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x3a, 0x31, 0x7d]), headers: { 'Content-Type': 'application/json' } }],
  ['10,000-level nested JSON', { raw: '['.repeat(10000) + ']'.repeat(10000), headers: { 'Content-Type': 'application/json' } }],
  ['empty object', { raw: '{}', headers: { 'Content-Type': 'application/json' } }],
]
for (const [label, opts] of bad) {
  const res = await call('POST', '/api/interviews/start', opts)
  expect(res.status >= 400 && res.status < 500 && shape(res), `${label} → 4xx in the standard shape (got ${res.status})`)
}

/* ---------------------------------------------------------------- C. unusual types */
section('C. Unusual field types in submit-answer')
const sid = await newSession()
const STRICT = new Set(['question_number "1" (string)', 'question_number true', 'skipped "yes"'])
const arguments_want = (label) => (STRICT.has(label) ? 422 : null) // silently coercing these would hide client bugs
for (const [label, body] of [
  ['question_number "1" (string)', { question_number: '1', answer: GOOD }, 422],
  ['question_number 1.0', { question_number: 1.0, answer: GOOD }],
  ['question_number 1.5', { question_number: 1.5, answer: GOOD }],
  ['question_number true', { question_number: true, answer: GOOD }, 422],
  ['question_number null', { question_number: null, answer: GOOD }],
  ['question_number [1]', { question_number: [1], answer: GOOD }],
  ['question_number 2^63', { question_number: 9223372036854775808, answer: GOOD }],
  ['question_number -1', { question_number: -1, answer: GOOD }],
  ['answer as number', { question_number: 1, answer: 12345678901234 }],
  ['answer as object', { question_number: 1, answer: { a: 1 } }],
  ['skipped "yes"', { question_number: 1, skipped: 'yes' }, 422],
  ['skipped 2', { question_number: 1, skipped: 2 }],
  ['extra unknown field', { question_number: 1, answer: GOOD, admin: true }],
]) {
  const want = arguments_want(label)
  const res = await submit(sid, body)
  expect(no5xx(res) && (res.status === 200 || shape(res)) && (want === null || res.status === want), `${label} → ${want ? `rejected with ${want}` : 'no server error, standard shape on failure'} (got ${res.status}${res.status === 200 ? ' accepted' : ' ' + (res.json?.error?.code ?? '')})`)
}

/* ---------------------------------------------------------------- D. hostile session ids */
section('D. Hostile or malformed session ids (must be 404, never 5xx; ids containing / never reach the route, so NOT_FOUND is correct)')
for (const [label, id] of [
  ['unknown uuid', '00000000-0000-0000-0000-000000000000'],
  ['not a uuid', 'not-a-session'],
  ['path traversal', '..%2F..%2Fetc%2Fpasswd'],
  ['SQL-looking', encodeURIComponent("' OR '1'='1")],
  ['script tag', encodeURIComponent('<script>alert(1)</script>')],
  ['NUL byte', '%00'],
  ['unicode', encodeURIComponent('séssion-日本語')],
  ['10,000 characters', 'a'.repeat(10000)],
  ['another valid id with a changed character', sid.slice(0, -1) + (sid.endsWith('0') ? '1' : '0')],
]) {
  for (const [name, fn] of [['results', () => call('GET', `/api/interviews/${id}/results`)], ['evaluate', () => call('POST', `/api/interviews/${id}/evaluate`, { body: { question_number: 1 } })], ['submit', () => call('POST', `/api/interviews/${id}/submit-answer`, { body: { question_number: 1, skipped: true } })]]) {
    const res = await fn()
    expect(res.status === 404 && shape(res) && ['SESSION_NOT_FOUND', 'NOT_FOUND'].includes(res.json.error.code), `${label} / ${name} → 404 in the standard shape, no 5xx (got ${res.status} ${res.json?.error?.code})`)
  }
}
r = await call('GET', `/api/interviews/${'a'.repeat(10000)}/results`)
expect(r.text.length < 2000, `a 10,000-character id is not echoed back in full (response is ${r.text.length} bytes)`)

/* ---------------------------------------------------------------- E. boundaries */
section('E. Input boundaries')
const names = [
  ['2 characters "Jo"', 'Jo', 201], ['1 character', 'A', 422], ['50 characters', 'A'.repeat(50), 201], ['51 characters', 'A'.repeat(51), 422],
  ['hyphen, dot and apostrophe "Mary-Jane O\'Neil Jr."', "Mary-Jane O'Neil Jr.", 201],
  ['accented letters "José Álvarez"', 'José Álvarez', 201], ['"Zoë Müller"', 'Zoë Müller', 201], ['Vietnamese "Nguyễn Văn An"', 'Nguyễn Văn An', 201],
  ['Chinese "李雷"', '李雷', 201], ['typographic apostrophe "O’Neil" (what phone keyboards insert)', 'O’Neil', 201],
  ['digits "Priya2"', 'Priya2', 422], ['symbols "Priya<script>"', 'Priya<script>', 422], ['leading space only "   "', '   ', 422], ['emoji "Priya 😀"', 'Priya 😀', 422],
]
for (const [label, name, want] of names) {
  const res = await start({ candidate_name: name })
  expect(res.status === want, `name ${label} → ${want} (got ${res.status})`)
}
const sid2 = await newSession()
const answers = [['9 characters', 'x'.repeat(9), 422], ['10 characters', 'x'.repeat(10), 200], ['2,000 characters', 'x'.repeat(2000), 200], ['2,001 characters', 'x'.repeat(2001), 422], ['whitespace only', ' '.repeat(50), 422], ['emoji only (10)', '😀'.repeat(10), 200], ['HTML', '<img src=x onerror=alert(1)> and <b>bold</b> text here', 200], ['NUL bytes', 'null\u0000byte\u0000answer here', 200], ['RTL text', 'مرحبا بالعالم هذه إجابة طويلة', 200]]
let n = 1
for (const [label, answer, want] of answers) {
  const id = want === 200 ? await newSession() : sid2
  const res = await submit(id, { question_number: want === 200 ? 1 : n, answer })
  expect(res.status === want, `answer ${label} → ${want} (got ${res.status})`)
  n = (n % 5) + 1
}

/* ---------------------------------------------------------------- F. oversized bodies */
section('F. Oversized request bodies')
const rssBefore = backendRss()
for (const mb of [1, 10, 64]) {
  const big = JSON.stringify({ question_number: 1, answer: 'x'.repeat(mb * 1024 * 1024) })
  const res = await call('POST', `/api/interviews/${sid2}/submit-answer`, { raw: big, headers: { 'Content-Type': 'application/json' } })
  note(`${mb} MB answer → HTTP ${res.status} in ${Math.round(res.ms)} ms (backend memory now ${backendRss()} MB, was ${rssBefore} MB)`)
  expect(res.status === 413 || res.status === 422, `${mb} MB body is rejected (413/422), not processed (got ${res.status})`)
  expect(res.status === 413 || mb < 10, `${mb} MB body is refused before it is read into memory (413) rather than parsed and then rejected (got ${res.status})`)
}

/* ---------------------------------------------------------------- G. response headers */
section('G. Response headers')
r = await call('GET', '/api/health')
for (const [header, want] of [['x-content-type-options', 'nosniff'], ['cache-control', 'no-store']]) {
  expect((r.headers.get(header) ?? '').toLowerCase().includes(want), `API responses send ${header}: ${want} (got ${JSON.stringify(r.headers.get(header))})`)
}
note(`server header: ${r.headers.get('server')}`)
r = await call('GET', `/api/interviews/${sid2}/results`)
expect((r.headers.get('cache-control') ?? '').includes('no-store'), 'session data (results) is not cacheable (Cache-Control: no-store)')

/* ---------------------------------------------------------------- H. CORS */
section('H. CORS')
const preflight = (origin, extra = {}) => call('OPTIONS', '/api/interviews/start', { origin, headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type', ...extra } })
r = await preflight('http://localhost:5173')
expect(r.status === 200 && r.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'allowed origin localhost:5173 → allowed')
expect(r.headers.get('access-control-allow-credentials') === null, 'credentials are not enabled')
expect((r.headers.get('access-control-allow-methods') ?? '').split(/,\s*/).every((m) => ['GET', 'POST', 'OPTIONS'].includes(m)) && !/DELETE|PUT|PATCH/.test(r.headers.get('access-control-allow-methods') ?? ''), `only GET/POST are allowed (${r.headers.get('access-control-allow-methods')})`)
r = await preflight('http://127.0.0.1:5173')
expect(r.headers.get('access-control-allow-origin') === 'http://127.0.0.1:5173', '127.0.0.1:5173 variant → allowed')
for (const origin of ['http://evil.example', 'http://localhost:5173.evil.com', 'http://evil.com/localhost:5173', 'null', 'https://localhost:5173', 'http://localhost:5174', 'http://localhost']) {
  r = await preflight(origin)
  expect(r.headers.get('access-control-allow-origin') === null, `origin ${origin} → not allowed`)
}
r = await preflight('http://localhost:5173', { 'Access-Control-Request-Headers': 'x-custom, authorization' })
expect(r.status === 400 || r.headers.get('access-control-allow-headers') === null || !/authorization/i.test(r.headers.get('access-control-allow-headers') ?? ''), 'a preflight asking for Authorization/custom headers is not granted')
r = await call('POST', '/api/interviews/start', { body: CONFIG, origin: 'http://evil.example' })
expect(r.headers.get('access-control-allow-origin') === null, 'a simple cross-origin POST from another origin gets no CORS grant (browser will not expose the response)')

/* ---------------------------------------------------------------- I. concurrency */
section('I. Concurrency (duplicate submissions and races)')
const cid = await newSession()
let rs = await Promise.all(Array.from({ length: 20 }, () => submit(cid, { question_number: 1, answer: GOOD })))
let codes = rs.map((x) => x.status).sort()
expect(codes.filter((c) => c === 200).length === 1 && codes.filter((c) => c === 409).length === 19, `20 simultaneous submits of the same answer → exactly one 200 and nineteen 409 (got ${JSON.stringify(Object.fromEntries([...new Set(codes)].map((c) => [c, codes.filter((x) => x === c).length])))})`)
await stub.reset()
rs = await Promise.all(Array.from({ length: 20 }, () => evaluate(cid, 1)))
expect(rs.every((x) => x.status === 200) && new Set(rs.map((x) => x.text)).size === 1, '20 simultaneous evaluations → all 200 and identical')
let seen = await stub.requests()
expect(seen.filter((x) => x.schema_properties.includes('technical_accuracy')).length === 1, `20 simultaneous evaluations made exactly 1 Gemini request (made ${seen.filter((x) => x.schema_properties.includes('technical_accuracy')).length})`)
for (let q = 2; q <= 5; q++) { await submit(cid, { question_number: q, answer: GOOD }); await evaluate(cid, q) }
await stub.reset()
rs = await Promise.all(Array.from({ length: 20 }, () => results(cid)))
expect(rs.every((x) => x.status === 200) && new Set(rs.map((x) => x.text)).size === 1, '20 simultaneous result requests → all 200 and identical')
seen = await stub.requests()
expect(seen.length === 1 && seen[0].schema_properties.includes('summary'), `20 simultaneous result requests made exactly 1 Gemini request (made ${seen.length})`)
const sessions = await Promise.all(Array.from({ length: 20 }, () => start()))
expect(sessions.every((x) => x.status === 201) && new Set(sessions.map((x) => x.json.session_id)).size === 20, '20 simultaneous interviews → 20 distinct sessions')

/* ---------------------------------------------------------------- J. lifecycle: progress, duplicates, incomplete */
section('J. Progress, duplicates and incomplete interviews')
const pid = await newSession()
r = await submit(pid, { question_number: 1, answer: GOOD })
expect(r.json.progress.answered === 1 && r.json.progress.remaining === 4 && r.json.progress.percent === 20 && r.json.next_question.number === 2, 'progress after 1 answer: 1 answered, 4 remaining, 20%, next question 2')
r = await submit(pid, { question_number: 1, answer: 'A different answer to try to overwrite the first.' })
expect(r.status === 409 && r.json.error.code === 'ANSWER_ALREADY_SUBMITTED', 'a second answer for the same question → 409 ANSWER_ALREADY_SUBMITTED')
r = await submit(pid, { question_number: 2, skipped: true })
r = await submit(pid, { question_number: 2, skipped: true })
expect(r.status === 200 && r.json.progress.skipped === 1, 'skipping twice is idempotent (still 1 skipped)')
r = await results(pid)
expect(r.status === 409 && r.json.error.code === 'RESULTS_NOT_READY' && JSON.stringify(r.json.error.details.unanswered) === '[3,4,5]' && JSON.stringify(r.json.error.details.unevaluated) === '[1]', `incomplete interview → 409 RESULTS_NOT_READY listing exactly what is missing (${JSON.stringify(r.json?.error?.details)})`)
r = await evaluate(pid, 3)
expect(r.status === 409 && r.json.error.code === 'ANSWER_REQUIRED', 'evaluating an unanswered question → 409 ANSWER_REQUIRED')
r = await evaluate(pid, 2)
expect(r.status === 409 && r.json.error.code === 'QUESTION_SKIPPED', 'evaluating a skipped question → 409 QUESTION_SKIPPED')
r = await evaluate(pid, 6)
expect(r.status === 404 && r.json.error.code === 'QUESTION_NOT_FOUND', 'question 6 → 404 QUESTION_NOT_FOUND')

/* ---------------------------------------------------------------- K. latency (application overhead only) */
section('K. API response times: application overhead (the stand-in Gemini answers instantly, so this is NOT real Gemini latency)')
const lat = { start: [], submit: [], evaluate: [], results: [] }
for (let i = 0; i < 25; i++) {
  const s = await start()
  lat.start.push(s.ms)
  const id = s.json.session_id
  for (let q = 1; q <= 5; q++) {
    const a = await submit(id, { question_number: q, answer: GOOD })
    if (q === 1) lat.submit.push(a.ms)
    const e = await evaluate(id, q)
    if (q === 1) lat.evaluate.push(e.ms)
  }
  lat.results.push((await results(id)).ms)
}
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))] }
const table = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: +pct(v, 0.5).toFixed(1), p95: +pct(v, 0.95).toFixed(1), max: +Math.max(...v).toFixed(1) }]))
for (const [k, v] of Object.entries(table)) note(`${k.padEnd(9)} n=${v.n}  p50=${v.p50} ms  p95=${v.p95} ms  max=${v.max} ms`)
expect(Object.values(table).every((v) => v.p95 < 500), 'every endpoint p95 < 500 ms of application overhead')
writeFileSync(new URL('./results/latency.json', import.meta.url), JSON.stringify(table, null, 2))

/* ---------------------------------------------------------------- L. secrets in logs */
section('L. Secrets and private content in the backend log')
await sleep(300)
const log = readFileSync(BACKEND_LOG, 'utf8').split('\n').slice(logStart).join('\n')
expect(!log.includes(TEST_KEY), `the API key never appears in ${log.length.toLocaleString()} characters of log output`)
expect(!log.includes('<img src=x') && !log.includes('different answer to try'), 'candidate answers never appear in the log')
expect(!/Priya Sharma|José|Nguyễn/.test(log), 'candidate names never appear in the log')
expect(/gemini (questions|evaluation|summary) ok/.test(log), 'each Gemini call is logged (purpose, model, time) without content')

/* ---------------------------------------------------------------- M. session expiry and eviction (real, over HTTP) */
section('M. Session expiry and eviction, with the backend restarted at TTL = 1 minute and a cap of 3 sessions')
await startBackend({ mode: 'stub', timeoutSeconds: 5, extraEnv: { SESSION_TTL_MINUTES: '1', MAX_SESSIONS: '3' } })
const [a, b, c] = [await newSession(), await newSession(), await newSession()]
const d = await newSession() // the cap is 3: the least recently used session (a) is evicted
expect((await results(a)).json.error.code === 'SESSION_NOT_FOUND', 'cap of 3: the oldest session was evicted → 404 SESSION_NOT_FOUND')
expect((await results(b)).status === 409 && (await results(c)).status === 409 && (await results(d)).status === 409, 'the three newest sessions are alive (409 RESULTS_NOT_READY, not 404)')
note('waiting for the 1-minute idle TTL (about 65 s)...')
await sleep(20000)
r = await submit(d, { question_number: 1, answer: GOOD })
expect(r.status === 200, 'activity at +20 s keeps a session alive (its idle timer restarts)')
await sleep(65000)
const afterTtl = await Promise.all([results(b), results(c), results(d)])
expect(afterTtl.every((x) => x.status === 404 && x.json.error.code === 'SESSION_NOT_FOUND'), `after 65 s idle every session has expired → 404 SESSION_NOT_FOUND (got ${afterTtl.map((x) => x.status).join(', ')})`)
r = await submit(d, { question_number: 2, answer: GOOD })
expect(r.status === 404 && r.json.error.code === 'SESSION_NOT_FOUND', 'writing to an expired session is refused, not silently recreated')
r = await start()
expect(r.status === 201, 'a new interview can be started after sessions expired')
await startBackend({ mode: 'stub', timeoutSeconds: 5 }) // restore the default test configuration

process.exit(t.done() ? 1 : 0)
