import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchVenueSchedule, updateVenueRegistration, type Venue } from '../../lib/venueApi'
import { StatusBadge } from '../layout/DashboardShell'
import { useChatUI } from '../../lib/ChatUIContext'
import { echo } from '../../lib/echo'
import { buttonGhost } from '../../lib/formStyles'
import { IconMessageCircle } from '../layout/icons'

const ACCENT_BY_STATUS: Record<string, string> = {
  pending: 'bg-amber-400',
  approved: 'bg-green-500',
  rejected: 'bg-red-400',
  cancelled: 'bg-slate-300',
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

// "Sep 4, 2026 · 2:00 PM – 3:00 PM" when the booking sits inside one day
// (true for essentially every booking this app allows), falling back to two
// full timestamps for the rare case that isn't.
function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const dateLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  if (start.toDateString() === end.toDateString()) {
    return `${dateLabel} · ${startTime} – ${endTime}`
  }
  return `${dateLabel} ${startTime} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${endTime}`
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function RegistrationApprovalQueue({ venue }: { venue: Venue }) {
  const { openChatWindow } = useChatUI()
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['facilitator', 'schedule', venue.id],
    queryFn: () => fetchVenueSchedule(venue.id),
  })

  useEffect(() => {
    const channel = echo.private(`venue.${venue.id}.schedule`)
    channel.listen('.VenueRegistrationUpdated', () =>
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'schedule', venue.id] })
    )

    return () => {
      echo.leave(`venue.${venue.id}.schedule`)
    }
  }, [venue.id, queryClient])

  const respond = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'rejected' }) =>
      updateVenueRegistration(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'schedule', venue.id] })
      // The venue list's booking/pending counts (venues.mine) come from a
      // separate query — without this, "Back to venues" would still show
      // the old pending count until an unrelated refetch happened to occur.
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
    },
  })

  // Most recent first, so new requests don't get buried under old history.
  const bookings = [...(data ?? [])].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())

  if (bookings.length === 0) {
    return <p className="text-sm text-slate-400">No bookings yet for {venue.name}.</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((event) => {
        const requesterName = event.is_walk_in ? event.walk_in_name ?? 'Walk-in' : event.user?.name ?? 'Unknown'

        return (
          <li
            key={event.id}
            className="flex overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <span className={`w-1.5 shrink-0 ${ACCENT_BY_STATUS[event.status] ?? 'bg-slate-300'}`} />

            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    event.is_walk_in
                      ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      : 'bg-teal-100 text-teal-700'
                  }`}
                >
                  {initialsFor(requesterName)}
                </span>

                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    <span className="truncate">{event.title}</span>
                    {event.is_walk_in && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Walk-in
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{requesterName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <ClockIcon />
                    {formatRange(event.start, event.end)}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                {/* A conversation exists the instant the request comes in
                    (see VenueBookingService::ensureBookingConversation, now
                    called from store() too), not just once approved — so
                    the facilitator can message the booker while still
                    deciding, same as the booker already can. */}
                {event.conversation_id && (
                  <button onClick={() => openChatWindow(event.conversation_id!)} className={`${buttonGhost} !text-xs`}>
                    <IconMessageCircle className="h-4 w-4" /> Message
                  </button>
                )}
                {event.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => respond.mutate({ id: event.id, status: 'approved' })}
                      disabled={respond.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckIcon /> Approve
                    </button>
                    <button
                      onClick={() => respond.mutate({ id: event.id, status: 'rejected' })}
                      disabled={respond.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40"
                    >
                      <XIcon /> Reject
                    </button>
                  </>
                ) : (
                  <StatusBadge status={event.status} />
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
