import { Link } from 'react-router-dom'
import { cn } from '../../utils/format.js'

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#6366F1" />
      <path d="M10 9v14M15 9v14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="16" r="4" fill="none" stroke="#22D3EE" strokeWidth="2.6" />
    </svg>
  )
}

export default function Logo({ to = '/', className, onClick }) {
  return (
    <Link to={to} onClick={onClick} className={cn('flex items-center gap-2.5 rounded-md', className)} aria-label="InterviewIQ home">
      <LogoMark />
      <span className="text-[1.0625rem] font-semibold tracking-tight text-white">InterviewIQ</span>
    </Link>
  )
}
