import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchVenueSchedule, updateVenueRegistration, type Venue } from '../../lib/venueApi'
import { echo } from '../../lib/echo'

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
    return <p className="text-xs text-gray-500">No pending requests for {venue.name}.</p>
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {pending.map((event) => (
        <li key={event.id} className="flex items-center justify-between rounded border p-2">
          <div>
            <div>{event.title}</div>
            <div className="text-xs text-gray-500">
              {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleTimeString()}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => respond.mutate({ id: event.id, status: 'approved' })}
              className="rounded bg-green-600 px-2 py-1 text-xs text-white"
            >
              Approve
            </button>
            <button
              onClick={() => respond.mutate({ id: event.id, status: 'rejected' })}
              className="rounded bg-red-600 px-2 py-1 text-xs text-white"
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
