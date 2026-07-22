import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLivestream, type Tournament } from '../../lib/organizerApi'

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
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Start a livestream</h3>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
      <select
        value={platform}
        onChange={(e) => setPlatform(e.target.value as 'youtube' | 'facebook')}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="youtube">YouTube</option>
        <option value="facebook">Facebook</option>
      </select>
      <input
        type="text"
        placeholder="Embed URL (https://...)"
        value={embedUrl}
        onChange={(e) => setEmbedUrl(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
      <select
        value={tournamentId}
        onChange={(e) => setTournamentId(e.target.value ? Number(e.target.value) : '')}
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="">No tournament link</option>
        {tournaments.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => mutation.mutate()}
        disabled={!title || !embedUrl || mutation.isPending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Creating...' : 'Create livestream'}
      </button>
    </div>
  )
}
