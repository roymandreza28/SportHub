import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteVenue, updateVenue, type Venue } from '../../lib/venueApi'
import { StatusBadge } from '../layout/DashboardShell'
import { buttonDanger, buttonSecondary, buttonSuccess } from '../../lib/formStyles'

export function VenueList({
  venues,
  selectedId,
  onSelect,
  onEdit,
}: {
  venues: Venue[]
  selectedId: number | null
  onSelect: (venue: Venue) => void
  onEdit: (venue: Venue) => void
}) {
  const queryClient = useQueryClient()

  const toggleStatus = useMutation({
    mutationFn: (venue: Venue) => updateVenue(venue.id, { status: venue.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] }),
  })

  // Soft delete on the backend — the row is kept, just removed from view
  // here and from the player-facing directory, so nothing is lost.
  const remove = useMutation({
    mutationFn: (venue: Venue) => deleteVenue(venue.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] }),
  })

  function handleDelete(venue: Venue) {
    if (window.confirm(`Delete "${venue.name}"? You can ask support to restore it later if needed.`)) {
      remove.mutate(venue)
    }
  }

  if (venues.length === 0) {
    return <p className="text-sm text-slate-400">No venues yet — create one to get started.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {venues.map((venue) => (
        <li
          key={venue.id}
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 shadow-sm transition ${
            selectedId === venue.id ? 'border-teal-300 bg-teal-50/50' : 'border-slate-100 bg-white'
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect(venue)}
            className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium text-slate-800">{venue.name}</span>
              <StatusBadge status={venue.status} />
            </span>
            <span className="truncate text-xs text-slate-500">{venue.address}</span>
            <span className="text-xs text-slate-400">
              {venue.courts.length} court{venue.courts.length === 1 ? '' : 's'} · {venue.equipment.length} equipment
              item{venue.equipment.length === 1 ? '' : 's'}
            </span>
          </button>

          <div className="flex shrink-0 gap-2">
            <button onClick={() => onEdit(venue)} className={buttonSecondary}>
              Edit
            </button>
            <button
              onClick={() => toggleStatus.mutate(venue)}
              disabled={toggleStatus.isPending}
              className={venue.status === 'active' ? buttonDanger : buttonSuccess}
            >
              {venue.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
            <button
              onClick={() => handleDelete(venue)}
              disabled={remove.isPending}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
