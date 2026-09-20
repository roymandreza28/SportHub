import { useChatUI } from '../../lib/ChatUIContext'
import type { MatchmakingRequestItem } from '../../lib/playerApi'
import { buttonPrimary } from '../../lib/formStyles'
import { formatPeso } from '../../lib/venueApi'
import { IconMessageCircle } from '../layout/icons'

// The classic "torn receipt" bottom edge: two mirrored 45°/-45° gradients
// on the same tile overlap into a repeating zigzag — solid white where they
// agree, transparent (showing the blue background-color through) in the
// notches between. Purely decorative, so it's aria-hidden.
function ReceiptZigzag() {
  return (
    <div
      aria-hidden
      className="h-4 w-full bg-blue-600"
      style={{
        backgroundImage:
          'linear-gradient(45deg, transparent 50%, white 50%), linear-gradient(-45deg, transparent 50%, white 50%)',
        backgroundSize: '16px 16px',
        backgroundPosition: 'top left',
        backgroundRepeat: 'repeat-x',
      }}
    />
  )
}

function formatReservationDateTime(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

// Shown the instant a match pairs AND the pair's chosen venue+time got
// auto-reserved (see MatchmakingRequestController::store()). The blue
// receipt card mirrors a GCash-style payment slip — facilitator name,
// number, reservation time, total due, and the facilitator's own payment
// QR (uploaded from their account settings) — so a matched player/coach can
// scan straight to pay instead of only being pointed at a chat thread.
export function DownPaymentPrompt({ req }: { req: MatchmakingRequestItem }) {
  const { openChatWindow } = useChatUI()
  const reservation = req.venue_registration
  if (!reservation) return null

  const opponentName = req.opponent?.name ?? req.opponent_team?.name
  const facilitator = reservation.facilitator

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-800">
        Matched{opponentName ? ` with ${opponentName}` : ''} — {req.venue?.name} reserved
      </p>

      {facilitator && (
        <div className="overflow-hidden rounded-2xl bg-blue-600 shadow-lg">
          <div className="rounded-t-2xl bg-white px-6 pb-5 pt-6">
            <p className="text-center text-lg font-bold tracking-tight text-blue-700">{facilitator.name}</p>
            {facilitator.phone && <p className="mt-1 text-center text-sm text-slate-500">{facilitator.phone}</p>}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
              <span className="shrink-0 text-slate-500">Reserve date &amp; time</span>
              <span className="text-right text-slate-400">{formatReservationDateTime(reservation.starts_at)}</span>
            </div>

            {reservation.total_amount !== null && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="font-semibold text-slate-700">Total</span>
                <span className="text-lg font-bold text-slate-900">{formatPeso(reservation.total_amount)}</span>
              </div>
            )}

            <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
              {facilitator.qr_code_url ? (
                <img
                  src={facilitator.qr_code_url}
                  alt={`${facilitator.name}'s payment QR code`}
                  className="h-40 w-40 rounded-lg object-contain"
                />
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">
                  The facilitator hasn't added a payment QR code yet — message them below to arrange payment.
                </p>
              )}
            </div>
          </div>
          <ReceiptZigzag />
        </div>
      )}

      <p className="text-xs text-slate-600">
        {new Date(reservation.starts_at).toLocaleString()} – {new Date(reservation.ends_at).toLocaleTimeString()}
        {reservation.court && ` · ${reservation.court.name}`}.{' '}
        {reservation.status === 'pending' &&
          "This slot is being held pending the venue facilitator's approval. Scan the QR above (or message the facilitator) to send a down payment and confirm."}
        {reservation.status === 'approved' && 'Your booking is confirmed.'}
        {reservation.status === 'rejected' && 'The facilitator was unable to confirm this slot.'}
      </p>

      {reservation.conversation_id && (
        <button
          onClick={() => openChatWindow(reservation.conversation_id!)}
          className={`${buttonPrimary} flex w-fit items-center gap-1.5`}
        >
          <IconMessageCircle className="h-4 w-4" />
          Message the venue facilitator
        </button>
      )}
    </div>
  )
}
