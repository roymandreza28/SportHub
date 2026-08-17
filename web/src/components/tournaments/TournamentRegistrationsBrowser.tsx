import { useState, type ReactNode } from 'react'
import { StatusBadge } from '../layout/DashboardShell'
import { IconChevronDown } from '../layout/icons'
import { BracketView } from '../organizer/BracketView'

type RegistrationLike = {
  id: number
  status: string
  tournament: {
    id: number
    name: string
    status: string
    starts_at: string
    sport: { name: string }
    venue: { id: number; name: string } | null
  }
}

function RegistrationDropdown<T extends RegistrationLike>({
  label,
  registrations,
  selectedTournamentId,
  onSelectTournament,
  emptyText,
  renderPrimary,
  renderBadges,
}: {
  label: string
  registrations: T[]
  selectedTournamentId: number | null
  onSelectTournament: (tournamentId: number) => void
  emptyText: string
  renderPrimary: (registration: T) => ReactNode
  renderBadges: (registration: T) => ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="truncate">{label}</span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {registrations.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">{emptyText}</p>}
          {registrations.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelectTournament(r.tournament.id)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-sm transition ${
                selectedTournamentId === r.tournament.id ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{renderPrimary(r)}</p>
                <p className="truncate text-xs text-slate-500">
                  {r.tournament.sport.name} — {new Date(r.tournament.starts_at).toLocaleDateString()}
                  {r.tournament.venue ? ` at ${r.tournament.venue.name}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">{renderBadges(r)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TournamentRegistrationsBrowser<T extends RegistrationLike>({
  registrations,
  selectedTournamentId,
  onSelectTournament,
  renderPrimary,
  renderBadges,
}: {
  registrations: T[]
  selectedTournamentId: number | null
  onSelectTournament: (tournamentId: number) => void
  renderPrimary: (registration: T) => ReactNode
  renderBadges?: (registration: T) => ReactNode
}) {
  const badges =
    renderBadges ??
    ((r: T) => (
      <>
        <StatusBadge status={r.status} />
        <StatusBadge status={r.tournament.status} />
      </>
    ))

  const ongoing = registrations.filter((r) => r.tournament.status !== 'completed' && r.tournament.status !== 'cancelled')
  const completed = registrations.filter((r) => r.tournament.status === 'completed' || r.tournament.status === 'cancelled')

  return (
    <div>
      <RegistrationDropdown
        label="Ongoing tournaments"
        registrations={ongoing}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={onSelectTournament}
        emptyText="No ongoing tournaments."
        renderPrimary={renderPrimary}
        renderBadges={badges}
      />
      <RegistrationDropdown
        label="Completed tournaments"
        registrations={completed}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={onSelectTournament}
        emptyText="No completed tournaments."
        renderPrimary={renderPrimary}
        renderBadges={badges}
      />
      {selectedTournamentId && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <BracketView tournamentId={selectedTournamentId} />
        </div>
      )}
    </div>
  )
}
