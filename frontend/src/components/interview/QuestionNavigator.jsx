import { Check, Loader2 } from 'lucide-react'
import { STATUS } from '../../features/interview/sessionModel.js'
import { cn } from '../../utils/format.js'

const STATUS_LABEL = {
  [STATUS.UNANSWERED]: 'not answered',
  [STATUS.EVALUATING]: 'evaluating',
  [STATUS.ANSWERED]: 'answered',
  [STATUS.SKIPPED]: 'skipped',
}

/** Numbered question buttons showing answered / skipped / current state. Click to jump. */
export default function QuestionNavigator({ questions, responses, currentIndex, onSelect, disabled }) {
  return (
    <nav aria-label="Questions">
      <ol className="flex gap-1.5">
        {questions.map((q, index) => {
          const { status, draft } = responses[q.id]
          const current = index === currentIndex
          return (
            <li key={q.id} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={disabled}
                aria-current={current ? 'step' : undefined}
                aria-label={`Question ${q.number}, ${STATUS_LABEL[status]}${draft && status === STATUS.UNANSWERED ? ', draft saved' : ''}`}
                className={cn(
                  'group flex w-full flex-col items-stretch gap-1.5 rounded-md pt-1 text-left disabled:cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium tabular-nums transition-colors',
                    current ? 'text-white' : 'text-faint group-hover:text-muted',
                  )}
                >
                  {q.number}
                  {status === STATUS.ANSWERED && <Check className="size-3 text-primary" aria-hidden="true" />}
                  {status === STATUS.EVALUATING && <Loader2 className="size-3 animate-spin text-accent" aria-hidden="true" />}
                  {status === STATUS.SKIPPED && <span className="text-faint">skipped</span>}
                </span>
                <span
                  className={cn(
                    'h-1.5 rounded-full transition-colors',
                    status === STATUS.ANSWERED
                      ? 'bg-primary'
                      : status === STATUS.SKIPPED
                        ? 'bg-faint/50'
                        : current
                          ? 'bg-accent'
                          : draft
                            ? 'bg-line-strong'
                            : 'bg-line',
                    current && status !== STATUS.UNANSWERED && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-surface',
                  )}
                />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
