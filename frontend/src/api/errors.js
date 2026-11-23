// Turns anything that can go wrong with a request into one friendly `ApiError`,
// so components show a clear message and never deal with raw Axios errors.
import axios from 'axios'

/**
 * kind: 'network' | 'timeout' | 'session_expired' | 'validation' | 'rejected' | 'server' | 'cancelled' | 'unknown'
 * `message` is always safe to show to the user.
 */
export class ApiError extends Error {
  constructor(message, { kind = 'unknown', code = 'UNKNOWN', status = null, details = null, fieldErrors = {}, retryable = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.code = code
    this.status = status
    this.details = details
    this.fieldErrors = fieldErrors // validation errors keyed by form field (camelCase)
    this.retryable = retryable
  }
}

export const SESSION_EXPIRED_MESSAGE =
  'Your interview session has expired. This happens when the server restarts or the session is idle for too long. Start a new interview to continue.'

// Friendly wording for the backend's error codes (see docs/ARCHITECTURE.md §6.3)
const MESSAGES = {
  SESSION_NOT_FOUND: SESSION_EXPIRED_MESSAGE,
  QUESTION_NOT_FOUND: 'That question could not be found in this interview. Start a new interview to continue.',
  ANSWER_ALREADY_SUBMITTED: 'This answer has already been submitted and can no longer be changed.',
  INTERVIEW_COMPLETED: 'This interview is already finished. Open its report from your history.',
  ANSWER_REQUIRED: 'Submit an answer before asking for feedback.',
  QUESTION_SKIPPED: 'This question was skipped, so there is no answer to score.',
  RESULTS_NOT_READY: 'Some answers have not been scored yet. Please try again in a moment.',
  NOT_ENOUGH_QUESTIONS: 'There are not enough questions for this setup. Try a different role or interview type.',
  NOT_FOUND: 'The server does not recognise this request. Make sure the frontend and backend are up to date.',
  METHOD_NOT_ALLOWED: 'The server does not recognise this request. Make sure the frontend and backend are up to date.',
  // The AI (Gemini) service. These come from the backend; nothing here is ever made up locally.
  AI_NOT_CONFIGURED: "The AI service isn't set up yet. Add your Gemini API key (GEMINI_API_KEY) to backend/.env and restart the backend.",
  AI_AUTH_FAILED: 'The AI service rejected the API key. Check GEMINI_API_KEY in backend/.env and restart the backend.',
  AI_MODEL_NOT_FOUND: "The configured AI model isn't available. Check GEMINI_MODEL in backend/.env.",
  AI_RATE_LIMITED: 'The AI service is busy or its quota is used up. Wait a minute, then try again.',
  AI_TIMEOUT: 'The AI took too long to respond. Please try again.',
  AI_UNAVAILABLE: 'The AI service is temporarily unavailable. Please try again in a moment.',
  AI_BAD_RESPONSE: 'The AI gave a response we could not use. Please try again.',
  AI_CONTENT_BLOCKED: "The AI couldn't process this content. Try rewording your answer and submit again.",
  AI_REQUEST_REJECTED: 'The AI service rejected the request. Check the backend log for details.',
  AI_CALL_LIMIT_REACHED: 'This interview has used all of its AI requests. Start a new interview to continue.',
}

// Worth trying again straight away (the others need a configuration change or different input)
const RETRYABLE_CODES = new Set(['AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_BAD_RESPONSE', 'AI_RATE_LIMITED'])

const SERVER_MESSAGE = 'Something went wrong on our side. Please try again in a moment.'

// Backend field names → form field names
const FIELD_NAMES = {
  candidate_name: 'candidateName',
  job_role: 'jobRole',
  experience: 'experience',
  difficulty: 'difficulty',
  interview_type: 'interviewType',
  question_count: 'questionCount',
}

/** The friendly wording for a backend error code, or `fallback` when there is none (used for the summary's error). */
export const messageForCode = (code, fallback = SERVER_MESSAGE) => MESSAGES[code] ?? fallback

export const isSessionExpired = (error) => error instanceof ApiError && error.kind === 'session_expired'

export function toApiError(error, { baseUrl = '' } = {}) {
  if (error instanceof ApiError) return error

  if (axios.isCancel(error)) {
    return new ApiError('The request was cancelled.', { kind: 'cancelled', code: 'CANCELLED' })
  }
  if (!axios.isAxiosError(error)) {
    return new ApiError('Something unexpected happened. Please try again.', { kind: 'unknown', code: 'UNKNOWN' })
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError('The server took too long to respond. Please try again.', {
      kind: 'timeout',
      code: 'TIMEOUT',
      retryable: true,
    })
  }

  if (!error.response) {
    return new ApiError(
      `We couldn't reach the InterviewIQ server${baseUrl ? ` at ${baseUrl}` : ''}. Check that the backend is running and your connection is working, then try again.`,
      { kind: 'network', code: 'NETWORK_ERROR', retryable: true },
    )
  }

  const { status, data } = error.response
  const body = data?.error
  const code = body?.code ?? `HTTP_${status}`
  const details = body?.details ?? null

  if (code === 'SESSION_NOT_FOUND') {
    return new ApiError(SESSION_EXPIRED_MESSAGE, { kind: 'session_expired', code, status, details })
  }

  if (code === 'VALIDATION_ERROR' && Array.isArray(details)) {
    const fieldErrors = {}
    for (const { field, message } of details) {
      const key = FIELD_NAMES[field] ?? field
      if (!fieldErrors[key]) fieldErrors[key] = message
    }
    return new ApiError(details[0]?.message ?? 'Some details are invalid. Check the form and try again.', {
      kind: 'validation',
      code,
      status,
      details,
      fieldErrors,
    })
  }

  if (MESSAGES[code]) {
    return new ApiError(MESSAGES[code], { kind: status >= 500 ? 'server' : 'rejected', code, status, details, retryable: RETRYABLE_CODES.has(code) })
  }

  if (status >= 500) {
    return new ApiError(SERVER_MESSAGE, { kind: 'server', code, status, details, retryable: true })
  }

  return new ApiError(body?.message ?? 'The request could not be completed. Please try again.', {
    kind: 'rejected',
    code,
    status,
    details,
  })
}
