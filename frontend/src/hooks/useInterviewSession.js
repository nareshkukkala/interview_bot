import { useCallback, useMemo, useRef, useState } from 'react'
import { fetchResults, requestEvaluation, startInterview, submitAnswer } from '../api/interviewApi.js'
import { isSessionExpired } from '../api/errors.js'
import { useApp } from '../context/useApp.js'
import {
  STATUS,
  completeSession,
  createSession,
  currentQuestion,
  getProgress,
  isLocked,
  isResolved,
  nextUnresolvedIndex,
  needsScoring,
} from '../features/interview/sessionModel.js'
import { validateAnswer } from '../utils/validation.js'

/**
 * The interview workflow as a hook: wraps the pure session reducer with the backend calls.
 * UI components call these actions and never touch the reducer or Axios directly.
 *
 *   start    → POST /api/interviews/start
 *   submit   → POST …/submit-answer, then POST …/evaluate
 *   skip     → POST …/submit-answer (skipped)
 *   finish   → (skip/evaluate anything outstanding) then GET …/results
 */
export function useInterviewSession() {
  const { session, dispatchSession: dispatch, addCompletedSession, settings, updateSettings } = useApp()
  const submitting = useRef(new Set()) // question ids with a request in flight (guards double clicks before React re-renders)
  const sessionBusy = useRef(false) // skip / finish in flight
  const [busy, setBusy] = useState(false) // drives disabled buttons
  const [notice, setNotice] = useState(null) // last session-level error to show (skip / finish failures)

  const sessionId = session?.id

  /** A request failed: an expired session ends the interview, anything else is shown as a notice. */
  const handleFailure = useCallback(
    (error, id) => {
      if (isSessionExpired(error)) {
        dispatch({ type: 'session_expired', sessionId: id })
        return
      }
      setNotice(error.message)
    },
    [dispatch],
  )

  /** Runs a session-level request once at a time, with `busy` set while it runs. */
  const runExclusive = useCallback(
    async (id, task) => {
      if (sessionBusy.current) return { ok: false, duplicate: true }
      sessionBusy.current = true
      setBusy(true)
      setNotice(null)
      try {
        return { ok: true, value: await task() }
      } catch (error) {
        handleFailure(error, id)
        return { ok: false, error }
      } finally {
        sessionBusy.current = false
        setBusy(false)
      }
    },
    [handleFailure],
  )

  /** Creates the interview on the server. Throws an ApiError (shown by the caller). Returns the new session id. */
  const start = useCallback(
    async (config) => {
      const created = await startInterview(config)
      dispatch({
        type: 'start',
        session: createSession({ id: created.sessionId, config, questions: created.questions, now: created.createdAt }),
      })
      if (!settings.candidateName) updateSettings({ candidateName: config.candidateName })
      return created.sessionId
    },
    [dispatch, settings.candidateName, updateSettings],
  )

  const setDraft = useCallback(
    (questionId, text) => dispatch({ type: 'set_draft', sessionId, questionId, text }),
    [dispatch, sessionId],
  )

  /** Stores the draft on the server, then asks for its evaluation. */
  const submit = useCallback(
    async (questionId) => {
      if (!session || session.status !== 'in_progress') return { error: 'This interview is no longer active.' }
      const question = session.questions.find((q) => q.id === questionId)
      const response = session.responses[questionId]
      if (!question || !response) return { error: 'Question not found.' }
      if (isLocked(response) || submitting.current.has(questionId) || sessionBusy.current) return { duplicate: true }

      const answer = response.draft.trim()
      const validationError = validateAnswer(answer)
      if (validationError) return { error: validationError }

      const id = session.id
      submitting.current.add(questionId)
      dispatch({ type: 'submit_request', sessionId: id, questionId })
      try {
        try {
          await submitAnswer(id, { questionNumber: question.number, answer })
        } catch (error) {
          // The server already has this answer (an earlier response was lost): carry on to scoring
          if (error.code !== 'ANSWER_ALREADY_SUBMITTED') throw error
        }
        dispatch({ type: 'answer_stored', sessionId: id, questionId, answer })

        const evaluation = await requestEvaluation(id, question.number)
        dispatch({ type: 'submit_success', sessionId: id, questionId, answer, evaluation })
        return {}
      } catch (error) {
        if (isSessionExpired(error)) {
          dispatch({ type: 'session_expired', sessionId: id })
        } else {
          dispatch({ type: 'submit_failure', sessionId: id, questionId, error: error.message })
        }
        return { error: error.message }
      } finally {
        submitting.current.delete(questionId)
      }
    },
    [dispatch, session],
  )

  /** Retries scoring for an answer the server has stored but could not score. */
  const retryScoring = useCallback(
    async (questionId) => {
      if (!session || session.status !== 'in_progress') return
      const question = session.questions.find((q) => q.id === questionId)
      const response = session.responses[questionId]
      if (!question || !response || !needsScoring(response) || submitting.current.has(questionId)) return

      const id = session.id
      submitting.current.add(questionId)
      dispatch({ type: 'evaluate_request', sessionId: id, questionId })
      try {
        const evaluation = await requestEvaluation(id, question.number)
        dispatch({ type: 'submit_success', sessionId: id, questionId, answer: response.answer, evaluation })
      } catch (error) {
        if (isSessionExpired(error)) dispatch({ type: 'session_expired', sessionId: id })
        else dispatch({ type: 'submit_failure', sessionId: id, questionId, error: error.message })
      } finally {
        submitting.current.delete(questionId)
      }
    },
    [dispatch, session],
  )

  /** Records the skip on the server first, so what you see always matches what is stored. */
  const skip = useCallback(
    async (questionId) => {
      if (!session || session.status !== 'in_progress') return
      const question = session.questions.find((q) => q.id === questionId)
      const response = session.responses[questionId]
      if (!question || response?.status !== STATUS.UNANSWERED || submitting.current.has(questionId)) return

      const result = await runExclusive(session.id, () => submitAnswer(session.id, { questionNumber: question.number, skipped: true }))
      if (result.ok) dispatch({ type: 'skip', sessionId: session.id, questionId })
    },
    [dispatch, runExclusive, session],
  )

  const goTo = useCallback((index) => dispatch({ type: 'go_to', sessionId, index }), [dispatch, sessionId])
  const next = useCallback(() => dispatch({ type: 'next', sessionId }), [dispatch, sessionId])
  const previous = useCallback(() => dispatch({ type: 'previous', sessionId }), [dispatch, sessionId])

  /** Moves to the next unanswered/unskipped question, if any. */
  const goToNextUnresolved = useCallback(() => {
    if (!session) return
    const index = nextUnresolvedIndex(session)
    if (index !== -1) goTo(index)
  }, [goTo, session])

  /**
   * Finishes the interview. Questions with no answer are recorded as skipped, answers that were
   * stored but never scored are scored, then the results are fetched. Returns the session id, or
   * null if something failed (the interview stays open and a notice explains why).
   */
  const finish = useCallback(async () => {
    if (!session || session.status !== 'in_progress' || getProgress(session).evaluating > 0) return null
    const snapshot = session
    const id = snapshot.id

    const outcome = await runExclusive(id, async () => {
      dispatch({ type: 'finish_request', sessionId: id })
      try {
        const evaluations = {}
        for (const q of snapshot.questions) {
          const r = snapshot.responses[q.id]
          if (!isResolved(r)) await submitAnswer(id, { questionNumber: q.number, skipped: true })
          else if (needsScoring(r)) evaluations[q.id] = await requestEvaluation(id, q.number)
        }
        const result = await fetchResults(id, { durationSec: getProgress(snapshot).totalTime })
        const details = { result, completedAt: result.completedAt, evaluations }
        dispatch({ type: 'finish_success', sessionId: id, ...details })
        addCompletedSession(completeSession({ ...snapshot, status: 'finishing' }, details))
        return id
      } catch (error) {
        if (!isSessionExpired(error)) dispatch({ type: 'finish_failure', sessionId: id })
        throw error
      }
    })
    return outcome.ok ? outcome.value : null
  }, [addCompletedSession, dispatch, runExclusive, session])

  const discard = useCallback(() => dispatch({ type: 'discard' }), [dispatch])
  const dismissNotice = useCallback(() => setNotice(null), [])

  const derived = useMemo(() => {
    if (!session) return { question: null, response: null, progress: null }
    const question = currentQuestion(session)
    return { question, response: session.responses[question.id], progress: getProgress(session) }
  }, [session])

  return {
    session,
    ...derived,
    busy,
    notice,
    dismissNotice,
    isEvaluating: derived.response?.status === STATUS.EVALUATING,
    start,
    setDraft,
    submit,
    retryScoring,
    skip,
    goTo,
    next,
    previous,
    goToNextUnresolved,
    finish,
    discard,
  }
}
