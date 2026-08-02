import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchVenueSchedule, updateVenueRegistration, type Venue } from '../../lib/venueApi'
import { StatusBadge } from '../layout/DashboardShell'
import { useChatUI } from '../../lib/ChatUIContext'
import { echo } from '../../lib/echo'
import { buttonDanger, buttonGhost, buttonSuccess } from '../../lib/formStyles'

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
    <ul className="flex flex-col gap-2.5">
      {bookings.map((event) => (
        <li
          key={event.id}
          className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3 shadow-sm"
        >
          <div>
            <p className="text-sm font-medium text-slate-800">{event.title}</p>
            <p className="text-xs text-slate-500">
              {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleTimeString()}
            </p>
          </div>
          {event.status === 'pending' ? (
            <div className="flex gap-2">
              <button onClick={() => respond.mutate({ id: event.id, status: 'approved' })} className={buttonSuccess}>
                Approve
              </button>
              <button onClick={() => respond.mutate({ id: event.id, status: 'rejected' })} className={buttonDanger}>
                Reject
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {event.status === 'approved' && event.conversation_id && (
                <button onClick={() => openChatWindow(event.conversation_id!)} className={buttonGhost}>
                  Message
                </button>
              )}
              <StatusBadge status={event.status} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
