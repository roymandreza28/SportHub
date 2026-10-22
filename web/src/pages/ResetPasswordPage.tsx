import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { buttonPrimary, fieldGroup, input, label } from '../lib/formStyles'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!token || !email) {
      setError('This password reset link is invalid or expired.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('/api/password/reset', {
        token,
        email,
        password,
        password_confirmation: confirmPassword,
      })
      setIsSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { message?: string; errors?: { email?: string[] } } } }).response?.data?.message
          ?? (requestError as { response?: { data?: { errors?: { email?: string[] } } } }).response?.data?.errors?.email?.[0]
        : null
      setError(message ?? 'We could not reset your password. Please request a new link and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Password reset</h1>
        <p className="text-sm text-slate-600">Your password has been reset successfully. Redirecting to login…</p>
        <Link to="/login" className="text-sm font-medium text-teal-600 hover:underline">Go to login</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className={fieldGroup}>
          <label className={label} htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
            required
          />
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="reset-confirm-password">Confirm password</label>
          <input
            id="reset-confirm-password"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={input}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={isSubmitting} className={`${buttonPrimary} justify-center py-2.5`}>
          {isSubmitting ? 'Resetting...' : 'Reset password'}
        </button>
      </form>
      <p className="text-sm text-slate-600">
        Remembered it? <Link to="/login" className="font-medium text-teal-600 hover:underline">Log in</Link>
      </p>
    </div>
  )
}
