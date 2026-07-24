import { api } from './api'
import type { Role } from './AuthContext'

export type AdminUser = {
  id: number
  name: string
  email: string
  is_active: boolean
  roles: { id: number; name: Role }[]
}

export type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

export type Metrics = {
  users_by_role: Record<string, number>
  total_venues: number
  total_tournaments: number
  pending_venue_registrations: number
  open_matchmaking_requests: number
  live_matches: number
}

export type AuditLogEntry = {
  id: number
  action: string
  subject_type: string | null
  subject_id: number | null
  metadata: Record<string, unknown>
  created_at: string
  actor: { id: number; name: string; email: string } | null
}

export async function fetchMetrics() {
  const { data } = await api.get<Metrics>('/api/admin/dashboard/metrics')
  return data
}

export async function fetchUsers(search: string) {
  const { data } = await api.get<Paginated<AdminUser>>('/api/admin/users', { params: { search } })
  return data
}

export async function updateUserPassword(userId: number, password: string) {
  await api.patch(`/api/admin/users/${userId}/password`, { password })
}

export async function updateUserStatus(userId: number, isActive: boolean) {
  const { data } = await api.patch<AdminUser>(`/api/admin/users/${userId}/status`, { is_active: isActive })
  return data
}

export async function deleteUser(userId: number) {
  await api.delete(`/api/admin/users/${userId}`)
}

export async function createFacilitator(input: { name: string; email: string; password: string }) {
  const { data } = await api.post<AdminUser>('/api/admin/facilitators', input)
  return data
}

export async function fetchAuditLog() {
  const { data } = await api.get<Paginated<AuditLogEntry>>('/api/admin/audit-log')
  return data
}
