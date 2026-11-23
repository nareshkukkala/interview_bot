// Runs QA scripts against the stand-in-Gemini stack, then restores the real (as configured) backend.
//
//   node qa/run.mjs qa/api-probes.mjs qa/browser-journey.mjs
//   node qa/run.mjs --real qa/no-key.mjs        # scripts that must see the backend exactly as configured in backend/.env
import { spawnSync } from 'node:child_process'
import { startBackend, startStub, stopStub } from './lib/stack.mjs'

let stubPort = null

const args = process.argv.slice(2)
const real = args[0] === '--real'
const scripts = real ? args.slice(1) : args

if (!real) {
  stubPort = await startStub()
  await startBackend({ mode: 'stub', timeoutSeconds: 5 })
} else {
  await startBackend({ mode: 'real' })
}

let failed = false
for (const script of scripts) {
  console.log(`\n=== ${script} ===`)
  const result = spawnSync('node', [script], { stdio: 'inherit', env: { ...process.env, ...(stubPort ? { QA_STUB_PORT: String(stubPort) } : {}) } })
  if (result.status !== 0) failed = true
}

stopStub()
await startBackend({ mode: 'real' })
console.log(failed ? '\nSOME SCRIPTS FAILED' : '\nALL SCRIPTS PASSED', '(backend restored: real configuration)')
process.exit(failed ? 1 : 0)
