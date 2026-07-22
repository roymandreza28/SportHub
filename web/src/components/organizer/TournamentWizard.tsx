import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTournament, generateBracket, type TournamentFormat } from '../../lib/organizerApi'
import { fetchSports } from '../../lib/venueApi'

const FORMATS: TournamentFormat[] = ['single_elimination', 'round_robin']

export function TournamentWizard() {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [sportId, setSportId] = useState<number | ''>('')
  const [name, setName] = useState('')
  const [format, setFormat] = useState<TournamentFormat>('single_elimination')
  const [startsAt, setStartsAt] = useState('')
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => createTournament({
      sport_id: Number(sportId),
      name,
      format,
      starts_at: new Date(startsAt).toISOString(),
    }),
    onSuccess: (tournament) => {
      setCreatedId(tournament.id)
      setMessage(`Created "${tournament.name}" as a draft. Register players, then generate the bracket.`)
      queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] })
    },
  })

  const bracketMutation = useMutation({
    mutationFn: () => generateBracket(createdId!),
    onSuccess: () => {
      setMessage('Bracket generated!')
      queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', createdId] })
    },
    onError: () => setMessage('Could not generate bracket (does it already have one, or no players registered?).'),
  })

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Create a tournament</h3>

      <select
        value={sportId}
        onChange={(e) => setSportId(e.target.value ? Number(e.target.value) : '')}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="">Sport...</option>
        {sports?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Tournament name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as TournamentFormat)}
        className="rounded border px-2 py-1 text-sm"
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f.replace('_', ' ')}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
      <button
        onClick={() => createMutation.mutate()}
        disabled={!sportId || !name || !startsAt || createMutation.isPending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {createMutation.isPending ? 'Creating...' : 'Create tournament'}
      </button>

      {createdId && (
        <button
          onClick={() => bracketMutation.mutate()}
          disabled={bracketMutation.isPending}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {bracketMutation.isPending ? 'Generating...' : `Generate bracket for tournament #${createdId}`}
        </button>
      )}

      {message && <p className="text-xs text-gray-600">{message}</p>}
    </div>
  )
}
