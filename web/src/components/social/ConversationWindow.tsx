import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchMessages, sendMessage, type ConversationMessageItem, type ConversationSummary } from '../../lib/chatApi'
import { useAuth } from '../../lib/AuthContext'
import { formatRelativeTime } from '../../lib/formatRelativeTime'
import { input, textarea, buttonPrimary } from '../../lib/formStyles'
import { IconImage, IconX } from '../layout/icons'

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
function AdminSupportComposer({ conversationId, messages }: { conversationId: number; messages: ConversationMessageItem[] }) {
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
            id={`admin-attachment-input-${conversationId}`}
          />
          <label
            htmlFor={`admin-attachment-input-${conversationId}`}
            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <IconImage className="h-4 w-4" /> Attach a photo
          </label>
          <button type="submit" disabled={mutation.isPending || (!body.trim() && !attachment)} className={buttonPrimary}>
            {mutation.isPending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AdminChatThread({
  conversationId,
  messages,
  adminParticipantId,
}: {
  conversationId: number
  messages: ConversationMessageItem[]
  adminParticipantId: number | undefined
}) {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {messages.map((m) => (
          <div key={m.id} className={m.user.id === user?.id ? 'text-right' : ''}>
            <span
              className={`inline-block max-w-[80%] rounded-lg px-3 py-1.5 text-left ${
                m.user.id === user?.id ? 'bg-teal-600 text-pure-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {m.user.id !== user?.id && (
                <strong className="mr-1.5 block text-xs font-semibold opacity-70">
                  {m.user.id === adminParticipantId ? 'admin-name' : m.user.name}
                </strong>
              )}
              {m.attachment_url && (
                <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mb-1 block">
                  <img src={m.attachment_url} alt="Attachment" className="max-h-48 rounded-md" />
                </a>
              )}
              {m.body}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 border-t border-slate-100 p-2">
        {attachment && <AttachmentPreview file={attachment} onRemove={() => setAttachment(null)} />}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            className="hidden"
            id={`attachment-input-${conversationId}`}
          />
          <label
            htmlFor={`attachment-input-${conversationId}`}
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

  if (adminParticipant && !adminHasReplied) {
    return <AdminSupportComposer conversationId={conversationId} messages={messages} />
  }

  return <AdminChatThread conversationId={conversationId} messages={messages} adminParticipantId={adminParticipant?.id} />
}
