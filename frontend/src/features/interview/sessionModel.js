// Pure interview-session model: creation, reducer and selectors (no React, no network, no UI).
//
// The backend is the source of truth for the session, its questions, stored answers, evaluations
// and results. This model holds the *UI-side* state for the interview in progress: drafts, which
// question is open, the per-question timer, and what each request is currently doing.
//
// Session shape:
// {
//   id, config, status: 'in_progress' | 'finishing' | 'completed' | 'expired',
//   questions: [{ id, number, text, category, level, topic }],      // as served by the backend
//   responses: { [questionId]: Response },
//   currentIndex, startedAt, completedAt, result
// }
// Response: { status, draft, answer, evaluation, timeSpent, error, statusBeforeSubmit }
//   status 'answered' with evaluation === null means: the answer is stored on the server but scoring failed.

export const STATUS = {
  UNANSWERED: 'unanswered',
  EVALUATING: 'evaluating', // storing + scoring in flight
  ANSWERED: 'answered',
  SKIPPED: 'skipped',
}

const emptyResponse = () => ({
  status: STATUS.UNANSWERED,
  draft: '',
  answer: null,
  evaluation: null,
  timeSpent: 0,
  error: null,
  statusBeforeSubmit: null,
})

/** Builds the local session from the backend's start response. */
export function createSession({ id, config, questions, now = Date.now() }) {
  return {
    id,
    config,
    status: 'in_progress',
    questions,
    responses: Object.fromEntries(questions.map((q) => [q.id, emptyResponse()])),
    currentIndex: 0,
    startedAt: now,
    completedAt: null,
    result: null,
  }
}

/* ---------- Selectors ---------- */

export const isResolved = (response) => response.status === STATUS.ANSWERED || response.status === STATUS.SKIPPED
export const isLocked = (response) => response.status === STATUS.ANSWERED || response.status === STATUS.EVALUATING
/** Stored on the server but not scored yet (scoring failed or is being retried). */
export const needsScoring = (response) => response.status === STATUS.ANSWERED && response.evaluation === null

/** A session you can still work on (or that is being finished). */
export const isActive = (session) => session.status === 'in_progress' || session.status === 'finishing'

export function currentQuestion(session) {
  return session.questions[session.currentIndex]
}

export function currentResponse(session) {
  return session.responses[currentQuestion(session).id]
}

export function getProgress(session) {
  const responses = session.questions.map((q) => session.responses[q.id])
  const count = (status) => responses.filter((r) => r.status === status).length
  const answered = count(STATUS.ANSWERED)
  const skipped = count(STATUS.SKIPPED)
  const evaluating = count(STATUS.EVALUATING)
  const total = session.questions.length
  return {
    total,
    answered,
    skipped,
    evaluating,
    resolved: answered + skipped,
    remaining: total - answered - skipped,
    allResolved: answered + skipped === total,
    percent: Math.round(((answered + skipped) / total) * 100),
    totalTime: responses.reduce((sum, r) => sum + r.timeSpent, 0),
  }
}

/** Index of the next question that is neither answered nor skipped (wrapping), or -1. */
export function nextUnresolvedIndex(session, from = session.currentIndex) {
  const total = session.questions.length
  for (let step = 1; step <= total; step++) {
    const index = (from + step) % total
    if (!isResolved(session.responses[session.questions[index].id])) return index
  }
  return -1
}

/** Flattens questions + responses into the shape used by the result screens. */
export function mergeResponses(session) {
  return session.questions.map((q) => {
    const r = session.responses[q.id]
    return {
      ...q,
      answer: r.answer,
      evaluation: r.evaluation,
      skipped: r.status === STATUS.SKIPPED,
      durationSec: r.timeSpent,
    }
  })
}

/**
 * The completed session: unresolved questions become skipped (the server records the same when
 * finishing), evaluations fetched while finishing are merged in, and the result is attached.
 */
export function completeSession(session, { result, completedAt, evaluations = {} }) {
  const responses = Object.fromEntries(
    Object.entries(session.responses).map(([id, r]) => {
      if (evaluations[id]) return [id, { ...r, evaluation: evaluations[id], error: null }]
      return [id, isResolved(r) ? r : { ...r, status: STATUS.SKIPPED, error: null }]
    }),
  )
  return { ...session, responses, status: 'completed', result, completedAt }
}

/* ---------- Reducer ---------- */

