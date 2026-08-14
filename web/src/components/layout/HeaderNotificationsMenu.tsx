import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { acceptFriendRequest, declineFriendRequest } from '../../lib/friendsApi'
import { acceptTeamInvite, declineTeamInvite } from '../../lib/teamsApi'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../../lib/notificationsApi'
import { echo } from '../../lib/echo'
import { useAuth } from '../../lib/AuthContext'
import { IconBell } from './icons'

function notificationText(n: NotificationItem): { title: string; subtitle?: string } {
  switch (n.type) {
    case 'friend_request':
      return { title: `${n.data.requester_name} sent you a friend request` }
    case 'friend_request_accepted':
      return { title: `${n.data.addressee_name} accepted your friend request` }
    case 'booking_approved':
      return {
        title: `Your booking at ${n.data.venue_name} was approved`,
        subtitle: n.data.starts_at ? new Date(n.data.starts_at as string).toLocaleString() : undefined,
      }
    case 'matchmaking_paired':
      return { title: `You've been matched with ${n.data.opponent_name}`, subtitle: n.data.sport_name as string }
    case 'tournament_update':
      return { title: n.data.message as string, subtitle: n.data.tournament_name as string }
    case 'team_invite':
      return {
        title: `${n.data.captain_name} invited you to join "${n.data.team_name}"`,
        subtitle: n.data.sport_name as string,
      }
    default:
      return { title: 'New notification' }
  }
}

// Both friend requests and team invites need inline Accept/Decline rather
// than a plain click-to-dismiss — everything else in the feed is read-only.
function isActionable(n: NotificationItem): boolean {
  return n.type === 'friend_request' || n.type === 'team_invite'
}

export function HeaderNotificationsMenu() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['social', 'friend-requests'] })
    queryClient.invalidateQueries({ queryKey: ['social', 'friends'] })
    queryClient.invalidateQueries({ queryKey: ['player', 'teams'] })
  }

  const acceptMutation = useMutation({
    mutationFn: (n: NotificationItem) =>
      Promise.all([acceptFriendRequest(n.data.friendship_id as number), markNotificationRead(n.id)]),
    onSuccess: invalidate,
  })
  const declineMutation = useMutation({
    mutationFn: (n: NotificationItem) =>
      Promise.all([declineFriendRequest(n.data.friendship_id as number), markNotificationRead(n.id)]),
    onSuccess: invalidate,
  })
  const acceptTeamMutation = useMutation({
    mutationFn: (n: NotificationItem) =>
      Promise.all([acceptTeamInvite(n.data.team_member_id as number), markNotificationRead(n.id)]),
    onSuccess: invalidate,
  })
  const declineTeamMutation = useMutation({
    mutationFn: (n: NotificationItem) =>
      Promise.all([declineTeamInvite(n.data.team_member_id as number), markNotificationRead(n.id)]),
    onSuccess: invalidate,
  })
  const readMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    if (!user) return

    const channel = echo.private(`App.Models.User.${user.id}`)
    channel.listen('.NotificationCreated', invalidate)
    channel.listen('.FriendRequestSent', invalidate)
    channel.listen('.FriendRequestAccepted', invalidate)

    return () => {
      echo.leave(`App.Models.User.${user.id}`)
    }
    // Only re-subscribes when the user identity changes — invalidate() is
    // re-created every render but doesn't need to retrigger the subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const items = notifications ?? []
  const unreadCount = items.filter((n) => !n.read_at).length

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 w-80 pt-2">
          <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => readAllMutation.mutate()}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700"
                >
                  Mark all as read
                </button>
              )}
            </div>
            {items.length === 0 && <p className="p-3 text-sm text-slate-400">Nothing yet.</p>}
            <ul className="flex flex-col divide-y divide-slate-100">
              {items.map((n) => {
                const { title, subtitle } = notificationText(n)
                const unread = !n.read_at

                const accept = n.type === 'team_invite' ? acceptTeamMutation : acceptMutation
                const decline = n.type === 'team_invite' ? declineTeamMutation : declineMutation

                return (
                  <li key={n.id} className={`px-2 py-2.5 ${unread ? 'bg-teal-50/60' : ''}`}>
                    {isActionable(n) ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-slate-800">{title}</p>
                        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
                        {unread ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => accept.mutate(n)}
                              className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-teal-700"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => decline.mutate(n)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">Responded</p>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => unread && readMutation.mutate(n.id)} className="w-full text-left">
                        <p className="text-sm font-medium text-slate-800">{title}</p>
                        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
                        <p className="mt-0.5 text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
