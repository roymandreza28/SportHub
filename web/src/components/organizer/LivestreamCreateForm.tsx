import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLivestream, type Tournament } from '../../lib/organizerApi'
import { buttonPrimary, fieldGroup, input, label, select } from '../../lib/formStyles'

export function LivestreamCreateForm({ tournaments }: { tournaments: Tournament[] }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState<'youtube' | 'facebook'>('youtube')
  const [embedUrl, setEmbedUrl] = useState('')
  const [tournamentId, setTournamentId] = useState<number | ''>('')

  const mutation = useMutation({
    mutationFn: () => createLivestream({
      title,
      platform,
      embed_url: embedUrl,
      tournament_id: tournamentId === '' ? undefined : tournamentId,
    }),
    onSuccess: () => {
      setTitle('')
      setEmbedUrl('')
      queryClient.invalidateQueries({ queryKey: ['livestreams'] })
    },
  })

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-800">Start a livestream</h3>

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
          <label className={label}>Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as 'youtube' | 'facebook')} className={select}>
            <option value="youtube">YouTube</option>
            <option value="facebook">Facebook</option>
          </select>
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
        <div className={`${fieldGroup} sm:col-span-2`}>
          <label className={label}>Embed URL</label>
          <input
            type="text"
            placeholder="https://..."
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
            className={input}
          />
        </div>
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={!title || !embedUrl || mutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Creating...' : 'Create livestream'}
      </button>
    </div>
  )
}
