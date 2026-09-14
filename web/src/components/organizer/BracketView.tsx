import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBracket, freshBracketMatch, type BracketMatch, type ScoringType } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'
import { chip } from '../../lib/formStyles'
import { MatchScheduleModal } from './MatchScheduleModal'
import { ShareMatchModal } from './ShareMatchModal'
import { ShareBracketModal } from './ShareBracketModal'
import { TournamentStandingsView } from './TournamentStandingsView'
import { IconCalendar, IconChevronDown, IconClipboard, IconShare } from '../layout/icons'

export const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
}

export const TRACK_LABEL: Record<string, string> = {
  winners: 'Winners bracket',
  losers: 'Losers bracket',
  final: 'Grand final',
}

type ConnectorLine = { id: string; x1: number; y1: number; x2: number; y2: number; dashed?: boolean }

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
  // Lettered (Group A, B, ...) to match the group-stage standings grid's
  // own card headers — see GroupStandingsCard.
  const groupLabel = match.group_number != null ? `Group ${String.fromCharCode(65 + match.group_number)}` : null
  const canSchedule = !!onSchedule && !isOpen && match.status !== 'completed'
  // Nothing to share until both participants are actually known — a
  // still-open "awaiting players" slot has no matchup worth posting. Once
  // they are, a scheduled-but-not-yet-live match is just as shareable as a
  // live or completed one (ShareMatchModal frames it as an upcoming-game
  // announcement rather than a score/result).
  const canShare = !!onShare && !isOpen

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
export function isTreeRound(round: BracketMatch[]): boolean {
  return round.length > 0 && round.every((m) => !m.bracket_type && m.group_number == null)
}

