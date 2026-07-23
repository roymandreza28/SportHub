import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchUsers, type AdminUser } from '../../lib/adminApi'
import { RoleAssignmentModal } from './RoleAssignmentModal'
import { buttonGhost, input, table, tableCell, tableHeadCell, tableHeadRow, tableRow, tableWrap } from '../../lib/formStyles'

export function UserManagementTable() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => fetchUsers(search),
  })

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Search name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${input} max-w-sm`}
      />

      {isLoading && <p className="text-sm text-slate-500">Loading...</p>}

      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr className={tableHeadRow}>
              <th className={tableHeadCell}>Name</th>
              <th className={tableHeadCell}>Email</th>
              <th className={tableHeadCell}>Roles</th>
              <th className={tableHeadCell} />
            </tr>
          </thead>
          <tbody>
            {data?.data.map((user) => (
              <tr key={user.id} className={tableRow}>
                <td className={`${tableCell} font-medium text-slate-900`}>{user.name}</td>
                <td className={tableCell}>{user.email}</td>
                <td className={tableCell}>
                  {user.roles.length === 0 ? (
                    <span className="text-slate-400">none</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <span key={r.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {r.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className={`${tableCell} text-right`}>
                  <button onClick={() => setEditing(user)} className={buttonGhost}>
                    Edit roles
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <RoleAssignmentModal user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
