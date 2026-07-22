import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateUserRoles, type AdminUser } from '../../lib/adminApi'
import type { Role } from '../../lib/AuthContext'

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
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-72 rounded bg-white p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-medium">Roles for {user.name}</h3>
        <div className="flex flex-col gap-2">
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.has(role)} onChange={() => toggle(role)} />
              {role}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
