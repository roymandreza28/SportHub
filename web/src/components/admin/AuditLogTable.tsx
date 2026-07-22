import { useQuery } from '@tanstack/react-query'
import { fetchAuditLog } from '../../lib/adminApi'

export function AuditLogTable() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'audit-log'], queryFn: fetchAuditLog })

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Audit log</h3>
      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-gray-600">
            <th className="py-1">When</th>
            <th className="py-1">Actor</th>
            <th className="py-1">Action</th>
            <th className="py-1">Subject</th>
          </tr>
        </thead>
        <tbody>
          {data?.data.map((entry) => (
            <tr key={entry.id} className="border-b text-xs last:border-0">
              <td className="py-1">{new Date(entry.created_at).toLocaleString()}</td>
              <td className="py-1">{entry.actor?.name ?? 'system'}</td>
              <td className="py-1">{entry.action}</td>
              <td className="py-1">
                {entry.subject_type ? `${entry.subject_type.split('\\').pop()} #${entry.subject_id}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
