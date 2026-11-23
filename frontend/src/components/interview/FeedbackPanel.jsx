import { BookOpen, CheckCircle2, CircleAlert, Lightbulb, MessageCircleQuestion } from 'lucide-react'
import { CRITERIA } from '../../constants/options.js'
import { performanceLabel, questionScore } from '../../utils/scoring.js'
import { TONE_TEXT, cn, scoreTone } from '../../utils/format.js'
import Badge from '../ui/Badge.jsx'
import ScoreBar from '../ui/ScoreBar.jsx'
import ScoreRing from '../ui/ScoreRing.jsx'

function PointList({ title, items, icon: Icon, iconClass }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] text-[#cbd5e1]">
            <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Full AI feedback for one answer: scores, strengths, improvement areas, missing concepts, ideal answer, follow-up, topic to study. */
export default function FeedbackPanel({ question, compact = false }) {
  const { evaluation } = question
  const score = questionScore(question)
  const tone = scoreTone(score * 10)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 sm:w-52 sm:shrink-0">
          <ScoreRing value={score} max={10} size={compact ? 76 : 96} stroke={compact ? 7 : 8} />
          <div>
            <p className={cn('text-sm font-semibold', TONE_TEXT[tone])}>{performanceLabel(score * 10)}</p>
            <p className="mt-0.5 text-xs text-faint">Answer score</p>
          </div>
        </div>
        <div className="grid flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {CRITERIA.map((c) => (
            <ScoreBar key={c.key} label={c.label} value={evaluation[c.key]} />
          ))}
        </div>
      </div>

      <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        <PointList title="Strengths" items={evaluation.strengths} icon={CheckCircle2} iconClass="text-success" />
        <PointList title="Improvement areas" items={evaluation.weaknesses} icon={CircleAlert} iconClass="text-warning" />
      </div>

      {evaluation.missing_concepts?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white">Missing concepts</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {evaluation.missing_concepts.map((concept) => (
              <li key={concept}>
                <Badge tone="warning">{concept}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Lightbulb className="size-4 text-accent" aria-hidden="true" />
          Ideal answer
        </h3>
        <p className="mt-3 max-w-[72ch] text-sm leading-relaxed [overflow-wrap:anywhere] text-[#cbd5e1]">{evaluation.improved_answer}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-line p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageCircleQuestion className="size-4 text-accent" aria-hidden="true" />
            Practice follow-up
          </h3>
          <p className="mt-2 text-sm leading-relaxed [overflow-wrap:anywhere] text-muted">{evaluation.follow_up_question}</p>
        </section>
        {evaluation.recommended_topic && (
          <section className="rounded-lg border border-line p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <BookOpen className="size-4 text-accent" aria-hidden="true" />
              Study next
            </h3>
            <p className="mt-2 text-sm leading-relaxed [overflow-wrap:anywhere] text-muted">{evaluation.recommended_topic}</p>
          </section>
        )}
      </div>
    </div>
  )
}
