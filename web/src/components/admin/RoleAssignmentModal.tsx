import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateUserRoles, type AdminUser } from '../../lib/adminApi'
import type { Role } from '../../lib/AuthContext'
import { buttonPrimary, buttonSecondary } from '../../lib/formStyles'

const ALL_ROLES: Role[] = ['admin', 'organizer', 'venue_facilitator', 'player', 'coach']

export function RoleAssignmentModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<Role>>(new Set(user.roles.map((r) => r.name)))

  const mutation = useMutation({
    mutationFn: () => updateUserRoles(user.id, Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-log'] })
      onClose()
    },
  })

  function toggle(role: Role) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-xs rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Roles for {user.name}</h3>
        <p className="mt-1 text-xs text-slate-500">Select every role this account should have.</p>
        <div className="mt-4 flex flex-col gap-2">
          {ALL_ROLES.map((role) => (
            <label
              key={role}
              className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2 text-sm font-medium capitalize text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(role)}
                onChange={() => toggle(role)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              {role.replace('_', ' ')}
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className={buttonPrimary}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
