import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchTournaments, registerPlayerForTournament, type PlayerSearchResult } from '../../lib/coachApi'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { buttonPrimary, fieldGroup, label, select } from '../../lib/formStyles'

export function TournamentRegistrationForm() {
  const { data: tournaments } = useQuery({ queryKey: ['tournaments', 'open'], queryFn: () => fetchTournaments('open') })
  const [tournamentId, setTournamentId] = useState<number | ''>('')
  const [player, setPlayer] = useState<PlayerSearchResult | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const mutation = useMutation({
    mutationFn: () => registerPlayerForTournament(Number(tournamentId), player!.id),
    onSuccess: () => {
      setMessage({ type: 'success', text: `Registered ${player?.name}.` })
      setPlayer(null)
    },
    onError: (err: unknown) => {
      const text =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not register this player.'
      setMessage({ type: 'error', text })
    },
  })

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className={fieldGroup}>
        <label className={label}>Tournament</label>
        <select
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value ? Number(e.target.value) : '')}
          className={select}
        >
          <option value="">Choose a tournament...</option>
          {tournaments?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.sport.name})
            </option>
          ))}
        </select>
      </div>

      <div className={fieldGroup}>
        <label className={label}>Player</label>
        <PlayerSearchPicker selected={player} onSelect={setPlayer} />
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={!tournamentId || !player || mutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Registering...' : 'Register player'}
      </button>

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  )
}
