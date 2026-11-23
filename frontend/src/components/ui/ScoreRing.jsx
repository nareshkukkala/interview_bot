import { TONE_COLOR, TONE_TEXT, cn, scoreTone } from '../../utils/format.js'

/**
 * Circular score dial — the product's signature element.
 * `value` on a scale of `max` (10 for a question, 100 for an interview).
 */
export default function ScoreRing({ value, max = 100, size = 120, stroke = 10, caption, className }) {
  const pct = Math.max(0, Math.min(1, value / max))
  const tone = scoreTone(pct * 100)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const big = size >= 140
  const display = max === 10 ? value.toFixed(1) : Math.round(value)

  return (
    <div
      role="img"
      aria-label={`Score ${display} out of ${max}${caption ? `, ${caption}` : ''}`}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_COLOR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className={cn('font-semibold tabular-nums tracking-tight text-white', big ? 'text-5xl' : size >= 96 ? 'text-3xl' : 'text-xl')}>
          {display}
        </span>
        <span className={cn('tabular-nums text-faint', big ? 'text-sm' : 'text-xs')}>of {max}</span>
        {caption && big && <span className={cn('mt-1 text-sm font-medium', TONE_TEXT[tone])}>{caption}</span>}
      </div>
    </div>
  )
}
