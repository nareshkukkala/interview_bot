import { NavLink, Link } from 'react-router-dom'
import { BarChart3, History, LayoutDashboard, PlayCircle, Settings, X } from 'lucide-react'
import { useApp } from '../../context/useApp.js'
import { getProgress } from '../../features/interview/sessionModel.js'
import { cn, initials } from '../../utils/format.js'
import Logo from '../ui/Logo.jsx'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/interview/new', label: 'Start Interview', icon: PlayCircle },
  { to: '/history', label: 'Interview History', icon: History },
  { to: '/performance', label: 'Performance', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ onNavigate, onClose }) {
  const { settings, activeSession } = useApp()
  const name = settings.candidateName

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo onClick={onNavigate} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-white"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="mt-4 flex-1 px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-card text-white' : 'text-muted hover:bg-white/[0.04] hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />}
                    <Icon className={cn('size-[1.125rem]', isActive ? 'text-primary' : 'text-faint')} aria-hidden="true" />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {activeSession && (
          <Link
            to={`/interview/${activeSession.id}`}
            onClick={onNavigate}
            className="mt-6 block rounded-lg border border-accent/25 bg-accent/[0.06] p-3 transition-colors hover:border-accent/50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-white">
              <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
              Interview in progress
            </span>
            <span className="mt-1 block text-xs text-muted">
              {getProgress(activeSession).resolved} of {activeSession.questions.length} done. Select to resume.
            </span>
          </Link>
        )}
      </nav>

      <div className="border-t border-line p-4">
        <Link
          to="/settings"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/[0.04]"
        >
          <span className="grid size-9 place-items-center rounded-full bg-[#1f2a44] text-sm font-semibold text-[#c7d2fe]">
            {name ? initials(name) : '?'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{name || 'Add your name'}</span>
            <span className="block text-xs text-faint">Guest session</span>
          </span>
        </Link>
      </div>
    </div>
  )
}
