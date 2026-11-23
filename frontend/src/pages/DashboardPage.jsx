import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock3, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import InterviewListItem from '../components/results/InterviewListItem.jsx'
import Button from '../components/ui/Button.jsx'
import Card, { CardHeader } from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { LogoMark } from '../components/ui/Logo.jsx'
import ScoreRing from '../components/ui/ScoreRing.jsx'
import { useApp } from '../context/useApp.js'
import { ROLES, labelFor } from '../constants/options.js'
import { TONE_COLOR, cn, formatDuration, greeting, scoreTone } from '../utils/format.js'
import { performanceLabel } from '../utils/scoring.js'
import { getProgress } from '../features/interview/sessionModel.js'
import { computeStats } from '../utils/stats.js'

const HOW_IT_WORKS = [
  ['Set up', 'Pick a role, a level and an interview type.'],
  ['Answer', 'Five questions, one at a time, in your own words.'],
  ['Improve', 'Scored feedback, ideal answers and what to study next.'],
]

function StatStrip({ stats }) {
  const items = [
    { label: 'Interviews completed', value: stats.count },
    { label: 'Questions answered', value: stats.questionsAnswered },
    { label: 'Practice time', value: formatDuration(stats.practiceSeconds) },
    { label: 'Best score', value: stats.bestScore, suffix: '/100' },
  ]
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-card shadow-sm shadow-black/20 lg:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            'px-5 py-5 sm:px-6',
            i % 2 === 1 && 'border-l border-line',
            i >= 2 && 'border-t border-line lg:border-t-0',
            i === 2 && 'lg:border-l',
          )}
        >
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">
            {item.value}
            {item.suffix && <span className="text-base font-normal text-faint">{item.suffix}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SkillCard({ skill }) {
  const delta = Math.round((skill.to - skill.from) * 10) / 10
  const improving = delta >= 0
  return (
    <Card className="flex flex-col">
      <p className="text-sm text-muted">{skill.label}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-white">{skill.to.toFixed(1)}</span>
        <span className="text-sm text-faint">/10</span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-sm font-medium tabular-nums',
            improving ? 'text-success' : 'text-danger',
          )}
        >
          {improving ? <TrendingUp className="size-4" aria-hidden="true" /> : <TrendingDown className="size-4" aria-hidden="true" />}
          {improving ? '+' : ''}
          {delta.toFixed(1)}
        </span>
      </div>
      <div className="relative mt-4 h-1.5 rounded-full bg-line" aria-hidden="true">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${skill.to * 10}%`, backgroundColor: TONE_COLOR[scoreTone(skill.to * 10)] }}
        />
        <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-white/60" style={{ left: `${skill.from * 10}%` }} />
      </div>
      <p className="mt-3 text-xs text-faint">Started at {skill.from.toFixed(1)}</p>
    </Card>
  )
}

export default function DashboardPage() {
  const { settings, history, activeSession } = useApp()
  const stats = useMemo(() => computeStats(history), [history])
  const name = settings.candidateName.trim().split(/\s+/)[0]
  const hasHistory = history.length > 0

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2.5 text-sm text-muted">
            <LogoMark className="size-6" />
            Your personal AI interview coach
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] text-white sm:text-[2.125rem]">
            {name ? `${greeting()}, ${name}` : 'Welcome to InterviewIQ'}
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Practise real interview questions for your role and get scored feedback on every answer.
          </p>
        </div>
        <Button to="/interview/new" size="lg">
          <Plus aria-hidden="true" />
          Start new interview
        </Button>
      </section>

      {activeSession && (
        <Link
          to={`/interview/${activeSession.id}`}
          className="flex items-center gap-4 rounded-xl border border-accent/25 bg-accent/[0.06] px-5 py-4 transition-colors hover:border-accent/50"
        >
          <Clock3 className="size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">
              Resume your {labelFor(ROLES, activeSession.config.jobRole)} interview
            </p>
            <p className="text-sm text-muted">
              {getProgress(activeSession).resolved} of {activeSession.questions.length} questions done
            </p>
          </div>
          <ArrowUpRight className="size-5 text-muted" aria-hidden="true" />
        </Link>
      )}

      {!hasHistory ? (
        <Card>
          <EmptyState
            title="No interviews yet"
            description="Complete your first mock interview to see your scores, trends and skill progress here."
            action={<Button to="/interview/new">Start your first interview</Button>}
          />
          <ol className="grid gap-5 border-t border-line pt-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-[#a5b4fc]">{i + 1}</span>
                <span>
                  <span className="block text-sm font-medium text-white">{title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <>
          <StatStrip stats={stats} />

          <div className="grid items-start gap-6 lg:grid-cols-3">
            <Card className="flex flex-col items-center text-center">
              <CardHeader title="Average score" description="Across all interviews" className="w-full text-left" />
              <ScoreRing value={stats.averageScore} size={168} stroke={12} caption={performanceLabel(stats.averageScore)} />
              {stats.count >= 2 && (
                <p className="mt-6 flex items-center gap-1.5 text-sm text-muted">
                  {stats.scoreChange >= 0 ? (
                    <TrendingUp className="size-4 text-success" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="size-4 text-danger" aria-hidden="true" />
                  )}
                  <span>
                    <span className={cn('font-medium tabular-nums', stats.scoreChange >= 0 ? 'text-success' : 'text-danger')}>
                      {stats.scoreChange >= 0 ? '+' : ''}
                      {stats.scoreChange} points
                    </span>{' '}
                    since your first interview
                  </span>
                </p>
              )}
            </Card>

            <Card padded={false} className="lg:col-span-2">
              <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
                <h2 className="text-base font-semibold text-white">Recent activity</h2>
                <Link to="/history" className="text-sm font-medium text-[#a5b4fc] hover:text-white">
                  View all
                </Link>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {history.slice(0, 4).map((item) => (
                  <InterviewListItem key={item.id} item={item} />
                ))}
              </ul>
            </Card>
          </div>

          {stats.skillProgress.length > 0 && (
            <section aria-labelledby="skills-heading">
              <div className="mb-4">
                <h2 id="skills-heading" className="text-lg font-semibold text-white">
                  Skill improvement
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Your latest {stats.skillWindow === 1 ? 'interview' : `${stats.skillWindow} interviews`} compared with your first{' '}
                  {stats.skillWindow === 1 ? 'one' : stats.skillWindow}.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.skillProgress.map((skill) => (
                  <SkillCard key={skill.key} skill={skill} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
