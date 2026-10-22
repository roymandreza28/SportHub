import { useState, type FormEvent } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { api } from '../../lib/api'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label } from '../../lib/formStyles'

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
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetStatus, setResetStatus] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [isSendingReset, setIsSendingReset] = useState(false)

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

  async function handleForgotPassword() {
    const trimmed = resetEmail.trim()
    setResetError(null)
    setResetStatus(null)

    if (!trimmed) {
      setResetError('Please enter the email address associated with your account.')
      return
    }

    setIsSendingReset(true)
    try {
      await api.post('/api/password/forgot', { email: trimmed })
      setResetStatus('Password reset instructions have been sent to your email.')
      setResetEmail('')
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { message?: string; errors?: { email?: string[] } } } }).response?.data?.message
          ?? (requestError as { response?: { data?: { errors?: { email?: string[] } } } }).response?.data?.errors?.email?.[0]
        : null
      setResetError(message ?? 'We could not send a reset link for that email. Please try again.')
    } finally {
      setIsSendingReset(false)
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

      {!showForgotPassword ? (
        <button
          type="button"
          onClick={() => {
            setShowForgotPassword(true)
            setResetError(null)
            setResetStatus(null)
          }}
          className="text-left text-sm font-medium text-teal-600 hover:underline"
        >
          Forgot password?
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className={fieldGroup}>
            <label className={label} htmlFor="forgot-email">Reset email</label>
            <input
              id="forgot-email"
              type="email"
              placeholder="Enter your email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className={input}
            />
          </div>
          {resetError && <p className="text-sm text-red-600">{resetError}</p>}
          {resetStatus && <p className="text-sm text-green-600">{resetStatus}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleForgotPassword} disabled={isSendingReset} className={`${buttonSecondary} flex-1 justify-center`}>
              {isSendingReset ? 'Sending...' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false)
                setResetEmail('')
                setResetError(null)
                setResetStatus(null)
              }}
              className="text-sm font-medium text-slate-600 hover:underline"
            >
              Back
            </button>
          </div>
        </div>
      )}

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
