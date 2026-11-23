import { RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { messageForCode } from '../../api/errors.js'
import { EXPERIENCE_LEVELS, ROLES, labelFor } from '../../constants/options.js'
import { cn, formatDuration, formatShortDate } from '../../utils/format.js'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import ScoreRing from '../ui/ScoreRing.jsx'

function SummaryBlock({ result, retrying, retryError, onRetry }) {
  if (result.summary) {
    return (
      <>
        <p className="max-w-[62ch] text-[0.9375rem] leading-relaxed text-[#cbd5e1]">{result.summary}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Written by Gemini from your question evaluations
        </p>
      </>
    )
  }

  if (result.answeredCount === 0) {
    return <p className="text-sm text-muted">No questions were answered, so there is nothing to summarise.</p>
  }

  // The report is real; only the written summary is missing. Say so, and let the candidate retry it.
  const reason = retryError ?? messageForCode(result.summaryError?.code, result.summaryError?.message)
  return (
    <Alert
      tone="warning"
      title="The AI summary could not be written"
      action={
        <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying}>
          {!retrying && <RefreshCw aria-hidden="true" />}
          Try again
        </Button>
      }
    >
      Your scores and feedback below are not affected.{reason ? ` ${reason}` : ''}
    </Alert>
  )
}

/** The headline of the report: the overall score out of 100, the AI summary and the facts behind the score. */
export default function OverallScoreCard({ result, config, total, previous, retrying, retryError, onRetrySummary }) {
  const firstName = config.candidateName.split(' ')[0]
  const facts = [
    ['Answered', `${result.answeredCount} of ${total}`],
    ['Skipped', result.skippedCount],
    ['Time taken', formatDuration(result.durationSec)],
    ['Experience', labelFor(EXPERIENCE_LEVELS, config.experience)],
  ]
  const change = previous ? result.overallScore - previous.score : null

  return (
    <Card as="section" aria-labelledby="overall-heading" className="grid gap-8 sm:p-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
      <ScoreRing value={result.overallScore} size={196} stroke={14} caption={result.label} className="mx-auto" />
      <div>
        <h2 id="overall-heading" className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere] text-white">
          {firstName}, you scored {result.overallScore} out of 100
        </h2>
        <div className="mt-3" aria-live="polite">
          <SummaryBlock result={result} retrying={retrying} retryError={retryError} onRetry={onRetrySummary} />
        </div>

        {change !== null && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-muted">
            {change >= 0 ? <TrendingUp className="size-4 text-success" aria-hidden="true" /> : <TrendingDown className="size-4 text-danger" aria-hidden="true" />}
            <span>
              <span className={cn('font-medium tabular-nums', change >= 0 ? 'text-success' : 'text-danger')}>
                {change >= 0 ? '+' : ''}
                {change} points
              </span>{' '}
              compared with your previous {labelFor(ROLES, config.jobRole)} interview ({formatShortDate(previous.completedAt)})
            </span>
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-6 sm:grid-cols-4">
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt className="text-sm text-muted">{term}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-faint">
          How this is calculated: each answer is scored by Gemini on four criteria out of 10. A question&apos;s score is their average, and your overall
          score is the average of your {total} question scores times 10. Skipped questions count as 0.
        </p>
      </div>
    </Card>
  )
}
