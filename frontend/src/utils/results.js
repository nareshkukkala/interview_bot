// Pure helpers for the results screen. Everything here is derived from real data (the backend's report and the
// evaluations behind it); nothing is estimated, defaulted or invented.
import { CRITERIA } from '../constants/options.js'

/** The four skills with their real averages, tagged strongest / weakest as reported by the backend. */
export function skillRows(result) {
  return CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    value: result.criteria[c.key],
    tag: c.key === result.strongestSkill ? 'strongest' : c.key === result.weakestSkill ? 'weakest' : null,
  }))
}

/** Concepts the evaluations said were missing, de-duplicated (case-insensitive) in the order they appeared. */
export function conceptsToRevisit(questions, limit = 10) {
  const seen = new Set()
  const concepts = []
  for (const q of questions) {
    for (const concept of q.evaluation?.missing_concepts ?? []) {
      const key = concept.trim().toLowerCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        concepts.push(concept.trim())
      }
    }
  }
  return concepts.slice(0, limit)
}

/** The candidate's most recent earlier REAL interview for the same role, if any. Example interviews are never used. */
export function previousAttempt(history, session) {
  return (
    history
      .filter((h) => !h.isSample && h.id !== session.id && h.jobRole === session.config.jobRole && h.completedAt < session.completedAt)
      .sort((a, b) => b.completedAt - a.completedAt)[0] ?? null
  )
}
