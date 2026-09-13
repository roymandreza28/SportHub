import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNews } from '../../lib/organizerApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

// Shares the WHOLE bracket (as opposed to ShareMatchModal, which shares one
// game) to the newsfeed — the post carries tournament_id only, no match_id.
// Newsfeed.tsx/PublicNewsModal.tsx render any tournament-tagged post with
// no attached match as an embedded, read-only BracketView complete with its
// own Bracket/Standings toggle, so a reader can explore every match (and
// drill into any one game's full record) without leaving the feed — and
// since that embed polls the same public bracket endpoint BracketView
// always has, it keeps updating live as the tournament progresses.
export function ShareBracketModal({
  tournamentId,
  tournamentName,
  onClose,
}: {
  tournamentId: number
  tournamentName: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(`${tournamentName} — Bracket & Standings`)
  const [body, setBody] = useState(
    `Follow every match of ${tournamentName} right here — switch between bracket and standings view below.`
  )

  const mutation = useMutation({
    mutationFn: () => createNews({ title, body, tournament_id: tournamentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsfeed'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'news'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Share the bracket</h3>
        <p className="mb-4 text-xs text-slate-500">
          Post {tournamentName}'s bracket to the newsfeed — readers get a live, interactive view with a
          bracket/standings toggle, not just a snapshot.
        </p>

        <div className="flex flex-col gap-4">
          <div className={fieldGroup}>
            <label className={label}>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Context</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className={textarea} rows={4} />
          </div>
        </div>

        {mutation.isError && <p className="mt-3 text-xs text-red-600">Could not post — try again.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={!title || !body || mutation.isPending} className={buttonPrimary}>
            {mutation.isPending ? 'Posting...' : 'Post to newsfeed'}
          </button>
        </div>
      </div>
    </div>
  )
}
