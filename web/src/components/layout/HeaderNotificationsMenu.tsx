import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
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
import { useAuth, type Role } from '../../lib/AuthContext'
import { useIsMobile } from '../../lib/useIsMobile'
import { IconBell, IconX } from './icons'

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
    case 'matchmaking_venue_reserved':
      return {
        title: `Slot reserved at ${n.data.venue_name} — pay a down payment to confirm`,
        subtitle: n.data.starts_at ? new Date(n.data.starts_at as string).toLocaleString() : undefined,
      }
    case 'matchmaking_reservation_expired':
      return {
        title: `Your match's reservation at ${n.data.venue_name} wasn't confirmed in time and has been cancelled`,
        subtitle: n.data.starts_at ? new Date(n.data.starts_at as string).toLocaleString() : undefined,
      }
    case 'tournament_update':
      return { title: n.data.message as string, subtitle: n.data.tournament_name as string }
    case 'tournament_champion_crowned':
      return {
        title: `${n.data.champion_name ?? 'A champion'} won ${n.data.tournament_name}!`,
        subtitle: 'Post a congratulations to the newsfeed',
      }
    case 'team_invite':
      return {
        title: `${n.data.captain_name} invited you to join "${n.data.team_name}"`,
        subtitle: n.data.sport_name as string,
      }
    case 'tournament_assigned':
      return {
        title: `You've been assigned to ${n.data.tournament_name}`,
        subtitle: n.data.role === 'venue_organizer' ? 'Venue organizer' : 'Livestream organizer',
      }
    case 'public_inquiry_received':
      return {
        title: `New inquiry: ${n.data.topic}`,
        subtitle: `${n.data.inquirer_name || 'Anonymous'} — ${n.data.inquirer_email}`,
      }
    case 'account_pending_verification':
    case 'account_verified':
    case 'account_rejected':
      return { title: n.data.message as string }
    default:
      return { title: 'New notification' }
  }
}

// Both friend requests and team invites need inline Accept/Decline rather
// than a plain click-to-dismiss — everything else in the feed is read-only.
function isActionable(n: NotificationItem): boolean {
  return n.type === 'friend_request' || n.type === 'team_invite'
}

// Where clicking a notification's own details (not its Accept/Decline
// buttons, where those exist) should take the user — the whole point being
// "show me what this is actually about" rather than leaving them to go
// hunt for the team/tournament/match themselves. Both /player and /coach
// already read an initial ?tab= from the URL (see PlayerPage/CoachPage), so
// this reuses that existing mechanism rather than inventing a new one.
//
// A coach account always also carries the player role (see roles.ts's own
// comment on this) — checked in the same coach-before-player priority
// primaryDashboardPath() uses, so a coach who's also a player lands on
// their coach dashboard, not the player one.
//
// tournament_champion_crowned is deliberately absent: OrganizerPage already
// turns that specific type into its own auto-popup congratulations modal
// (see its championModal effect) the moment it arrives, which is a better
// response than a link — by the time it'd show up here as a plain list
// item, it's normally already been consumed by that modal.
function notificationLink(n: NotificationItem, hasRole: (...roles: Role[]) => boolean): string | null {
  const isCoach = hasRole('coach')
  const isPlayer = hasRole('player')

  switch (n.type) {
    case 'friend_request':
      return n.data.requester_id != null ? `/profile/${n.data.requester_id}` : null
    case 'friend_request_accepted':
      return n.data.addressee_id != null ? `/profile/${n.data.addressee_id}` : null
    // Team management lives inside the Matchmaking tab (see TeamPanel
    // nested in MatchmakingPanel), not a separate top-level tab.
    case 'team_invite':
    case 'matchmaking_paired':
    case 'matchmaking_venue_reserved':
    case 'matchmaking_reservation_expired':
      return isCoach ? '/coach?tab=matchmaking' : isPlayer ? '/player?tab=matchmaking' : null
    case 'booking_approved':
      return isCoach ? '/coach?tab=venues' : isPlayer ? '/player?tab=venues' : null
    case 'tournament_update':
      // Same feature, different tab id per dashboard — see each page's own
      // NAV_ITEMS ('registrations' for coach, 'tournaments' for player).
      return isCoach ? '/coach?tab=registrations' : isPlayer ? '/player?tab=tournaments' : null
    // Only ever sent to a venue_organizer/livestream_organizer landing a
    // tournament assignment (see TournamentController::notifyAssignment) —
    // both land on OrganizerPage, same as the main organizer.
    case 'tournament_assigned':
      return '/organizer?tab=tournaments'
    default:
      return null
  }
}

export function HeaderNotificationsMenu() {
  const { user, hasRole } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
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

  // Marks read (if it wasn't already) and, when this notification type has
  // somewhere to go, navigates there and closes the dropdown — clicking "X
  // invited you to join Team Y" should land the user looking at Team Y, not
  // just silently flip a read flag.
  function openNotification(n: NotificationItem) {
    if (!n.read_at) readMutation.mutate(n.id)
    const link = notificationLink(n, hasRole)
    if (link) {
      setOpen(false)
      navigate(link)
    }
  }
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

  const panel = (
    <div
      className={
        isMobile
          ? 'flex h-full w-full flex-col overflow-y-auto bg-white p-2'
          : 'max-h-[26rem] w-80 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-2xl'
      }
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-sm font-semibold text-slate-900">Notifications</p>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={() => readAllMutation.mutate()}
              className="text-xs font-medium text-teal-600 hover:text-teal-700"
            >
              Mark all as read
            </button>
          )}
          {/* No "click outside" affordance once the panel fills the whole
              screen — mobile needs an explicit close button instead. */}
          {isMobile && (
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
              <IconX className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      {items.length === 0 && <p className="p-3 text-sm text-slate-400">Nothing yet.</p>}
      <ul className="flex flex-col divide-y divide-slate-100">
        {items.map((n) => {
          const { title, subtitle } = notificationText(n)
          const unread = !n.read_at

          const accept = n.type === 'team_invite' ? acceptTeamMutation : acceptMutation
          const decline = n.type === 'team_invite' ? declineTeamMutation : declineMutation

          const hasLink = notificationLink(n, hasRole) !== null

          return (
            <li key={n.id} className={`px-2 py-2.5 ${unread ? 'bg-teal-50/60' : ''}`}>
              {isActionable(n) ? (
                <div className="flex flex-col gap-2">
                  {/* The details themselves are clickable independently of
                      Accept/Decline below — e.g. a team invite's title opens
                      the team, without accidentally accepting it. */}
                  <button
                    onClick={() => openNotification(n)}
                    disabled={!hasLink}
                    className={`-m-1 rounded-md p-1 text-left ${hasLink ? 'hover:bg-slate-100' : 'cursor-default'}`}
                  >
                    <p className="text-sm font-medium text-slate-800">{title}</p>
                    {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
                  </button>
                  {unread ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => accept.mutate(n)}
                        className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-pure-white transition hover:bg-teal-700"
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
                <button onClick={() => openNotification(n)} className="w-full rounded-md text-left hover:bg-slate-100">
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
  )

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
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-semibold text-pure-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && !isMobile && <div className="absolute right-0 top-full z-20 pt-2">{panel}</div>}

      {/* Mobile: portaled to <body> for the same reason as HeaderMessagesMenu
          — this component lives inside the header's backdrop-blur bar,
          which would otherwise hijack "fixed inset-0" into a thin strip. */}
      {open && isMobile && createPortal(<div className="fixed inset-0 z-40">{panel}</div>, document.body)}
    </div>
  )
}
