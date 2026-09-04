import { useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { buttonPrimary, fieldGroup, input, label } from '../../lib/formStyles'

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className={fieldGroup}>
        <label className={label} htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          required
        />
      </div>
      <div className={fieldGroup}>
        <label className={label} htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={isSubmitting} className={`${buttonPrimary} justify-center py-2.5`}>
        {isSubmitting ? 'Logging in...' : 'Log in'}
      </button>
      {onSwitchToRegister && (
        <p className="text-center text-sm text-slate-600">
          No account?{' '}
          <button type="button" onClick={onSwitchToRegister} className="font-medium text-teal-600 hover:underline">
            Register
          </button>
        </p>
      )}
    </form>
  )
}
