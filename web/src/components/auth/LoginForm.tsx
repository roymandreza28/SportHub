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
  const [lastPassword, setLastPassword] = useState('')
  const [resetStatus, setResetStatus] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [isCheckingAccount, setIsCheckingAccount] = useState(false)
  const [isSendingResetRequest, setIsSendingResetRequest] = useState(false)
  const [accountFound, setAccountFound] = useState(false)

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

  async function handleCheckAccount() {
    const trimmedEmail = resetEmail.trim()
    setResetError(null)
    setResetStatus(null)

    if (!trimmedEmail) {
      setResetError('Please enter your registered email.')
      return
    }

    setIsCheckingAccount(true)
    try {
      const { data } = await api.post<{ found: boolean; message: string }>('/api/password/forgot', { email: trimmedEmail })
      setAccountFound(Boolean(data.found))
      setResetStatus(data.message)
      setResetError(null)
      if (!data.found) {
        setResetStatus('No account is found.')
      }
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { message?: string; errors?: { email?: string[] } } } }).response?.data?.errors?.email?.[0]
          ?? (requestError as { response?: { data?: { message?: string } } }).response?.data?.message
        : null
      setAccountFound(false)
      setResetStatus(null)
      setResetError(message ?? 'No account is found.')
    } finally {
      setIsCheckingAccount(false)
    }
  }

  async function handleResetRequest() {
    const trimmedEmail = resetEmail.trim()
    const trimmedLastPassword = lastPassword.trim()

    setResetError(null)
    setResetStatus(null)

    if (!trimmedEmail) {
      setResetError('Please enter your registered email.')
      return
    }

    if (!trimmedLastPassword) {
      setResetError('Please enter the last password you remember.')
      return
    }

    setIsSendingResetRequest(true)
    try {
      const { data } = await api.post<{ message: string }>('/api/password/request-reset', {
        email: trimmedEmail,
        last_password: trimmedLastPassword,
      })
      setResetStatus(data.message)
      setLastPassword('')
      setAccountFound(false)
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { message?: string; errors?: { email?: string[]; last_password?: string[] } } } }).response?.data?.message
          ?? (requestError as { response?: { data?: { errors?: { email?: string[]; last_password?: string[] } } } }).response?.data?.errors?.email?.[0]
          ?? (requestError as { response?: { data?: { errors?: { last_password?: string[] } } } }).response?.data?.errors?.last_password?.[0]
        : null
      setResetError(message ?? 'We could not submit your reset request. Please try again.')
    } finally {
      setIsSendingResetRequest(false)
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
            setAccountFound(false)
            setLastPassword('')
          }}
          className="text-left text-sm font-medium text-teal-600 hover:underline"
        >
          Forgot password?
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className={fieldGroup}>
            <label className={label} htmlFor="forgot-email">Registered email</label>
            <input
              id="forgot-email"
              type="email"
              placeholder="Enter your registered email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className={input}
            />
          </div>

          {resetError && <p className="text-sm text-red-600">{resetError}</p>}
          {resetStatus && <p className="text-sm text-green-600">{resetStatus}</p>}

          {accountFound && (
            <div className={fieldGroup}>
              <label className={label} htmlFor="last-password">Last password you remember</label>
              <input
                id="last-password"
                type="password"
                placeholder="Enter the last password you remember"
                value={lastPassword}
                onChange={(e) => setLastPassword(e.target.value)}
                className={input}
              />
            </div>
          )}

          <div className="flex gap-2">
            {!accountFound ? (
              <button type="button" onClick={handleCheckAccount} disabled={isCheckingAccount} className={`${buttonSecondary} flex-1 justify-center`}>
                {isCheckingAccount ? 'Checking...' : 'Check account'}
              </button>
            ) : (
              <button type="button" onClick={handleResetRequest} disabled={isSendingResetRequest} className={`${buttonSecondary} flex-1 justify-center`}>
                {isSendingResetRequest ? 'Sending...' : 'Send reset request'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false)
                setResetEmail('')
                setLastPassword('')
                setResetError(null)
                setResetStatus(null)
                setAccountFound(false)
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
