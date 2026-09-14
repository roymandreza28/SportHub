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
