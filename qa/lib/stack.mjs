// Starts and stops the processes the QA scripts need. It only ever kills processes that THIS helper started,
// or a listener on :8000 whose command line it has verified is this project's uvicorn.
//
//   mode 'stub'  backend + a local stand-in for Google's Gemini API (test tooling: backend/tests/stub_gemini.py)
//   mode 'real'  the backend exactly as configured in backend/.env (with no key, AI endpoints return AI_NOT_CONFIGURED)
//
// The frontend dev server (npm run dev, port 5173) must already be running for browser scripts.
import { execFileSync, spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const BACKEND_DIR = `${ROOT}backend`
export const BACKEND_LOG = process.env.QA_BACKEND_LOG ?? '/tmp/iq-backend.log'
export const API = 'http://localhost:8000'
export const WEB = process.env.QA_WEB ?? 'http://localhost:5173'
export const TEST_KEY = 'stub-test-key-not-a-real-credential'
export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const SHOTS = fileURLToPath(new URL('../results/', import.meta.url))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// QA_STUB_PORT is set by qa/run.mjs so scripts it launches can control the same stand-in
const spawned = { stub: null, backend: null, stubPort: process.env.QA_STUB_PORT ? Number(process.env.QA_STUB_PORT) : null }

export const healthy = () => fetch(`${API}/api/health`).then((r) => r.ok).catch(() => false)

export async function waitFor(fn, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn()) return true
    await sleep(150)
  }
  return false
}

/** A free port chosen by the OS (never a hard-coded one that something else might own). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

const commandOf = (pid) => {
  try { return execFileSync('ps', ['-p', String(pid), '-o', 'command=']).toString() } catch { return '' }
}
const kill = (pid) => { try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ } }

/** Stops the backend on :8000, but only if it is this project's uvicorn. */
export async function stopBackend() {
  if (spawned.backend) {
    kill(spawned.backend)
    spawned.backend = null
  }
  // Always stop whatever is actually listening on :8000 (verified to be this project's uvicorn). The recorded pid can be stale
  // when a script restarted the backend itself, and trusting it would leave an old instance running.
  let pids = []
  try { pids = execFileSync('lsof', ['-ti', 'tcp:8000', '-sTCP:LISTEN']).toString().split('\n').filter(Boolean) } catch { /* nothing listening */ }
  for (const pid of pids) {
    const cmd = commandOf(pid)
    if (!(cmd.includes('uvicorn') && cmd.includes('app.main:app'))) throw new Error(`Refusing to kill pid ${pid}: not this project's backend (${cmd.trim().slice(0, 80)})`)
    kill(Number(pid))
  }
  if (!(await waitFor(async () => !(await healthy()), 10000))) throw new Error('the backend on :8000 did not stop')
}

export async function startBackend({ mode = 'stub', timeoutSeconds = 30, extraEnv = {} } = {}) {
  if (await healthy()) await stopBackend()
  const env = { ...process.env }
  for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GOOGLE_GEMINI_BASE_URL', 'GEMINI_TIMEOUT_SECONDS']) delete env[k]
  if (mode === 'stub') {
    Object.assign(env, { GEMINI_API_KEY: TEST_KEY, GEMINI_MODEL: 'stub-model', GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${spawned.stubPort}`, GEMINI_TIMEOUT_SECONDS: String(timeoutSeconds) })
  }
  Object.assign(env, extraEnv)
  const out = openSync(BACKEND_LOG, 'a')
  const child = spawn(`${BACKEND_DIR}/.venv/bin/uvicorn`, ['app.main:app', '--port', '8000'], { cwd: BACKEND_DIR, env, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  closeSync(out)
  spawned.backend = child.pid
  if (!(await waitFor(healthy))) throw new Error('backend did not start')
}

export async function startStub() {
  if (spawned.stub) return spawned.stubPort
  const port = await freePort()
  const out = openSync('/tmp/iq-stub.log', 'a')
  const child = spawn(`${BACKEND_DIR}/.venv/bin/python`, ['-m', 'tests.stub_gemini', '--port', String(port)], { cwd: BACKEND_DIR, detached: true, stdio: ['ignore', out, out] })
  child.unref()
  closeSync(out)
  spawned.stub = child.pid
  spawned.stubPort = port
  if (!(await waitFor(() => fetch(`http://127.0.0.1:${port}/__requests`).then((r) => r.ok).catch(() => false)))) throw new Error('stub did not start')
  return port
}

export function stopStub() {
  if (spawned.stub) kill(spawned.stub)
  spawned.stub = null
}

/** Control and inspection of the stand-in Gemini (test tooling). */
export const stub = {
  base: () => `http://127.0.0.1:${spawned.stubPort}`,
  requests: async () => (await fetch(`${stub.base()}/__requests`)).json(),
  reset: () => fetch(`${stub.base()}/__reset`, { method: 'POST' }),
  script: (items) => fetch(`${stub.base()}/__script`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) }),
  expectedKey: (key) => fetch(`${stub.base()}/__expected_key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) }),
}

/** Tiny test reporter shared by the QA scripts: prints ✔/✘ and records results for the report. */
export function reporter(name) {
  const results = []
  let failures = 0
  return {
    section: (title) => console.log(`\n${title}`),
    expect(cond, msg) {
      console.log(cond ? '  ✔' : '  ✘', msg)
      results.push({ script: name, ok: Boolean(cond), test: msg })
      if (!cond) failures++
    },
    note: (msg) => console.log('   ·', msg),
    results,
    get failures() { return failures },
    done() {
      console.log(failures ? `\n${name}: ${failures} FAILED of ${results.length}` : `\n${name}: ALL ${results.length} PASSED`)
      return failures
    },
  }
}
