import axios from 'axios'

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
