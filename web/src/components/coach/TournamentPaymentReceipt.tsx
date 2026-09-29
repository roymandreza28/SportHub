import { useChatUI } from '../../lib/ChatUIContext'
import type { PaymentReceipt } from '../../lib/coachApi'
import { buttonPrimary, buttonSecondary } from '../../lib/formStyles'
import { formatPeso } from '../../lib/venueApi'
import { IconMessageCircle } from '../layout/icons'

// The classic "torn receipt" bottom edge — identical technique to
// DownPaymentPrompt.tsx's own ReceiptZigzag (two mirrored 45°/-45°
// gradients on one tile overlapping into a repeating zigzag). Purely
// decorative, so it's aria-hidden. Duplicated rather than imported since
// DownPaymentPrompt.tsx lives under components/player/ for the matchmaking
// flow specifically — this is the same visual language applied to a
// different domain (tournament registration), not the same component.
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

// Shown the instant a coach registers a player/team for a tournament that
// actually has a registration_fee set (see TournamentRegistrationController::
// paymentReceipt() — absent entirely for a free tournament, same "only
// when there's something real to pay for" rule DownPaymentPrompt follows
// for a matchmaking-reserved venue). Mirrors that same GCash-style payment
// slip so the two "you owe someone money, here's how to pay them" moments
// in this app read as the same pattern — organizer name/phone, the amount,
// and their own payment QR — plus a direct line to message them, exactly
// like DownPaymentPrompt's "Message the venue facilitator" button.
export function TournamentPaymentReceipt({ receipt, onDone }: { receipt: PaymentReceipt; onDone: () => void }) {
  const { openChatWindow } = useChatUI()

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <p className="text-sm font-semibold text-slate-800">
        Registered for {receipt.tournament_name} — pay the organizer to confirm your spot
      </p>

      <div className="overflow-hidden rounded-2xl bg-blue-600 shadow-lg">
        <div className="rounded-t-2xl bg-white px-6 pb-5 pt-6">
          <p className="text-center text-lg font-bold tracking-tight text-blue-700">{receipt.organizer.name}</p>
          {receipt.organizer.phone && <p className="mt-1 text-center text-sm text-slate-500">{receipt.organizer.phone}</p>}

          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="font-semibold text-slate-700">Registration fee</span>
            <span className="text-lg font-bold text-slate-900">{formatPeso(Number(receipt.registration_fee))}</span>
          </div>

          <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
            {receipt.organizer.qr_code_url ? (
              <img
                src={receipt.organizer.qr_code_url}
                alt={`${receipt.organizer.name}'s payment QR code`}
                className="h-40 w-40 rounded-lg object-contain"
              />
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">
                The organizer hasn't added a payment QR code yet — message them below to arrange payment.
              </p>
            )}
          </div>
        </div>
        <ReceiptZigzag />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => openChatWindow(receipt.conversation_id)}
          className={`${buttonPrimary} flex flex-1 items-center justify-center gap-1.5`}
        >
          <IconMessageCircle className="h-4 w-4" />
          Message the organizer
        </button>
        <button onClick={onDone} className={buttonSecondary}>
          Done
        </button>
      </div>
    </div>
  )
}
