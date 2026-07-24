import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useAuth } from '../../lib/AuthContext'
import { updateOwnPassword } from '../../lib/accountApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label } from '../../lib/formStyles'

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined
    const firstFieldError = data?.errors && Object.values(data.errors)[0]?.[0]
    if (firstFieldError) return firstFieldError
    if (data?.message) return data.message
  }
  return 'Something went wrong. Please try again.'
}

export function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => updateOwnPassword(currentPassword, password),
    onSuccess: () => {
      setCurrentPassword('')
      setPassword('')
    },
  })

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Account settings</h3>
        <p className="mt-1 text-xs text-slate-500">{user?.name} — {user?.email}</p>

        <div className="mt-4 flex flex-col gap-3">
          <div className={fieldGroup}>
            <label className={label}>Current password</label>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={input}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>New password</label>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </div>

          {mutation.isError && <p className="text-xs text-red-600">{extractErrorMessage(mutation.error)}</p>}
          {mutation.isSuccess && <p className="text-xs text-green-700">Password updated.</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!currentPassword || password.length < 8 || mutation.isPending}
            className={buttonPrimary}
          >
            {mutation.isPending ? 'Saving...' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  )
}
