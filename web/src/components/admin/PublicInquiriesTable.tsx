import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPublicInquiries, type PublicInquiryRecord } from '../../lib/publicInquiryApi'
import { buttonPrimary } from '../../lib/formStyles'

// Gmail's own inbox date convention: a bare time for anything sent today,
// otherwise "Mon D" (or "Mon D, YYYY" once it's not this year) — never a
// relative "3d ago" style, which is what formatRelativeTime.ts is for
// elsewhere in the app.
function formatInboxDate(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString(undefined, options)
}

// mailto: is the whole mechanism here — there's no in-app send (no real
// SMTP is configured for this app either, see PublicInquiryMail's own
// comment), so "Reply" hands off to whatever mail client the admin's
// browser is registered to open mailto: links with. If that's Gmail, the
// browser opens a Gmail compose draft pre-filled with this; if it's a
// desktop client, that opens instead. Either way, actual delivery happens
// from the admin's own mail account, not from SportHub's backend.
function buildReplyHref(inquiry: PublicInquiryRecord): string {
  const subject = `Re: ${inquiry.topic}`
  const greeting = inquiry.name ? `Hi ${inquiry.name},` : 'Hi,'
  const quoted = inquiry.message
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  const body = `${greeting}\n\n\n\n---\nOn ${new Date(inquiry.created_at).toLocaleString()}, you wrote:\n${quoted}`
  return `mailto:${inquiry.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function StarOutline() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-300">
      <path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.4l-5.4 2.9 1-6-4.4-4.4 6.1-.9L12 3.5Z" />
    </svg>
  )
}

function InquiryRow({ inquiry, expanded, onToggle }: { inquiry: PublicInquiryRecord; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={expanded ? 'bg-teal-50/40' : ''}>
      {/* Single Gmail-style row from sm: up (fixed-width sender column, then
          topic+snippet, then date) — below that, a fixed 160px sender
          column plus a date column left no room for the snippet on a phone
          screen and pushed the row wider than the viewport. Mobile instead
          stacks it into two lines: star + sender + date on top, topic +
          snippet (indented under the sender) below — every piece truncates
          or wraps within the screen's own width instead of forcing it wider. */}
      <button
        onClick={onToggle}
        className="flex w-full min-w-0 flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <StarOutline />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 sm:w-40 sm:flex-none">
            {inquiry.name ?? inquiry.email}
          </span>
          <span className="shrink-0 text-xs text-slate-400 sm:hidden">{formatInboxDate(inquiry.created_at)}</span>
        </div>
        <span className="min-w-0 truncate pl-6 text-sm sm:flex-1 sm:pl-0">
          <span className="font-semibold text-slate-900">{inquiry.topic}</span>
          <span className="text-slate-400"> &mdash; {inquiry.message}</span>
        </span>
        <span className="hidden shrink-0 text-xs text-slate-400 sm:block">{formatInboxDate(inquiry.created_at)}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 sm:pl-11">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold text-slate-900">{inquiry.topic}</p>
              <p className="mt-1 text-sm text-slate-500">
                <span className="font-medium text-slate-700">{inquiry.name ?? 'Not provided'}</span>
                {' '}&lt;{inquiry.email}&gt;
              </p>
            </div>
            <p className="shrink-0 text-xs text-slate-400">{new Date(inquiry.created_at).toLocaleString()}</p>
          </div>

          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-700">{inquiry.message}</p>

          <div className="mt-5">
            <a href={buildReplyHref(inquiry)} className={`${buttonPrimary} inline-flex`}>
              Reply
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// Read-only otherwise — the admin's actual reply is composed and sent from
// their own email account via the Reply button's mailto: link, never
// through SportHub's own backend.
export function PublicInquiriesTable() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'public-inquiries'], queryFn: fetchPublicInquiries })
  const [expandedId, setExpandedId] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
      {!isLoading && data?.length === 0 && <p className="text-sm text-slate-400">No inquiries yet.</p>}
      {!isLoading && (data?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data?.map((inquiry) => (
            <div key={inquiry.id} className="border-b border-slate-100 last:border-0">
              <InquiryRow
                inquiry={inquiry}
                expanded={expandedId === inquiry.id}
                onToggle={() => setExpandedId((current) => (current === inquiry.id ? null : inquiry.id))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
