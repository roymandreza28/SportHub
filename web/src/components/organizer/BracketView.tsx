import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBracket, type BracketMatch } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'
import { MatchScheduleModal } from './MatchScheduleModal'
import { IconCalendar } from '../layout/icons'

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
}

const TRACK_LABEL: Record<string, string> = {
  winners: 'Winners bracket',
  losers: 'Losers bracket',
  final: 'Grand final',
}

type ConnectorLine = { id: string; x1: number; y1: number; x2: number; y2: number }

function MatchCard({
  match,
  onClick,
  cardRef,
  onSchedule,
}: {
  match: BracketMatch
  onClick?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  onSchedule?: () => void
}) {
  const aDetermined = !!match.participant_a
  const bDetermined = !!match.participant_b
  const isOpen = !aDetermined && !bDetermined
  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'
  const trackLabel = match.bracket_type ? TRACK_LABEL[match.bracket_type] : null
  const groupLabel = match.group_number != null ? `Group ${match.group_number + 1}` : null
  const canSchedule = !!onSchedule && !isOpen && match.status !== 'completed'

  return (
    <div ref={cardRef}>
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`w-52 rounded-lg border p-3 text-left text-xs shadow-sm transition enabled:hover:border-teal-200 enabled:hover:shadow-md disabled:cursor-default ${
          isOpen ? 'border-dashed border-slate-200 bg-slate-50/70' : 'border-slate-200 bg-white'
        }`}
      >
        {(trackLabel || groupLabel) && (
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {trackLabel ?? groupLabel}
          </div>
        )}
        <div
          className={`flex justify-between ${
            !aDetermined
              ? 'italic text-slate-400'
              : match.winner && match.winner.id === match.participant_a?.id
                ? 'font-semibold text-teal-700'
                : 'text-slate-700'
          }`}
        >
          <span className="truncate">{aName}</span>
          {aDetermined && <span className="tabular-nums">{match.score_a}</span>}
        </div>
        <div
          className={`mt-1 flex justify-between ${
            !bDetermined
              ? 'italic text-slate-400'
              : match.winner && match.winner.id === match.participant_b?.id
                ? 'font-semibold text-teal-700'
                : 'text-slate-700'
          }`}
        >
          <span className="truncate">{bName}</span>
          {bDetermined && <span className="tabular-nums">{match.score_b}</span>}
        </div>
        <div
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isOpen ? 'bg-slate-100 text-slate-400' : STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {isOpen ? 'awaiting players' : match.status}
        </div>
        {match.scheduled_at && (
          <div className="mt-1.5 text-[10px] text-slate-500">
            {new Date(match.scheduled_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {match.court && ` — ${match.court.venue.name} (${match.court.name})`}
          </div>
        )}
      </button>
      {canSchedule && (
        <button
          onClick={onSchedule}
          className="mt-1.5 flex w-52 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
        >
          <IconCalendar className="h-3 w-3" />
          {match.scheduled_at ? 'Reschedule' : 'Schedule'}
        </button>
      )}
    </div>
  )
}

// A round only has a clean 1-or-2-feeds-into-1 tree relationship with the
// next round when every match in it is a plain elimination match — not a
// group_stage pool match (group_number set) or a double_elimination /
// swiss match (bracket_type set to something other than null). That's true
// for single_elimination throughout, and for group_stage once its knockout
// stage has been generated (its matches look identical to single_elimination
// ones) — so no extra "format" prop is needed to know when arrows apply.
function isTreeRound(round: BracketMatch[]): boolean {
  return round.length > 0 && round.every((m) => !m.bracket_type && m.group_number == null)
}

function SwissStandings({ matches }: { matches: BracketMatch[] }) {
  const stats = new Map<number, { name: string; wins: number; for: number; against: number }>()

  for (const m of matches) {
    for (const [id, name, forScore, againstScore] of [
      [m.participant_a_id, m.participant_a?.name, m.score_a, m.score_b],
      [m.participant_b_id, m.participant_b?.name, m.score_b, m.score_a],
    ] as const) {
      if (!id) continue
      const entry = stats.get(id) ?? { name: name ?? 'Unknown', wins: 0, for: 0, against: 0 }
      entry.for += forScore
      entry.against += againstScore
      if (m.winner_id === id) entry.wins += 1
      stats.set(id, entry)
    }
  }

  const ranked = [...stats.values()].sort(
    (a, b) => b.wins - a.wins || b.for - b.against - (a.for - a.against) || b.for - a.for
  )

  if (ranked.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Standings</h4>
      <ol className="flex flex-col gap-1 text-sm">
        {ranked.map((p, i) => (
          <li key={p.name + i} className="flex items-center justify-between rounded-md bg-white px-3 py-1.5 shadow-sm">
            <span className="font-medium text-slate-700">
              {i + 1}. {p.name}
            </span>
            <span className="tabular-nums text-xs text-slate-500">
              {p.wins}W &middot; {p.for - p.against >= 0 ? '+' : ''}
              {p.for - p.against}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function BracketView({
  tournamentId,
  onSelectMatch,
  canScheduleMatches,
}: {
  tournamentId: number
  onSelectMatch?: (match: BracketMatch) => void
  // Only the main organizer sets the date/time/court for a game — distinct
  // from onSelectMatch, which is the venue organizer's click-to-score path.
  canScheduleMatches?: boolean
}) {
  const queryClient = useQueryClient()
  const { data: bracket, isLoading } = useQuery({
    queryKey: ['organizer', 'bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId),
    retry: false,
  })
  const [schedulingMatch, setSchedulingMatch] = useState<BracketMatch | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const cardEls = useRef<Map<number, HTMLDivElement>>(new Map())
  const [lines, setLines] = useState<ConnectorLine[]>([])
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })

  const isSwiss = bracket?.structure?.[0]?.[0]?.bracket_type === 'swiss'

  // Public channel — spectators watching the bracket see round advances and
  // score-driven bracket changes live, without a manual refresh.
  useEffect(() => {
    const channel = echo.channel(`tournament.${tournamentId}`)
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })

    channel.listen('.BracketUpdated', invalidate).listen('.RoundAdvanced', invalidate)

    return () => {
      echo.leave(`tournament.${tournamentId}`)
    }
  }, [tournamentId, queryClient])

  const structure = bracket?.structure ?? []

  // Measures each visible match card relative to the scrollable bracket
  // container and draws an elbowed connector + arrowhead from every match
  // that feeds into a specific next-round slot — mirrors the visual
  // language of standard bracket generators (Challonge/Toornament-style),
  // rather than leaving advancement implicit.
  useLayoutEffect(() => {
    function recompute() {
      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const next: ConnectorLine[] = []

      for (let r = 0; r < structure.length - 1; r++) {
        const round = structure[r]
        const nextRound = structure[r + 1]
        if (!isTreeRound(round) || !isTreeRound(nextRound)) continue

        round.forEach((match, i) => {
          const targetMatch = nextRound[Math.floor(i / 2)]
          if (!targetMatch) return

          const fromEl = cardEls.current.get(match.id)
          const toEl = cardEls.current.get(targetMatch.id)
          if (!fromEl || !toEl) return

          const fromRect = fromEl.getBoundingClientRect()
          const toRect = toEl.getBoundingClientRect()

          next.push({
            id: `${match.id}-${targetMatch.id}`,
            x1: fromRect.right - containerRect.left + container.scrollLeft,
            y1: fromRect.top + fromRect.height / 2 - containerRect.top + container.scrollTop,
            x2: toRect.left - containerRect.left + container.scrollLeft,
            y2: toRect.top + toRect.height / 2 - containerRect.top + container.scrollTop,
          })
        })
      }

      setLines(next)
      setSvgSize({ width: container.scrollWidth, height: container.scrollHeight })
    }

    recompute()

    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    window.addEventListener('resize', recompute)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recompute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure])

  if (isLoading) return <p className="text-sm text-slate-500">Loading bracket...</p>
  // A bracket row can exist with no structure yet if generation failed
  // partway through (e.g. too few registrants) — treat it the same as "no
  // bracket" rather than crashing on a null structure.
  if (!bracket || !bracket.structure) return <p className="text-sm text-slate-400">No bracket generated yet.</p>

  // A true single "Final" only exists for single-elimination-shaped
  // brackets — round-robin/swiss's last round is several matches, not one,
  // so there's no single champion slot to call out there.
  const finalRound = structure[structure.length - 1]
  const champion =
    finalRound?.length === 1 && finalRound[0].status === 'completed' ? finalRound[0].winner : null

  return (
    <div className="flex flex-col gap-4">
      {champion && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-center">
          <span className="text-sm font-semibold text-teal-800">🏆 Champion: {champion.name}</span>
        </div>
      )}

      {isSwiss && <SwissStandings matches={structure.flat()} />}

      <div ref={containerRef} className="relative flex gap-8 overflow-x-auto rounded-lg border border-slate-100 bg-slate-50/60 p-4">
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={svgSize.width}
          height={svgSize.height}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker id="bracket-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" className="fill-teal-400" />
            </marker>
          </defs>
          {lines.map((line) => {
            const midX = (line.x1 + line.x2) / 2
            return (
              <path
                key={line.id}
                d={`M ${line.x1} ${line.y1} L ${midX} ${line.y1} L ${midX} ${line.y2} L ${line.x2 - 8} ${line.y2}`}
                fill="none"
                className="stroke-teal-300"
                strokeWidth={1.5}
                markerEnd="url(#bracket-arrow)"
              />
            )
          })}
        </svg>

        {structure.map((round, i) => (
          <div key={i} className="relative flex flex-col justify-around gap-4">
            <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              {i === structure.length - 1 ? 'Final' : `Round ${i + 1}`}
            </h4>
            {round.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={onSelectMatch ? () => onSelectMatch(match) : undefined}
                onSchedule={canScheduleMatches ? () => setSchedulingMatch(match) : undefined}
                cardRef={(el) => {
                  if (el) cardEls.current.set(match.id, el)
                  else cardEls.current.delete(match.id)
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {schedulingMatch && (
        <MatchScheduleModal
          match={schedulingMatch}
          tournamentId={tournamentId}
          onClose={() => setSchedulingMatch(null)}
        />
      )}
    </div>
  )
}
