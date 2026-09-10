import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

// Every DashboardShell-based page (Player/Coach/Organizer/Admin/Facilitator)
// tracked its active nav tab as plain component state, which a reload (or
// a shared/bookmarked link) always reset back to the first tab — this keeps
// it in the ?tab= query param instead, so whatever tab the user is on
// survives a reload.
export function useTabParam(defaultId: string): [string, (id: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const [active, setActiveState] = useState(searchParams.get('tab') ?? defaultId)

  // Re-applies ?tab= whenever it changes, not just on first mount — a
  // notification click (e.g. "you were matched" → ?tab=matchmaking)
  // navigates to this same route while it's already mounted, which the
  // useState initializer above alone would never see.
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActiveState(tab)
  }, [searchParams])

  function setActive(id: string) {
    setActiveState(id)
    // replace: true — switching tabs shouldn't pile up browser-back entries,
    // it should feel like flipping a toggle, not navigating to a new page.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', id)
        return next
      },
      { replace: true },
    )
  }

  return [active, setActive]
}
