import { TONE_COLOR, scoreTone } from '../../utils/format.js'
import { skillRows } from '../../utils/results.js'
import Badge from '../ui/Badge.jsx'
import Card, { CardHeader } from '../ui/Card.jsx'

/** The four criteria as progress indicators, with the strongest and weakest highlighted (from the real averages). */
export default function SkillProgress({ result, className }) {
  const rows = skillRows(result)
  const strongest = rows.find((r) => r.tag === 'strongest')
  const weakest = rows.find((r) => r.tag === 'weakest')

  return (
    <Card as="section" aria-labelledby="skills-heading" className={className}>
      <CardHeader title={<span id="skills-heading">Skills</span>} description="Average score out of 10 for each criterion" />
      <ul className="space-y-5">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="flex flex-wrap items-center gap-2 text-muted">
                {row.label}
                {row.tag === 'strongest' && <Badge tone="success">Strongest</Badge>}
                {row.tag === 'weakest' && <Badge tone="warning">Weakest</Badge>}
              </span>
              <span className="font-medium tabular-nums text-white">
                {row.value.toFixed(1)}
                <span className="text-faint">/10</span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-line"
              role="meter"
              aria-label={row.label}
              aria-valuenow={row.value}
              aria-valuemin={0}
              aria-valuemax={10}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: `${row.value * 10}%`, backgroundColor: TONE_COLOR[scoreTone(row.value * 10)] }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
        {strongest && weakest ? (
          <>
            Your strongest skill is <span className="font-medium text-white">{strongest.label.toLowerCase()}</span> and your weakest is{' '}
            <span className="font-medium text-white">{weakest.label.toLowerCase()}</span>.
          </>
        ) : result.answeredCount > 0 ? (
          'Your four skills are evenly balanced.'
        ) : (
          'Answer at least one question to see your strongest and weakest skills.'
        )}
      </p>
    </Card>
  )
}
