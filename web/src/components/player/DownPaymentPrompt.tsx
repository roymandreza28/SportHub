import { useChatUI } from '../../lib/ChatUIContext'
import type { MatchmakingRequestItem } from '../../lib/playerApi'
import { buttonPrimary } from '../../lib/formStyles'
import { IconMessageCircle } from '../layout/icons'

// Shown the instant a match pairs AND the pair's chosen venue+time got
// auto-reserved (see MatchmakingRequestController::store()) — the prompt
// this session was built for: "you're matched, now go arrange a down
// payment with the venue." The reservation itself is already a real,
// pending VenueRegistration row (visible in both this player's and the
// facilitator's own booking lists either way); this card's only job is
// pointing the player at the facilitator conversation that already exists
// for it, created the same moment the reservation was.
export function DownPaymentPrompt({ req }: { req: MatchmakingRequestItem }) {
  const { openChatWindow } = useChatUI()
  const reservation = req.venue_registration
  if (!reservation) return null

  const opponentName = req.opponent?.name ?? req.opponent_team?.name

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        Matched{opponentName ? ` with ${opponentName}` : ''} — {req.venue?.name} reserved
      </p>
      <p className="text-xs text-amber-800">
        {new Date(reservation.starts_at).toLocaleString()} – {new Date(reservation.ends_at).toLocaleTimeString()}.
        {reservation.status === 'pending' &&
          ' This slot is being held pending the venue facilitator\'s approval. Most venues ask for a down payment (e.g. via GCash) to confirm — message the facilitator below to arrange it and send proof of payment.'}
        {reservation.status === 'approved' && ' Your booking is confirmed.'}
        {reservation.status === 'rejected' && ' The facilitator was unable to confirm this slot.'}
      </p>
      {reservation.conversation_id && (
        <button
          onClick={() => openChatWindow(reservation.conversation_id!)}
          className={`${buttonPrimary} flex w-fit items-center gap-1.5 !bg-amber-700 hover:!bg-amber-800`}
        >
          <IconMessageCircle className="h-4 w-4" />
          Message the venue facilitator
        </button>
      )}
    </div>
  )
}
