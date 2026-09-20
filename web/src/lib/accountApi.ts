import { api } from './api'
import type { User } from './AuthContext'

export async function updateOwnPassword(currentPassword: string, password: string) {
  await api.patch('/api/user/password', { current_password: currentPassword, password })
}

// Basic-details self-edit — name parts, phone, address. Deliberately
// excludes email/password/role/verification — those have their own
// dedicated flows (or none at all for a regular user). Returns the fresh
// user record (roles included) so the caller can update AuthContext
// without a second round trip.
export async function updateOwnProfile(input: {
  first_name?: string
  middle_name?: string | null
  last_name?: string
  phone?: string
  address?: string
}) {
  const { data } = await api.patch<User>('/api/user/profile', input)
  return data
}

export async function updateOwnAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  await api.post('/api/user/avatar', form)
}

// venue_facilitator only (enforced server-side) — the facilitator's own
// payment QR (e.g. GCash), shown to a matched player/coach on the
// down-payment receipt (see DownPaymentPrompt.tsx).
export async function updateOwnQrCode(file: File) {
  const form = new FormData()
  form.append('qr_code', file)
  await api.post('/api/user/qr-code', form)
}

// Downloads a JSON file of everything this account has on record — profile,
// registrations, bookings, skill history, authored content. The backend
// sets a Content-Disposition header, but that only drives browser behavior
// for a full-page navigation, not an XHR response — so the actual "download
// a file" part happens here: build a Blob from the parsed JSON and trigger
// it through a throwaway <a download> link.
export async function exportOwnData(): Promise<void> {
  const { data } = await api.get('/api/user/data-export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sporthub-data-${data.profile?.id ?? 'export'}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function deleteOwnAccount(password: string) {
  await api.delete('/api/user', { data: { password } })
}
