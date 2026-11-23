import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCheck, Flag, LogOut, RefreshCw, SearchX, Timer, TimerOff } from 'lucide-react'
import AnswerEditor from '../components/interview/AnswerEditor.jsx'
import FeedbackPanel from '../components/interview/FeedbackPanel.jsx'
import FeedbackSkeleton from '../components/interview/FeedbackSkeleton.jsx'
import QuestionCard from '../components/interview/QuestionCard.jsx'
import QuestionNavigator from '../components/interview/QuestionNavigator.jsx'
import Alert from '../components/ui/Alert.jsx'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import LoadingScreen from '../components/ui/LoadingScreen.jsx'
import { LogoMark } from '../components/ui/Logo.jsx'
import Modal from '../components/ui/Modal.jsx'
import { useApp } from '../context/useApp.js'
import { DIFFICULTIES, ROLES, labelFor } from '../constants/options.js'
import { STATUS, nextUnresolvedIndex } from '../features/interview/sessionModel.js'
import { useBeforeUnload } from '../hooks/useBeforeUnload.js'
import { useConfirmDialog } from '../hooks/useConfirmDialog.js'
import { useInterviewSession } from '../hooks/useInterviewSession.js'
import { useSessionTimer } from '../hooks/useSessionTimer.js'
import { SESSION_EXPIRED_MESSAGE } from '../api/errors.js'
import { formatClock, formatDuration } from '../utils/format.js'

function FullPageNotice({ icon, title, description, action }) {
  return (
    <div className="grid min-h-screen place-items-center bg-base px-4">
      <Card className="w-full max-w-md">
        <EmptyState icon={icon} title={title} description={description} action={action} />
      </Card>
    </div>
  )
}

export default function InterviewRoomPage() {
  const { sessionId } = useParams()
  const { session, getSessionById } = useApp()

  if (!session || session.id !== sessionId) {
    if (getSessionById(sessionId)?.status === 'completed') return <Navigate to={`/results/${sessionId}`} replace />
    return (
      <FullPageNotice
        icon={SearchX}
        title="This interview is no longer available"
        description="Interviews are kept only while this tab is open. Set up a new one to keep practising."
        action={<Button to="/interview/new">Set up an interview</Button>}
      />
    )
  }

  if (session.status === 'completed') return <Navigate to={`/results/${session.id}`} replace />

  // The server no longer knows this session (it restarted, or the session timed out)
  if (session.status === 'expired') {
    return (
      <FullPageNotice
        icon={TimerOff}
        title="Your interview session has expired"
        description={SESSION_EXPIRED_MESSAGE}
        action={<Button to="/interview/new">Start a new interview</Button>}
      />
    )
  }

  return <InterviewRoom />
}

