import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMetrics } from '../../lib/adminApi'
import { echo } from '../../lib/echo'

export function useAdminMetrics() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['admin', 'metrics'], queryFn: fetchMetrics })

  // Nudges a refetch whenever a metric-affecting action happens elsewhere
  // (e.g. a facilitator or venue is created) instead of waiting on a poll.
  useEffect(() => {
    const channel = echo.private('admin.monitoring')
    channel.listen('.SystemMetricUpdated', () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] })
    )

    return () => {
      echo.leave('admin.monitoring')
    }
  }, [queryClient])

  return query
}
