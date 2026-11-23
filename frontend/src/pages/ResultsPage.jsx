import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BookOpen, CheckCircle2, CircleAlert, ClipboardList, LayoutDashboard, RotateCcw, SearchX } from 'lucide-react'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import InsightCard from '../components/results/InsightCard.jsx'
import OverallScoreCard from '../components/results/OverallScoreCard.jsx'
import QuestionScoreCard from '../components/results/QuestionScoreCard.jsx'
import ReviewAnswers from '../components/results/ReviewAnswers.jsx'
import SkillProgress from '../components/results/SkillProgress.jsx'
import { useApp } from '../context/useApp.js'
import { DIFFICULTIES, INTERVIEW_TYPES, ROLES, labelFor } from '../constants/options.js'
import { mergeResponses } from '../features/interview/sessionModel.js'
import { useSummaryRetry } from '../hooks/useSummaryRetry.js'
import { formatDate } from '../utils/format.js'
import { conceptsToRevisit, previousAttempt } from '../utils/results.js'

function scrollToId(id) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // wait a frame so a row that was just opened is in the page
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }))
}

export default function ResultsPage() {
  const { sessionId } = useParams()
  const { getSessionById } = useApp()
  const session = getSessionById(sessionId)

  if (!session || session.status !== 'completed') {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="Report not found"
          description="Reports are kept only while this tab is open. Complete a new interview to get a fresh report."
          action={<Button to="/interview/new">Start an interview</Button>}
        />
      </Card>
    )
  }

  return <Report session={session} />
}

function Report({ session }) {
  const { history } = useApp()
  const { config, result } = session
  const questions = useMemo(() => mergeResponses(session), [session])
  const scores = useMemo(() => Object.fromEntries(result.questionScores.map((q) => [q.number, q.score])), [result])
  const concepts = useMemo(() => conceptsToRevisit(questions), [questions])
  const previous = useMemo(() => previousAttempt(history, session), [history, session])
  const summary = useSummaryRetry(session)
  const [openNumbers, setOpenNumbers] = useState(() => new Set())

  const toggle = (number) =>
    setOpenNumbers((current) => {
      const next = new Set(current)
      if (!next.delete(number)) next.add(number)
      return next
    })

  const toggleAll = () =>
    setOpenNumbers((current) => (questions.every((q) => current.has(q.number)) ? new Set() : new Set(questions.map((q) => q.number))))

  const reviewQuestion = (number) => {
    setOpenNumbers((current) => new Set(current).add(number))
    scrollToId(`review-${number}`)
  }

  const reviewAnswers = () => {
    const first = questions.find((q) => !q.skipped)
    if (first) setOpenNumbers((current) => new Set(current).add(first.number))
    scrollToId('review')
  }

  // "Retake" opens the setup form with this interview's configuration filled in
  const { candidateName, jobRole, experience, difficulty, interviewType } = config
  const retakeState = { prefill: { candidateName, jobRole, experience, difficulty, interviewType } }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted">{formatDate(session.completedAt)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">Interview results</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="primary">{labelFor(ROLES, config.jobRole)}</Badge>
            <Badge>{labelFor(INTERVIEW_TYPES, config.interviewType)}</Badge>
            <Badge>{labelFor(DIFFICULTIES, config.difficulty)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" to="/">
            <LayoutDashboard aria-hidden="true" />
            Back to Dashboard
          </Button>
          <Button variant="secondary" onClick={reviewAnswers}>
            <ClipboardList aria-hidden="true" />
            Review Answers
          </Button>
          <Button to="/interview/new" state={retakeState}>
            <RotateCcw aria-hidden="true" />
            Retake Interview
          </Button>
        </div>
      </header>

      <OverallScoreCard
        result={result}
        config={config}
        total={questions.length}
        previous={previous}
        retrying={summary.retrying}
        retryError={summary.error}
        onRetrySummary={summary.retry}
      />

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <SkillProgress result={result} className="lg:col-span-2" />

        <section aria-labelledby="question-wise-heading" className="lg:col-span-3">
          <h2 id="question-wise-heading" className="text-base font-semibold text-white">
            Question-wise performance
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted">Each score is out of 10, as evaluated by Gemini.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {questions.map((q) => (
              <QuestionScoreCard key={q.id} question={q} score={scores[q.number]} onReview={reviewQuestion} />
            ))}
          </div>
        </section>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <InsightCard id="strengths-heading" title="Strengths" description="What your best answers did well" icon={CheckCircle2} iconClass="text-success" items={result.strengths} />
        <InsightCard
          id="improvements-heading"
          title="Improvement areas"
          description="Where your weakest answers lost points"
          icon={CircleAlert}
          iconClass="text-warning"
          items={result.weaknesses}
        />
        <InsightCard
          id="learning-heading"
          title="Learning recommendations"
          description="What to study before you retake the interview"
          icon={BookOpen}
          iconClass="text-accent"
          items={result.recommendations}
        >
          {concepts.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-white">Concepts to revisit</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {concepts.map((concept) => (
                  <li key={concept}>
                    <Badge tone="warning">{concept}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </InsightCard>
      </div>

      <ReviewAnswers questions={questions} scores={scores} openNumbers={openNumbers} onToggle={toggle} onToggleAll={toggleAll} />
    </div>
  )
}
