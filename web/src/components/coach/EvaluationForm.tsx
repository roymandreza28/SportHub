import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvaluation, type PlayerSearchResult } from '../../lib/coachApi'
import { fetchSports } from '../../lib/venueApi'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { PlayerSkillHistoryChart } from './PlayerSkillHistoryChart'

const LEVELS = ['beginner', 'intermediate', 'advanced', 'pro'] as const

export function EvaluationForm() {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [player, setPlayer] = useState<PlayerSearchResult | null>(null)
  const [sportId, setSportId] = useState<number | ''>('')
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('beginner')
  const [score, setScore] = useState('')
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: () => createEvaluation({
      player_id: player!.id,
      sport_id: Number(sportId),
      level,
      score: score ? Number(score) : undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      setNotes('')
      setScore('')
      queryClient.invalidateQueries({ queryKey: ['coach', 'evaluations', player?.id] })
    },
  })

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <h3 className="text-sm font-medium">Evaluate a player</h3>

      <PlayerSearchPicker selected={player} onSelect={setPlayer} />

      {player && (
        <>
          <div className="flex flex-col gap-2">
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
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
              className="rounded border px-2 py-1 text-sm"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Score (optional)"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="rounded border px-2 py-1 text-sm"
            />
            <textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded border px-2 py-1 text-sm"
            />
            <button
              onClick={() => mutation.mutate()}
              disabled={!sportId || mutation.isPending}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : 'Submit evaluation'}
            </button>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-medium text-gray-600">Skill history</h4>
            <PlayerSkillHistoryChart playerId={player.id} />
          </div>
        </>
      )}
    </div>
  )
}
