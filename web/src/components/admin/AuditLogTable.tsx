import { useQuery } from '@tanstack/react-query'
import { fetchAuditLog } from '../../lib/adminApi'
import { table, tableCell, tableHeadCell, tableHeadRow, tableRow, tableWrap } from '../../lib/formStyles'

export function AuditLogTable() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'audit-log'], queryFn: fetchAuditLog })

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr className={tableHeadRow}>
              <th className={tableHeadCell}>When</th>
              <th className={tableHeadCell}>Actor</th>
              <th className={tableHeadCell}>Action</th>
              <th className={tableHeadCell}>Subject</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((entry) => (
              <tr key={entry.id} className={tableRow}>
                <td className={`${tableCell} whitespace-nowrap text-slate-500`}>
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className={`${tableCell} font-medium text-slate-900`}>{entry.actor?.name ?? 'system'}</td>
                <td className={tableCell}>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{entry.action}</code>
                </td>
                <td className={tableCell}>
                  {entry.subject_type ? `${entry.subject_type.split('\\').pop()} #${entry.subject_id}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
