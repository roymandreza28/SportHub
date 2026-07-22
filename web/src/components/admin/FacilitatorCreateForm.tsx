import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFacilitator } from '../../lib/adminApi'

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Create facilitator account</h3>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        required
      />
      <input
        type="password"
        placeholder="Temporary password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        required
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Creating...' : 'Create facilitator'}
      </button>
    </form>
  )
}
