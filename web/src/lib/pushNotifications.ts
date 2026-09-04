import { api } from './api'

// Push services (FCM, Mozilla's, etc.) want the VAPID public key as a raw
// byte array, not the base64url string the backend hands out — this is the
// standard conversion every Web Push integration needs.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i)
  return bytes
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// iOS Safari only exposes the Push API to a site that's been added to the
// Home Screen (running in standalone/"app" mode) — outside that, Notification
// and PushManager may exist on the object but subscribing silently fails.
// `navigator.standalone` is Safari's own (non-standard) flag for this.
export function needsHomeScreenInstallOnIOS(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
  const isStandalone = 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true
  return isIOS && !isStandalone
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export function getPushPermissionState(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// Distinct from getPushPermissionState(): a browser never lets JS revoke
// Notification permission once granted, so "granted" alone can't tell you
// whether this device is actually subscribed right now — the user may have
// turned it off via disablePushNotifications() without touching browser
// permission at all.
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return !!subscription
}

async function subscribeAndRegister(): Promise<void> {
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const { data } = await api.get<{ key: string | null }>('/api/push/public-key')
    if (!data.key) throw new Error('Push notifications are not configured on the server.')

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key),
    })
  }

  await api.post('/api/push-subscriptions', subscription.toJSON())
}

// User-initiated only — shows the browser's native permission prompt, so
// this must be called from a click handler, not on page load. Browsers
// increasingly auto-deny (or just don't show) a permission prompt fired
// without a direct user gesture.
export async function enablePushNotifications(): Promise<PushPermissionState> {
  if (!isPushSupported()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission

  await subscribeAndRegister()
  return 'granted'
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  await api.delete('/api/push-subscriptions', { data: { endpoint: subscription.endpoint } })
  await subscription.unsubscribe()
}

// Re-arms an already-granted permission without prompting again — browsers
// remember the grant, so on every login this just re-registers the
// subscription in case it rotated or expired (push subscriptions aren't
// permanent), keeping an already-opted-in user receiving notifications
// without asking them twice. Silent by design: a failure here shouldn't
// interrupt anything the user is actually trying to do.
export async function resubscribeIfAlreadyGranted(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  try {
    await subscribeAndRegister()
  } catch {
    // Best-effort — see comment above.
  }
}
