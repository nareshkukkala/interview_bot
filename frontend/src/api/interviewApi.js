// Centralised service for the interview endpoints (docs/ARCHITECTURE.md §6).
// The backend speaks snake_case; this module translates to and from the camelCase the UI uses,
// so no component ever sees the wire format.
import apiClient, { AI_REQUEST_TIMEOUT_MS } from './client.js'
import { ApiError } from './errors.js'

/* ---------- Response guards ----------
 * A response that does not have the documented shape (a proxy's HTML page, an empty body, a partial deploy) must become a
 * clear error, never a crash. Every endpoint checks what the screens will read before returning it. */

const unexpected = () =>
  new ApiError('The server sent a response we could not understand. Please try again.', { kind: 'server', code: 'UNEXPECTED_RESPONSE', retryable: true })

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isString = (v) => typeof v === 'string' && v.length > 0
const isStrings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const isScore = (v) => Number.isFinite(v) && v >= 0 && v <= 10
const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const CATEGORIES = ['technical', 'hr']
const LEVELS = ['beginner', 'intermediate', 'advanced']
const CRITERIA_KEYS = ['technical_accuracy', 'relevance', 'clarity', 'completeness']

const isQuestion = (q) =>
  isObject(q) && isString(q.id) && Number.isInteger(q.number) && isString(q.text) && CATEGORIES.includes(q.category) && LEVELS.includes(q.level) && isString(q.topic)

const isEvaluation = (e) =>
  isObject(e) && CRITERIA_KEYS.every((k) => isScore(e[k])) && isStrings(e.strengths) && isStrings(e.weaknesses) && typeof e.improved_answer === 'string' &&
  typeof e.follow_up_question === 'string' && (e.missing_concepts === undefined || isStrings(e.missing_concepts)) && (e.recommended_topic === undefined || typeof e.recommended_topic === 'string')

const isResult = (r) =>
  isObject(r) && Number.isFinite(r.overall_score) && r.overall_score >= 0 && r.overall_score <= 100 && isString(r.performance_label) && isObject(r.criteria_averages) &&
  CRITERIA_KEYS.every((k) => Number.isFinite(r.criteria_averages[k])) && Array.isArray(r.questions) &&
  r.questions.every((q) => isObject(q) && Number.isInteger(q.number) && Number.isFinite(q.score) && isString(q.status)) && Number.isFinite(r.answered_count) &&
  Number.isFinite(r.skipped_count) && isStrings(r.strengths) && isStrings(r.weaknesses) && isStrings(r.learning_recommendations) && isDate(r.completed_at)

const interviewPath = (sessionId, action) => `/api/interviews/${encodeURIComponent(sessionId)}/${action}`

/* ---------- Mappers (exported for tests) ---------- */

export function toStartPayload(config) {
  return {
    candidate_name: config.candidateName,
    job_role: config.jobRole,
    experience: config.experience,
    difficulty: config.difficulty,
    interview_type: config.interviewType,
    question_count: config.questionCount,
  }
}

export function mapQuestion(q) {
  return { id: q.id, number: q.number, text: q.text, category: q.category, level: q.level, topic: q.topic }
}

/** The UI reads evaluations in the backend's own field names. */
export function mapEvaluation(e) {
  return {
    technical_accuracy: e.technical_accuracy,
    relevance: e.relevance,
    clarity: e.clarity,
    completeness: e.completeness,
    strengths: e.strengths,
    weaknesses: e.weaknesses, // the three improvement areas
    missing_concepts: e.missing_concepts ?? [],
    improved_answer: e.improved_answer, // the ideal answer
    follow_up_question: e.follow_up_question,
    recommended_topic: e.recommended_topic ?? '',
    overall_score: e.overall_score, // the backend's score for this answer (average of the four criteria)
  }
}

/** `durationSec` is the active time the candidate spent, tracked by the in-room timer (the backend does not track it). */
export function mapResult(r, { durationSec = 0 } = {}) {
  return {
    overallScore: r.overall_score,
    label: r.performance_label,
    criteria: {
      technical_accuracy: r.criteria_averages.technical_accuracy,
      relevance: r.criteria_averages.relevance,
      clarity: r.criteria_averages.clarity,
      completeness: r.criteria_averages.completeness,
    },
    strongestSkill: r.strongest_skill ?? null, // a criterion key, from the real averages
    weakestSkill: r.weakest_skill ?? null,
    questionScores: r.questions.map((q) => ({ number: q.number, score: q.score, skipped: q.status === 'skipped' })),
    answeredCount: r.answered_count,
    skippedCount: r.skipped_count,
    durationSec,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    recommendations: r.learning_recommendations,
    summary: r.summary ?? null, // written by Gemini from the stored evaluations
    summaryError: r.summary_error ? { code: r.summary_error.code, message: r.summary_error.message } : null,
    completedAt: Date.parse(r.completed_at),
  }
}

/* ---------- Endpoints ---------- */

/** POST /api/interviews/start → Gemini writes the questions and the backend creates the session. */
export async function startInterview(config) {
  const { data } = await apiClient.post('/api/interviews/start', toStartPayload(config), { timeout: AI_REQUEST_TIMEOUT_MS })
  if (!isObject(data) || !isString(data.session_id) || !Array.isArray(data.questions) || data.questions.length === 0 || !data.questions.every(isQuestion) || !isDate(data.created_at)) throw unexpected()
  return {
    sessionId: data.session_id,
    questions: data.questions.map(mapQuestion),
    createdAt: Date.parse(data.created_at),
  }
}

/** POST /api/interviews/{id}/submit-answer → stores an answer, or a skip when `skipped` is true. */
export async function submitAnswer(sessionId, { questionNumber, answer, skipped = false }) {
  const body = { question_number: questionNumber, skipped }
  if (!skipped) body.answer = answer
  const { data } = await apiClient.post(interviewPath(sessionId, 'submit-answer'), body)
  if (!isObject(data) || !['answered', 'skipped'].includes(data.status)) throw unexpected()
  return { status: data.status, progress: data.progress }
}

/** POST /api/interviews/{id}/evaluate → Gemini evaluates a stored answer. */
export async function requestEvaluation(sessionId, questionNumber) {
  const { data } = await apiClient.post(interviewPath(sessionId, 'evaluate'), { question_number: questionNumber }, { timeout: AI_REQUEST_TIMEOUT_MS })
  if (!isEvaluation(data)) throw unexpected()
  return mapEvaluation(data)
}

/** GET /api/interviews/{id}/results → the final report, with Gemini's summary (null + summaryError if it could not be written). */
export async function fetchResults(sessionId, options) {
  const { data } = await apiClient.get(interviewPath(sessionId, 'results'), { timeout: AI_REQUEST_TIMEOUT_MS })
  if (!isResult(data)) throw unexpected()
  return mapResult(data, options)
}
