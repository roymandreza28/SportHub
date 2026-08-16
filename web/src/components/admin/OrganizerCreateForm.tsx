import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createOrganizer, type OrganizerType } from '../../lib/adminApi'
import { buttonPrimary, fieldGroup, input, label, select } from '../../lib/formStyles'

const ORGANIZER_TYPES: { value: OrganizerType; label: string; description: string }[] = [
  {
    value: 'main',
    label: 'Main organizer',
    description: 'Full access — create tournaments, generate brackets, manage news and livestreams.',
  },
  {
    value: 'venue',
    label: 'Venue organizer',
    description: 'Runs the live scoreboard courtside — scores, fouls, and timeouts for any ongoing tournament.',
  },
  {
    value: 'livestream',
    label: 'Livestream organizer',
    description: 'Feeds camera footage into the livestream platform for any tournament.',
  },
]

export function OrganizerCreateForm() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [type, setType] = useState<OrganizerType>('main')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createOrganizer,
    onSuccess: () => {
      setName('')
      setEmail('')
      setPassword('')
      setType('main')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-log'] })
    },
    onError: () => setError('Could not create organizer account. Check the details and try again.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({ name, email, password, type })
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <div className={fieldGroup}>
        <label className={label} htmlFor="organizer-type">Account type</label>
        <select
          id="organizer-type"
          value={type}
          onChange={(e) => setType(e.target.value as OrganizerType)}
          className={select}
        >
          {ORGANIZER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          {ORGANIZER_TYPES.find((t) => t.value === type)?.description}
        </p>
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="organizer-name">Name</label>
        <input
          id="organizer-name"
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
          required
        />
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="organizer-email">Email</label>
        <input
          id="organizer-email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          required
        />
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="organizer-password">Temporary password</label>
        <input
          id="organizer-password"
          type="password"
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={mutation.isPending} className={`${buttonPrimary} self-start`}>
        {mutation.isPending ? 'Creating...' : 'Create organizer'}
      </button>
    </form>
  )
}
