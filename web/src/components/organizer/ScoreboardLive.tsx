import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMatchScore, updateMatchSets, type BracketMatch, type SetScore, type Tournament } from '../../lib/organizerApi'
import { echo } from '../../lib/echo'
import { buttonPrimary, buttonSecondary, buttonSuccess } from '../../lib/formStyles'
import { BasketballScoreboard } from './BasketballScoreboard'
import { Basketball3x3Scoreboard } from './Basketball3x3Scoreboard'
import { VolleyballScoreboard } from './VolleyballScoreboard'
import { BadmintonScoreboard } from './BadmintonScoreboard'
import { PickleballScoreboard } from './PickleballScoreboard'
import { TableTennisScoreboard } from './TableTennisScoreboard'
import { TennisScoreboard } from './TennisScoreboard'
import { BowlingScoreboard } from './BowlingScoreboard'

type LiveUpdate = { score_a: number; score_b: number; status?: string }

function SetsScoreboard({
  match,
  tournament,
  tournamentId,
  onClose,
}: {
  match: BracketMatch
  tournament: Tournament
  tournamentId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [sets, setSets] = useState<SetScore[]>(match.sets ?? [])
  const [currentA, setCurrentA] = useState(0)
  const [currentB, setCurrentB] = useState(0)

  useEffect(() => {
    setSets(match.sets ?? [])
  }, [match])

  const canPlay = match.participant_a !== null && match.participant_b !== null
  const setsToWin = tournament.sets_to_win ?? 3
  const setsWonA = sets.filter((s) => s.score_a > s.score_b).length
  const setsWonB = sets.filter((s) => s.score_b > s.score_a).length
  const isDecided = match.status === 'completed'

  const save = useMutation({
    mutationFn: (nextSets: SetScore[]) => updateMatchSets(match.id, { sets: nextSets }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  function recordSet() {
    const nextSets = [...sets, { score_a: currentA, score_b: currentB }]
    setSets(nextSets)
    setCurrentA(0)
    setCurrentB(0)
    save.mutate(nextSets)
  }

  function removeLastSet() {
    const nextSets = sets.slice(0, -1)
    setSets(nextSets)
    save.mutate(nextSets)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Scoreboard — Match #{match.id}</h3>
        <p className="mt-0.5 text-xs text-slate-500">Best of {setsToWin * 2 - 1} sets — first to {setsToWin} wins.</p>

        {!canPlay && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Both participants aren&apos;t determined yet.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          <span>{match.participant_a?.name ?? 'TBD'}</span>
          <span className="tabular-nums text-teal-700">{setsWonA} - {setsWonB}</span>
          <span>{match.participant_b?.name ?? 'TBD'}</span>
        </div>

        {sets.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
            {sets.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded-md border border-slate-100 px-2 py-1">
                <span>Set {i + 1}</span>
                <span className="tabular-nums font-medium">{s.score_a} - {s.score_b}</span>
              </li>
            ))}
          </ul>
        )}

        {isDecided ? (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            Match complete — {(setsWonA > setsWonB ? match.participant_a?.name : match.participant_b?.name) ?? 'Winner'} wins.
          </p>
        ) : (
          <div className="mt-3 flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
              {match.participant_a?.name ?? 'A'}
              <input
                type="number"
                min={0}
                value={currentA}
                onChange={(e) => setCurrentA(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-right tabular-nums focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
              {match.participant_b?.name ?? 'B'}
              <input
                type="number"
                min={0}
                value={currentB}
                onChange={(e) => setCurrentB(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-right tabular-nums focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <button onClick={recordSet} disabled={!canPlay || save.isPending} className={buttonPrimary}>
              Record set
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {sets.length > 0 && !isDecided && (
            <button onClick={removeLastSet} disabled={save.isPending} className={buttonSecondary}>
              Undo last set
            </button>
          )}
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function SingleScoreScoreboard({
  match,
  tournamentId,
  onClose,
}: {
  match: BracketMatch
  tournamentId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [scoreA, setScoreA] = useState(match.score_a)
  const [scoreB, setScoreB] = useState(match.score_b)
  const [liveUpdate, setLiveUpdate] = useState<LiveUpdate | null>(null)

  useEffect(() => {
    setScoreA(match.score_a)
    setScoreB(match.score_b)
  }, [match])

  // Public channel — any spectator (and this organizer's own other tabs) sees
  // score changes the instant they're broadcast, not just after a refetch.
  useEffect(() => {
    const channel = echo.channel(`match.${match.id}`)
    channel
      .listen('.MatchEventCreated', (e: { payload: { score_a: number; score_b: number } }) => {
        setLiveUpdate((prev) => ({ ...prev, score_a: e.payload.score_a, score_b: e.payload.score_b }))
        queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
      })
      .listen('.MatchStatusChanged', (e: { status: string; score_a: number; score_b: number }) => {
        setLiveUpdate({ score_a: e.score_a, score_b: e.score_b, status: e.status })
        queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
      })

    return () => {
      echo.leave(`match.${match.id}`)
    }
  }, [match.id, tournamentId, queryClient])

  const canPlay = match.participant_a !== null && match.participant_b !== null

  const save = useMutation({
    mutationFn: (status?: 'live' | 'completed') => updateMatchScore(match.id, { score_a: scoreA, score_b: scoreB, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Scoreboard — Match #{match.id}</h3>

        {!canPlay && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Both participants aren&apos;t determined yet.
          </p>
        )}

        {liveUpdate && (
          <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            Live: {liveUpdate.score_a} - {liveUpdate.score_b}
            {liveUpdate.status && ` (${liveUpdate.status})`}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-700">
            {match.participant_a?.name ?? 'TBD'}
            <input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right tabular-nums focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm font-medium text-slate-700">
            {match.participant_b?.name ?? 'TBD'}
            <input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(Number(e.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right tabular-nums focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
          <button onClick={() => save.mutate('live')} disabled={!canPlay || save.isPending} className={buttonPrimary}>
            Update score
          </button>
          <button onClick={() => save.mutate('completed')} disabled={!canPlay || save.isPending} className={buttonSuccess}>
            Finish match
          </button>
        </div>
      </div>
    </div>
  )
}

export function ScoreboardLive({
  match,
  tournamentId,
  tournament,
  onClose,
}: {
  match: BracketMatch
  tournamentId: number
  tournament?: Tournament
  onClose: () => void
}) {
  // Basketball and volleyball get sport-accurate scoreboards; every other
  // sport keeps the generic single-score/best-of-sets boards below. The rich
  // quarters/clock/foul-bonus basketball board assumes NBA/FIBA-style 5v5
  // rules, so it only applies to 5v5 team tournaments — 3x3 gets its own
  // FIBA-3x3-rules board below (it's a separate discipline, not small-sided
  // 5v5), and individual basketball tournaments fall back to the generic
  // board further down.
  if (tournament?.sport.name === 'Basketball' && tournament.sport_format?.players_per_side === 5) {
    return <BasketballScoreboard match={match} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Basketball' && tournament.sport_format?.players_per_side === 3) {
    return <Basketball3x3Scoreboard match={match} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Volleyball') {
    return <VolleyballScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Badminton') {
    return <BadmintonScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Pickleball') {
    return <PickleballScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Table Tennis') {
    return <TableTennisScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Tennis') {
    return <TennisScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.sport.name === 'Bowling') {
    return <BowlingScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  if (tournament?.scoring_type === 'best_of_sets') {
    return <SetsScoreboard match={match} tournament={tournament} tournamentId={tournamentId} onClose={onClose} />
  }

  return <SingleScoreScoreboard match={match} tournamentId={tournamentId} onClose={onClose} />
}
