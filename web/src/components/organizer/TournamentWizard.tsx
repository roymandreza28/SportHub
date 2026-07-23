import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTournament, generateBracket, type TournamentFormat } from '../../lib/organizerApi'
import { fetchSports } from '../../lib/venueApi'
import { buttonPrimary, buttonSuccess, fieldGroup, input, label, select } from '../../lib/formStyles'

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
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-800">Create a tournament</h3>

      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label}>Sport</label>
          <select
            value={sportId}
            onChange={(e) => setSportId(e.target.value ? Number(e.target.value) : '')}
            className={select}
          >
            <option value="">Sport...</option>
            {sports?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldGroup}>
          <label className={label}>Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} className={select}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className={`${fieldGroup} sm:col-span-2`}>
          <label className={label}>Tournament name</label>
          <input
            type="text"
            placeholder="Tournament name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </div>
        <div className={fieldGroup}>
          <label className={label}>Starts at</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={input}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => createMutation.mutate()}
          disabled={!sportId || !name || !startsAt || createMutation.isPending}
          className={buttonPrimary}
        >
          {createMutation.isPending ? 'Creating...' : 'Create tournament'}
        </button>

        {createdId && (
          <button
            onClick={() => bracketMutation.mutate()}
            disabled={bracketMutation.isPending}
            className={buttonSuccess}
          >
            {bracketMutation.isPending ? 'Generating...' : `Generate bracket for tournament #${createdId}`}
          </button>
        )}
      </div>

      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  )
}
