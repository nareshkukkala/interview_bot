import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/format.js'

const inputClasses = (error) =>
  cn(
    'w-full rounded-lg border bg-surface px-3.5 text-[0.9375rem] text-white placeholder:text-faint transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-primary/50',
    error ? 'border-danger/70 focus:border-danger' : 'border-line hover:border-line-strong focus:border-primary',
  )

function FieldMessage({ id, error, hint }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {error}
      </p>
    )
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="mt-2 text-sm text-faint">
        {hint}
      </p>
    )
  }
  return null
}

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

export function TextField({ id, label, error, hint, className, ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        {label}
      </label>
      <input
        id={id}
        className={cn(inputClasses(error), 'h-11')}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  )
}

export function SelectField({ id, label, options, placeholder, error, hint, className, ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className={cn(inputClasses(error), 'h-11 cursor-pointer appearance-none pr-10')}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, error, hint)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-surface">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  )
}

/** Radio group rendered as selectable tiles. */
export function ChoiceField({ id, label, options, value, onChange, error, hint, columns = 3, className }) {
  const gridCols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[columns]
  return (
    <fieldset className={className} aria-describedby={describedBy(id, error, hint)}>
      <legend className="mb-2 block text-sm font-medium text-white">{label}</legend>
      <div className={cn('grid gap-2', gridCols)}>
        {options.map((option) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex cursor-pointer flex-col rounded-lg border px-3.5 py-3 transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                checked ? 'border-primary bg-primary/10' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className={cn('text-sm font-medium', checked ? 'text-white' : 'text-[#cbd5e1]')}>{option.label}</span>
              {option.description && <span className="mt-0.5 text-xs text-muted">{option.description}</span>}
            </label>
          )
        })}
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </fieldset>
  )
}

export function Toggle({ id, label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-white">
          {label}
        </label>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-primary bg-primary' : 'border-line bg-surface',
        )}
      >
        <span
          className={cn(
            'inline-block size-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}
