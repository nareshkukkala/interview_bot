// Shared browser helpers for the QA scripts: launching Chrome, a page that records everything, and common actions.
import puppeteer from 'puppeteer-core'
import { API, CHROME, WEB } from './stack.mjs'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const ANSWER = 'In my last project I used this concept directly. The key idea is the trade-off, and I explained the result with an example, the reasoning and what I learned.'

export const launch = () => puppeteer.launch({ executablePath: CHROME, headless: 'new' })

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
}

/**
 * A page that records console messages, uncaught errors and API requests.
 * `latency` delays API calls so loading states are observable. `viewport` must be set before navigating
 * (changing a mobile viewport later reloads the page and loses in-memory state).
 */
export async function newPage(browser, { latency = 0, viewport = VIEWPORTS.desktop } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const log = { console: [], pageErrors: [], calls: [], bodies: {}, dialogs: [], hosts: new Set(), failNext: null, intercept: null }
  page.on('console', (m) => log.console.push({ type: m.type(), text: m.text() }))
  page.on('pageerror', (e) => log.pageErrors.push(e.message))
  page.on('dialog', async (d) => {
    log.dialogs.push({ type: d.type(), message: d.message() })
    await d.accept()
  })
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    try { log.hosts.add(new URL(req.url()).host) } catch { /* data: urls */ }
    const url = req.url()
    if (!url.startsWith(`${API}/api`) || req.method() === 'OPTIONS') return req.continue().catch(() => {})
    const path = new URL(url).pathname
    const override = log.intercept?.(req, path)
    if (override) return req.respond(override).catch(() => {})
    if (log.failNext && req.method() === log.failNext.method && path.endsWith(log.failNext.suffix)) {
      log.calls.push({ method: req.method(), path, status: 'aborted', body: null })
      log.failNext = null
      return req.abort('failed').catch(() => {})
    }
    setTimeout(() => req.continue().catch(() => {}), latency)
  })
  page.on('response', async (res) => {
    const url = res.url()
    if (!url.startsWith(`${API}/api`)) return
    const req = res.request()
    if (req.method() === 'OPTIONS') return
    const path = new URL(url).pathname
    log.calls.push({ method: req.method(), path, status: res.status(), body: req.postData() ? safeJson(req.postData()) : null })
    try { log.bodies[`${req.method()} ${path}`] = await res.json() } catch { /* not json */ }
  })
  return { page, log }
}

const safeJson = (s) => { try { return JSON.parse(s) } catch { return s } }

/** Console errors/warnings that are NOT the browser's own note about a failed HTTP request (expected when a test provokes API errors). */
export const unexpectedConsole = (log) => log.console.filter((m) => ['error', 'warning'].includes(m.type) && !/Failed to load resource/.test(m.text))

export const text = (page) => page.evaluate(() => document.body.innerText)
export const waitText = (page, t, timeout = 15000) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t)
export const goto = (page, path = '/') => page.goto(`${WEB}${path}`, { waitUntil: 'networkidle0' })

/** Clicks the first visible element matching `selector` whose text (or aria-label) contains `label`. */
export async function click(page, selector, label) {
  for (const h of await page.$$(selector)) {
    const ok = await h.evaluate((el, l) => !!el.offsetParent && (el.innerText.trim().includes(l) || (el.getAttribute('aria-label') ?? '').includes(l)), label)
    if (ok) return h.click()
  }
  throw new Error(`No visible ${selector} containing "${label}"`)
}

export async function findButton(page, label) {
  for (const h of await page.$$('button')) {
    if ((await h.evaluate((el) => `${el.innerText} ${el.getAttribute('aria-label') ?? ''}`)).includes(label)) return h
  }
  return null
}
export const isDisabled = async (page, label) => (await (await findButton(page, label))?.evaluate((el) => el.disabled)) ?? null

export async function typeAnswer(page, value = ANSWER) {
  await page.click('#answer', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('#answer', value)
}

/** Sets a textarea/input value directly (for very long text where typing would be slow). */
export const setValue = (page, selector, value) =>
  page.$eval(
    selector,
    (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    value,
  )

export async function configure(page, { name = 'Priya Sharma', role = 'python_developer', difficulty = 'Medium', type = 'Mixed' } = {}) {
  await goto(page, '/interview/new')
  await setValue(page, '#candidateName', name)
  await page.select('#jobRole', role)
  await click(page, 'label', difficulty)
  await click(page, 'label', type)
}

export async function startInterview(page, opts) {
  await configure(page, opts)
  await click(page, 'button', 'Start interview')
  await page.waitForSelector('#question-text', { timeout: 15000 })
}

export const questionText = (page) => page.$eval('#question-text', (e) => e.innerText)
export const countCalls = (log, method, suffix) => log.calls.filter((c) => c.method === method && c.path.endsWith(suffix) && typeof c.status === 'number').length

export async function finishInterview(page) {
  await click(page, 'header button', 'Finish interview')
  await sleep(150)
  await click(page, '[role=dialog] button', 'See my summary')
  await page.waitForFunction(() => location.pathname.startsWith('/results/'), { timeout: 20000 })
  await waitText(page, 'Interview results')
}

/** True if the page scrolls horizontally (content wider than the window). */
export const hasHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)

/** Elements whose box extends past the viewport's right edge (the usual cause of a horizontal scrollbar). */
export const overflowingElements = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed')
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]}`),
  )
