import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '../../utils/format.js'

const TONES = {
  danger: { box: 'border-danger/30 bg-danger/[0.07]', icon: AlertCircle, iconClass: 'text-danger' },
  warning: { box: 'border-warning/30 bg-warning/[0.06]', icon: AlertTriangle, iconClass: 'text-warning' },
  info: { box: 'border-accent/25 bg-accent/[0.06]', icon: Info, iconClass: 'text-accent' },
}

/**
 * One consistent look for every error, warning and notice in the app: an icon, an optional title, the message,
 * an optional action (such as "Try again") and an optional dismiss button.
 */
export default function Alert({ tone = 'danger', title, children, action, onDismiss, className, ref, role = 'alert' }) {
  const { box, icon: Icon, iconClass } = TONES[tone]
  return (
    <div ref={ref} role={role} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3.5', box, className)}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold text-white">{title}</p>}
        {children && <div className={cn('leading-relaxed [overflow-wrap:anywhere]', title ? 'mt-1 text-muted' : 'text-white')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Dismiss message"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
