import { useState } from 'react'
import type { BracketMatch, ScoringType, TournamentFormat } from '../../lib/organizerApi'
import { STATUS_STYLE, TRACK_LABEL, isTreeRound, eliminationRoundLabel } from './BracketView'
import { MatchDetailModal } from './MatchDetailModal'
import { IconChevronDown } from '../layout/icons'

type ParticipantStanding = {
  id: number
  name: string
  wins: number
  draws: number
  losses: number
  for: number
  against: number
  // Real points scored, not "sets won" — for a best-of-sets match `for`
  // above is the set count (e.g. 2-1), which is what the game score should
  // show, but the champion tiebreak below needs actual points (see
  // BracketService::realPointTotals()'s own reasoning for the same split).
  totalPoints: number
  matches: BracketMatch[]
}

// Equal win-loss records are shown tied at the same position — nobody
// drops a spot just because of a coin-flip differential. The one
// exception is the very top spot: a tournament can only crown one
// champion, so if the best record is shared, whoever scored the most real
// points across the whole tournament (see BracketService::
// determineChampion()'s own tiebreak, which this mirrors) takes sole
// possession of 1st; the rest of that tied group falls to 2nd, still tied
// with each other. Every other tied group (2nd, 3rd, ...) is left alone —
// there's no "runner-up champion" to resolve, so no score tiebreak is
// applied there. Ranks are DENSE (1, 2, 3, 3, 3, 4, ...), not "standard
// competition" ranking (1, 2, 3, 3, 3, 6, ...) — a 3-way tie for 3rd is
// followed by 4th, not 6th; nobody's position number jumps just because
// of how many people they're tied with.
function rankStandings(participants: ParticipantStanding[]): { participant: ParticipantStanding; rank: number }[] {
  const winPoints = (p: ParticipantStanding) => p.wins + p.draws * 0.5

  // Display order only — ties elsewhere never get resolved by this, just
  // kept deterministic (alphabetical) rather than left to insertion order.
  const sorted = [...participants].sort((a, b) => winPoints(b) - winPoints(a) || a.name.localeCompare(b.name))

  if (sorted.length > 1 && winPoints(sorted[0]) === winPoints(sorted[1])) {
    let end = 1
    while (end < sorted.length && winPoints(sorted[end]) === winPoints(sorted[0])) end++
    const topGroup = sorted.slice(0, end).sort((a, b) => b.totalPoints - a.totalPoints)
    sorted.splice(0, end, ...topGroup)
  }

  const ranks: number[] = [1]
  for (let i = 1; i < sorted.length; i++) {
    const sameRecord = winPoints(sorted[i]) === winPoints(sorted[i - 1])
    // Only the boundary right after the champion (index 0 -> 1) forces a
    // rank increment despite equal records — that tie was already broken
    // by score above. Every later equal-record boundary stays tied.
    const championBoundary = i === 1 && sameRecord
    ranks.push(sameRecord && !championBoundary ? ranks[i - 1] : ranks[i - 1] + 1)
  }

  return sorted.map((participant, i) => ({ participant, rank: ranks[i] }))
}

// Mirrors the label MatchCard already shows on a bracket card (track name,
// then group number, then a real round name for a clean elimination round,
// falling back to a plain "Round N") — needs the whole round structure, not
// just the one match, to know whether its round is a clean elimination
// round (see isTreeRound's own doc comment). round_robin is excluded the
// same way BracketView's own render does (see its isRoundRobin comment):
// isTreeRound alone can't tell a round_robin match apart from a real
// elimination one (neither ever sets bracket_type/group_number), so
// without this a round_robin fixture could get mislabeled "Quarterfinals"
// whenever that round's match count happened to match one of
// eliminationRoundLabel's cases.
function roundLabelFor(match: BracketMatch, structure: BracketMatch[][], format?: TournamentFormat): string {
  if (match.bracket_type && TRACK_LABEL[match.bracket_type]) return TRACK_LABEL[match.bracket_type]
  if (match.group_number != null) return `Group ${String.fromCharCode(65 + match.group_number)}`
  const round = structure[match.round - 1]
  if (format !== 'round_robin' && round && isTreeRound(round)) return eliminationRoundLabel(round.length, match.round - 1)
  return `Round ${match.round}`
}

