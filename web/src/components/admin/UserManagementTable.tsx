import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchUsers, type AdminUser } from '../../lib/adminApi'
import { RoleAssignmentModal } from './RoleAssignmentModal'

export function UserManagementTable() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => fetchUsers(search),
  })

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Users</h3>
        <input
          type="text"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-600">
            <th className="py-1">Name</th>
            <th className="py-1">Email</th>
            <th className="py-1">Roles</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {data?.data.map((user) => (
            <tr key={user.id} className="border-b last:border-0">
              <td className="py-1">{user.name}</td>
              <td className="py-1">{user.email}</td>
              <td className="py-1">{user.roles.map((r) => r.name).join(', ') || 'none'}</td>
              <td className="py-1 text-right">
                <button onClick={() => setEditing(user)} className="text-xs text-indigo-600">
                  Edit roles
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && <RoleAssignmentModal user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
