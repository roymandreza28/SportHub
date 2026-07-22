import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyVenueRegistrations } from '../../lib/playerApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

export function MyBookings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: bookings } = useQuery({
    queryKey: ['player', 'venue-registrations'],
    queryFn: fetchMyVenueRegistrations,
  })

  useEffect(() => {
    if (!user) return

    const channel = echo.private(`venue-registrations.user.${user.id}`)
    channel.listen('.VenueRegistrationUpdated', () =>
      queryClient.invalidateQueries({ queryKey: ['player', 'venue-registrations'] })
    )

    return () => {
      echo.leave(`venue-registrations.user.${user.id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">My bookings</h3>
      {bookings?.length === 0 && <p className="text-xs text-gray-500">No bookings yet.</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {bookings?.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded border p-2">
            <div>
              <div>
                {b.venue.name}
                {b.court && ` — ${b.court.name}`}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(b.starts_at).toLocaleString()} - {new Date(b.ends_at).toLocaleTimeString()}
              </div>
            </div>
            <span className={`rounded px-2 py-1 text-xs ${STATUS_COLORS[b.status]}`}>{b.status}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
