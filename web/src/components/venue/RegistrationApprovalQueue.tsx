import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchVenueSchedule, updateVenueRegistration, type Venue } from '../../lib/venueApi'
import { echo } from '../../lib/echo'
import { buttonDanger, buttonSuccess } from '../../lib/formStyles'

export function RegistrationApprovalQueue({ venue }: { venue: Venue }) {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facilitator', 'schedule', venue.id] }),
  })

  const pending = (data ?? []).filter((e) => e.status === 'pending')

  if (pending.length === 0) {
    return <p className="text-sm text-slate-400">No pending requests for {venue.name}.</p>
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {pending.map((event) => (
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
          <div className="flex gap-2">
            <button onClick={() => respond.mutate({ id: event.id, status: 'approved' })} className={buttonSuccess}>
              Approve
            </button>
            <button onClick={() => respond.mutate({ id: event.id, status: 'rejected' })} className={buttonDanger}>
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
