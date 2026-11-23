import { useEffect } from 'react'
import { useApp } from '../context/useApp.js'
import { currentResponse, isLocked } from '../features/interview/sessionModel.js'

/**
 * Ticks time onto the current question once per second while the interview room is open
 * and that question is still being worked on. Pauses on submitted answers and hidden tabs.
 */
export function useSessionTimer() {
  const { session, dispatchSession } = useApp()
  const sessionId = session?.id
  const currentIndex = session?.currentIndex
  const running = Boolean(session && session.status === 'in_progress' && !isLocked(currentResponse(session)))

  // The interval restarts whenever the question changes. Otherwise its phase is shared between questions, and a tick that
  // lands while you are briefly on another question credits that question with a whole second it never had.
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') dispatchSession({ type: 'tick', sessionId, seconds: 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [running, sessionId, currentIndex, dispatchSession])
}
