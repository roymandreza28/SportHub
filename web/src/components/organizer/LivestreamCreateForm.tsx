import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLivestream, type Tournament } from '../../lib/organizerApi'
import { buttonPrimary, fieldGroup, input, label, select } from '../../lib/formStyles'

export function LivestreamCreateForm({ tournaments }: { tournaments: Tournament[] }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [tournamentId, setTournamentId] = useState<number | ''>('')

  const mutation = useMutation({
    mutationFn: () => createLivestream({
      title,
      tournament_id: tournamentId === '' ? undefined : tournamentId,
    }),
    onSuccess: () => {
      setTitle('')
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
            onChange={(e) => setTournamentId(e.target.value ? Number(e.target.value) : '')}
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
