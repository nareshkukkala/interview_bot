import { useCallback, useMemo, useReducer, useState } from 'react'
import { AppContext } from './appContextObject.js'
import { SAMPLE_HISTORY } from '../data/sampleData.js'
import { isActive, sessionReducer } from '../features/interview/sessionModel.js'

// App-wide state, all in React memory (PRD: no database). A page refresh resets it.
// Interview workflow logic lives in features/interview + hooks/useInterviewSession.

const DEFAULT_SETTINGS = {
  candidateName: '',
  jobRole: 'python_developer',
  experience: 'fresher',
  difficulty: 'medium',
  interviewType: 'mixed',
  showTimer: true,
  showSampleData: false, // example interviews are an explicit opt-in: results and history show only real interviews
}

/** Converts a completed session into a history row. */
function toHistoryItem(session) {
  return {
    id: session.id,
    completedAt: session.completedAt,
    jobRole: session.config.jobRole,
    interviewType: session.config.interviewType,
    difficulty: session.config.difficulty,
    score: session.result.overallScore,
    answered: session.result.answeredCount,
    total: session.questions.length,
    durationSec: session.result.durationSec,
    criteria: session.result.criteria,
    isSample: false,
  }
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [session, dispatchSession] = useReducer(sessionReducer, null) // the active (or just-finished) interview
  const [completed, setCompleted] = useState([]) // full sessions completed in this tab

  const history = useMemo(() => {
    const items = [...completed.map(toHistoryItem), ...(settings.showSampleData ? SAMPLE_HISTORY : [])]
    return items.sort((a, b) => b.completedAt - a.completedAt)
  }, [completed, settings.showSampleData])

  const addCompletedSession = useCallback((finished) => {
    setCompleted((list) => [finished, ...list.filter((s) => s.id !== finished.id)])
  }, [])

  const updateCompletedResult = useCallback((id, result) => {
    setCompleted((list) => list.map((s) => (s.id === id ? { ...s, result } : s)))
    dispatchSession({ type: 'result_updated', sessionId: id, result })
  }, [])

  const updateSettings = useCallback((changes) => setSettings((s) => ({ ...s, ...changes })), [])

  const getSessionById = useCallback(
    (id) => (session?.id === id ? session : (completed.find((s) => s.id === id) ?? null)),
    [session, completed],
  )

  const clearCompleted = useCallback(() => {
    setCompleted([])
    if (session?.status === 'completed') dispatchSession({ type: 'discard' })
  }, [session])

  const value = {
    settings,
    updateSettings,
    session,
    dispatchSession,
    activeSession: session && isActive(session) ? session : null, // an expired or completed session is not resumable
    history,
    completedCount: completed.length,
    addCompletedSession,
    updateCompletedResult,
    getSessionById,
    clearCompleted,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
