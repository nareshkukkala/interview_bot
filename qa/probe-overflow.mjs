// Diagnostic: where does a long unbroken answer overflow? (used to confirm BUG-6 and to verify its fix)
import { SHOTS, reporter } from './lib/stack.mjs'
import { VIEWPORTS, click, finishInterview, launch, newPage, setValue, startInterview, waitText } from './lib/browser.mjs'

const t = reporter('probe-overflow')
const browser = await launch()
for (const [name, viewport] of [['desktop', VIEWPORTS.desktop], ['mobile', VIEWPORTS.mobile]]) {
  const { page } = await newPage(browser, { viewport })
  await startInterview(page)
  await setValue(page, '#answer', 'x'.repeat(2000))
  await click(page, 'button', 'Submit answer')
  await waitText(page, 'Ideal answer')
  const room = await page.evaluate(() => {
    const p = document.querySelector('section[aria-labelledby="your-answer"] p')
    return { window: window.innerWidth, doc: document.documentElement.scrollWidth, paragraph: p.scrollWidth, paragraphBox: Math.round(p.getBoundingClientRect().width) }
  })
  console.log(`   ${name} room:`, JSON.stringify(room))
  t.expect(room.doc <= room.window + 1 && room.paragraph <= room.paragraphBox + 1, `${name}: the answer wraps inside its box in the room (document ${room.doc}px, window ${room.window}px, paragraph content ${room.paragraph}px in a ${room.paragraphBox}px box)`)
  await page.screenshot({ path: `${SHOTS}overflow-room-${name}.png` })

  await finishInterview(page)
  await click(page, 'button', 'Expand all')
  await new Promise((r) => setTimeout(r, 300))
  const results = await page.evaluate(() => ({ window: window.innerWidth, doc: document.documentElement.scrollWidth }))
  t.expect(results.doc <= results.window + 1, `${name}: the answer wraps inside its box on the results page (document ${results.doc}px, window ${results.window}px)`)
  await page.screenshot({ path: `${SHOTS}overflow-results-${name}.png` })
  await page.close()
}
await browser.close()
process.exit(t.done() ? 1 : 0)
