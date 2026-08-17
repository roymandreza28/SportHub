import { useQuery } from '@tanstack/react-query'
import { fetchMyTournamentRegistrationsAsPlayer } from '../../lib/playerApi'
import { TournamentRegistrationsBrowser } from '../tournaments/TournamentRegistrationsBrowser'

export function MyTournamentRegistrations({
  selectedTournamentId,
  onSelectTournament,
}: {
  selectedTournamentId: number | null
  onSelectTournament: (tournamentId: number) => void
}) {
  const { data: registrations } = useQuery({
    queryKey: ['player', 'tournament-registrations', 'mine'],
    queryFn: fetchMyTournamentRegistrationsAsPlayer,
  })

  return (
    <TournamentRegistrationsBrowser
      registrations={registrations ?? []}
      selectedTournamentId={selectedTournamentId}
      onSelectTournament={onSelectTournament}
      renderPrimary={(r) => r.tournament.name}
    />
  )
}
