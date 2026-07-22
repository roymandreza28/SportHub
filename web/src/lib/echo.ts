import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import type { ChannelAuthorizationCallback } from 'pusher-js/types/src/core/auth/options'
import { api } from './api'

declare global {
  interface Window {
    Pusher: typeof Pusher
  }
}

window.Pusher = Pusher

export const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: import.meta.env.VITE_REVERB_PORT,
  wssPort: import.meta.env.VITE_REVERB_PORT,
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
  enabledTransports: ['ws', 'wss'],
  // Reuse our existing axios instance for auth requests instead of Echo's default
  // HTTP authorizer — it already carries withCredentials + the Sanctum XSRF header
  // that every other API call depends on.
  authorizer: (channel: { name: string }) => ({
    authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
      api
        .post('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
        .then((response) => callback(null, response.data))
        .catch((error) => callback(error, null))
    },
  }),
})
