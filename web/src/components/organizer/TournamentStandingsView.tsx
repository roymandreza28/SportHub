import { useState } from 'react'
import type { BracketMatch, ScoringType } from '../../lib/organizerApi'
import { STATUS_STYLE, TRACK_LABEL, isTreeRound, eliminationRoundLabel } from './BracketView'
import { MatchDetailModal } from './MatchDetailModal'
import { IconChevronDown } from '../layout/icons'

type ParticipantStanding = {
  id: number
  name: string
  wins: number
  losses: number
  for: number
  against: number
  matches: BracketMatch[]
}

// Mirrors the label MatchCard already shows on a bracket card (track name,
// then group number, then a real round name for a clean elimination round,
// falling back to a plain "Round N") — needs the whole round structure, not
// just the one match, to know whether its round is a clean elimination
// round (see isTreeRound's own doc comment).
function roundLabelFor(match: BracketMatch, structure: BracketMatch[][]): string {
  if (match.bracket_type && TRACK_LABEL[match.bracket_type]) return TRACK_LABEL[match.bracket_type]
  if (match.group_number != null) return `Group ${match.group_number + 1}`
  const round = structure[match.round - 1]
  if (round && isTreeRound(round)) return eliminationRoundLabel(round.length, match.round - 1)
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
}: {
  structure: BracketMatch[][]
  tournamentName?: string
  scoringType?: ScoringType
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
    for (const [participant, forScore, againstScore] of [
      [match.participant_a, match.score_a, match.score_b],
      [match.participant_b, match.score_b, match.score_a],
    ] as const) {
      if (!participant) continue
      const entry = standingsMap.get(participant.id) ?? {
        id: participant.id,
        name: participant.name,
        wins: 0,
        losses: 0,
        for: 0,
        against: 0,
        matches: [],
      }
      entry.matches.push(match)
      // Only a completed match has a real result — a still-scheduled or
      // live game shows up in the participant's own match history below,
      // just not counted toward their win/loss record yet.
      if (match.status === 'completed') {
        entry.for += forScore
        entry.against += againstScore
        if (match.winner?.id === participant.id) entry.wins += 1
        else entry.losses += 1
      }
      standingsMap.set(participant.id, entry)
    }
  }

  const ranked = [...standingsMap.values()].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.for - b.against - (a.for - a.against)
  )

  if (ranked.length === 0) {
    return <p className="text-sm text-slate-400">No participants placed into the bracket yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {ranked.map((participant, i) => {
        const isExpanded = expandedId === participant.id
        const played = participant.wins + participant.losses

        return (
          <div key={participant.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : participant.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {i + 1}
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
                            : null

                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setViewingMatch(match)}
                        className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">vs {opponent?.name ?? 'TBD'}</p>
                          <p className="text-slate-400">{roundLabelFor(match, structure)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {result && (
                            <span className={`font-bold ${result === 'W' ? 'text-teal-600' : 'text-red-500'}`}>
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
          roundLabel={roundLabelFor(viewingMatch, structure)}
          scoringType={scoringType}
          onClose={() => setViewingMatch(null)}
        />
      )}
    </div>
  )
}
