import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMyVenueRegistrations, type MyVenueRegistration } from '../../lib/playerApi'
import { useAuth } from '../../lib/AuthContext'
import { useChatUI } from '../../lib/ChatUIContext'
import { echo } from '../../lib/echo'
import { IconChevronDown } from '../layout/icons'
import { VenueMap } from '../venue/VenueMap'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

function BookingGroup({
  label,
  bookings,
  emptyText,
  onMessage,
  selectedBookingId,
  onToggleMap,
}: {
  label: string
  bookings: MyVenueRegistration[]
  emptyText: string
  onMessage: (conversationId: number) => void
  selectedBookingId: number | null
  onToggleMap: (bookingId: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="truncate">
          {label} ({bookings.length})
        </span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-1 flex max-h-96 flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {bookings.length === 0 && <p className="px-2 py-2 text-sm text-slate-400">{emptyText}</p>}
          {bookings.map((b) => (
            <li key={b.id} className="rounded-lg border border-slate-100">
              <div
                onClick={() => b.venue && onToggleMap(b.id)}
                className={`flex items-center justify-between gap-4 p-3 ${b.venue ? 'cursor-pointer' : ''}`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {b.venue?.name ?? 'Deleted venue'}
                    {b.court && ` — ${b.court.name}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(b.starts_at).toLocaleString()} - {new Date(b.ends_at).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {b.conversation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onMessage(b.conversation!.id)
                      }}
                      className="text-xs font-medium text-teal-600 hover:text-teal-700"
                    >
                      Message facilitator
                    </button>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status}</span>
                </div>
              </div>
              {selectedBookingId === b.id && b.venue && (
                <div className="border-t border-slate-100 p-3">
                  <p className="mb-2 text-xs text-slate-500">{b.venue.address}</p>
                  <VenueMap venues={[b.venue]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MyBookings() {
  const { user } = useAuth()
  const { openChatWindow } = useChatUI()
  const queryClient = useQueryClient()
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null)
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

  const pending = (bookings ?? []).filter((b) => b.status === 'pending')
  const approved = (bookings ?? []).filter((b) => b.status === 'approved')
  const rejected = (bookings ?? []).filter((b) => b.status === 'rejected')
  const cancelled = (bookings ?? []).filter((b) => b.status === 'cancelled')

  const toggleMap = (bookingId: number) => setSelectedBookingId((id) => (id === bookingId ? null : bookingId))

  return (
    <div>
      <BookingGroup
        label="Pending"
        bookings={pending}
        emptyText="No pending bookings."
        onMessage={openChatWindow}
        selectedBookingId={selectedBookingId}
        onToggleMap={toggleMap}
      />
      <BookingGroup
        label="Approved"
        bookings={approved}
        emptyText="No approved bookings."
        onMessage={openChatWindow}
        selectedBookingId={selectedBookingId}
        onToggleMap={toggleMap}
      />
      <BookingGroup
        label="Rejected"
        bookings={rejected}
        emptyText="No rejected bookings."
        onMessage={openChatWindow}
        selectedBookingId={selectedBookingId}
        onToggleMap={toggleMap}
      />
      <BookingGroup
        label="Cancelled"
        bookings={cancelled}
        emptyText="No cancelled bookings."
        onMessage={openChatWindow}
        selectedBookingId={selectedBookingId}
        onToggleMap={toggleMap}
      />
    </div>
  )
}
