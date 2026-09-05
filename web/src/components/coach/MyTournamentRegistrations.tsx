import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMyTournamentRegistrations, type CoachTournamentRegistration } from '../../lib/coachApi'
import type { BracketMatch } from '../../lib/organizerApi'
import { StatusBadge } from '../layout/DashboardShell'
import { TournamentRegistrationsBrowser } from '../tournaments/TournamentRegistrationsBrowser'
import { StatSheetModal } from './StatSheetModal'

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
  const [statSheetMatchId, setStatSheetMatchId] = useState<number | null>(null)

  // Mirrors MatchPolicy::viewStatSheet() client-side, from data this same
  // query already fetched — a team registration is only ever created by
  // its own captain (TournamentRegistrationController::storeTeam), so
  // team.id here is exactly "a team I captain," and user.id is exactly "a
  // player I registered," the same two predicates the policy checks. Used
  // purely to decide whether to SHOW the Stat Sheet button; the backend
  // still authorizes the actual request independently.
  const myTeamIds = useMemo(
    () => new Set((registrations ?? []).map((r) => r.team?.id).filter((id): id is number => id != null)),
    [registrations]
  )
  const myRegisteredUserIds = useMemo(
    () => new Set((registrations ?? []).map((r) => r.user?.id).filter((id): id is number => id != null)),
    [registrations]
  )

  function isStatSheetEligible(match: BracketMatch): boolean {
    if (match.participant_a_team_id != null || match.participant_b_team_id != null) {
      return (
        (match.participant_a_team_id != null && myTeamIds.has(match.participant_a_team_id)) ||
        (match.participant_b_team_id != null && myTeamIds.has(match.participant_b_team_id))
      )
    }
    return (
      (match.participant_a_id != null && myRegisteredUserIds.has(match.participant_a_id)) ||
      (match.participant_b_id != null && myRegisteredUserIds.has(match.participant_b_id))
    )
  }

  return (
    <>
      <TournamentRegistrationsBrowser
        registrations={grouped}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={onSelectTournament}
        renderPrimary={(r) => `${r.tournament.name} — ${r.players.map((p) => p.name).join(', ')}`}
        renderBadges={(r) => <StatusBadge status={r.tournament.status} />}
        isStatSheetEligible={isStatSheetEligible}
        onOpenStatSheet={(match) => setStatSheetMatchId(match.id)}
      />

      {statSheetMatchId && (
        <StatSheetModal matchId={statSheetMatchId} onClose={() => setStatSheetMatchId(null)} />
      )}
    </>
  )
}
