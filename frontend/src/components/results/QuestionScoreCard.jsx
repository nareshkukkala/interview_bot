import { CRITERIA } from '../../constants/options.js'
import { LEVEL_LABELS } from '../../features/interview/levels.js'
import { TONE_COLOR, scoreTone } from '../../utils/format.js'
import Badge from '../ui/Badge.jsx'
import Button from '../ui/Button.jsx'
import ScorePill from '../ui/ScorePill.jsx'

const SHORT = { technical_accuracy: 'Accuracy', relevance: 'Relevance', clarity: 'Clarity', completeness: 'Complete' }

/** One question's performance: the backend's score, the four criterion scores and a way to review the answer. */
export default function QuestionScoreCard({ question, score, onReview }) {
  const titleId = `question-card-${question.number}`
  const { evaluation } = question

  return (
    <article aria-labelledby={titleId} className="flex flex-col rounded-xl border border-line bg-card p-5 shadow-sm shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-faint tabular-nums">Question {question.number}</p>
          <h3 id={titleId} className="mt-1 truncate text-sm font-semibold text-white">
            {question.topic}
          </h3>
        </div>
        <ScorePill value={score} max={10} skipped={question.skipped} className="text-xl" />
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-muted">{question.text}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={question.category === 'hr' ? 'accent' : 'primary'}>{question.category === 'hr' ? 'HR' : 'Technical'}</Badge>
        <Badge>{LEVEL_LABELS[question.level]}</Badge>
      </div>

      {question.skipped || !evaluation ? (
        <p className="mt-4 text-sm text-faint">Skipped, so this question scored 0.</p>
      ) : (
        <>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${score * 10}%`, backgroundColor: TONE_COLOR[scoreTone(score * 10)] }} />
          </div>
          <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
            {CRITERIA.map((c) => (
              <div key={c.key}>
                <dt className="text-[0.6875rem] text-faint">{SHORT[c.key]}</dt>
                <dd className="mt-0.5 text-sm font-medium text-white tabular-nums">{evaluation[c.key]}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <Button variant="ghost" size="sm" className="mt-4 -ml-3 self-start" onClick={() => onReview(question.number)}>
        Review answer
      </Button>
    </article>
  )
}
