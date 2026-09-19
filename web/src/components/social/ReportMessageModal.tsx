import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { reportMessage } from '../../lib/chatApi'
import { buttonPrimary, buttonSecondary, textarea } from '../../lib/formStyles'
import { IconX } from '../layout/icons'

// Same "no separate admin moderation inbox" rationale as
// ReportConversationModal — posts into the caller's own Contact Admin
// thread, quoting the specific message (see
// ConversationMessageController::report()).
export function ReportMessageModal({
  conversationId,
  messageId,
  onClose,
}: {
  conversationId: number
  messageId: number
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: () => reportMessage(conversationId, messageId, reason.trim()),
    onSuccess: () => setSubmitted(true),
  })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex w-full max-w-sm flex-col rounded-xl bg-white p-6 shadow-2xl">
        {submitted ? (
          <>
            <h2 className="text-lg font-bold text-slate-900">Report sent</h2>
            <p className="mt-2 text-sm text-slate-600">
              Thanks — our support team will review this message and follow up in your admin chat thread if needed.
            </p>
            <button onClick={onClose} className={`${buttonPrimary} mt-5 self-end`}>
              Done
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">Report this message</h2>
              <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Tell us what's wrong. This gets sent to our support team as a message in your admin chat.
            </p>
            <textarea
              autoFocus
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What happened?"
              className={`${textarea} mt-4`}
            />
            {mutation.isError && <p className="mt-2 text-xs text-red-600">Something went wrong — please try again.</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className={buttonSecondary}>
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!reason.trim() || mutation.isPending}
                className={buttonPrimary}
              >
                {mutation.isPending ? 'Sending...' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
