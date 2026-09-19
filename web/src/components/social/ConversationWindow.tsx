import { useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchMessages, sendMessage, type ConversationMessageItem, type ConversationSummary } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { formatRelativeTime } from '../../lib/formatRelativeTime'
import { input, textarea, buttonPrimary } from '../../lib/formStyles'
import { IconCornerUpLeft, IconImage, IconPin, IconX } from '../layout/icons'
import { MessageRowMenu } from './MessageRowMenu'

function AttachmentPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
      <IconImage className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <button type="button" onClick={onRemove} aria-label="Remove attachment" className="shrink-0 text-slate-400 hover:text-slate-600">
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// A brand-new FAQ thread (no admin reply yet) reads like a support-ticket
// email rather than a live chat — a "To: Support" header, a multi-line
// composer instead of a one-line input, and any messages already sent sit
// in a plain stacked list rather than colored bubbles, since there's no
// back-and-forth to visually separate yet. The moment the admin replies,
// AdminChatThread below takes over permanently for this conversation.
function AdminSupportComposer({
  conversationId,
  messages,
  blocked,
}: {
  conversationId: number
  messages: ConversationMessageItem[]
  blocked: boolean
}) {
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Unique per mounted instance (not derived from conversationId) — the
  // SAME conversation can have two ConversationWindows mounted at once
  // (FloatingChatWindows renders both a mobile full-screen variant and a
  // desktop corner-stack variant simultaneously, toggling which is visible
  // via CSS breakpoints rather than only mounting one). A conversationId-
  // based id collided across both instances, so `<label for>` always
  // resolved to whichever instance's input came first in the DOM — often
  // the CSS-hidden one — meaning the visible attach button silently picked
  // a file nobody could see land anywhere, and Send stayed disabled.
  const attachmentInputId = useId()

  const mutation = useMutation({
    mutationFn: () => sendMessage(conversationId, body, attachment ?? undefined),
    onSuccess: () => {
      setBody('')
      setAttachment(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (body.trim() || attachment) mutation.mutate()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
          <span className="font-semibold text-slate-500">To:</span> <span className="text-slate-700">Support</span>
        </div>

        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">
            Send a message describing your issue — a member of our support team will reply here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div key={m.id} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="text-xs font-semibold text-slate-500">You &middot; {formatRelativeTime(m.created_at)}</p>
                {m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mt-1.5 block">
                    <img src={m.attachment_url} alt="Attachment" className="max-h-40 rounded-md" />
                  </a>
                )}
                {m.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{m.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {blocked ? (
        <p className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
          You can't send messages in this conversation.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-slate-100 p-3">
          {attachment && <AttachmentPreview file={attachment} onRemove={() => setAttachment(null)} />}
          <textarea
            placeholder="Describe your issue..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className={textarea}
          />
          <div className="flex items-center justify-between gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="hidden"
              id={attachmentInputId}
            />
            <label
              htmlFor={attachmentInputId}
              className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <IconImage className="h-4 w-4" /> Attach a photo
            </label>
            <button type="submit" disabled={mutation.isPending || (!body.trim() && !attachment)} className={buttonPrimary}>
              {mutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// A small quoted-message preview — used both for the reply banner above the
// composer (while composing a reply) and inline inside a bubble that has a
// reply_to or forwarded_from. A removed original just says so instead of
// showing stale content, since the server clears body/attachment_path the
// moment it's removed.
function QuotePreview({ label, name, quote }: { label?: string; name: string; quote: ConversationMessageItem['reply_to'] }) {
  if (!quote) {
    return <p className="truncate text-xs italic opacity-70">{label ?? 'Original message unavailable'}</p>
  }
  return (
    <p className="truncate text-xs opacity-70">
      {label ? <span className="font-semibold">{label} </span> : null}
      <span className="font-semibold">{name}: </span>
      {quote.removed_at ? <span className="italic">Original message unavailable</span> : quote.body || (quote.attachment_url ? '[photo]' : '')}
    </p>
  )
}

function AdminChatThread({
  conversationId,
  messages,
  adminParticipantId,
  blocked,
}: {
  conversationId: number
  messages: ConversationMessageItem[]
  adminParticipantId: number | undefined
  blocked: boolean
}) {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [replyTo, setReplyTo] = useState<ConversationMessageItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // See AdminSupportComposer's own comment on this — a conversationId-based
  // id collided across the two ConversationWindow instances FloatingChatWindows
  // keeps simultaneously mounted (mobile full-screen + desktop corner-stack).
  const attachmentInputId = useId()

  const mutation = useMutation({
    mutationFn: () => sendMessage(conversationId, body, attachment ?? undefined, replyTo?.id),
    onSuccess: () => {
      setBody('')
      setAttachment(null)
      setReplyTo(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (body.trim() || attachment) mutation.mutate()
  }

  function nameFor(u: { id: number; name: string }) {
    return u.id === adminParticipantId ? 'admin-name' : u.name
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.map((m) => {
          const isOwn = m.user.id === user?.id
          return (
            <div key={m.id} className={`group flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
              <div className={`max-w-[80%] ${isOwn ? 'text-right' : ''}`}>
                {m.removed_at ? (
                  <span className="inline-block rounded-lg bg-slate-50 px-3 py-1.5 text-left text-xs italic text-slate-400">
                    {isOwn ? 'You removed a message' : `${nameFor(m.user)} removed a message`}
                  </span>
                ) : (
                  <span
                    className={`inline-block rounded-lg px-3 py-1.5 text-left ${
                      isOwn ? 'bg-teal-600 text-pure-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {!isOwn && (
                      <strong className="mr-1.5 block text-xs font-semibold opacity-70">{nameFor(m.user)}</strong>
                    )}
                    {m.pinned_at && (
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                        <IconPin className="h-3 w-3" /> Pinned
                      </span>
                    )}
                    {m.forwarded_from && (
                      <span className="mb-1 flex items-center gap-1 text-[11px] italic opacity-70">
                        <IconCornerUpLeft className="h-3 w-3 scale-x-[-1]" /> Forwarded
                      </span>
                    )}
                    {m.reply_to && (
                      <span className={`mb-1 block rounded border-l-2 pl-1.5 ${isOwn ? 'border-white/40' : 'border-slate-300'}`}>
                        <QuotePreview
                          name={m.reply_to.user.id === user?.id ? 'You' : nameFor(m.reply_to.user)}
                          quote={m.reply_to}
                        />
                      </span>
                    )}
                    {m.attachment_url && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mb-1 block">
                        <img src={m.attachment_url} alt="Attachment" className="max-h-48 rounded-md" />
                      </a>
                    )}
                    {m.body}
                  </span>
                )}
              </div>
              {!m.removed_at && (
                <MessageRowMenu
                  conversationId={conversationId}
                  message={m}
                  isOwn={isOwn}
                  align={isOwn ? 'right' : 'left'}
                  onReply={setReplyTo}
                />
              )}
            </div>
          )
        })}
      </div>
      {blocked ? (
        <p className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
          You can't send messages in this conversation.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 border-t border-slate-100 p-2">
          {replyTo && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
              <IconCornerUpLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <QuotePreview
                  label="Replying to"
                  name={replyTo.user.id === user?.id ? 'yourself' : nameFor(replyTo.user)}
                  quote={replyTo}
                />
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {attachment && <AttachmentPreview file={attachment} onRemove={() => setAttachment(null)} />}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="hidden"
              id={attachmentInputId}
            />
            <label
              htmlFor={attachmentInputId}
              aria-label="Attach a photo"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"
            >
              <IconImage className="h-4 w-4" />
            </label>
            <input
              type="text"
              placeholder="Type a message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={`${input} flex-1`}
            />
            <button
              type="submit"
              disabled={mutation.isPending || (!body.trim() && !attachment)}
              className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-pure-white hover:bg-teal-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export function ConversationWindow({ conversation }: { conversation: ConversationSummary }) {
  const conversationId = conversation.id
  const { user } = useAuth()

  // No socket subscription here — GlobalChatListener owns the single
  // subscription per conversation and keeps this query's cache fresh, so
  // every open surface (a floating window, a future re-render) just reads it.
  const { data: history } = useQuery({
    queryKey: ['social', 'messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
  })

  const messages = history?.data ?? []
  // The *other* participant, not just "whoever is flagged is_admin" — an
  // admin viewing their own FAQ inbox also carries is_admin: true, and
  // without excluding the current viewer here they'd see the email
  // composer meant for the person asking them for help, not themselves.
  const otherParticipant = conversation.participants.find((p) => p.id !== user?.id)
  const adminParticipant = otherParticipant?.is_admin ? otherParticipant : undefined
  const adminHasReplied = adminParticipant ? messages.some((m) => m.user.id === adminParticipant.id) : false

  const blocked = !!conversation.pivot.blocked_at

  if (adminParticipant && !adminHasReplied) {
    return <AdminSupportComposer conversationId={conversationId} messages={messages} blocked={blocked} />
  }

  return (
    <AdminChatThread conversationId={conversationId} messages={messages} adminParticipantId={adminParticipant?.id} blocked={blocked} />
  )
}
