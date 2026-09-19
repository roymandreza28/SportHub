import { useEffect } from 'react'
import { sendHeartbeat } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'

const INTERVAL_MS = 25 * 1000

// Renders nothing — same self-contained, App.tsx-level pattern as
// GlobalChatListener.tsx. Every authenticated role pings POST /api/heartbeat
// on a fixed interval (not just the roles that use the floating chat
// window) since anyone logged in can be the "other participant" someone
// else is looking at an online/offline dot for.
export function HeartbeatPulse() {
  const { user } = useAuth()
  const userId = user?.id

  // Keyed on the id (a stable primitive), not the user object itself — the
  // object gets a fresh reference on every unrelated profile refetch, which
  // would otherwise tear down and restart this interval far more often
  // than the login/logout transitions it's actually meant to react to.
  useEffect(() => {
    if (!userId) return

    sendHeartbeat().catch(() => {})
    const id = setInterval(() => {
      sendHeartbeat().catch(() => {})
    }, INTERVAL_MS)

    return () => clearInterval(id)
  }, [userId])

  return null
}
