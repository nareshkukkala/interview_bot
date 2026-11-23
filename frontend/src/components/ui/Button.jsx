import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/format.js'

const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-black/30',
  secondary: 'border border-line bg-card text-white hover:border-line-strong hover:bg-[#1b2640]',
  ghost: 'text-muted hover:bg-white/5 hover:text-white',
  danger: 'bg-danger/90 text-[#0b1020] hover:bg-danger',
}

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[0.9375rem]',
}

/** Renders a <Link> when `to` is given, otherwise a <button>. */
export default function Button({
  to,
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  const classes = cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-[color,background-color,border-color,opacity,transform] duration-150 active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
    VARIANTS[variant],
    SIZES[size],
    className,
  )

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
