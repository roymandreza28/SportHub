import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { forfeitMatch, type BracketMatch } from '../../lib/organizerApi'
import { buttonPrimary, buttonSecondary } from '../../lib/formStyles'

// Shown the instant a venue organizer taps a not-yet-started match, before
// the actual scoreboard ever opens — a real-world game can be decided
// without a single point played (a no-show, a withdrawal), and forcing the
// organizer through the live scoreboard just to declare that felt wrong.
export function MatchStartOptionsModal({
  match,
  tournamentId,
  onStartGame,
  onClose,
}: {
  match: BracketMatch
  tournamentId: number
  onStartGame: () => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmingSide, setConfirmingSide] = useState<'a' | 'b' | null>(null)

  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'

  const forfeit = useMutation({
    mutationFn: (side: 'a' | 'b') => forfeitMatch(match.id, side),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          {aName} vs {bName}
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Before opening the scoreboard, is this game actually being played?
        </p>

        {confirmingSide ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              Declare <span className="font-semibold">{confirmingSide === 'a' ? aName : bName}</span> the winner by
              default? The other side forfeits — no points are recorded, and this can't be undone.
            </p>
            {forfeit.isError && <p className="text-xs text-red-600">Could not record this — try again.</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmingSide(null)} className={buttonSecondary} disabled={forfeit.isPending}>
                Back
              </button>
              <button
                onClick={() => forfeit.mutate(confirmingSide)}
                disabled={forfeit.isPending}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
              >
                {forfeit.isPending ? 'Recording...' : 'Confirm win by default'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button onClick={onStartGame} className={`${buttonPrimary} w-full justify-center`}>
              Start game
            </button>
            <div className="my-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> or declare a winner by default{' '}
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              onClick={() => setConfirmingSide('a')}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {aName} wins by default
            </button>
            <button
              onClick={() => setConfirmingSide('b')}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {bName} wins by default
            </button>
            <button onClick={onClose} className={`${buttonSecondary} mt-1 w-full justify-center`}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
