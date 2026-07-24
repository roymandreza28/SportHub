import { api } from './api'

export async function updateOwnPassword(currentPassword: string, password: string) {
  await api.patch('/api/user/password', { current_password: currentPassword, password })
}
