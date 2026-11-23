import { useEffect, useState } from 'react'
import { cn } from '../../utils/format.js'
import { LogoMark } from './Logo.jsx'

const SLOW_AFTER_MS = 8000

/** Loading state: a pulsing logo, what is happening, an indeterminate bar, and an honest note if it is taking a while. */
export default function LoadingScreen({ title, description, overlay = false }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(id)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('grid place-items-center px-4', overlay ? 'fixed inset-0 z-50 bg-base/90 backdrop-blur-sm' : 'min-h-[60vh]')}
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span className="relative grid size-16 place-items-center" aria-hidden="true">
          <span className="absolute inset-0 animate-pulse rounded-2xl bg-primary/20" />
          <LogoMark className="relative size-10" />
        </span>
        <p className="mt-6 text-lg font-semibold text-white">{title}</p>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="progress-indeterminate h-full w-1/3 rounded-full bg-primary" />
        </div>
        <p className="mt-4 min-h-5 text-xs text-faint">{slow ? 'This is taking longer than usual. If something goes wrong you will see a message here.' : ''}</p>
      </div>
    </div>
  )
}
