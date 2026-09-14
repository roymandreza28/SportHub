import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createLivestream, fetchBracket, type Tournament } from '../../lib/organizerApi'
import { buttonPrimary, fieldGroup, input, label, select } from '../../lib/formStyles'

export function LivestreamCreateForm({ tournaments }: { tournaments: Tournament[] }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [tournamentId, setTournamentId] = useState<number | ''>('')
  const [matchId, setMatchId] = useState<number | ''>('')

  // A tournament can have several courts live at once now — once a
  // tournament is picked, offer its still-open matches so the organizer can
  // tie this broadcast to one specific game instead of the whole event.
  const { data: bracket } = useQuery({
    queryKey: ['organizer', 'bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId as number),
    enabled: tournamentId !== '',
  })
  const candidateMatches = (bracket?.matches ?? []).filter((m) => m.status !== 'completed')

  const mutation = useMutation({
    mutationFn: () => createLivestream({
      title,
      tournament_id: tournamentId === '' ? undefined : tournamentId,
      match_id: matchId === '' ? undefined : matchId,
    }),
    onSuccess: () => {
      setTitle('')
      setMatchId('')
      queryClient.invalidateQueries({ queryKey: ['livestreams'] })
    },
  })

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-800">Start a livestream</h3>
      <p className="text-xs text-slate-500">
        The tournament's assigned livestream organizer broadcasts from their own device camera — no external link
        needed.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`${fieldGroup} sm:col-span-2`}>
          <label className={label}>Title</label>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={input}
          />
        </div>
        <div className={fieldGroup}>
          <label className={label}>Linked tournament</label>
          <select
            value={tournamentId}
            onChange={(e) => {
              setTournamentId(e.target.value ? Number(e.target.value) : '')
              setMatchId('')
            }}
            className={select}
          >
            <option value="">No tournament link</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {tournamentId !== '' && (
          <div className={fieldGroup}>
            <label className={label}>Game</label>
            <select
              value={matchId}
              onChange={(e) => setMatchId(e.target.value ? Number(e.target.value) : '')}
              className={select}
            >
              <option value="">Whole tournament (no specific game)</option>
              {candidateMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  Round {m.round}: {m.participant_a?.name ?? 'TBD'} vs {m.participant_b?.name ?? 'TBD'}
                  {m.court ? ` — ${m.court.venue.name} (${m.court.name})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={!title || mutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Creating...' : 'Create livestream'}
      </button>
    </div>
  )
}
