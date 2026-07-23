import { useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/AuthContext'

export function LoginForm({
  onSuccess,
  onSwitchToRegister,
}: {
  onSuccess: () => void
  onSwitchToRegister?: () => void
}) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
      onSuccess()
    } catch {
      setError('Invalid credentials.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded border px-3 py-2"
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border px-3 py-2"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Logging in...' : 'Log in'}
      </button>
      {onSwitchToRegister && (
        <p className="text-center text-sm text-slate-600">
          No account?{' '}
          <button type="button" onClick={onSwitchToRegister} className="text-indigo-600 hover:underline">
            Register
          </button>
        </p>
      )}
    </form>
  )
}
