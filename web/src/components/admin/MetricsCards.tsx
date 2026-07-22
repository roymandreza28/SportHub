import { useQuery } from '@tanstack/react-query'
import { fetchMetrics } from '../../lib/adminApi'

export function MetricsCards() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'metrics'], queryFn: fetchMetrics })

  if (isLoading || !data) return <p className="text-sm text-gray-500">Loading metrics...</p>

  const cards = [
    { label: 'Venues', value: data.total_venues },
    { label: 'Tournaments', value: data.total_tournaments },
    { label: 'Pending venue registrations', value: data.pending_venue_registrations },
    { label: 'Open matchmaking requests', value: data.open_matchmaking_requests },
    { label: 'Live matches', value: data.live_matches },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded border p-3">
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-gray-600">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded border p-3">
        <div className="mb-1 text-xs font-medium text-gray-600">Users by role</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.users_by_role).map(([role, count]) => (
            <span key={role} className="rounded bg-gray-100 px-2 py-1 text-xs">
              {role}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