const WHILE_IN_PROGRESS = new Set([
  'set_draft',
  'submit_request',
  'evaluate_request',
  'answer_stored',
  'submit_success',
  'submit_failure',
  'skip',
  'go_to',
  'next',
  'previous',
  'tick',
  'finish_request',
])

function patchResponse(state, questionId, patch) {
  return {
    ...state,
    responses: { ...state.responses, [questionId]: { ...state.responses[questionId], ...patch } },
  }
}

export function sessionReducer(state, action) {
  if (action.type === 'start') return action.session
  if (action.type === 'discard') return null
  if (!state) return state
  if (action.sessionId && action.sessionId !== state.id) return state // stale async result
  if (WHILE_IN_PROGRESS.has(action.type) && state.status !== 'in_progress') return state

  const response = action.questionId ? state.responses[action.questionId] : null
  if (action.questionId && !response) return state

  switch (action.type) {
    case 'set_draft':
      if (isLocked(response)) return state
      return patchResponse(state, action.questionId, { draft: action.text, error: null })

    case 'submit_request':
      // Prevents duplicate submissions: answered or in-flight questions are ignored
      if (isLocked(response)) return state
      return patchResponse(state, action.questionId, {
        status: STATUS.EVALUATING,
        error: null,
        statusBeforeSubmit: response.status,
      })

    case 'evaluate_request':
      // Retry scoring for an answer that is already stored on the server
      if (!needsScoring(response)) return state
      return patchResponse(state, action.questionId, {
        status: STATUS.EVALUATING,
        error: null,
        statusBeforeSubmit: STATUS.ANSWERED,
      })

    case 'answer_stored':
      // The server has saved the answer; scoring is still in flight
      if (response.status !== STATUS.EVALUATING) return state
      return patchResponse(state, action.questionId, { answer: action.answer })

    case 'submit_success':
      if (response.status !== STATUS.EVALUATING) return state
      return patchResponse(state, action.questionId, {
        status: STATUS.ANSWERED,
        answer: action.answer,
        draft: action.answer,
        evaluation: action.evaluation,
        error: null,
        statusBeforeSubmit: null,
      })

    case 'submit_failure':
      if (response.status !== STATUS.EVALUATING) return state
      return patchResponse(state, action.questionId, {
        // Once the answer is stored it stays answered (it cannot be re-submitted); only scoring is retried
        status: response.answer !== null ? STATUS.ANSWERED : (response.statusBeforeSubmit ?? STATUS.UNANSWERED),
        error: action.error,
        statusBeforeSubmit: null,
      })

    case 'skip': {
      if (isLocked(response) || response.status === STATUS.SKIPPED) return state
      const skipped = patchResponse(state, action.questionId, { status: STATUS.SKIPPED, error: null })
      const next = nextUnresolvedIndex(skipped)
      return next === -1 ? skipped : { ...skipped, currentIndex: next }
    }

    case 'go_to':
      if (action.index < 0 || action.index >= state.questions.length || action.index === state.currentIndex) return state
      return { ...state, currentIndex: action.index }

    case 'next':
      return state.currentIndex < state.questions.length - 1 ? { ...state, currentIndex: state.currentIndex + 1 } : state

    case 'previous':
      return state.currentIndex > 0 ? { ...state, currentIndex: state.currentIndex - 1 } : state

    case 'tick': {
      const current = currentResponse(state)
      if (isLocked(current)) return state // timer pauses once an answer is submitted
      return patchResponse(state, currentQuestion(state).id, { timeSpent: current.timeSpent + (action.seconds ?? 1) })
    }

    case 'finish_request':
      if (getProgress(state).evaluating > 0) return state
      return { ...state, status: 'finishing' }

    case 'finish_success':
      if (state.status !== 'finishing') return state
      return completeSession(state, action)

    case 'finish_failure':
      // Something failed while finishing (for example a network error): back to the room, nothing is lost
      if (state.status !== 'finishing') return state
      return { ...state, status: 'in_progress' }

    case 'result_updated':
      // A completed interview's report was re-fetched (for example, to retry a missing AI summary)
      if (state.status !== 'completed') return state
      return { ...state, result: action.result }

    case 'session_expired':
      // The server no longer knows this session (restart or timeout)
      if (!isActive(state)) return state
      return { ...state, status: 'expired' }

    default:
      return state
  }
}
