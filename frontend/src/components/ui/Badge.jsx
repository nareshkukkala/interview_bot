import { cn } from '../../utils/format.js'

const TONES = {
  neutral: 'border-line bg-white/[0.03] text-muted',
  primary: 'border-primary/30 bg-primary/10 text-[#a5b4fc]',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
}

export default function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
