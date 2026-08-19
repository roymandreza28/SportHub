import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMyUpcomingStatSheetMatches } from '../../lib/coachApi'
import { StatSheetModal } from './StatSheetModal'

const TEN_MINUTES_MS = 10 * 60 * 1000

// Auto-pops a coach's stat sheet ~10 minutes before their team's/player's
// tournament match, across every sport StatSheetFieldSets supports (see
// api/app/Support/StatSheetFieldSets.php). No production scheduler runs
// (see api/routes/console.php), so this is a live client-side poll rather
// than a server push — mounted once at the top of CoachPage so it fires
// regardless of which tab is open.
export function StatSheetTrigger() {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [openMatchId, setOpenMatchId] = useState<number | null>(null)

  const { data: upcoming } = useQuery({
    queryKey: ['coach', 'matches', 'upcoming-stat-sheets'],
    queryFn: fetchMyUpcomingStatSheetMatches,
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (!upcoming || openMatchId !== null) return

    const now = Date.now()
    const due = upcoming.find((m) => {
      if (dismissed.has(m.match_id) || !m.scheduled_at) return false
      const diff = new Date(m.scheduled_at).getTime() - now
      return diff <= TEN_MINUTES_MS && diff > -TEN_MINUTES_MS
    })

    if (due) setOpenMatchId(due.match_id)
  }, [upcoming, dismissed, openMatchId])

  function handleClose(matchId: number) {
    setDismissed((s) => new Set(s).add(matchId))
    setOpenMatchId(null)
  }

  if (openMatchId === null) return null

  return <StatSheetModal matchId={openMatchId} onClose={() => handleClose(openMatchId)} />
}
