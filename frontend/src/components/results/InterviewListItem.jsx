import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { INTERVIEW_TYPES, ROLES, DIFFICULTIES, labelFor } from '../../constants/options.js'
import { formatRelative } from '../../utils/format.js'
import Badge from '../ui/Badge.jsx'
import ScorePill from '../ui/ScorePill.jsx'

/** One past interview in a list. Real interviews link to their report; samples are static. */
export default function InterviewListItem({ item }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{labelFor(ROLES, item.jobRole)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
          <Badge>{labelFor(INTERVIEW_TYPES, item.interviewType)}</Badge>
          <Badge>{labelFor(DIFFICULTIES, item.difficulty)}</Badge>
          {item.isSample && <Badge tone="neutral">Sample</Badge>}
          <span className="ml-1">{formatRelative(item.completedAt)}</span>
        </div>
      </div>
      <ScorePill value={item.score} className="text-lg" />
      {!item.isSample && <ChevronRight className="size-4 text-faint" aria-hidden="true" />}
    </>
  )

  if (item.isSample) {
    return <li className="flex items-center gap-4 px-5 py-4 sm:px-6">{content}</li>
  }
  return (
    <li>
      <Link
        to={`/results/${item.id}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03] sm:px-6"
        aria-label={`View report: ${labelFor(ROLES, item.jobRole)}, score ${item.score}`}
      >
        {content}
      </Link>
    </li>
  )
}
