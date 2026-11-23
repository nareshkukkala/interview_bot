import { LEVEL_LABELS } from '../../features/interview/levels.js'
import Badge from '../ui/Badge.jsx'

export default function QuestionCard({ question, total }) {
  return (
    <section aria-labelledby="question-text" className="rounded-xl border border-line bg-card p-6 shadow-sm shadow-black/20 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums text-muted">
          Question {question.number} of {total}
        </span>
        <Badge tone={question.category === 'hr' ? 'accent' : 'primary'}>
          {question.category === 'hr' ? 'HR' : 'Technical'}
        </Badge>
        <Badge>{LEVEL_LABELS[question.level]}</Badge>
        <Badge>{question.topic}</Badge>
      </div>
      <h1 id="question-text" className="mt-5 text-xl leading-snug font-semibold tracking-tight text-pretty text-white sm:text-2xl">
        {question.text}
      </h1>
    </section>
  )
}