// A clean elimination round's own match count says exactly how many teams
// are left standing (matchCount * 2) — 1 match is always the Final, 2 is
// always the Semifinals, and so on — regardless of how many rounds came
// before it (a bye-heavy earlier round doesn't shift this). Only meaningful
// for a tree round (see isTreeRound) — round_robin/swiss/pre-knockout
// group_stage rounds don't shrink this way, so those keep "Round N".
export function eliminationRoundLabel(matchCount: number, roundIndex: number): string {
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

// Splits a flat match list into winners-bracket rounds, losers-bracket
// rounds (both ordered ascending by round number, matches within a round
// ordered by id — the same order BracketService's generators create them
// in), and the grand final match, if one exists. A tournament with only 2
// entrants never gets a losers bracket or a final match at all — see
// BracketService::generateDoubleElimination()'s own "decisive on its own"
// comment — so both come back empty/null rather than throwing.
function groupDoubleEliminationMatches(matches: BracketMatch[]) {
  const wbByRound = new Map<number, BracketMatch[]>()
  const lbByRound = new Map<number, BracketMatch[]>()
  let finalMatch: BracketMatch | null = null

  for (const m of matches) {
    if (m.bracket_type === 'winners') {
      const arr = wbByRound.get(m.round) ?? []
      arr.push(m)
      wbByRound.set(m.round, arr)
    } else if (m.bracket_type === 'losers') {
      const arr = lbByRound.get(m.round) ?? []
      arr.push(m)
      lbByRound.set(m.round, arr)
    } else if (m.bracket_type === 'final') {
      finalMatch = m
    }
  }

  const byId = (a: BracketMatch, b: BracketMatch) => a.id - b.id
  const wbRounds = [...wbByRound.keys()].sort((a, b) => a - b).map((r) => [...wbByRound.get(r)!].sort(byId))
  const lbRounds = [...lbByRound.keys()].sort((a, b) => a - b).map((r) => [...lbByRound.get(r)!].sort(byId))

  return { wbRounds, lbRounds, finalMatch }
}

// Reconstructs exactly which match every winners/losers-bracket match feeds
// into — mirroring BracketService's advanceDoubleEliminationWinners()/
// dropIntoLosersBracket()/advanceDoubleEliminationLosers() position math, so
// the connector lines drawn from this always match what actually happens
// when a result is reported, not just a visual approximation. `dashed`
// marks a LOSER dropping into the losers bracket (the one relationship
// isTreeRound-style single-elimination brackets never have); everything
// else is a winner advancing.
function computeDoubleEliminationConnectors(
  matches: BracketMatch[]
): { from: number; to: number; dashed: boolean }[] {
  const { wbRounds, lbRounds, finalMatch } = groupDoubleEliminationMatches(matches)
  const edges: { from: number; to: number; dashed: boolean }[] = []

  // Winners bracket: round r's winner advances to round r+1 (standard
  // single-elimination pairing), and the last WB round's winner goes into
  // the grand final's slot A.
  wbRounds.forEach((round, i) => {
    const nextRound = wbRounds[i + 1]
    if (nextRound) {
      round.forEach((m, j) => {
        const target = nextRound[Math.floor(j / 2)]
        if (target) edges.push({ from: m.id, to: target.id, dashed: false })
      })
    } else if (finalMatch) {
      round.forEach((m) => edges.push({ from: m.id, to: finalMatch!.id, dashed: false }))
    }
  })

  // Winners bracket: round r's LOSER drops into the losers bracket. Round 1
  // losers pair up directly (two WB round-1 losers per LB round-1 match);
  // every later round's loser instead joins whoever already survived that
  // far in the losers bracket, one per LB "merge" round — see
  // dropIntoLosersBracket()'s own two branches.
  wbRounds.forEach((round, i) => {
    const wbRound = i + 1
    if (wbRound === 1) {
      const lbRound1 = lbRounds[0]
      if (!lbRound1) return
      round.forEach((m, j) => {
        const target = lbRound1.find((lm) => lm.bracket_position === Math.floor(j / 2))
        if (target) edges.push({ from: m.id, to: target.id, dashed: true })
      })
    } else {
      // Losers-bracket rounds are numbered 100+1, 100+2, ... — the merge
      // round a WB round r (r>1) loser drops into is 100 + 2*(r-1).
      const lbRound = lbRounds.find((r) => r[0] && r[0].round === 100 + 2 * (wbRound - 1))
      if (!lbRound) return
      round.forEach((m, j) => {
        const target = lbRound.find((lm) => lm.bracket_position === j)
        if (target) edges.push({ from: m.id, to: target.id, dashed: true })
      })
    }
  })

  // Losers bracket: odd rounds feed the very next (even, "merge") round at
  // the SAME position, slot A; even rounds feed the next (odd, "survivors")
  // round at position floor(position/2) — see advanceDoubleEliminationLosers().
  // The very last losers-bracket round's winner goes into the grand final's
  // slot B instead of another losers round.
  lbRounds.forEach((round, i) => {
    const lbRoundNumber = i + 1
    const isLast = i === lbRounds.length - 1
    if (isLast) {
      if (finalMatch) round.forEach((m) => edges.push({ from: m.id, to: finalMatch!.id, dashed: false }))
      return
    }
    const nextRound = lbRounds[i + 1]
    if (!nextRound) return
    if (lbRoundNumber % 2 === 1) {
      round.forEach((m) => {
        const target = nextRound.find((lm) => lm.bracket_position === m.bracket_position)
        if (target) edges.push({ from: m.id, to: target.id, dashed: false })
      })
    } else {
      round.forEach((m) => {
        const nextPos = Math.floor((m.bracket_position ?? 0) / 2)
        const target = nextRound.find((lm) => lm.bracket_position === nextPos)
        if (target) edges.push({ from: m.id, to: target.id, dashed: false })
      })
    }
  })

  return edges
}

type SwissRoundBucket = { label: string; matches: BracketMatch[] }
type SwissRound = { round: number; buckets: SwissRoundBucket[] }

// Groups each swiss round's matches by the record its players were
// carrying INTO that round (wins-losses from every earlier round) — the
// same layout convention as a standard Swiss-stage bracket graphic: a
// column per round, sub-divided into labeled rows ("2-0", "1-1", "0-2", ...)
// for whichever record tier landed there, since real Swiss pairing already
// groups same-record players together. This only reorganizes DISPLAY —
// it doesn't change who plays whom, which the backend already decided (see
// BracketService::pairSwissRound()) — so it just re-derives, from the
// match results already on hand, the record each match's players carried
// in, the same running tally a real standings table keeps. Draws don't
// move the win/loss count either way, matching how a completed-but-tied
// match already behaves elsewhere in this file.
function computeSwissRecordBuckets(matches: BracketMatch[]): SwissRound[] {
  const swissMatches = matches.filter((m) => m.bracket_type === 'swiss')
  const rounds = [...new Set(swissMatches.map((m) => m.round))].sort((a, b) => a - b)
  const record = new Map<number, { wins: number; losses: number }>()

  const recordLabel = (id: number) => {
    const r = record.get(id) ?? { wins: 0, losses: 0 }
    return `${r.wins}-${r.losses}`
  }

  const result: SwissRound[] = []

  for (const round of rounds) {
    const roundMatches = swissMatches.filter((m) => m.round === round).sort((a, b) => a.id - b.id)
    const bucketsByLabel = new Map<string, BracketMatch[]>()

    for (const match of roundMatches) {
      const aId = match.participant_a?.id
      const label = aId != null ? recordLabel(aId) : 'TBD'
      const arr = bucketsByLabel.get(label) ?? []
      arr.push(match)
      bucketsByLabel.set(label, arr)
    }

    // Most wins first — mirrors the reference layout's top-to-bottom order
    // (2-0 above 1-1 above 0-2).
    const buckets = [...bucketsByLabel.entries()]
      .sort(([a], [b]) => Number(b.split('-')[0]) - Number(a.split('-')[0]))
      .map(([label, bucketMatches]) => ({ label, matches: bucketMatches }))

    result.push({ round, buckets })

    // Fold this round's actual results into the running tally before
    // computing the next round's bucket labels.
    for (const match of roundMatches) {
      if (match.status !== 'completed') continue

      for (const participant of [match.participant_a, match.participant_b]) {
        if (!participant) continue
        const r = record.get(participant.id) ?? { wins: 0, losses: 0 }
        if (match.winner?.id === participant.id) r.wins += 1
        else if (match.winner) r.losses += 1
        record.set(participant.id, r)
      }
    }
  }

  return result
}

// Reconstructs, from the real match data already on hand, which previous-
// round match each of a round's matches' players actually came from —
// swiss pairing has no fixed bracket topology the way single/double
// elimination does (BracketService::pairSwissRound() can pair a player
// with anyone still fresh each round), so unlike
// computeDoubleEliminationConnectors this doesn't encode an advancement
// RULE, it just re-derives "this player's previous game was here" from
// whichever match each player actually appears in the round before. A
// round 1 match has nothing to connect from (no previous round), so it's
// simply skipped, same as a knocked-out bracket slot never getting a line.
function computeSwissConnectors(matches: BracketMatch[]): { from: number; to: number }[] {
  const swissMatches = matches.filter((m) => m.bracket_type === 'swiss')
  const rounds = [...new Set(swissMatches.map((m) => m.round))].sort((a, b) => a - b)
  const seen = new Set<string>()
  const edges: { from: number; to: number }[] = []

  for (let i = 1; i < rounds.length; i++) {
    const prevRoundMatches = swissMatches.filter((m) => m.round === rounds[i - 1])
    const currRoundMatches = swissMatches.filter((m) => m.round === rounds[i])

    const lastMatchByParticipant = new Map<number, BracketMatch>()
    for (const m of prevRoundMatches) {
      if (m.participant_a) lastMatchByParticipant.set(m.participant_a.id, m)
      if (m.participant_b) lastMatchByParticipant.set(m.participant_b.id, m)
    }

    for (const m of currRoundMatches) {
      for (const participant of [m.participant_a, m.participant_b]) {
        if (!participant) continue
        const prevMatch = lastMatchByParticipant.get(participant.id)
        if (!prevMatch) continue
        const key = `${prevMatch.id}-${m.id}`
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ from: prevMatch.id, to: m.id })
      }
    }
  }

  return edges
}

