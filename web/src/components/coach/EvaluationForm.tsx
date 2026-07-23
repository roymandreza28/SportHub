import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createEvaluation, type PlayerSearchResult } from '../../lib/coachApi'
import { fetchSports } from '../../lib/venueApi'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { PlayerSkillHistoryChart } from './PlayerSkillHistoryChart'
import { buttonPrimary, fieldGroup, input, label, select, textarea } from '../../lib/formStyles'

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
    <div className="flex flex-col gap-4">
      <div className={`${fieldGroup} max-w-md`}>
        <label className={label}>Player</label>
        <PlayerSearchPicker selected={player} onSelect={setPlayer} />
      </div>

      {player && (
        <>
          <div className="grid max-w-md gap-4 sm:grid-cols-2">
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
              <label className={label}>Level</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
                className={select}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className={fieldGroup}>
              <label className={label}>Score (optional)</label>
              <input
                type="number"
                placeholder="0–100"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className={input}
              />
            </div>
            <div className={`${fieldGroup} sm:col-span-2`}>
              <label className={label}>Notes (optional)</label>
              <textarea
                placeholder="What did you observe?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={textarea}
                rows={2}
              />
            </div>
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={!sportId || mutation.isPending}
            className={`${buttonPrimary} self-start`}
          >
            {mutation.isPending ? 'Saving...' : 'Submit evaluation'}
          </button>

          <div className="border-t border-slate-100 pt-4">
            <h4 className={`${label} mb-2`}>Skill history</h4>
            <PlayerSkillHistoryChart playerId={player.id} />
          </div>
        </>
      )}
    </div>
  )
}
