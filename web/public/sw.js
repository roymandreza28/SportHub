// Web Push service worker. This is the piece that makes a notification show
// up in the OS notification tray/lock screen even when SportHub isn't open
// in a tab — a plain page can't do that on its own; only a registered
// service worker can receive a 'push' event and hand it to the OS via
// showNotification(). Kept deliberately tiny and dependency-free: it only
// needs to run when a push arrives or its notification is clicked, so there's
// nothing here to bundle through Vite — this file is served as-is from
// web/public/sw.js.

self.addEventListener('push', (event) => {
  let payload = { title: 'SportHub', body: '', url: '/dashboard' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Non-JSON payload (shouldn't happen — WebPushService always sends
    // JSON) — fall back to the generic title/body above rather than crash.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: payload.url },
    })
  )
})

// Clicking the OS notification focuses an already-open SportHub tab if one
// exists, or opens a new one, rather than always opening a fresh tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