type GroupStanding = {
  id: number
  name: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
}

// Per-group standings table (Name/P/W/D/L/PTS), matching a real group-
// stage reference layout's group-of-cards presentation — mirrors
// BracketService::rankGroup()'s own ranking (points, i.e. wins + half a
// point per draw — same scheme swissStandings()/TournamentStandingsView
// already use elsewhere — then score differential, then total scored)
// recomputed client-side from the match data already on hand, since this
// is a display concern, not a source of truth. Every group member gets a
// row (even a still-winless 0-0-0-0 one) as soon as they appear in ANY of
// that group's matches, played or not — otherwise a group whose games
// haven't started yet would show no rows at all.
function computeGroupStandings(matches: BracketMatch[]): Map<number, GroupStanding[]> {
  const byGroup = new Map<number, BracketMatch[]>()
  for (const m of matches) {
    if (m.group_number == null) continue
    const arr = byGroup.get(m.group_number) ?? []
    arr.push(m)
    byGroup.set(m.group_number, arr)
  }

  const result = new Map<number, GroupStanding[]>()

  for (const [groupNumber, groupMatches] of byGroup) {
    const table = new Map<number, GroupStanding>()
    const ensure = (participant: { id: number; name: string } | null | undefined) => {
      if (!participant || table.has(participant.id)) return
      table.set(participant.id, { id: participant.id, name: participant.name, played: 0, wins: 0, draws: 0, losses: 0, points: 0 })
    }
    for (const match of groupMatches) {
      ensure(match.participant_a)
      ensure(match.participant_b)
    }

    for (const match of groupMatches) {
      if (match.status !== 'completed') continue

      for (const participant of [match.participant_a, match.participant_b]) {
        if (!participant) continue
        const entry = table.get(participant.id)!
        entry.played += 1
        if (match.winner?.id === participant.id) {
          entry.wins += 1
          entry.points += 1
        } else if (match.winner) {
          entry.losses += 1
        } else {
          entry.draws += 1
          entry.points += 0.5
        }
      }
    }

    result.set(
      groupNumber,
      [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
    )
  }

  return result
}

function GroupStandingsCard({
  groupNumber,
  standings,
  matches,
  advancePerGroup,
  renderMatchCard,
}: {
  groupNumber: number
  standings: GroupStanding[]
  matches: BracketMatch[]
  advancePerGroup: number
  renderMatchCard: (match: BracketMatch) => ReactNode
}) {
  const [showFixtures, setShowFixtures] = useState(false)

  return (
    <div className="w-72 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-teal-600 px-4 py-2.5">
        <h4 className="text-center text-xs font-bold uppercase tracking-wide text-pure-white">
          Group {String.fromCharCode(65 + groupNumber)}
        </h4>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <th className="px-3 py-1.5 text-left font-medium">Name</th>
            <th className="px-1.5 py-1.5 text-right font-medium">P</th>
            <th className="px-1.5 py-1.5 text-right font-medium">W</th>
            <th className="px-1.5 py-1.5 text-right font-medium">D</th>
            <th className="px-1.5 py-1.5 text-right font-medium">L</th>
            <th className="px-3 py-1.5 text-right font-medium">PTS</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.id} className={`border-b border-slate-50 last:border-0 ${i < advancePerGroup ? 'bg-teal-50/60' : ''}`}>
              <td className="max-w-32 truncate px-3 py-1.5 font-medium text-slate-700">{s.name}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-600">{s.played}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-600">{s.wins}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-600">{s.draws}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-600">{s.losses}</td>
              <td className="px-3 py-1.5 text-right font-bold tabular-nums text-teal-700">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => setShowFixtures((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
      >
        {showFixtures ? 'Hide fixtures' : 'Show fixtures'}
        <IconChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showFixtures ? 'rotate-180' : ''}`} />
      </button>
      {showFixtures && (
        <div className="flex flex-col items-center gap-3 border-t border-slate-100 bg-slate-50/60 p-3">
          {matches.map((match) => renderMatchCard(match))}
        </div>
      )}
    </div>
  )
}

export function BracketView({
  tournamentId,
  tournamentName,
  scoringType,
  onSelectMatch,
  canScheduleMatches,
  canShareMatches,
  canShareBracket,
  isStatSheetEligible,
  onOpenStatSheet,
  onGoLive,
}: {
  tournamentId: number
  // Used to prefill a shared post's text — a per-match share (e.g. "...in
  // Round 2 of {tournamentName}") when canShareMatches is set, or the
  // whole-bracket share's title/body when canShareBracket is set.
  tournamentName?: string
  // Only needed for the Standings tab's match-detail popup, to show a
  // best-of-sets match's set-by-set breakdown — omitted entirely (rather
  // than fetched here) by callers that don't already have the tournament
  // record in hand.
  scoringType?: ScoringType
  onSelectMatch?: (match: BracketMatch) => void
  // Only the main organizer sets the date/time/court for a game — distinct
  // from onSelectMatch, which is the venue organizer's click-to-score path.
  canScheduleMatches?: boolean
  // Lets the main organizer post an ongoing or just-finished game to the
  // newsfeed/news page — same "main organizer only" scoping as scheduling.
  canShareMatches?: boolean
  // Lets the main organizer post the WHOLE bracket (not one game) to the
  // newsfeed — same scoping as canShareMatches, just a separate flag since
  // sharing the bracket makes sense at any point (even before a single
  // match has been played), unlike per-match sharing.
  canShareBracket?: boolean
  // Coach-only: shows a "Stat Sheet" button on any match involving their own
  // team/registered player (computed by the caller — MatchStatSheetPolicy's
  // eligibility rule, re-derived client-side from data the coach already
  // has, so an ineligible match never even renders the button rather than
  // opening StatSheetModal and getting a 403). Not passed at all by the
  // player-facing or organizer-family callers.
  isStatSheetEligible?: (match: BracketMatch) => boolean
  onOpenStatSheet?: (match: BracketMatch) => void
  // Lets ShareMatchModal's "Go live & score" button hand off to the same
  // match-open routing onSelectMatch itself uses (OrganizerPage's own
  // openMatch) — starting the broadcast and jumping into the scoreboard in
  // one action, rather than two separate ones. Absent for any caller with
  // no scoreboard route to send the organizer to (e.g. a coach/player view).
  onGoLive?: (match: BracketMatch) => void
}) {
  // 'bracket' (the existing tree/grid view) or 'standings' (a flat,
  // ranked list — every participant with their win/loss record, each
  // expandable into that participant's own match history, each of THOSE
  // expandable into that one game's full record). Works for every
  // tournament format since it's built from the same match list the
  // bracket grid already has, not a format-specific computation.
  const [viewMode, setViewMode] = useState<'bracket' | 'standings'>('bracket')
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
  const [sharingBracket, setSharingBracket] = useState(false)

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

  // "Portrait" / pyramid-upward layout — only single_elimination is a
  // single clean tree narrowing to one final; double_elimination is two
  // trees (winners+losers) converging, and round_robin/swiss/group_stage's
  // group phase have no such narrowing at all, so those keep the existing
  // left-to-right layout.
  const isPyramid = bracket?.format === 'single_elimination'

  // isTreeRound() below only looks at bracket_type/group_number, which is
  // exactly how a plain round_robin match looks too (neither is ever set
  // for it) — without this extra check, a real round_robin schedule (now
  // that it's genuinely spread across N-1 rounds instead of one, see
  // BracketService::generateRoundRobin()'s circle-method rewrite) would get
  // bogus "winner advances to next round" tree connector lines drawn
  // between fixtures that have no such relationship at all, and misleading
  // Quarterfinals/Semifinals/Final labels wherever a round's match count
  // happens to coincide with eliminationRoundLabel's cases.
  const isRoundRobin = bracket?.format === 'round_robin'

  // Double elimination gets its own two-track layout (winners bracket row
  // on top, losers bracket row below, grand final off to the side) instead
  // of the flat per-round-number columns every other format uses — a flat
  // layout would put the losers bracket's rounds (numbered 101+) AFTER the
  // winners bracket's in reading order, several columns away from the WB
  // matches whose losers actually feed them, which is exactly backwards for
  // "show the flow of the tournament".
  const isDoubleElimination = bracket?.format === 'double_elimination'

  // Swiss gets its own record-bucketed layout (a column per round, each
  // subdivided into labeled rows for whichever win-loss record landed
  // there — "2-0", "1-1", "0-2", ...) instead of one flat list of matches
  // per round — see computeSwissRecordBuckets's own doc comment.
  const isSwiss = bracket?.format === 'swiss'

  // Group stage gets its own group-of-cards standings layout (a bordered
  // card per group, each a Name/P/W/D/L/PTS table) for the group phase,
  // followed by the knockout bracket once it's generated — see
  // computeGroupStandings's own doc comment. Mirrors
  // BracketService::ADVANCE_PER_GROUP so the standings table highlights
  // the same qualification cutoff the backend actually seeds the knockout
  // from, rather than a display-only guess.
  const isGroupStage = bracket?.format === 'group_stage'
  const ADVANCE_PER_GROUP = 2

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

  // Only computed/used when isDoubleElimination — see groupDoubleEliminationMatches.
  const { wbRounds, lbRounds, finalMatch } = useMemo(
    () => groupDoubleEliminationMatches(structure.flat()),
    [structure]
  )

  // Only computed/used when isSwiss — see computeSwissRecordBuckets.
  const swissRounds = useMemo(() => computeSwissRecordBuckets(structure.flat()), [structure])

  // Only computed/used when isGroupStage — see computeGroupStandings.
  // Sorted by group number for stable left-to-right/reading order.
  const groupStandings = useMemo(() => computeGroupStandings(structure.flat()), [structure])
  const sortedGroupNumbers = useMemo(() => [...groupStandings.keys()].sort((a, b) => a - b), [groupStandings])
  // The knockout phase's matches look exactly like a single_elimination
  // bracket once generated (see isTreeRound's own doc comment) — this
  // filters the group-phase matches (group_number set) out of each round,
  // leaving only the knockout rounds, in the same left-to-right layout the
  // generic branch below already uses for a plain single_elimination
  // tournament.
  const knockoutRounds = useMemo(
    () => structure.map((round) => round.filter((m) => m.group_number == null)).filter((round) => round.length > 0),
    [structure]
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

      // Horizontal elbow: flow is left→right, so a connector exits a
      // match's right edge and enters the target's left edge — used for
      // every non-pyramid layout, double elimination included (a
      // cross-row winners→losers drop just has a bigger vertical jog).
      function pushHorizontal(fromId: number, toId: number, dashed: boolean) {
        const fromEl = cardEls.current.get(fromId)
        const toEl = cardEls.current.get(toId)
        if (!fromEl || !toEl) return
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        next.push({
          id: `${fromId}-${toId}`,
          x1: fromRect.right - containerRect.left + container.scrollLeft,
          y1: fromRect.top + fromRect.height / 2 - containerRect.top + container.scrollTop,
          x2: toRect.left - containerRect.left + container.scrollLeft,
          y2: toRect.top + toRect.height / 2 - containerRect.top + container.scrollTop,
          dashed,
        })
      }

      if (isDoubleElimination) {
        computeDoubleEliminationConnectors(structure.flat()).forEach((e) => pushHorizontal(e.from, e.to, e.dashed))
      } else if (isSwiss) {
        computeSwissConnectors(structure.flat()).forEach((e) => pushHorizontal(e.from, e.to, false))
      } else if (!isRoundRobin) {
        for (let r = 0; r < structure.length - 1; r++) {
          const round = structure[r]
          const nextRound = structure[r + 1]
          if (!isTreeRound(round) || !isTreeRound(nextRound)) continue

          round.forEach((match, i) => {
            const targetMatch = nextRound[Math.floor(i / 2)]
            if (!targetMatch) return

            if (isPyramid) {
              // Vertical (pyramid/portrait): flow is bottom→top instead
              // (round 1 sits at the bottom, the final at the top — see the
              // flex-col-reverse container below), so a connector exits a
              // match's top edge and enters the next one's bottom edge.
              const fromEl = cardEls.current.get(match.id)
              const toEl = cardEls.current.get(targetMatch.id)
              if (!fromEl || !toEl) return
              const fromRect = fromEl.getBoundingClientRect()
              const toRect = toEl.getBoundingClientRect()
              next.push({
                id: `${match.id}-${targetMatch.id}`,
                x1: fromRect.left + fromRect.width / 2 - containerRect.left + container.scrollLeft,
                y1: fromRect.top - containerRect.top + container.scrollTop,
                x2: toRect.left + toRect.width / 2 - containerRect.left + container.scrollLeft,
                y2: toRect.bottom - containerRect.top + container.scrollTop,
              })
            } else {
              pushHorizontal(match.id, targetMatch.id, false)
            }
          })
        }
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
  }, [structure, isPyramid, isDoubleElimination, isRoundRobin, isSwiss, scale])

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

  // Shared by both the double-elimination two-track layout and the generic
  // flat one below — same MatchCard, same handlers, just arranged into
  // different containers.
  function renderMatchCard(match: BracketMatch) {
    return (
      <MatchCard
        key={match.id}
        match={match}
        onClick={onSelectMatch ? () => onSelectMatch(match) : undefined}
        onSchedule={canScheduleMatches ? () => setSchedulingMatch(match) : undefined}
        onShare={canShareMatches ? () => setSharingMatch(match) : undefined}
        onStatSheet={isStatSheetEligible?.(match) && onOpenStatSheet ? () => onOpenStatSheet(match) : undefined}
        cardRef={(el) => {
          if (el) cardEls.current.set(match.id, el)
          else cardEls.current.delete(match.id)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {champion && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-center">
          <span className="text-sm font-semibold text-teal-800">🏆 Champion: {champion.name}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" className={chip(viewMode === 'bracket')} onClick={() => setViewMode('bracket')}>
            Bracket
          </button>
          <button type="button" className={chip(viewMode === 'standings')} onClick={() => setViewMode('standings')}>
            Standings
          </button>
        </div>
        {canShareBracket && (
          <button
            type="button"
            onClick={() => setSharingBracket(true)}
            className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
          >
            <IconShare className="h-3.5 w-3.5" />
            Share bracket
          </button>
        )}
      </div>

      {viewMode === 'standings' && (
        <TournamentStandingsView
          structure={structure}
          tournamentName={tournamentName}
          scoringType={scoringType}
          format={bracket.format}
        />
      )}

      <div
        ref={containerRef}
        className={`relative overflow-auto rounded-lg border border-slate-100 bg-slate-50/60 p-4 ${
          viewMode === 'standings' ? 'hidden' : ''
        }`}
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
            <marker id="bracket-arrow-amber" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" className="fill-amber-400" />
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
                className={line.dashed ? 'stroke-amber-400' : 'stroke-teal-300'}
                strokeWidth={1.5}
                strokeDasharray={line.dashed ? '4 3' : undefined}
                markerEnd={line.dashed ? 'url(#bracket-arrow-amber)' : 'url(#bracket-arrow)'}
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
          {isDoubleElimination ? (
            <div
              ref={contentRef}
              className="flex w-max items-stretch gap-10"
              style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Winners bracket</h3>
                  <div className="flex gap-8">
                    {wbRounds.map((round, i) => (
                      <div key={`wb-${i}`} className="relative flex flex-col justify-around gap-4">
                        <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {i === wbRounds.length - 1 ? 'WB Final' : eliminationRoundLabel(round.length, i)}
                        </h4>
                        {round.map((match) => renderMatchCard(match))}
                      </div>
                    ))}
                  </div>
                </div>
                {lbRounds.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600">Losers bracket</h3>
                    <div className="flex gap-8">
                      {lbRounds.map((round, i) => (
                        <div key={`lb-${i}`} className="relative flex flex-col justify-around gap-4">
                          <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {i === lbRounds.length - 1 ? 'LB Final' : `LB Round ${i + 1}`}
                          </h4>
                          {round.map((match) => renderMatchCard(match))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {finalMatch && (
                <div className="flex flex-col justify-center gap-2">
                  <h3 className="text-center text-xs font-semibold uppercase tracking-wide text-purple-600">
                    Grand final
                  </h3>
                  {renderMatchCard(finalMatch)}
                </div>
              )}
            </div>
          ) : isSwiss ? (
            <div
              ref={contentRef}
              className="flex w-max items-start gap-8"
              style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              {swissRounds.map(({ round, buckets }) => (
                <div key={round} className="flex flex-col gap-6">
                  <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Round {round}
                  </h4>
                  {buckets.map((bucket) => (
                    <div
                      key={bucket.label}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 p-3"
                    >
                      <h5 className="text-center text-[10px] font-bold uppercase tracking-wide text-teal-600">
                        {bucket.label}
                      </h5>
                      <div className="flex flex-col gap-4">{bucket.matches.map((match) => renderMatchCard(match))}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : isGroupStage ? (
            <div
              ref={contentRef}
              className="flex w-max flex-col gap-8"
              style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              <div className="flex flex-wrap gap-4">
                {sortedGroupNumbers.map((groupNumber) => (
                  <GroupStandingsCard
                    key={groupNumber}
                    groupNumber={groupNumber}
                    standings={groupStandings.get(groupNumber) ?? []}
                    matches={structure
                      .flat()
                      .filter((m) => m.group_number === groupNumber)
                      .sort((a, b) => a.round - b.round || a.id - b.id)}
                    advancePerGroup={ADVANCE_PER_GROUP}
                    renderMatchCard={renderMatchCard}
                  />
                ))}
              </div>
              {knockoutRounds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-600">Knockout stage</h3>
                  <div className="flex gap-8">
                    {knockoutRounds.map((round, i) => (
                      <div key={i} className="relative flex flex-col justify-around gap-4">
                        <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {eliminationRoundLabel(round.length, i)}
                        </h4>
                        {round.map((match) => renderMatchCard(match))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
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
                    {!isRoundRobin && isTreeRound(round) ? eliminationRoundLabel(round.length, i) : `Round ${i + 1}`}
                  </h4>
                  {round.map((match) => renderMatchCard(match))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isDoubleElimination && (
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-teal-300" /> Winner advances
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-amber-400" /> Loser drops to losers bracket
          </span>
        </div>
      )}

      {isSwiss && (
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-teal-300" /> Line traces a player's previous match
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-4 w-4 rounded-md border border-slate-300 bg-white/70" /> Box groups matches by
            record entering that round
          </span>
        </div>
      )}

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
          onGoLive={onGoLive}
        />
      )}

      {sharingBracket && (
        <ShareBracketModal
          tournamentId={tournamentId}
          tournamentName={tournamentName ?? 'this tournament'}
          onClose={() => setSharingBracket(false)}
        />
      )}
    </div>
  )
}
