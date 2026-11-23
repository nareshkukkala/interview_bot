import { TONE_COLOR, cn, scoreTone } from '../../utils/format.js'

/** Labelled horizontal bar for a 0–max score. */
export default function ScoreBar({ label, value, max = 10, className }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums text-white">
          {Number.isInteger(value) ? value : value.toFixed(1)}
          <span className="text-faint">/{max}</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out')}
          style={{ width: `${pct}%`, backgroundColor: TONE_COLOR[scoreTone(pct)] }}
        />
      </div>
    </div>
  )
}
