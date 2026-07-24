import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { deleteUser, updateUserPassword, updateUserStatus, type AdminUser } from '../../lib/adminApi'
import { buttonDanger, buttonPrimary, buttonSecondary, fieldGroup, input, label } from '../../lib/formStyles'

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return 'Something went wrong. Please try again.'
}

export function UserActionsModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function invalidateAndClose() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'audit-log'] })
    onClose()
  }

  const passwordMutation = useMutation({
    mutationFn: () => updateUserPassword(user.id, password),
    onSuccess: () => {
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-log'] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: () => updateUserStatus(user.id, !user.is_active),
    onSuccess: invalidateAndClose,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: invalidateAndClose,
  })

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Manage {user.name}</h3>
        <p className="mt-1 text-xs text-slate-500">{user.email}</p>

        <div className="mt-4 flex flex-col gap-4">
          <div className={fieldGroup}>
            <label className={label}>Change password</label>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
              <button
                onClick={() => passwordMutation.mutate()}
                disabled={password.length < 8 || passwordMutation.isPending}
                className={buttonSecondary}
              >
                {passwordMutation.isPending ? 'Saving...' : 'Update'}
              </button>
            </div>
            {passwordMutation.isError && (
              <p className="text-xs text-red-600">{extractErrorMessage(passwordMutation.error)}</p>
            )}
            {passwordMutation.isSuccess && <p className="text-xs text-green-700">Password updated.</p>}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-4">
            <label className={label}>Account status</label>
            <button
              onClick={() => statusMutation.mutate()}
              disabled={statusMutation.isPending}
              className={user.is_active ? buttonDanger : buttonPrimary}
            >
              {statusMutation.isPending ? 'Saving...' : user.is_active ? 'Deactivate account' : 'Activate account'}
            </button>
            {statusMutation.isError && (
              <p className="text-xs text-red-600">{extractErrorMessage(statusMutation.error)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-4">
            <label className={label}>Danger zone</label>
            {!confirmingDelete ? (
              <button onClick={() => setConfirmingDelete(true)} className={buttonDanger}>
                Delete account
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg bg-red-50 p-3">
                <p className="text-xs text-red-700">
                  This permanently removes {user.name} from the active user list. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingDelete(false)} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className={buttonDanger}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Yes, delete'}
                  </button>
                </div>
              </div>
            )}
            {deleteMutation.isError && (
              <p className="text-xs text-red-600">{extractErrorMessage(deleteMutation.error)}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
