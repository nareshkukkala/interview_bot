import { CRITERIA, INTERVIEW_TYPES } from '../constants/options.js'

const round1 = (n) => Math.round(n * 10) / 10
const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)

/** Aggregate stats for the dashboard and performance pages. `history` is newest-first. */
export function computeStats(history) {
  const chronological = [...history].sort((a, b) => a.completedAt - b.completedAt)
  const scores = chronological.map((h) => h.score)

  const criteria = Object.fromEntries(
    CRITERIA.map((c) => [c.key, round1(avg(chronological.map((h) => h.criteria[c.key])))]),
  )

  // Skill improvement: first N interviews vs latest N (N = up to 3, never overlapping)
  const window = Math.min(3, Math.floor(chronological.length / 2))
  const skillProgress =
    window > 0
      ? CRITERIA.map((c) => ({
          key: c.key,
          label: c.label,
          from: round1(avg(chronological.slice(0, window).map((h) => h.criteria[c.key]))),
          to: round1(avg(chronological.slice(-window).map((h) => h.criteria[c.key]))),
        }))
      : []

  const byType = INTERVIEW_TYPES.map((t) => {
    const items = chronological.filter((h) => h.interviewType === t.value)
    return { ...t, count: items.length, average: items.length ? Math.round(avg(items.map((h) => h.score))) : null }
  })

  return {
    count: history.length,
    averageScore: Math.round(avg(scores)),
    bestScore: scores.length ? Math.max(...scores) : 0,
    questionsAnswered: history.reduce((total, h) => total + h.answered, 0),
    practiceSeconds: history.reduce((total, h) => total + h.durationSec, 0),
    scoreChange: scores.length >= 2 ? scores.at(-1) - scores[0] : 0,
    chronological,
    criteria,
    skillProgress,
    skillWindow: window,
    byType,
  }
}
