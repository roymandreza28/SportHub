import axios, { isAxiosError } from 'axios'

const API_URL = import.meta.env.VITE_API_URL
const TOKEN_STORAGE_KEY = 'sporthub_token'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
  },
})

// Bearer-token auth, not cookies: the frontend and API are on unrelated
// domains (Vercel + Render), and browsers won't send a cookie set on one
// domain to a request against the other regardless of CORS/SameSite config.
api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

// A request made with `responseType: 'blob'` (every CSV/file download in
// this app) still gets its error body decoded as a Blob even when the
// server responds with a JSON error (403/422/500/etc) — axios doesn't know
// to treat it differently just because the request failed. Left alone,
// `error.response.data` is an opaque Blob a caller can't read a message
// out of, so a failed export looks like nothing happened at all instead of
// showing why. This reads that Blob back out as the JSON message it
// actually is, wherever possible.
export async function extractDownloadErrorMessage(error: unknown): Promise<string> {
  if (isAxiosError(error)) {
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const parsed = JSON.parse(text) as { message?: string }
        if (parsed?.message) return parsed.message
      } catch {
        // Not JSON (or empty) — fall through to the generic messages below.
      }
    }
    if (!error.response) {
      return "Couldn't reach the server — check your connection and try again."
    }
    if (error.response.status === 403) {
      return "You don't have permission to export this."
    }
  }
  return 'Something went wrong while preparing the download. Please try again.'
}
