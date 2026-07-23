import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyVenueRegistrations } from '../../lib/playerApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
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

  if (bookings?.length === 0) {
    return <p className="text-sm text-slate-400">No bookings yet.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {bookings?.map((b) => (
        <li
          key={b.id}
          className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3 shadow-sm"
        >
          <div>
            <p className="text-sm font-medium text-slate-800">
              {b.venue.name}
              {b.court && ` — ${b.court.name}`}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(b.starts_at).toLocaleString()} - {new Date(b.ends_at).toLocaleTimeString()}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status}</span>
        </li>
      ))}
    </ul>
  )
}
