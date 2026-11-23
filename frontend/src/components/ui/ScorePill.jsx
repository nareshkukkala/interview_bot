import { TONE_TEXT, cn, scoreTone } from '../../utils/format.js'

/** Compact numeric score, coloured by performance band. */
export default function ScorePill({ value, max = 100, skipped = false, className }) {
  if (skipped) {
    return <span className={cn('text-sm font-medium text-faint', className)}>Skipped</span>
  }
  const tone = scoreTone((value / max) * 100)
  return (
    <span className={cn('inline-flex items-baseline gap-0.5 font-semibold tabular-nums', TONE_TEXT[tone], className)}>
      {max === 10 ? value.toFixed(1) : value}
      <span className="text-xs font-normal text-faint">/{max}</span>
    </span>
  )
}
