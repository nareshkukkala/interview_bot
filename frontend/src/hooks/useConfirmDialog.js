import { useCallback, useState } from 'react'

/** Tracks which confirmation dialog (if any) is open: `const confirm = useConfirmDialog()`. */
export function useConfirmDialog() {
  const [kind, setKind] = useState(null)
  const open = useCallback((next) => setKind(next), [])
  const close = useCallback(() => setKind(null), [])
  return { kind, isOpen: (k) => kind === k, open, close }
}
