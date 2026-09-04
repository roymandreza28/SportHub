import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMatchSets, type BracketMatch, type SetScore, type Tournament } from '../../lib/organizerApi'

// Bowling has no natural in-app "win condition" per game (unlike a rally
// sport's target score) — a game ends when the physical 10 frames are done,
// which only the scorekeeper watching the lane knows. So unlike the other
// best-of-sets scoreboards (which auto-detect a set's end from the score),
// this one is a manual tally: +1/+5/+10 taps build up each player's pinfall
// for the game in progress, and "Save result & next game" is the explicit
// signal that this game is over. Once saved it round-trips through the same
// `sets` mechanism every other best-of-sets sport uses — the backend
// compares score_a/score_b per saved game to decide who won it, and
// completes the match once someone reaches tournament.sets_to_win games won.

const BUMPS = [1, 5, 10]

function gamesWon(games: SetScore[], side: 'a' | 'b'): number {
  return games.filter((g) => (side === 'a' ? g.score_a > g.score_b : g.score_b > g.score_a)).length
}

function PlayerPanel({
  color,
  label,
  name,
  onRename,
  score,
  onBump,
  disabled,
}: {
  color: 'blue' | 'red'
  label: string
  name: string
  onRename: (name: string) => void
  score: number
  onBump: (delta: number) => void
  disabled: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const headerBg = color === 'blue' ? 'bg-blue-800' : 'bg-red-800'

  function commitRename() {
    onRename(draft.trim() || label)
    setEditing(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-slate-900 shadow-lg">
      <div className={`flex items-center justify-center gap-2 px-4 py-3 ${headerBg}`}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            className="w-full max-w-[70%] rounded bg-white/20 px-2 py-0.5 text-center text-sm font-bold uppercase tracking-wide text-pure-white outline-none placeholder:text-white/60"
          />
        ) : (
          <>
            <span className="text-sm font-bold uppercase tracking-wide text-pure-white">{name}</span>
            <button
              onClick={() => {
                setDraft(name)
                setEditing(true)
              }}
              aria-label={`Rename ${label}`}
              className="text-white/60 hover:text-pure-white"
            >
              ✎
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 px-4 py-5">
        <span className="rounded-full bg-slate-800 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Score
        </span>
        <span className="text-5xl font-black tabular-nums text-pure-white">{score}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        {BUMPS.map((n) => (
          <button
            key={`plus-${n}`}
            disabled={disabled}
            onClick={() => onBump(n)}
            className="rounded-lg bg-white py-3 text-base font-bold text-slate-900 shadow transition hover:bg-slate-100 disabled:opacity-40"
          >
            +{n}
          </button>
        ))}
        {BUMPS.map((n) => (
          <button
            key={`minus-${n}`}
            disabled={disabled}
            onClick={() => onBump(-n)}
            className="rounded-lg bg-slate-800 py-3 text-base font-bold text-slate-300 shadow transition hover:bg-slate-700 disabled:opacity-40"
          >
            -{n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BowlingScoreboard({
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

  const [games, setGames] = useState<SetScore[]>(match.sets ?? [])
  const [currentA, setCurrentA] = useState(0)
  const [currentB, setCurrentB] = useState(0)
  const [gameNumber, setGameNumber] = useState((match.sets?.length ?? 0) + 1)
  const [nameA, setNameA] = useState(match.participant_a?.name ?? 'Player 1')
  const [nameB, setNameB] = useState(match.participant_b?.name ?? 'Player 2')
  const [showFinal, setShowFinal] = useState(false)
  const [hornActive, setHornActive] = useState(false)

  // Re-sync from the server once a websocket-driven refetch hands down a
  // fresh match prop (e.g. the facilitator's device saved a game).
  useEffect(() => {
    setGames(match.sets ?? [])
    setGameNumber((match.sets?.length ?? 0) + 1)
  }, [match.id, match.sets])

  const save = useMutation({
    mutationFn: (nextGames: SetScore[]) => updateMatchSets(match.id, { sets: nextGames }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] }),
  })

  const isDecided = match.status === 'completed'
  const gamesToWin = tournament.sets_to_win ?? 1
  const wonA = gamesWon(games, 'a')
  const wonB = gamesWon(games, 'b')

  function bump(side: 'a' | 'b', delta: number) {
    if (isDecided) return
    const setter = side === 'a' ? setCurrentA : setCurrentB
    setter((v) => Math.max(0, v + delta))
  }

  function saveAndNext() {
    if (isDecided) return
    const nextGames = [...games, { score_a: currentA, score_b: currentB }]
    setGames(nextGames)
    setCurrentA(0)
    setCurrentB(0)
    setGameNumber(nextGames.length + 1)
    setShowFinal(false)
    save.mutate(nextGames)
  }

  function resetGame() {
    setCurrentA(0)
    setCurrentB(0)
    setShowFinal(false)
  }

  function soundHorn() {
    setHornActive(true)
    window.setTimeout(() => setHornActive(false), 500)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4">
      <div
        className="flex w-full max-w-5xl flex-col gap-4 overflow-y-auto rounded-2xl bg-slate-100 p-4 shadow-2xl dark:bg-slate-950"
        style={{ maxHeight: '92vh' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">🎳 Bowling Scoreboard</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tournament.name}
              {gamesToWin > 1 && ` · Games won ${wonA}-${wonB} (first to ${gamesToWin})`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            Close
          </button>
        </div>

        {isDecided && (
          <p className="rounded-lg bg-green-100 px-4 py-2 text-center text-sm font-semibold text-green-700">
            {match.winner?.name ?? (wonA > wonB ? nameA : nameB)} wins the match!
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_18rem]">
          <PlayerPanel
            color="blue"
            label="Player 1"
            name={nameA}
            onRename={setNameA}
            score={currentA}
            onBump={(d) => bump('a', d)}
            disabled={isDecided}
          />
          <PlayerPanel
            color="red"
            label="Player 2"
            name={nameB}
            onRename={setNameB}
            score={currentB}
            onBump={(d) => bump('b', d)}
            disabled={isDecided}
          />

          <div className="flex flex-col overflow-hidden rounded-xl bg-slate-900 shadow-lg">
            <div className="bg-slate-800 px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-pure-white">
              Game
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Game</span>
                <span className="text-2xl font-black tabular-nums text-pure-white">{gameNumber}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setGameNumber((n) => n + 1)}
                  className="rounded-lg bg-white py-2 text-sm font-bold text-slate-900 shadow"
                >
                  +1
                </button>
                <button
                  onClick={() => setGameNumber((n) => Math.max(1, n - 1))}
                  className="rounded-lg bg-slate-950 py-2 text-sm font-bold text-slate-300 shadow"
                >
                  -1
                </button>
              </div>

              <button
                onClick={soundHorn}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  hornActive ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {hornActive ? '🔔 Horn!' : 'Horn'}
              </button>

              <label className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-200">
                Show FINAL
                <button
                  role="switch"
                  aria-checked={showFinal}
                  onClick={() => setShowFinal((v) => !v)}
                  className={`relative h-5 w-9 rounded-full transition ${showFinal ? 'bg-teal-500' : 'bg-slate-600'}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${showFinal ? 'left-4' : 'left-0.5'}`}
                  />
                </button>
              </label>

              <button
                onClick={saveAndNext}
                disabled={isDecided || save.isPending}
                className="rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white shadow transition hover:bg-green-700 disabled:opacity-50"
              >
                {save.isPending ? 'Saving...' : 'Save result & next game'}
              </button>

              <button
                onClick={resetGame}
                disabled={isDecided}
                className="rounded-lg border border-red-500/40 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                ↺ Reset Game
              </button>
            </div>
          </div>
        </div>

        {games.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Game history{showFinal && ' — FINAL'}
            </p>
            <div className="flex flex-wrap gap-2">
              {games.map((g, i) => (
                <span
                  key={i}
                  className={`rounded-full px-3 py-1 text-xs font-medium tabular-nums ${
                    g.score_a > g.score_b
                      ? 'bg-blue-100 text-blue-700'
                      : g.score_b > g.score_a
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  G{i + 1}: {g.score_a}–{g.score_b}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
