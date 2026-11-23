import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, History as HistoryIcon, Plus } from 'lucide-react'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import ScorePill from '../components/ui/ScorePill.jsx'
import { useApp } from '../context/useApp.js'
import { DIFFICULTIES, INTERVIEW_TYPES, ROLES, labelFor } from '../constants/options.js'
import { cn, formatDate, formatDuration } from '../utils/format.js'

const TYPE_FILTERS = [{ value: 'all', label: 'All types' }, ...INTERVIEW_TYPES]

export default function HistoryPage() {
  const { history } = useApp()
  const [role, setRole] = useState('all')
  const [type, setType] = useState('all')

  const filtered = useMemo(
    () => history.filter((h) => (role === 'all' || h.jobRole === role) && (type === 'all' || h.interviewType === type)),
    [history, role, type],
  )

  const rolesInHistory = ROLES.filter((r) => history.some((h) => h.jobRole === r.value))

  return (
    <>
      <PageHeader
        title="Interview history"
        description="Every interview you have completed. Open one of your own interviews to see the full report."
        actions={
          <Button to="/interview/new">
            <Plus aria-hidden="true" />
            New interview
          </Button>
        }
      />

      {history.length === 0 ? (
        <Card>
          <EmptyState
            icon={HistoryIcon}
            title="No interviews yet"
            description="Your completed interviews will appear here."
            action={<Button to="/interview/new">Start an interview</Button>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div role="group" aria-label="Filter by interview type" className="flex flex-wrap gap-1 rounded-lg bg-surface p-1">
              {TYPE_FILTERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={type === t.value}
                  className={cn(
                    'h-8 rounded-md px-3 text-sm font-medium transition-colors',
                    type === t.value ? 'bg-card text-white shadow-sm shadow-black/30' : 'text-muted hover:text-white',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="sr-only sm:not-sr-only">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-line bg-surface px-3 text-sm text-white focus:border-primary focus:outline-none sm:w-auto"
              >
                <option value="all">All roles</option>
                {rolesInHistory.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No interviews match these filters"
              description="Try a different role or interview type."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRole('all')
                    setType('all')
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-6 py-3 font-medium">Date</th>
                    <th scope="col" className="px-4 py-3 font-medium">Role</th>
                    <th scope="col" className="px-4 py-3 font-medium">Type</th>
                    <th scope="col" className="px-4 py-3 font-medium">Difficulty</th>
                    <th scope="col" className="px-4 py-3 font-medium">Answered</th>
                    <th scope="col" className="px-4 py-3 font-medium">Time</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Score</th>
                    <th scope="col" className="w-28 px-6 py-3"><span className="sr-only">Report</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((h) => (
                    <tr key={h.id} className={cn(!h.isSample && 'hover:bg-white/[0.03]')}>
                      <td className="px-6 py-4 whitespace-nowrap text-muted tabular-nums">{formatDate(h.completedAt)}</td>
                      <td className="px-4 py-4 font-medium text-white">{labelFor(ROLES, h.jobRole)}</td>
                      <td className="px-4 py-4 text-muted">{labelFor(INTERVIEW_TYPES, h.interviewType)}</td>
                      <td className="px-4 py-4 text-muted">{labelFor(DIFFICULTIES, h.difficulty)}</td>
                      <td className="px-4 py-4 text-muted tabular-nums">{h.answered}/{h.total}</td>
                      <td className="px-4 py-4 text-muted tabular-nums whitespace-nowrap">{formatDuration(h.durationSec)}</td>
                      <td className="px-4 py-4 text-right"><ScorePill value={h.score} /></td>
                      <td className="px-6 py-4 text-right">
                        {h.isSample ? (
                          <Badge>Sample</Badge>
                        ) : (
                          <Link to={`/results/${h.id}`} className="inline-flex items-center gap-1 font-medium text-[#a5b4fc] hover:text-white">
                            Report
                            <ChevronRight className="size-4" aria-hidden="true" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile list */}
              <ul className="divide-y divide-line md:hidden">
                {filtered.map((h) => {
                  const body = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{labelFor(ROLES, h.jobRole)}</p>
                        <p className="mt-1 text-xs text-faint">
                          {formatDate(h.completedAt)}, {labelFor(INTERVIEW_TYPES, h.interviewType)}, {labelFor(DIFFICULTIES, h.difficulty)}
                        </p>
                        {h.isSample && <Badge className="mt-2">Sample</Badge>}
                      </div>
                      <ScorePill value={h.score} className="text-lg" />
                      {!h.isSample && <ChevronRight className="size-4 text-faint" aria-hidden="true" />}
                    </>
                  )
                  return (
                    <li key={h.id}>
                      {h.isSample ? (
                        <div className="flex items-center gap-4 px-4 py-4">{body}</div>
                      ) : (
                        <Link to={`/results/${h.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-white/[0.03]">
                          {body}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <p className="border-t border-line px-4 py-3 text-xs text-faint sm:px-6">
            {filtered.length} of {history.length} interviews shown. History is kept only while this tab is open.
          </p>
        </Card>
      )}
    </>
  )
}
