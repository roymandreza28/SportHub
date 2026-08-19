import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

// Matches this app's md: breakpoint (768px) — below it, DashboardShell
// switches from the sidebar to the icon nav bar, so header dropdowns need
// the same cutoff to switch from anchored panels to full-screen overlays.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
