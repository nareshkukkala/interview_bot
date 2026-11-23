import { useState } from 'react'
import { AlertCircle, Send, SkipForward } from 'lucide-react'
import { ANSWER_MAX, ANSWER_MIN } from '../../constants/options.js'
import { cn } from '../../utils/format.js'
import { validateAnswer } from '../../utils/validation.js'
import Button from '../ui/Button.jsx'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Controlled answer editor. The draft lives in session state, so it survives
 * Previous/Next navigation and can be edited freely until it is submitted.
 */
export default function AnswerEditor({ value, onChange, onSubmit, onSkip, evaluating, canSkip, externalError, disabled = false }) {
  const [localError, setLocalError] = useState(null)
  const length = value.trim().length
  const error = localError ?? externalError

  const submit = () => {
    const message = validateAnswer(value)
    setLocalError(message)
    if (!message) onSubmit()
  }

  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!evaluating && !disabled) submit()
    }
  }

  return (
    <section aria-label="Your answer" className="rounded-xl border border-line bg-card shadow-sm shadow-black/20">
      <label htmlFor="answer" className="sr-only">
        Your answer
      </label>
      <textarea
        id="answer"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          if (localError) setLocalError(validateAnswer(event.target.value))
        }}
        onKeyDown={onKeyDown}
        readOnly={evaluating}
        maxLength={ANSWER_MAX}
        rows={9}
        placeholder="Type your answer as you would say it in the interview. Explain your reasoning and give an example where you can."
        aria-invalid={Boolean(error)}
        aria-describedby="answer-meta"
        className={cn(
          'block min-h-56 w-full resize-y rounded-t-xl bg-transparent px-6 pt-6 pb-4 text-[0.9375rem] leading-relaxed text-white placeholder:text-faint focus:outline-none sm:px-8',
          evaluating && 'opacity-60',
        )}
      />

      <div className="flex flex-col gap-4 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div id="answer-meta" className="text-sm" aria-live="polite">
          {error ? (
            <span className="flex items-center gap-1.5 text-danger">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </span>
          ) : evaluating ? (
            <span className="text-accent">Evaluating your answer…</span>
          ) : (
            <span className="text-faint">
              <span className={cn('tabular-nums', length >= ANSWER_MIN && 'text-muted')}>
                {value.length.toLocaleString()} / {ANSWER_MAX.toLocaleString()}
              </span>
              <span className="hidden sm:inline"> · {isMac ? '⌘' : 'Ctrl'}+Enter to submit</span>
            </span>
          )}
        </div>
        <div className="flex gap-3">
          {canSkip && (
            <Button variant="ghost" onClick={onSkip} disabled={evaluating || disabled} className="flex-1 sm:flex-none">
              <SkipForward aria-hidden="true" />
              Skip
            </Button>
          )}
          <Button onClick={submit} loading={evaluating} disabled={!evaluating && (length === 0 || disabled)} className="flex-1 sm:flex-none">
            {!evaluating && <Send aria-hidden="true" />}
            {evaluating ? 'Evaluating' : 'Submit answer'}
          </Button>
        </div>
      </div>
    </section>
  )
}
