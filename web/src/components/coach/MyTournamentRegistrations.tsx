import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMyTournamentRegistrations, type CoachTournamentRegistration } from '../../lib/coachApi'
import { StatusBadge } from '../layout/DashboardShell'
import { TournamentRegistrationsBrowser } from '../tournaments/TournamentRegistrationsBrowser'

type GroupedTournamentRegistration = {
  id: number
  status: string
  tournament: CoachTournamentRegistration['tournament']
  players: { id: number; name: string }[]
}

function groupByTournament(registrations: CoachTournamentRegistration[]): GroupedTournamentRegistration[] {
  const groups = new Map<number, GroupedTournamentRegistration>()

  for (const r of registrations) {
    const entry = r.user ? r.user : { id: r.team?.id ?? r.id, name: `Team: ${r.team?.name ?? 'Unnamed'}` }
    const existing = groups.get(r.tournament.id)
    if (existing) {
      existing.players.push(entry)
    } else {
      groups.set(r.tournament.id, { id: r.tournament.id, status: r.status, tournament: r.tournament, players: [entry] })
    }
  }

  return [...groups.values()]
}

export function MyTournamentRegistrations({
  selectedTournamentId,
  onSelectTournament,
}: {
  selectedTournamentId: number | null
  onSelectTournament: (tournamentId: number) => void
}) {
  const { data: registrations } = useQuery({
    queryKey: ['coach', 'tournament-registrations', 'mine'],
    queryFn: fetchMyTournamentRegistrations,
  })

  const grouped = useMemo(() => groupByTournament(registrations ?? []), [registrations])

  return (
    <TournamentRegistrationsBrowser
      registrations={grouped}
      selectedTournamentId={selectedTournamentId}
      onSelectTournament={onSelectTournament}
      renderPrimary={(r) => `${r.tournament.name} — ${r.players.map((p) => p.name).join(', ')}`}
      renderBadges={(r) => <StatusBadge status={r.tournament.status} />}
    />
  )
}
