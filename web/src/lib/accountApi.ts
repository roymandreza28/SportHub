import { api } from './api'

export async function updateOwnPassword(currentPassword: string, password: string) {
  await api.patch('/api/user/password', { current_password: currentPassword, password })
}

export async function updateOwnAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  await api.post('/api/user/avatar', form)
}
