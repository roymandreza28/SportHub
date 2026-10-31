import { useChatUI } from '../../lib/ChatUIContext'
import type { MatchmakingRequestItem } from '../../lib/playerApi'
import { formatPeso } from '../../lib/venueApi'

export function DownPaymentPrompt({ req }: { req: MatchmakingRequestItem }) {
  const reservation = req.venue_registration
  const { openChatWindow } = useChatUI()
  if (!reservation) return null

  const opponentName = req.opponent?.name ?? req.opponent_team?.name
  const isCreatedMatch = !!req.venue || !!req.preferred_start_at || !!req.preferred_end_at
  const reservedHours = Math.max(
    0,
    (new Date(reservation.ends_at).getTime() - new Date(reservation.starts_at).getTime()) / (1000 * 60 * 60)
  )
  const facilitator = reservation.facilitator

  if (isCreatedMatch) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Match paired</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              Matched{opponentName ? ` with ${opponentName}` : ''}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
            {reservation.status}
          </span>
        </div>

        <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
            <p className="font-semibold text-slate-700">Venue facilitator</p>
            <p className="mt-1 text-sm font-medium text-slate-800">{facilitator?.name ?? 'Venue facilitator'}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
            <p className="font-semibold text-slate-700">Match date &amp; time</p>
            <p className="mt-1 text-sm text-slate-800">
              {new Date(reservation.starts_at).toLocaleString()} – {new Date(reservation.ends_at).toLocaleTimeString()}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-700">Reserved time</p>
            <p className="mt-1 text-sm text-slate-800">{reservedHours.toFixed(reservedHours % 1 === 0 ? 0 : 1)} hr</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-700">Venue</p>
            <p className="mt-1 text-sm text-slate-800">{req.venue?.name ?? 'Venue to be confirmed'}</p>
          </div>

          {reservation.total_amount != null && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <p className="font-semibold text-slate-700">Estimated total</p>
              <p className="mt-1 text-sm text-slate-800">{formatPeso(Number(reservation.total_amount))}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="font-semibold text-slate-700">Facilitator QR code</p>
          {facilitator?.qr_code_url ? (
            <div className="mt-2 flex justify-center">
              <img src={facilitator.qr_code_url} alt="Venue facilitator QR code" className="h-28 w-28 rounded-lg border border-slate-200 bg-white object-cover" />
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No QR code available yet — the facilitator can upload one in their account settings.</p>
          )}
        </div>

        {facilitator && (
          <button
            type="button"
            onClick={() => reservation.conversation_id && openChatWindow(reservation.conversation_id)}
            disabled={!reservation.conversation_id}
            className="w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Message facilitator
          </button>
        )}

        {reservation.status === 'pending' && (
          <p className="text-xs text-slate-500">This match is reserved and waiting for venue confirmation.</p>
        )}
        {reservation.status === 'approved' && <p className="text-xs text-green-600">Your match is confirmed.</p>}
        {reservation.status === 'rejected' && <p className="text-xs text-red-600">This slot was not confirmed by the venue.</p>}
      </div>
    )
  }

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
