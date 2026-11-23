import { useMemo } from 'react'
import { BarChart3, Target } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import Card, { CardHeader } from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import ScoreBar from '../components/ui/ScoreBar.jsx'
import ScoreRing from '../components/ui/ScoreRing.jsx'
import { useApp } from '../context/useApp.js'
import { CRITERIA, ROLES, labelFor } from '../constants/options.js'
import { cn, formatShortDate } from '../utils/format.js'
import { performanceLabel } from '../utils/scoring.js'
import { computeStats } from '../utils/stats.js'

const FOCUS_TIPS = {
  technical_accuracy: 'Revise core concepts for your role and practise explaining them precisely, with correct terminology.',
  relevance: 'Before answering, restate the question to yourself and make sure your first sentence answers it directly.',
  clarity: 'Use a simple structure: a one-line answer, a short explanation, then an example.',
  completeness: 'Cover the why and the trade-offs, not just the what, and finish with a real example.',
}

function ScoreTrend({ items }) {
  const latestIndex = items.length - 1
  return (
    <div>
      <div
        className="flex h-52 items-end gap-2 sm:gap-3"
        role="img"
        aria-label={`Score trend: ${items.map((h) => `${formatShortDate(h.completedAt)} ${h.score}`).join(', ')}`}
      >
        {items.map((h, i) => (
          <div key={h.id} className="flex h-full flex-1 flex-col items-center justify-end gap-2" aria-hidden="true">
            <span className={cn('text-xs font-medium tabular-nums', i === latestIndex ? 'text-white' : 'text-muted')}>{h.score}</span>
            <div
              className={cn('w-full max-w-12 rounded-t-md', i === latestIndex ? 'bg-accent' : 'bg-primary/70')}
              style={{ height: `${Math.max(4, h.score)}%` }}
              title={`${labelFor(ROLES, h.jobRole)}: ${h.score}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-line pt-2 sm:gap-3" aria-hidden="true">
        {items.map((h) => (
          <span key={h.id} className="flex-1 text-center text-xs text-faint tabular-nums">
            {formatShortDate(h.completedAt)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PerformancePage() {
  const { history } = useApp()
  const stats = useMemo(() => computeStats(history), [history])

  if (!history.length) {
    return (
      <>
        <PageHeader title="Performance" />
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Not enough data yet"
            description="Complete an interview to start tracking your performance over time."
            action={<Button to="/interview/new">Start an interview</Button>}
          />
        </Card>
      </>
    )
  }

  const weakest = CRITERIA.reduce((a, b) => (stats.criteria[b.key] < stats.criteria[a.key] ? b : a))
  const strongest = CRITERIA.reduce((a, b) => (stats.criteria[b.key] > stats.criteria[a.key] ? b : a))
  const recent = stats.chronological.slice(-10)

  return (
    <>
      <PageHeader title="Performance" description="How your interview scores are changing, and where to focus next." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Score trend"
            description={`Your last ${recent.length} interview${recent.length === 1 ? '' : 's'}, oldest to newest`}
          />
          <ScoreTrend items={recent} />
          {recent.length === 1 && <p className="mt-4 text-sm text-muted">Complete one more interview to see how your score changes.</p>}
        </Card>

        <Card className="flex flex-col items-center">
          <CardHeader title="Overall average" description={`${stats.count} interviews`} className="w-full" />
          <ScoreRing value={stats.averageScore} size={160} stroke={12} caption={performanceLabel(stats.averageScore)} />
          <dl className="mt-6 grid w-full grid-cols-2 gap-4 border-t border-line pt-5 text-center">
            <div>
              <dt className="text-sm text-muted">Best</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{stats.bestScore}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Change</dt>
              <dd className={cn('mt-1 text-xl font-semibold tabular-nums', stats.scoreChange >= 0 ? 'text-success' : 'text-danger')}>
                {stats.scoreChange >= 0 ? '+' : ''}
                {stats.scoreChange}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Criteria averages" description="Out of 10, across all interviews" />
          <div className="space-y-5">
            {CRITERIA.map((c) => (
              <ScoreBar key={c.key} label={c.label} value={stats.criteria[c.key]} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="By interview type" description="Average score per type" />
          <ul className="space-y-5">
            {stats.byType.map((t) => (
              <li key={t.value}>
                {t.average === null ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">{t.label}</span>
                    <span className="text-faint">No interviews yet</span>
                  </div>
                ) : (
                  <ScoreBar label={`${t.label} (${t.count})`} value={t.average} max={100} />
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Where to focus" />
          <div className="space-y-5 text-sm">
            <div className="flex gap-3">
              <Target className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium text-white">
                  {weakest.label} is your lowest area at {stats.criteria[weakest.key].toFixed(1)}
                </p>
                <p className="mt-1 leading-relaxed text-muted">{FOCUS_TIPS[weakest.key]}</p>
              </div>
            </div>
            <div className="border-t border-line pt-5 text-muted">
              Your strongest area is <span className="font-medium text-white">{strongest.label.toLowerCase()}</span> at{' '}
              <span className="tabular-nums">{stats.criteria[strongest.key].toFixed(1)}</span>.
            </div>
            <Button to="/interview/new" variant="secondary" className="w-full">
              Practise now
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
