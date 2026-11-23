import { useCallback, useState } from 'react'
import { fetchResults } from '../api/interviewApi.js'
import { useApp } from '../context/useApp.js'

/**
 * Re-requests the report when the AI summary could not be written. The backend retries only the summary;
 * the scores and feedback are already stored. The in-room timer total is kept.
 */
export function useSummaryRetry(session) {
  const { updateCompletedResult } = useApp()
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState(null)

  const retry = useCallback(async () => {
    setRetrying(true)
    setError(null)
    try {
      const fresh = await fetchResults(session.id, { durationSec: session.result.durationSec })
      updateCompletedResult(session.id, fresh)
    } catch (e) {
      setError(e.message)
    } finally {
      setRetrying(false)
    }
  }, [session, updateCompletedResult])

  return { retry, retrying, error }
}