// The list-format alternative to BracketView's tree/grid — every participant
// (team or individual, whichever this tournament registers) ranked by win
// record, each one a full-width card that expands into that participant's
// own match history, each match in THAT history opening a full record of
// that one game. Built from the same match list the bracket grid already
// has, so it works for every tournament format without a format-specific
// standings computation (round_robin/swiss's ranking mattered most, but
// there's no reason a single/double-elimination bracket's participants
// don't deserve the same at-a-glance win/loss view).
export function TournamentStandingsView({
  structure,
  tournamentName,
  scoringType,
  format,
}: {
  structure: BracketMatch[][]
  tournamentName?: string
  scoringType?: ScoringType
  format?: TournamentFormat
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [viewingMatch, setViewingMatch] = useState<BracketMatch | null>(null)

  const standingsMap = new Map<number, ParticipantStanding>()

  for (const match of structure.flat()) {
    // The shaped participant_a/participant_b (an {id, name} object) is the
    // one to key off of, not the raw participant_a_id/participant_b_id
    // columns — those are the individual-match user-id columns, which stay
    // null for a team match (which populates participant_a_team_id
    // instead). MatchCard's own winner comparison already does the same
    // thing for exactly this reason.
    for (const [participant, forScore, againstScore, isA] of [
      [match.participant_a, match.score_a, match.score_b, true],
      [match.participant_b, match.score_b, match.score_a, false],
    ] as const) {
      if (!participant) continue
      const entry = standingsMap.get(participant.id) ?? {
        id: participant.id,
        name: participant.name,
        wins: 0,
        draws: 0,
        losses: 0,
        for: 0,
        against: 0,
        totalPoints: 0,
        matches: [],
      }
      entry.matches.push(match)
      // Only a completed match has a real result — a still-scheduled or
      // live game shows up in the participant's own match history below,
      // just not counted toward their record yet. A completed match with no
      // winner (equal scores) is a draw, not a loss for both sides — this
      // used to fall into the `else` branch below and silently count as a
      // loss for BOTH participants.
      if (match.status === 'completed') {
        entry.for += forScore
        entry.against += againstScore
        // `forScore` above is sets WON for a best-of-sets match (the 2-1
        // that belongs in the game-score display) — the champion tiebreak
        // needs actual points instead, so sum each set's real score when
        // one exists, falling back to forScore for a single_score match
        // (where it already IS the real point total).
        entry.totalPoints +=
          match.sets && match.sets.length > 0
            ? match.sets.reduce((sum, s) => sum + (isA ? s.score_a : s.score_b), 0)
            : forScore
        if (match.winner?.id === participant.id) entry.wins += 1
        else if (match.winner) entry.losses += 1
        else entry.draws += 1
      }
      standingsMap.set(participant.id, entry)
    }
  }

  // A draw is worth half a win for ranking purposes (the same 1/0.5/0
  // points scheme the swiss pairing algorithm itself uses — see
  // BracketService::swissStandings()) rather than not counting at all. Ties
  // in that record are shown as a shared position — see rankStandings's own
  // doc comment for the one exception (the champion spot).
  const ranked = rankStandings([...standingsMap.values()])

  if (ranked.length === 0) {
    return <p className="text-sm text-slate-400">No participants placed into the bracket yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {ranked.map(({ participant, rank }) => {
        const isExpanded = expandedId === participant.id
        const played = participant.wins + participant.draws + participant.losses

        return (
          <div key={participant.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : participant.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {rank}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{participant.name}</p>
                  <p className="text-xs text-slate-500">
                    {played} game{played === 1 ? '' : 's'} played
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums">
                  <span className="text-teal-600">{participant.wins}W</span>
                  {participant.draws > 0 && (
                    <>
                      <span className="text-slate-300"> – </span>
                      <span className="text-amber-600">{participant.draws}D</span>
                    </>
                  )}
                  <span className="text-slate-300"> – </span>
                  <span className="text-red-500">{participant.losses}L</span>
                </span>
                <IconChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {isExpanded && (
              <div className="flex flex-col gap-1 border-t border-slate-100 p-2">
                {participant.matches
                  .slice()
                  .sort((a, b) => a.round - b.round || a.id - b.id)
                  .map((match) => {
                    const isA = match.participant_a?.id === participant.id
                    const opponent = isA ? match.participant_b : match.participant_a
                    const myScore = isA ? match.score_a : match.score_b
                    const oppScore = isA ? match.score_b : match.score_a
                    const result =
                      match.status !== 'completed'
                        ? null
                        : match.winner?.id === participant.id
                          ? 'W'
                          : match.winner
                            ? 'L'
                            : 'D'

                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setViewingMatch(match)}
                        className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">vs {opponent?.name ?? 'TBD'}</p>
                          <p className="text-slate-400">{roundLabelFor(match, structure, format)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {result && (
                            <span
                              className={`font-bold ${
                                result === 'W' ? 'text-teal-600' : result === 'D' ? 'text-amber-600' : 'text-red-500'
                              }`}
                            >
                              {result}
                            </span>
                          )}
                          {!match.won_by_default && (match.status === 'completed' || match.status === 'live') && (
                            <span className="tabular-nums text-slate-500">
                              {myScore}–{oppScore}
                            </span>
                          )}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[match.status] ?? 'bg-slate-100 text-slate-500'}`}
                          >
                            {match.won_by_default ? 'default' : match.status}
                          </span>
                        </div>
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        )
      })}

      {viewingMatch && (
        <MatchDetailModal
          match={viewingMatch}
          tournamentName={tournamentName}
          roundLabel={roundLabelFor(viewingMatch, structure, format)}
          scoringType={scoringType}
          onClose={() => setViewingMatch(null)}
        />
      )}
    </div>
  )
}
