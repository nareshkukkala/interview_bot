// Display helpers for scores. The backend owns the scoring rules (PRD §6, BR-05 – BR-08); the UI only formats them.
import { CRITERIA } from '../constants/options.js'

const round1 = (n) => Math.round(n * 10) / 10

/** Per-question score 0–10. Uses the backend's own score for the answer; the average of the 4 criteria is the same number. Skipped = 0. */
export function questionScore(question) {
  if (question.skipped || !question.evaluation) return 0
  if (typeof question.evaluation.overall_score === 'number') return question.evaluation.overall_score
  const sum = CRITERIA.reduce((total, c) => total + question.evaluation[c.key], 0)
  return round1(sum / CRITERIA.length)
}

export function performanceLabel(score) {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Average'
  return 'Needs improvement'
}
