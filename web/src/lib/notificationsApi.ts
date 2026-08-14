import { api } from './api'

export type NotificationType =
  | 'friend_request'
  | 'friend_request_accepted'
  | 'booking_approved'
  | 'matchmaking_paired'
  | 'tournament_update'
  | 'team_invite'

export type NotificationItem = {
  id: number
  type: NotificationType
  data: Record<string, string | number | null>
  read_at: string | null
  created_at: string
}

export async function fetchNotifications() {
  const { data } = await api.get<NotificationItem[]>('/api/notifications')
  return data
}

export async function markNotificationRead(id: number) {
  const { data } = await api.post<NotificationItem>(`/api/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead() {
  await api.post('/api/notifications/read-all')
}
