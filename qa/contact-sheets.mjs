// Builds contact sheets (several screens per image) from the PNGs that screenshots.mjs captured.
// Run:  node qa/contact-sheets.mjs ui-before        (reads qa/results/ui-before/*.png)
import { existsSync, writeFileSync } from 'node:fs'
import { CHROME, SHOTS } from './lib/stack.mjs'
import puppeteer from 'puppeteer-core'

const dir = `${SHOTS}${process.argv[2] ?? 'ui-review'}/`
const SHEETS = {
  'sheet-1-static': [['d01-dashboard-empty', 'd02-setup', 'd03-setup-errors', 'd04-history-empty', 'd05-performance-empty', 'd06-settings', 'd07-not-found', 'd08-room-unavailable', 'd09-report-not-found'], 3, 520],
  'sheet-2-room': [['d10-loading-start', 'd11-room-question', 'd12-room-draft', 'd13-room-evaluating', 'd14-feedback', 'd16-room-skipped'], 3, 520],
  'sheet-3-results': [['d17-finish-modal', 'd18-loading-summary', 'd19-results-top', 'd21-results-review', 'd23-history-data', 'd24-performance-data'], 3, 520],
  'sheet-4-errors': [['d25-setup-start-error', 'd26-room-unscored', 'd27-session-expired', 'd28-room-finish-error', 'd29-results-summary-failed'], 3, 520],
  'sheet-5-mobile': [['m01-dashboard-empty', 'm02-drawer', 'm04-room-question', 'm06-results-top'], 4, 300],
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
for (const [file, [names, columns, width]] of Object.entries(SHEETS)) {
  const present = names.filter((n) => existsSync(`${dir}${n}.png`))
  const html = `<body style="margin:0;background:#05070f;font:12px system-ui;color:#94a3b8"><div style="display:grid;grid-template-columns:repeat(${columns},${width}px);gap:10px;padding:10px">${present
    .map((n) => `<figure style="margin:0"><figcaption style="padding:2px 0 4px">${n}</figcaption><img src="${n}.png" style="width:${width}px;border:1px solid #243049;display:block"></figure>`)
    .join('')}</div></body>`
  writeFileSync(`${dir}_${file}.html`, html) // a real file, so file:// images are allowed to load
  const page = await browser.newPage()
  await page.setViewport({ width: columns * (width + 10) + 10, height: 800 })
  await page.goto(`file://${dir}_${file}.html`, { waitUntil: 'load' })
  await page.screenshot({ path: `${dir}${file}.png`, fullPage: true })
  await page.close()
  console.log(`${file}: ${present.length} screens`)
}
await browser.close()
