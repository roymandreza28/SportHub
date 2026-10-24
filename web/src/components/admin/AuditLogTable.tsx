import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLog } from '../../lib/adminApi'
import { table, tableCell, tableHeadCell, tableHeadRow, tableRow, tableWrap } from '../../lib/formStyles'

export function AuditLogTable() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [applied, setApplied] = useState({ from: '', to: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', applied],
    queryFn: () => fetchAuditLog(applied),
  })

  function applyFilters() {
    setApplied({ from, to })
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setApplied({ from: '', to: '' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          From
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-0 transition focus:border-sky-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          To
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-0 transition focus:border-sky-500"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Clear
          </button>
        </div>
      </div>

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
