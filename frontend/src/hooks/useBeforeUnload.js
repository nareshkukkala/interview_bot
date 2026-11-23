import { useEffect } from 'react'

/** Shows the browser's "leave site?" prompt while `active` is true (PRD ERR-07). */
export function useBeforeUnload(active) {
  useEffect(() => {
    if (!active) return undefined
    const onBeforeUnload = (event) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}
