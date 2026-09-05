import { useEffect, useState } from 'react'
import { echo } from '../../lib/echo'
import type { NewsMatchItem } from '../../lib/newsApi'

// match.{id} is a fully PUBLIC channel (see MatchController's broadcasts) —
// the exact same one ScoreboardLive.tsx subscribes to while actually
// scoring — so this drops in unchanged on both the authenticated Newsfeed
// and the fully anonymous public news page, no auth required either way.
type MatchStatusChangedPayload = {
  id: number
  status: 'scheduled' | 'live' | 'completed'
  score_a: number
  score_b: number
  winner_id: number | null
  winner_team_id: number | null
  won_by_default: boolean
}

// Basketball/3x3's game clock (and, where enabled, its shot clock) only —
// MatchClockChanged fires on a real transition (start, pause, period/
// overtime change, manual adjustment), never once per tick. Every other
// sport's board never broadcasts this at all, so these all just stay null.
// The shot clock shares the game clock's own clock_running/clock_synced_at
// pair — the two always start, pause, and sync together — rather than
// carrying a second running flag of its own.
type MatchClockChangedPayload = {
  id: number
  clock_seconds_remaining: number | null
  clock_shot_seconds_remaining: number | null
  clock_running: boolean
  clock_period_label: string | null
  clock_synced_at: string | null
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

// Forces a re-render every second while the clock is running, purely to
// drive the extrapolation below — it holds no clock value itself.
function useClockTick(running: boolean, syncedAt: string | null) {
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(interval)
  }, [running, syncedAt])
}

// The organizer's own scoreboard only ever syncs a snapshot + the server
// timestamp it was true as of — never a per-second tick — so a viewer stuck
// on a slow connection or a backgrounded tab still shows the right time the
// instant it looks again: this recomputes from Date.now() vs. that
// timestamp on every render instead of counting its own local seconds down,
// so nothing drifts and nothing needs to "catch up". Used for both the game
// clock and the shot clock — they extrapolate from the same synced_at.
function extrapolateSeconds(secondsRemaining: number | null, running: boolean, syncedAt: string | null): number | null {
  if (secondsRemaining === null) return null
  if (!running || !syncedAt) return secondsRemaining

  const elapsed = Math.floor((Date.now() - new Date(syncedAt).getTime()) / 1000)
  return Math.max(0, secondsRemaining - elapsed)
}

export function LiveMatchScore({ match }: { match: NewsMatchItem }) {
  // Seeded once from the initial fetch; kept current from here on purely by
  // the socket subscription below. Deliberately NOT re-synced from the
  // `match` prop on every parent re-render — react-query hands back a new
  // NewsItem[] (and thus a new `match` object) on any newsfeed interaction
  // (reacting to an unrelated post, a comment count updating, etc.), which
  // would otherwise stomp on live socket updates with a stale snapshot.
  const [live, setLive] = useState(match)

  useEffect(() => {
    const channel = echo.channel(`match.${match.id}`)
    channel.listen('.MatchStatusChanged', (e: MatchStatusChangedPayload) => {
      setLive((prev) => {
        // Exactly one of winner_id/winner_team_id is ever populated for a
        // given match (individual vs. team) — participant_a/b.id already
        // carry whichever id-space this match uses, so this resolves the
        // winner without needing to know which kind of match it is.
        const winnerId = e.winner_id ?? e.winner_team_id ?? null
        const winner =
          winnerId === prev.participant_a?.id ? prev.participant_a : winnerId === prev.participant_b?.id ? prev.participant_b : null

        return { ...prev, status: e.status, score_a: e.score_a, score_b: e.score_b, won_by_default: e.won_by_default, winner }
      })
    })
    channel.listen('.MatchClockChanged', (e: MatchClockChangedPayload) => {
      setLive((prev) => ({
        ...prev,
        clock_seconds_remaining: e.clock_seconds_remaining,
        clock_shot_seconds_remaining: e.clock_shot_seconds_remaining,
        clock_running: e.clock_running,
        clock_period_label: e.clock_period_label,
        clock_synced_at: e.clock_synced_at,
      }))
    })

    return () => {
      echo.leave(`match.${match.id}`)
    }
  }, [match.id])

  useClockTick(live.clock_running, live.clock_synced_at)
  const displayedClockSeconds = extrapolateSeconds(live.clock_seconds_remaining, live.clock_running, live.clock_synced_at)
  const displayedShotSeconds = extrapolateSeconds(live.clock_shot_seconds_remaining, live.clock_running, live.clock_synced_at)
  const hasClock = displayedClockSeconds !== null || live.clock_period_label !== null

  const aName = live.participant_a?.name ?? 'TBD'
  const bName = live.participant_b?.name ?? 'TBD'
  const isLive = live.status === 'live'
  const aIsWinner = live.winner !== null && live.winner.id === live.participant_a?.id
  const bIsWinner = live.winner !== null && live.winner.id === live.participant_b?.id

  return (
    <div className="scoreboard-palette mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-pure-white">
      {isLive && (
        <div className="flex items-center justify-center gap-1.5 border-b border-slate-800/80 bg-red-500/10 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
        </div>
      )}

      <div className={`grid items-center gap-2 p-4 ${hasClock ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-2'}`}>
        <div className="flex min-w-0 flex-col items-center gap-1 text-center">
          <p className={`w-full truncate text-xs font-semibold uppercase tracking-wide ${aIsWinner ? 'text-teal-400' : 'text-slate-400'}`}>
            {aName}
          </p>
          {!live.won_by_default && (
            <p className={`text-4xl font-bold leading-none tabular-nums sm:text-5xl ${aIsWinner ? 'text-teal-400' : 'text-pure-white'}`}>
              {live.score_a}
            </p>
          )}
        </div>

        {hasClock && (
          <div className="flex flex-col items-center gap-0.5 px-2">
            <p className="text-2xl font-bold leading-none tabular-nums text-pure-white sm:text-3xl">
              {displayedClockSeconds !== null ? formatClock(displayedClockSeconds) : '--:--'}
            </p>
            {live.clock_period_label && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{live.clock_period_label}</p>
            )}
            {displayedShotSeconds !== null && (
              <p className={`mt-0.5 text-sm font-bold tabular-nums ${displayedShotSeconds <= 5 ? 'text-red-500' : 'text-slate-400'}`}>
                Shot: {displayedShotSeconds}s
              </p>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col items-center gap-1 text-center">
          <p className={`w-full truncate text-xs font-semibold uppercase tracking-wide ${bIsWinner ? 'text-teal-400' : 'text-slate-400'}`}>
            {bName}
          </p>
          {!live.won_by_default && (
            <p className={`text-4xl font-bold leading-none tabular-nums sm:text-5xl ${bIsWinner ? 'text-teal-400' : 'text-pure-white'}`}>
              {live.score_b}
            </p>
          )}
        </div>
      </div>

      {live.won_by_default && live.winner && (
        <p className="border-t border-slate-800/80 py-2 text-center text-xs font-medium text-slate-400">
          {live.winner.name} won by default.
        </p>
      )}
    </div>
  )
}
