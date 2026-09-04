import { useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { resubscribeIfAlreadyGranted } from '../../lib/pushNotifications'

/**
 * Silently re-arms device push notifications on login for anyone who's
 * already granted permission (see AccountSettingsModal for the actual
 * opt-in prompt) — a subscription can rotate or expire between sessions, so
 * this just keeps an already-opted-in user subscribed without asking them
 * to grant permission again every time they log in.
 */
export function PushNotificationsBootstrap() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    resubscribeIfAlreadyGranted()
  }, [user])

  return null
}