function InterviewRoom() {
  const { settings } = useApp()
  const interview = useInterviewSession()
  const { session, question, response, progress, busy, notice } = interview
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const finishing = session.status === 'finishing'
  const topRef = useRef(null)
  const noticeRef = useRef(null)
  const feedbackRef = useRef(null)
  const previousStatus = useRef(null)

  useSessionTimer()
  useBeforeUnload(!finishing)

  // Bring the new question into view whenever the current question changes
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' })
  }, [session.currentIndex])

  // When scoring finishes, bring the start of the feedback into view (below the sticky header) instead of keeping the old scroll position
  useEffect(() => {
    const finishedScoring = previousStatus.current === STATUS.EVALUATING && response.status === STATUS.ANSWERED && response.evaluation !== null
    previousStatus.current = response.status
    if (!finishedScoring) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }))
  }, [response.status, response.evaluation])

  // Make sure a new error message is seen
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [notice])

  const total = progress.total
  const index = session.currentIndex
  const answered = response.status === STATUS.ANSWERED
  const scored = answered && response.evaluation !== null
  const evaluating = response.status === STATUS.EVALUATING
  const nextOpen = nextUnresolvedIndex(session)

  const handleFinish = async () => {
    confirm.close()
    const id = await interview.finish()
    if (id) navigate(`/results/${id}`, { replace: true })
  }

  const handleExit = () => {
    interview.discard()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-base" ref={topRef}>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <LogoMark className="size-7" />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="truncate text-sm font-medium text-white">{labelFor(ROLES, session.config.jobRole)}</span>
            <Badge>{labelFor(DIFFICULTIES, session.config.difficulty)}</Badge>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {settings.showTimer && (
              <span
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-medium tabular-nums text-white"
                title={`Total time: ${formatDuration(progress.totalTime)}`}
                aria-label={`Time on this question: ${formatClock(response.timeSpent)}`}
              >
                <Timer className="size-4 text-accent" aria-hidden="true" />
                {formatClock(response.timeSpent)}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => confirm.open('finish')}
              disabled={progress.evaluating > 0 || finishing || busy}
              aria-label="Finish interview"
            >
              <Flag aria-hidden="true" />
              <span className="hidden sm:inline">Finish</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => confirm.open('exit')} disabled={finishing} aria-label="Exit interview">
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Exit</span>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-3 sm:px-6">
          <QuestionNavigator
            questions={session.questions}
            responses={session.responses}
            currentIndex={index}
            onSelect={interview.goTo}
            disabled={finishing}
          />
          <p className="mt-2 text-xs text-muted" aria-live="polite">
            {progress.answered} answered, {progress.skipped} skipped, {progress.remaining} left
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {notice && (
          <Alert ref={noticeRef} onDismiss={interview.dismissNotice}>
            {notice}
          </Alert>
        )}

        {progress.allResolved && (
          <div className="flex flex-col gap-4 rounded-xl border border-success/25 bg-success/[0.06] px-5 py-4 sm:flex-row sm:items-center">
            <CheckCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
            <p className="flex-1 text-sm text-white">
              Every question is answered or skipped. Review your answers, or finish to see your summary.
            </p>
            <Button onClick={() => confirm.open('finish')} disabled={busy}>
              Finish interview
            </Button>
          </div>
        )}

        <QuestionCard question={question} total={total} />

        {response.status === STATUS.SKIPPED && (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            You skipped this question. You can still answer it before you finish.
          </p>
        )}

        {answered ? (
          <>
            <section aria-labelledby="your-answer" className="rounded-xl border border-line bg-surface p-6 sm:px-8">
              <h2 id="your-answer" className="text-sm font-semibold text-muted">
                Your answer
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-[#cbd5e1]">{response.answer}</p>
            </section>

            {scored ? (
              <Card as="section" ref={feedbackRef} aria-labelledby="feedback-heading" className="scroll-mt-40 sm:p-8">
                <h2 id="feedback-heading" className="mb-6 text-lg font-semibold text-white">
                  Feedback
                </h2>
                <FeedbackPanel question={{ ...question, evaluation: response.evaluation, skipped: false }} />
              </Card>
            ) : (
              // The server has saved the answer but could not score it. It cannot be re-submitted, only re-scored.
              <Card as="section" aria-labelledby="unscored-heading" className="sm:p-8">
                <h2 id="unscored-heading" className="text-lg font-semibold text-white">
                  Your answer is saved, but it has not been scored
                </h2>
                <Alert className="mt-4">{response.error ?? 'Scoring did not finish.'}</Alert>
                <Button className="mt-5" onClick={() => interview.retryScoring(question.id)}>
                  <RefreshCw aria-hidden="true" />
                  Try scoring again
                </Button>
              </Card>
            )}
          </>
        ) : (
          <>
            <AnswerEditor
              key={question.id}
              value={response.draft}
              onChange={(text) => interview.setDraft(question.id, text)}
              onSubmit={() => interview.submit(question.id)}
              onSkip={() => interview.skip(question.id)}
              evaluating={evaluating}
              disabled={busy}
              canSkip={response.status === STATUS.UNANSWERED}
              externalError={response.error}
            />
            {evaluating && <FeedbackSkeleton />}
          </>
        )}

        {/* Question navigation */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button variant="secondary" onClick={interview.previous} disabled={index === 0}>
            <ArrowLeft aria-hidden="true" />
            Previous
          </Button>
          <Button variant="secondary" onClick={interview.next} disabled={index === total - 1}>
            Next
            <ArrowRight aria-hidden="true" />
          </Button>
          <div className="ml-auto">
            {answered && nextOpen !== -1 && (
              <Button onClick={interview.goToNextUnresolved} autoFocus={scored}>
                Continue to question {nextOpen + 1}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
            {progress.allResolved && !answered && (
              <Button onClick={() => confirm.open('finish')} disabled={busy}>
                Finish interview
              </Button>
            )}
            {progress.allResolved && answered && (
              <Button onClick={() => confirm.open('finish')} autoFocus={scored} disabled={busy}>
                Finish interview
              </Button>
            )}
          </div>
        </div>
      </main>

      <Modal
        open={confirm.isOpen('exit')}
        onClose={confirm.close}
        title="Exit this interview?"
        description="Your answers and feedback so far will be discarded. You can start a new interview at any time."
        actions={
          <>
            <Button variant="secondary" onClick={confirm.close}>
              Keep going
            </Button>
            <Button variant="danger" onClick={handleExit}>
              Exit interview
            </Button>
          </>
        }
      />

      <Modal
        open={confirm.isOpen('finish')}
        onClose={confirm.close}
        title={progress.remaining > 0 ? `Finish with ${progress.remaining} unanswered?` : 'Finish the interview?'}
        description={
          progress.remaining > 0
            ? `${progress.remaining} question${progress.remaining === 1 ? '' : 's'} without a submitted answer will be marked as skipped and score 0. You can't change answers after finishing.`
            : `You answered ${progress.answered} and skipped ${progress.skipped}. You can't change answers after finishing.`
        }
        actions={
          <>
            <Button variant="secondary" onClick={confirm.close}>
              Keep working
            </Button>
            <Button onClick={handleFinish} disabled={busy}>
              See my summary
            </Button>
          </>
        }
      />

      {finishing && <LoadingScreen overlay title="Preparing your summary" description="Scoring your answers and building your report." />}
    </div>
  )
}
