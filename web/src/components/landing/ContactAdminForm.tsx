import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { submitPublicInquiry, INQUIRY_TOPICS, type InquiryTopic } from '../../lib/publicInquiryApi'
import { extractErrorMessage, extractFieldErrors } from '../../lib/errors'
import { buttonPrimary, fieldGroup, input, label, select, textarea } from '../../lib/formStyles'

// The landing page's "FAQ" section — a fully anonymous visitor reaching the
// admin directly, email-style: pick a topic, leave an email, write the
// message. There's no account and no in-app inbox on this side, so the
// email address is the only way the admin can reply — see
// PublicInquiryController/PublicInquiryMail on the backend for how that
// reply-to actually gets wired up.
export function ContactAdminForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<InquiryTopic | ''>('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => submitPublicInquiry({ name: name || undefined, email, topic: topic as InquiryTopic, message }),
    onSuccess: () => {
      setFieldErrors({})
      setGeneralError(null)
    },
    onError: (err) => {
      const fields = extractFieldErrors(err)
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields)
        setGeneralError(null)
      } else {
        setFieldErrors({})
        setGeneralError(extractErrorMessage(err))
      }
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setGeneralError(null)
    mutation.mutate()
  }

  if (mutation.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="m5 13 4 4 10-10" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-900">Message sent</h3>
        <p className="max-w-sm text-sm text-slate-500">{mutation.data?.message}</p>
        <button
          onClick={() => {
            mutation.reset()
            setName('')
            setEmail('')
            setTopic('')
            setMessage('')
          }}
          className="mt-2 text-sm font-medium text-teal-600 hover:underline"
        >
          Send another message
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label} htmlFor="inquiry-name">Name (optional)</label>
          <input id="inquiry-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="inquiry-email">Your email</label>
          <input
            id="inquiry-email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>
      </div>

      <div className={fieldGroup}>
        <label className={label} htmlFor="inquiry-topic">Topic</label>
        <select
          id="inquiry-topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value as InquiryTopic)}
          className={select}
        >
          <option value="" disabled>Choose a topic...</option>
          {INQUIRY_TOPICS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {fieldErrors.topic && <p className="mt-1 text-xs text-red-600">{fieldErrors.topic}</p>}
      </div>

      <div className={fieldGroup}>
        <label className={label} htmlFor="inquiry-message">Message</label>
        <textarea
          id="inquiry-message"
          required
          rows={5}
          placeholder="Tell us what's going on..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={textarea}
        />
        {fieldErrors.message && <p className="mt-1 text-xs text-red-600">{fieldErrors.message}</p>}
      </div>

      {generalError && <p className="text-sm text-red-600">{generalError}</p>}

      <button type="submit" disabled={mutation.isPending} className={`${buttonPrimary} justify-center py-2.5`}>
        {mutation.isPending ? 'Sending...' : 'Send message'}
      </button>
      <p className="text-center text-xs text-slate-400">
        We&apos;ll reply directly to the email address you provide above &mdash; no account needed.
      </p>
    </form>
  )
}
