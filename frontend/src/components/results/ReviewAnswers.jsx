import { ChevronDown } from 'lucide-react'
import FeedbackPanel from '../interview/FeedbackPanel.jsx'
import { LEVEL_LABELS } from '../../features/interview/levels.js'
import { cn } from '../../utils/format.js'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import Card from '../ui/Card.jsx'
import ScorePill from '../ui/ScorePill.jsx'

function ReviewRow({ question, score, open, onToggle }) {
  const panelId = `question-${question.number}-details`
  return (
    <li id={`review-${question.number}`} className="scroll-mt-6">
      <button
        type="button"
        onClick={() => onToggle(question.number)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03] sm:px-6"
      >
        <span className="mt-0.5 w-5 shrink-0 text-sm font-medium tabular-nums text-faint">{question.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium [overflow-wrap:anywhere] text-white">{question.text}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={question.category === 'hr' ? 'accent' : 'primary'}>{question.category === 'hr' ? 'HR' : 'Technical'}</Badge>
            <Badge>{LEVEL_LABELS[question.level]}</Badge>
            <Badge>{question.topic}</Badge>
          </span>
        </span>
        <ScorePill value={score} max={10} skipped={question.skipped} className="mt-0.5" />
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="space-y-6 border-t border-line bg-surface/50 px-5 py-6 sm:px-6 sm:pl-15">
          {question.skipped ? (
            <p className="text-sm text-muted">You skipped this question, so it scored 0.</p>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-semibold text-muted">Your answer</h3>
                <p className="mt-2 max-w-[72ch] text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-[#cbd5e1]">{question.answer}</p>
              </div>
              <FeedbackPanel question={question} compact />
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** Every question with the candidate's answer, Gemini's feedback and the ideal answer. */
export default function ReviewAnswers({ questions, scores, openNumbers, onToggle, onToggleAll }) {
  const allOpen = questions.length > 0 && questions.every((q) => openNumbers.has(q.number))
  return (
    <Card as="section" id="review" aria-labelledby="review-heading" padded={false} className="scroll-mt-6">
      <div className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6">
        <div>
          <h2 id="review-heading" className="text-base font-semibold text-white">
            Review answers
          </h2>
          <p className="mt-1 text-sm text-muted">Open a question to see your answer, the feedback, the ideal answer and what to study next.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onToggleAll}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {questions.map((q) => (
          <ReviewRow key={q.id} question={q} score={scores[q.number]} open={openNumbers.has(q.number)} onToggle={onToggle} />
        ))}
      </ul>
    </Card>
  )
}
