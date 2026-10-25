import type { MatchmakingRequestItem } from '../../lib/playerApi'

export function DownPaymentPrompt({ req }: { req: MatchmakingRequestItem }) {
  const reservation = req.venue_registration
  if (!reservation) return null

  const opponentName = req.opponent?.name ?? req.opponent_team?.name

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">
        Matched{opponentName ? ` with ${opponentName}` : ''}
      </p>

      <div className="space-y-2 text-xs text-slate-600">
        <p>
          <span className="font-semibold text-slate-700">When:</span>{' '}
          {new Date(reservation.starts_at).toLocaleString()} – {new Date(reservation.ends_at).toLocaleTimeString()}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Where:</span>{' '}
          {req.venue?.name ?? 'Venue to be confirmed'}
          {reservation.court && ` · ${reservation.court.name}`}
        </p>
      </div>

      {reservation.status === 'pending' && (
        <p className="text-xs text-slate-500">This match is reserved and waiting for venue confirmation.</p>
      )}
      {reservation.status === 'approved' && <p className="text-xs text-green-600">Your match is confirmed.</p>}
      {reservation.status === 'rejected' && <p className="text-xs text-red-600">This slot was not confirmed by the venue.</p>}
    </div>
  )
}
