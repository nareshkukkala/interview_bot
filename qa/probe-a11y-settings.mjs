// Diagnostic: what accessible names does Chrome compute for the Settings page switches?
import { reporter } from './lib/stack.mjs'
import { goto, launch, newPage } from './lib/browser.mjs'

const t = reporter('probe-a11y')
const browser = await launch()
const { page } = await newPage(browser)
await goto(page, '/settings')
const tree = await page.accessibility.snapshot({ interestingOnly: true })
const switches = []
const walk = (n) => { if (n.role === 'switch') switches.push({ name: n.name, checked: n.checked }); (n.children ?? []).forEach(walk) }
walk(tree)
console.log('   switches in the accessibility tree:', JSON.stringify(switches))
t.expect(switches.length === 2 && switches.every((s) => s.name && s.name.length > 3), 'both switches have an accessible name computed by Chrome from their <label>')
t.expect(switches.some((s) => /timer/i.test(s.name)) && switches.some((s) => /example interviews/i.test(s.name)), 'the names are meaningful ("Show question timer", "Show example interviews")')
await browser.close()
process.exit(t.done() ? 1 : 0)
