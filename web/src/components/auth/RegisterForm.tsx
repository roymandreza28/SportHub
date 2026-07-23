import { useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/AuthContext'

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
}: {
  onSuccess: () => void
  onSwitchToLogin?: () => void
}) {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await register(name, email, password, passwordConfirmation)
      onSuccess()
    } catch {
      setError('Registration failed. Check your details.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border px-3 py-2"
        required
      />
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
      <input
        type="password"
        placeholder="Confirm password"
        value={passwordConfirmation}
        onChange={(e) => setPasswordConfirmation(e.target.value)}
        className="rounded border px-3 py-2"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Registering...' : 'Register'}
      </button>
      {onSwitchToLogin && (
        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="text-indigo-600 hover:underline">
            Log in
          </button>
        </p>
      )}
    </form>
  )
}
