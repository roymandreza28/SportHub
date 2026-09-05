import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBracket, freshBracketMatch, type BracketMatch } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'
import { MatchScheduleModal } from './MatchScheduleModal'
import { ShareMatchModal } from './ShareMatchModal'
import { IconCalendar, IconClipboard, IconShare } from '../layout/icons'

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
  onShare,
  onStatSheet,
}: {
  match: BracketMatch
  onClick?: () => void
  cardRef?: (el: HTMLDivElement | null) => void
  onSchedule?: () => void
  onShare?: () => void
  onStatSheet?: () => void
}) {
  const aDetermined = !!match.participant_a
  const bDetermined = !!match.participant_b
  const isOpen = !aDetermined && !bDetermined
  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'
  const trackLabel = match.bracket_type ? TRACK_LABEL[match.bracket_type] : null
  const groupLabel = match.group_number != null ? `Group ${match.group_number + 1}` : null
  const canSchedule = !!onSchedule && !isOpen && match.status !== 'completed'
  // Nothing to share until the game is actually underway or decided — a
  // still-open "awaiting players" slot has no score/result worth posting.
  const canShare = !!onShare && (match.status === 'live' || match.status === 'completed')

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
          {aDetermined && !match.won_by_default && <span className="tabular-nums">{match.score_a}</span>}
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
          {bDetermined && !match.won_by_default && <span className="tabular-nums">{match.score_b}</span>}
        </div>
        <div
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isOpen ? 'bg-slate-100 text-slate-400' : STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {isOpen ? 'awaiting players' : match.won_by_default ? 'won by default' : match.status}
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
      {canShare && (
        <button
          onClick={onShare}
          className="mt-1.5 flex w-52 items-center justify-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-100"
        >
          <IconShare className="h-3 w-3" />
          Share to newsfeed
        </button>
      )}
      {onStatSheet && (
        <button
          onClick={onStatSheet}
          className="mt-1.5 flex w-52 items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
        >
          <IconClipboard className="h-3 w-3" />
          Stat Sheet
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

// A clean elimination round's own match count says exactly how many teams
// are left standing (matchCount * 2) — 1 match is always the Final, 2 is
// always the Semifinals, and so on — regardless of how many rounds came
// before it (a bye-heavy earlier round doesn't shift this). Only meaningful
// for a tree round (see isTreeRound) — round_robin/swiss/pre-knockout
// group_stage rounds don't shrink this way, so those keep "Round N".
function eliminationRoundLabel(matchCount: number, roundIndex: number): string {
  switch (matchCount) {
    case 1:
      return 'Final'
    case 2:
      return 'Semifinals'
    case 4:
      return 'Quarterfinals'
    case 8:
      return 'Round of 16'
    case 16:
      return 'Round of 32'
    default:
      return `Round ${roundIndex + 1}`
  }
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
  tournamentName,
  onSelectMatch,
  canScheduleMatches,
  canShareMatches,
  isStatSheetEligible,
  onOpenStatSheet,
}: {
  tournamentId: number
  // Only needed when canShareMatches is set — used to prefill the shared
  // post's text (e.g. "...in Round 2 of {tournamentName}").
  tournamentName?: string
  onSelectMatch?: (match: BracketMatch) => void
  // Only the main organizer sets the date/time/court for a game — distinct
  // from onSelectMatch, which is the venue organizer's click-to-score path.
  canScheduleMatches?: boolean
  // Lets the main organizer post an ongoing or just-finished game to the
  // newsfeed/news page — same "main organizer only" scoping as scheduling.
  canShareMatches?: boolean
  // Coach-only: shows a "Stat Sheet" button on any match involving their own
  // team/registered player (computed by the caller — MatchStatSheetPolicy's
  // eligibility rule, re-derived client-side from data the coach already
  // has, so an ineligible match never even renders the button rather than
  // opening StatSheetModal and getting a 403). Not passed at all by the
  // player-facing or organizer-family callers.
  isStatSheetEligible?: (match: BracketMatch) => boolean
  onOpenStatSheet?: (match: BracketMatch) => void
}) {
  const queryClient = useQueryClient()
  const { data: bracket, isLoading } = useQuery({
    queryKey: ['organizer', 'bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId),
    retry: false,
    // The tournament.{id} channel below only fires on a bracket-structure
    // change (generation, round advance) — a match merely going scheduled
    // -> live has no broadcast of its own, so a viewer who isn't the one
    // scoring it (the main organizer watching, say) wouldn't otherwise see
    // that transition (and thus the now-available Share/Stat Sheet buttons)
    // without this safety-net poll.
    refetchInterval: 20000,
  })
  const [schedulingMatch, setSchedulingMatch] = useState<BracketMatch | null>(null)
  const [sharingMatch, setSharingMatch] = useState<BracketMatch | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  // The bracket's actual rounds/matches live in here, at their natural
  // (unscaled) size — containerRef is the outer scrollable viewport,
  // contentRef is what gets CSS-scaled down to fit it. Kept separate so the
  // scale factor can be computed from contentRef's untransformed
  // scrollWidth (a CSS transform never affects layout size, only paint),
  // without the transform itself feeding back into the measurement.
  const contentRef = useRef<HTMLDivElement>(null)
  const cardEls = useRef<Map<number, HTMLDivElement>>(new Map())
  const [lines, setLines] = useState<ConnectorLine[]>([])
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })
  // Fit-to-device-width: shrinks the whole bracket down via transform:scale
  // so it's fully visible on a narrow phone screen instead of forcing
  // horizontal scrolling to see later rounds — never scales UP past natural
  // size on a roomy desktop, and never shrinks past a floor where match
  // cards would become unreadable (falls back to the pre-existing
  // overflow-auto scroll for a tournament too large even for that).
  const MIN_SCALE = 0.45
  const [scale, setScale] = useState(1)
  const [scaledSize, setScaledSize] = useState({ width: 0, height: 0 })

  const isSwiss = bracket?.structure?.[0]?.[0]?.bracket_type === 'swiss'
  // "Portrait" / pyramid-upward layout — only single_elimination is a
  // single clean tree narrowing to one final; double_elimination is two
  // trees (winners+losers) converging, and round_robin/swiss/group_stage's
  // group phase have no such narrowing at all, so those keep the existing
  // left-to-right layout.
  const isPyramid = bracket?.format === 'single_elimination'

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

  // See freshBracketMatch's own doc comment (organizerApi.ts) for why this
  // merge is needed at all — every match rendered here goes through it so
  // the whole grid (and whatever gets passed to onSelectMatch/onShare/
  // onOpenStatSheet from a click) reflects real, current data instead of
  // bracket.structure's cached-at-generation-or-completion snapshot.
  const structure = useMemo(
    () => (bracket?.structure ?? []).map((round) => round.map((m) => freshBracketMatch(bracket, m.id) ?? m)),
    [bracket]
  )

  // Measures each visible match card relative to the scrollable bracket
  // container and draws an elbowed connector + arrowhead from every match
  // that feeds into a specific next-round slot — mirrors the visual
  // language of standard bracket generators (Challonge/Toornament-style),
  // rather than leaving advancement implicit.
  useLayoutEffect(() => {
    function recompute() {
      const container = containerRef.current
      const content = contentRef.current
      if (!container || !content) return

      // scrollWidth/scrollHeight reflect real layout size regardless of any
      // CSS transform already applied (transform only affects paint, never
      // layout) — content itself is sized w-max (see render below) so it's
      // always its own natural, unconstrained width here, never squeezed by
      // the cropping wrapper around it.
      const naturalWidth = content.scrollWidth
      const naturalHeight = content.scrollHeight
      // -32 for the container's own p-4 (16px each side) the content sits inside.
      const availableWidth = container.clientWidth - 32
      const nextScale =
        naturalWidth > 0 ? Math.min(1, Math.max(MIN_SCALE, availableWidth / naturalWidth)) : 1

      setScale(nextScale)
      setScaledSize({ width: naturalWidth * nextScale, height: naturalHeight * nextScale })

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

          // Horizontal (default): flow is left→right, so a connector exits
          // a match's right edge and enters the next one's left edge.
          // Vertical (pyramid/portrait): flow is bottom→top instead (round
          // 1 sits at the bottom, the final at the top — see the
          // flex-col-reverse container below), so a connector exits a
          // match's top edge and enters the next one's bottom edge.
          next.push(
            isPyramid
              ? {
                  id: `${match.id}-${targetMatch.id}`,
                  x1: fromRect.left + fromRect.width / 2 - containerRect.left + container.scrollLeft,
                  y1: fromRect.top - containerRect.top + container.scrollTop,
                  x2: toRect.left + toRect.width / 2 - containerRect.left + container.scrollLeft,
                  y2: toRect.bottom - containerRect.top + container.scrollTop,
                }
              : {
                  id: `${match.id}-${targetMatch.id}`,
                  x1: fromRect.right - containerRect.left + container.scrollLeft,
                  y1: fromRect.top + fromRect.height / 2 - containerRect.top + container.scrollTop,
                  x2: toRect.left - containerRect.left + container.scrollLeft,
                  y2: toRect.top + toRect.height / 2 - containerRect.top + container.scrollTop,
                }
          )
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
    // scale is deliberately in this list despite being set inside
    // recompute() itself: connector-line/svg positions are measured via
    // getBoundingClientRect(), which only reflects the *previous* render's
    // transform — so the first pass after a scale change computes lines
    // against the stale (pre-change) DOM. Including scale here makes the
    // effect re-run once the new transform has actually painted, self-
    // correcting on that second pass. Safe from looping: the second pass
    // recomputes the same scale from the same natural sizes, so setScale
    // is a no-op and nothing triggers a third run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, isPyramid, scale])

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

      <div
        ref={containerRef}
        className="relative overflow-auto rounded-lg border border-slate-100 bg-slate-50/60 p-4"
      >
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
            // Horizontal: elbow meets halfway across (midX), arrowhead
            // backs off along x. Vertical (pyramid): elbow meets halfway up
            // (midY) instead, arrowhead backs off along y — see the
            // recompute() comment above for why the coordinates themselves
            // already point the right way round.
            const d = isPyramid
              ? (() => {
                  const midY = (line.y1 + line.y2) / 2
                  return `M ${line.x1} ${line.y1} L ${line.x1} ${midY} L ${line.x2} ${midY} L ${line.x2} ${line.y2 + 8}`
                })()
              : (() => {
                  const midX = (line.x1 + line.x2) / 2
                  return `M ${line.x1} ${line.y1} L ${midX} ${line.y1} L ${midX} ${line.y2} L ${line.x2 - 8} ${line.y2}`
                })()
            return (
              <path
                key={line.id}
                d={d}
                fill="none"
                className="stroke-teal-300"
                strokeWidth={1.5}
                markerEnd="url(#bracket-arrow)"
              />
            )
          })}
        </svg>

        {/* Crop wrapper: sized to exactly the scaled-down visual footprint
            of the content below, so the container's own layout (and its
            scrollbars) reflect the shrunk size — a CSS transform alone
            doesn't change how much space an element reserves in normal
            flow, only how it paints, so without this the container would
            still show whitespace/scrollbars sized for the un-shrunk content. */}
        <div style={{ width: scaledSize.width || undefined, height: scaledSize.height || undefined, overflow: 'hidden' }}>
          <div
            ref={contentRef}
            className={`flex w-max ${
              // items-center on the cross axis: each round-row is a different
              // width (round 1 widest, the final narrowest), so without this
              // they'd left-align against each other instead of narrowing
              // symmetrically toward the center — the actual pyramid shape.
              isPyramid ? 'flex-col-reverse items-center gap-10' : 'gap-8'
            }`}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {structure.map((round, i) => (
              <div
                key={i}
                className={
                  isPyramid
                    ? 'relative flex flex-row items-center justify-center gap-6'
                    : 'relative flex flex-col justify-around gap-4'
                }
              >
                <h4
                  className={
                    isPyramid
                      ? 'absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500'
                      : 'text-center text-xs font-semibold uppercase tracking-wide text-slate-500'
                  }
                >
                  {isTreeRound(round) ? eliminationRoundLabel(round.length, i) : `Round ${i + 1}`}
                </h4>
                {round.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onClick={onSelectMatch ? () => onSelectMatch(match) : undefined}
                    onSchedule={canScheduleMatches ? () => setSchedulingMatch(match) : undefined}
                    onShare={canShareMatches ? () => setSharingMatch(match) : undefined}
                    onStatSheet={
                      isStatSheetEligible?.(match) && onOpenStatSheet ? () => onOpenStatSheet(match) : undefined
                    }
                    cardRef={(el) => {
                      if (el) cardEls.current.set(match.id, el)
                      else cardEls.current.delete(match.id)
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {schedulingMatch && (
        <MatchScheduleModal
          match={schedulingMatch}
          tournamentId={tournamentId}
          onClose={() => setSchedulingMatch(null)}
        />
      )}

      {sharingMatch && (
        <ShareMatchModal
          match={sharingMatch}
          tournamentId={tournamentId}
          tournamentName={tournamentName ?? 'this tournament'}
          onClose={() => setSharingMatch(null)}
        />
      )}
    </div>
  )
}
