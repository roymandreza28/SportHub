import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchTournaments, registerPlayerForTournament, type PlayerSearchResult } from '../../lib/coachApi'
import { PlayerSearchPicker } from './PlayerSearchPicker'

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
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Register a player for a tournament</h3>

      <select
        value={tournamentId}
        onChange={(e) => setTournamentId(e.target.value ? Number(e.target.value) : '')}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="">Choose a tournament...</option>
        {tournaments?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.sport.name})
          </option>
        ))}
      </select>

      <PlayerSearchPicker selected={player} onSelect={setPlayer} />

      <button
        onClick={() => mutation.mutate()}
        disabled={!tournamentId || !player || mutation.isPending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Registering...' : 'Register player'}
      </button>

      {message && (
        <p className={`text-xs ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  )
}
