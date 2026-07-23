import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFacilitator } from '../../lib/adminApi'
import { buttonPrimary, fieldGroup, input, label } from '../../lib/formStyles'

export function FacilitatorCreateForm() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createFacilitator,
    onSuccess: () => {
      setName('')
      setEmail('')
      setPassword('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-log'] })
    },
    onError: () => setError('Could not create facilitator. Check the details and try again.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({ name, email, password })
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <div className={fieldGroup}>
        <label className={label} htmlFor="facilitator-name">Name</label>
        <input
          id="facilitator-name"
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
          required
        />
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="facilitator-email">Email</label>
        <input
          id="facilitator-email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          required
        />
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="facilitator-password">Temporary password</label>
        <input
          id="facilitator-password"
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
        {mutation.isPending ? 'Creating...' : 'Create facilitator'}
      </button>
    </form>
  )
}
