import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNews } from '../../lib/organizerApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

export function ChampionCongratsModal({
  tournamentId,
  tournamentName,
  championName,
  onClose,
}: {
  tournamentId: number
  tournamentName: string
  championName: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(
    championName ? `Congratulations, ${championName}!` : `${tournamentName} has a champion!`
  )
  const [body, setBody] = useState('')
  const [media, setMedia] = useState<File[]>([])

  const mutation = useMutation({
    mutationFn: () => createNews({ title, body, media, tournament_id: tournamentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsfeed'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'news'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">🏆 {tournamentName} is complete!</h3>
        <p className="mb-4 text-xs text-slate-500">
          Post a congratulations to the newsfeed for {championName ?? 'the winning team'}.
        </p>

        <div className="flex flex-col gap-4">
          <div className={fieldGroup}>
            <label className={label}>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Context</label>
            <textarea
              placeholder="Say a few words about the tournament and the champion..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={textarea}
              rows={4}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Photos / video</label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => setMedia(Array.from(e.target.files ?? []))}
              className={input}
            />
          </div>
        </div>

        {mutation.isError && <p className="mt-3 text-xs text-red-600">Could not post — try again.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Skip
          </button>
          <button onClick={() => mutation.mutate()} disabled={!title || !body || mutation.isPending} className={buttonPrimary}>
            {mutation.isPending ? 'Posting...' : 'Post congratulations'}
          </button>
        </div>
      </div>
    </div>
  )
}
