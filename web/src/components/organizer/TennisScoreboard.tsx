import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMatchRoster,
  toPlayerStatsPayload,
  updateMatchSets,
  type BracketMatch,
  type MatchRosterTeam,
  type PlayerStatEntry,
  type SetScore,
  type Tournament,
} from '../../lib/organizerApi'
import { buttonSecondary } from '../../lib/formStyles'

// 🎾 Tennis Scoring System — the deepest hierarchy of any board here: points
// (0/15/30/40/deuce/advantage) roll up into games, games roll up into sets
// (with a 7-point tiebreak at 6-6), sets roll up into the match. See the
// "Tennis rules" panel at the bottom for the full reference this component
// implements, including the two optional/"sometimes" rules (No-Ad scoring,
// Super tiebreak) as Game Settings toggles rather than always-on.
const TIEBREAK_TARGET = 7
const SUPER_TIEBREAK_TARGET = 10
const POINT_LABELS = ['0', '15', '30', '40']

type PointCategory = 'point' | 'error'
type RosterPlayer = { id: number; name: string }
// Feeds the career stats pentagon (see api/app/Support/PlayerStatFieldSets.php).
type PlayerStat = { points_won: number; aces: number; winners: number; unforced_errors: number; double_faults: number }
type PlayerStats = Record<number, PlayerStat>
type PointRequest = { scoringSide: 'a' | 'b'; category: PointCategory }
type Phase = 'game' | 'tiebreak'
type QuickStatKey = 'aces' | 'winners' | 'double_faults'

const QUICK_STAT_LABEL: Record<QuickStatKey, string> = { aces: 'Ace', winners: 'Winner', double_faults: 'DF' }

function emptyStat(): PlayerStat {
  return { points_won: 0, aces: 0, winners: 0, unforced_errors: 0, double_faults: 0 }
}

type PointSnapshot = {
  pointA: number
  pointB: number
  gameA: number
  gameB: number
  phase: Phase
  playerStats: PlayerStats
}
type LogEntry = { id: number; text: string; at: number }

function jerseyKey(matchId: number) {
  return `sporthub:scoreboard:tennis:jerseys:${matchId}`
}

function statsKey(matchId: number) {
  return `sporthub:scoreboard:tennis:stats:${matchId}`
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// 0/15/30/40, then Deuce/Advantage once both sides have reached 40 (index 3).
function pointLabel(mine: number, theirs: number): string {
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40'
    return mine > theirs ? 'AD' : '40'
  }
  return POINT_LABELS[Math.min(mine, 3)]
}

function PlayerPickerModal({
  title,
  team,
  jerseys,
  isDark,
  onPick,
  onCancel,
}: {
  title: string
  team: MatchRosterTeam | null | undefined
  jerseys: Record<number, string>
  isDark: boolean
  onPick: (player: RosterPlayer) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4">
      <div className={`w-full max-w-sm rounded-xl p-5 shadow-2xl ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'}`}>
        <h4 className="text-sm font-bold">{title}</h4>
        <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{team?.name ?? ''}</p>

        <div className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {!team && <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading roster...</p>}
          {team?.members.map((m) => (
            <button
              key={m.id}
              onClick={() => onPick(m)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                {jerseys[m.id] || '#'}
              </span>
              <span className="flex-1 truncate">{m.name}</span>
            </button>
          ))}
        </div>

        <button onClick={onCancel} className={`${buttonSecondary} mt-4 w-full`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export function TennisScoreboard({
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
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: roster } = useQuery({
    queryKey: ['organizer', 'match-roster', match.id],
    queryFn: () => fetchMatchRoster(match.id),
  })

  // Most matches are best of 3 (first to 2 sets) — Grand Slam men's matches
  // are best of 5 (first to 3), which an organizer picks at tournament
  // creation via sets_to_win, same as every other multi-set sport here.
  const setsToWin = tournament.sets_to_win ?? 2
  const totalPossibleSets = setsToWin * 2 - 1

  const isDoubles = (roster?.team_a?.members.length ?? 0) > 1 || (roster?.team_b?.members.length ?? 0) > 1

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [homeName, setHomeName] = useState(match.participant_a?.name ?? 'Home')
  const [awayName, setAwayName] = useState(match.participant_b?.name ?? 'Away')
  const [shareCopied, setShareCopied] = useState(false)

  // "Sometimes" rules — off by default, matching the rulebook's own framing
  // of them as optional/format-specific rather than the standard game.
  const [noAdScoring, setNoAdScoring] = useState(false)
  const [superTiebreakFinalSet, setSuperTiebreakFinalSet] = useState(false)

  const [sets, setSets] = useState<SetScore[]>(match.sets ?? [])
  const [gameA, setGameA] = useState(0)
  const [gameB, setGameB] = useState(0)
  const [pointA, setPointA] = useState(0)
  const [pointB, setPointB] = useState(0)
  const [phase, setPhase] = useState<Phase>('game')
  const [firstServer, setFirstServer] = useState<'a' | 'b'>('a')

  const historyRef = useRef<PointSnapshot[]>([])
  const [historyLength, setHistoryLength] = useState(0)

  const [jerseys, setJerseys] = useState<Record<number, string>>(() => loadJSON(jerseyKey(match.id), {}))
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadJSON(statsKey(match.id), {}))
  const [pointRequest, setPointRequest] = useState<PointRequest | null>(null)

  const [matchLog, setMatchLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)

  const [rosterOpen, setRosterOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    setSets(match.sets ?? [])
  }, [match])

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    localStorage.setItem(jerseyKey(match.id), JSON.stringify(jerseys))
  }, [jerseys, match.id])

  useEffect(() => {
    localStorage.setItem(statsKey(match.id), JSON.stringify(playerStats))
  }, [playerStats, match.id])

  function log(text: string) {
    logIdRef.current += 1
    setMatchLog((entries) => [{ id: logIdRef.current, text, at: Date.now() }, ...entries].slice(0, 200))
  }

  function setJersey(playerId: number, value: string) {
    setJerseys((j) => ({ ...j, [playerId]: value }))
  }

  const canPlay = match.participant_a !== null && match.participant_b !== null
  const setsWonA = sets.filter((s) => s.score_a > s.score_b).length
  const setsWonB = sets.filter((s) => s.score_b > s.score_a).length
  const isDecided = match.status === 'completed'
  const isDecidingSet = sets.length === totalPossibleSets - 1
  const isSuperTiebreakSet = isDecidingSet && superTiebreakFinalSet

  // Games alternate serve; a tiebreak alternates every point (simplified —
  // real ITTF/ITF tiebreak serve order is 1-then-2, not tracked here).
  const gamesPlayed = sets.reduce((sum, s) => sum + s.score_a + s.score_b, 0) + gameA + gameB
  const servingSide =
    phase === 'tiebreak'
      ? (pointA + pointB) % 2 === 0
        ? firstServer
        : firstServer === 'a'
          ? 'b'
          : 'a'
      : gamesPlayed % 2 === 0
        ? firstServer
        : firstServer === 'a'
          ? 'b'
          : 'a'
  const servingTeamName = servingSide === 'a' ? homeName : awayName

  const tiebreakTarget = isSuperTiebreakSet ? SUPER_TIEBREAK_TARGET : TIEBREAK_TARGET
  const isDeuce = phase === 'game' && pointA >= 3 && pointB >= 3 && pointA === pointB

  const pickerSide: 'a' | 'b' | null = pointRequest
    ? pointRequest.category === 'error'
      ? pointRequest.scoringSide === 'a'
        ? 'b'
        : 'a'
      : pointRequest.scoringSide
    : null
  const pickerTeam = pickerSide === 'a' ? roster?.team_a : pickerSide === 'b' ? roster?.team_b : null

  const save = useMutation({
    mutationFn: (input: { sets: SetScore[]; player_stats?: PlayerStatEntry[] }) => updateMatchSets(match.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  function pushHistory() {
    historyRef.current = [...historyRef.current, { pointA, pointB, gameA, gameB, phase, playerStats: { ...playerStats } }].slice(-200)
    setHistoryLength(historyRef.current.length)
  }

  function undoPoint() {
    const last = historyRef.current.pop()
    setHistoryLength(historyRef.current.length)
    if (!last) return
    setPointA(last.pointA)
    setPointB(last.pointB)
    setGameA(last.gameA)
    setGameB(last.gameB)
    setPhase(last.phase)
    setPlayerStats(last.playerStats)
    log('Undo point')
  }

  function startNewSet() {
    setGameA(0)
    setGameB(0)
    setPointA(0)
    setPointB(0)
    // Straight into a super-tiebreak instead of normal games, if this new
    // set is the deciding one and that mode is on.
    const nextIsDeciding = sets.length === totalPossibleSets - 1
    setPhase(nextIsDeciding && superTiebreakFinalSet ? 'tiebreak' : 'game')
  }

  function finishSet(finalGameA: number, finalGameB: number, statsForSave: PlayerStats) {
    const nextSets = [...sets, { score_a: finalGameA, score_b: finalGameB }]
    setSets(nextSets)
    log(`Set ${nextSets.length} won by ${finalGameA > finalGameB ? homeName : awayName} (${finalGameA}-${finalGameB})`)
    save.mutate({ sets: nextSets, player_stats: toPlayerStatsPayload(statsForSave) })
    startNewSet()
  }

  function finishGame(winner: 'a' | 'b', statsForSave: PlayerStats) {
    const nextGameA = winner === 'a' ? gameA + 1 : gameA
    const nextGameB = winner === 'b' ? gameB + 1 : gameB
    setPointA(0)
    setPointB(0)

    const leader = Math.max(nextGameA, nextGameB)
    const trailer = Math.min(nextGameA, nextGameB)

    if (leader >= 6 && leader - trailer >= 2) {
      finishSet(nextGameA, nextGameB, statsForSave)
      return
    }
    if (nextGameA === 6 && nextGameB === 6) {
      setGameA(nextGameA)
      setGameB(nextGameB)
      setPhase('tiebreak')
      log('Tiebreak — 6 games apiece')
      return
    }
    setGameA(nextGameA)
    setGameB(nextGameB)
  }

  function finishTiebreak(winner: 'a' | 'b', statsForSave: PlayerStats) {
    // A tiebreak win closes out the set: 7-6 (or, for a super tiebreak
    // standing in for the whole deciding set, the raw tiebreak score).
    if (isSuperTiebreakSet) {
      finishSet(winner === 'a' ? pointA + 1 : pointA, winner === 'b' ? pointB + 1 : pointB, statsForSave)
      return
    }
    finishSet(winner === 'a' ? 7 : 6, winner === 'b' ? 7 : 6, statsForSave)
  }

  function applyPoint(scoringSide: 'a' | 'b', category: PointCategory, player: RosterPlayer) {
    if (isDecided || !canPlay) return
    pushHistory()

    const nextA = scoringSide === 'a' ? pointA + 1 : pointA
    const nextB = scoringSide === 'b' ? pointB + 1 : pointB

    const nextStats = {
      ...playerStats,
      [player.id]: {
        ...emptyStat(),
        ...playerStats[player.id],
        points_won: (playerStats[player.id]?.points_won ?? 0) + (category === 'point' ? 1 : 0),
        unforced_errors: (playerStats[player.id]?.unforced_errors ?? 0) + (category === 'error' ? 1 : 0),
      },
    }
    setPlayerStats(nextStats)

    const scoringTeamName = scoringSide === 'a' ? homeName : awayName
    const logLine =
      category === 'error'
        ? `${player.name} error → point ${scoringTeamName}`
        : `${player.name} (${scoringTeamName}) point`
    log(logLine)

    if (phase === 'tiebreak') {
      const leader = Math.max(nextA, nextB)
      const trailer = Math.min(nextA, nextB)
      if (leader >= tiebreakTarget && leader - trailer >= 2) {
        finishTiebreak(nextA > nextB ? 'a' : 'b', nextStats)
        return
      }
      setPointA(nextA)
      setPointB(nextB)
      return
    }

    // Regular game — No-Ad means the very next point after 40-40 decides
    // the game outright, instead of requiring a 2-point margin.
    const wonByNoAd = noAdScoring && nextA >= 3 && nextB >= 3 && Math.abs(nextA - nextB) === 1
    const wonNormally = Math.max(nextA, nextB) >= 4 && Math.abs(nextA - nextB) >= 2
    if (wonByNoAd || wonNormally) {
      finishGame(nextA > nextB ? 'a' : 'b', nextStats)
      return
    }
    setPointA(nextA)
    setPointB(nextB)
  }

  // Aces / winners / double faults are supplementary box-score taps — the
  // Point/Opp. error buttons above don't distinguish how a point was won or
  // lost, so these are tapped directly on the roster row and round-trip
  // immediately with the current (not-yet-finished) set/game score.
  function bumpStat(playerId: number, key: QuickStatKey) {
    if (isDecided) return
    const nextStats = { ...playerStats, [playerId]: { ...emptyStat(), ...playerStats[playerId], [key]: (playerStats[playerId]?.[key] ?? 0) + 1 } }
    setPlayerStats(nextStats)
    save.mutate({ sets, player_stats: toPlayerStatsPayload(nextStats) })
  }

  function requestPoint(scoringSide: 'a' | 'b', category: PointCategory) {
    if (isDecided || !canPlay) return

    const attributionSide = category === 'error' ? (scoringSide === 'a' ? 'b' : 'a') : scoringSide
    const team = attributionSide === 'a' ? roster?.team_a : roster?.team_b

    if (team && team.members.length > 1) {
      setPointRequest({ scoringSide, category })
      return
    }

    const soloPlayer = team?.members[0] ?? (attributionSide === 'a' ? match.participant_a : match.participant_b)
    if (soloPlayer) {
      applyPoint(scoringSide, category, soloPlayer)
    } else {
      setPointRequest({ scoringSide, category })
    }
  }

  function choosePlayerForPoint(player: RosterPlayer) {
    if (!pointRequest) return
    applyPoint(pointRequest.scoringSide, pointRequest.category, player)
    setPointRequest(null)
  }

  function removeLastSet() {
    const nextSets = sets.slice(0, -1)
    setSets(nextSets)
    save.mutate({ sets: nextSets, player_stats: toPlayerStatsPayload(playerStats) })
    log('Undo last set')
  }

  function resetGame() {
    setSets([])
    setGameA(0)
    setGameB(0)
    setPointA(0)
    setPointB(0)
    setPhase('game')
    setFirstServer('a')
    setPlayerStats({})
    historyRef.current = []
    setHistoryLength(0)
    logIdRef.current += 1
    setMatchLog([{ id: logIdRef.current, text: 'Game reset — all sets, games, and points cleared.', at: Date.now() }])
    save.mutate({ sets: [], player_stats: [] })
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // Clipboard unavailable (permissions/insecure context) — no-op.
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {})
    }
  }

  // Home: Q point, W opponent error (picks from the away roster). Away: O
  // point, P opponent error (picks from the home roster). Z undoes the last
  // point — all ignored while typing or with a modifier key held.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'q':
          requestPoint('a', 'point')
          break
        case 'w':
          requestPoint('a', 'error')
          break
        case 'o':
          requestPoint('b', 'point')
          break
        case 'p':
          requestPoint('b', 'error')
          break
        case 'z':
          undoPoint()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const isDark = theme === 'dark'
  const panelClass = isDark ? 'bg-slate-950 text-pure-white' : 'bg-pure-white text-[#241e17]'
  const cardClass = isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-white'
  const subtleText = isDark ? 'text-slate-400' : 'text-slate-500'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4">
      <div ref={containerRef} className={`flex w-full max-w-7xl flex-col gap-4 overflow-y-auto rounded-xl p-6 shadow-2xl ${panelClass}`} style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/20 pb-3">
          <h3 className="text-base font-bold">🎾 Tennis Scoreboard</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex rounded-full border p-0.5 text-xs font-semibold ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
              <button onClick={() => setTheme('light')} className={`rounded-full px-3 py-1 ${!isDark ? 'bg-teal-600 text-pure-white' : subtleText}`}>
                Light
              </button>
              <button onClick={() => setTheme('dark')} className={`rounded-full px-3 py-1 ${isDark ? 'bg-teal-600 text-pure-white' : subtleText}`}>
                Dark
              </button>
            </div>
            <button onClick={copyShareLink} className={buttonSecondary}>
              {shareCopied ? 'Link copied!' : 'Share link'}
            </button>
            <button onClick={resetGame} disabled={isDecided} className={buttonSecondary}>
              Reset game
            </button>
            <button onClick={toggleFullscreen} className={buttonSecondary}>
              {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            </button>
            <button onClick={onClose} className={buttonSecondary}>
              Close
            </button>
          </div>
        </div>

        <p className={`text-xs ${subtleText}`}>
          Best of {totalPossibleSets} sets — first to {setsToWin} wins. Sets to 6 games (win by 2), 7-point tiebreak at
          6-6.
        </p>

        {!canPlay && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Both participants aren&apos;t determined yet.
          </p>
        )}

        {isDecided && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            Match complete — {(setsWonA > setsWonB ? homeName : awayName) ?? 'Winner'} wins.
          </p>
        )}

        {!isDecided && phase === 'tiebreak' && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            🎯 {isSuperTiebreakSet ? `Super tiebreak (to ${SUPER_TIEBREAK_TARGET})` : `Tiebreak (to ${TIEBREAK_TARGET})`}
            — win by 2.
          </p>
        )}

        {!isDecided && isDeuce && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Deuce.</p>
        )}

        {/* Team / set columns */}
        <div className="grid min-h-[78vh] grid-cols-1 gap-4 md:grid-cols-3">
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? homeName : awayName
            const setName = side === 'a' ? setHomeName : setAwayName
            const games = side === 'a' ? gameA : gameB
            const points = side === 'a' ? pointA : pointB
            const otherPoints = side === 'a' ? pointB : pointA
            const displayScore = phase === 'tiebreak' ? points : pointLabel(points, otherPoints)
            return (
              <div key={side} className={`${side === 'a' ? 'order-1' : 'order-3'} flex flex-col items-center justify-center gap-4 rounded-lg border p-6 text-center ${cardClass}`}>
                <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
                  {side === 'a' ? 'Home' : 'Away'}
                  {servingSide === side ? ' · serving' : ''}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-center text-3xl font-semibold ${isDark ? 'border-slate-600 bg-slate-950 text-pure-white' : 'border-slate-200 bg-pure-white text-[#241e17]'}`}
                />
                <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
                  {side === 'a' ? setsWonA : setsWonB} set{(side === 'a' ? setsWonA : setsWonB) === 1 ? '' : 's'} won ·{' '}
                  {games} game{games === 1 ? '' : 's'}
                </p>
                <p className="text-9xl font-bold leading-none tabular-nums">{displayScore}</p>
                <div className="grid w-full grid-cols-2 gap-1.5">
                  <button onClick={() => requestPoint(side, 'point')} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    Point
                  </button>
                  <button onClick={() => requestPoint(side, 'error')} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    Opp. error
                  </button>
                </div>
              </div>
            )
          })}

          <div className={`order-2 flex flex-col items-center justify-center gap-4 rounded-lg border p-6 ${cardClass}`}>
            <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>Sets</label>
            <p className="text-6xl font-bold leading-none tabular-nums">
              {setsWonA} - {setsWonB}
            </p>
            <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
              Set {sets.length + 1} — Games {gameA}-{gameB}
            </p>
            <p className={`text-xs ${subtleText}`}>Serving: {servingTeamName}</p>

            {sets.length > 0 && (
              <ul className="flex w-full flex-col gap-1 text-xs">
                {sets.map((s, i) => (
                  <li key={i} className={`flex items-center justify-between rounded-md border px-2 py-1 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <span>Set {i + 1}</span>
                    <span className="tabular-nums font-medium">
                      {s.score_a} - {s.score_b}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap justify-center gap-1.5">
              {!isDecided && historyLength > 0 && (
                <button onClick={undoPoint} disabled={save.isPending} className={buttonSecondary}>
                  Undo ({historyLength})
                </button>
              )}
              {sets.length > 0 && !isDecided && gameA === 0 && gameB === 0 && pointA === 0 && pointB === 0 && (
                <button onClick={removeLastSet} disabled={save.isPending} className={buttonSecondary}>
                  Undo last set
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Game settings */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{settingsOpen ? '▾' : '▸'} Game settings</span>
          </button>
          {settingsOpen && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>
                  No-Ad scoring (deuce = sudden death)
                </label>
                <button onClick={() => setNoAdScoring((v) => !v)} className={`self-start ${buttonSecondary}`}>
                  {noAdScoring ? 'On' : 'Off'}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>
                  Super tiebreak (to {SUPER_TIEBREAK_TARGET}) instead of final set
                </label>
                <button onClick={() => setSuperTiebreakFinalSet((v) => !v)} className={`self-start ${buttonSecondary}`}>
                  {superTiebreakFinalSet ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Player roster */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setRosterOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{rosterOpen ? '▾' : '▸'} Player roster {isDoubles ? '(doubles)' : '(singles)'}</span>
          </button>
          {rosterOpen && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(['a', 'b'] as const).map((side) => {
                const team = side === 'a' ? roster?.team_a : roster?.team_b
                const solo = side === 'a' ? match.participant_a : match.participant_b
                const members = team?.members ?? (solo ? [{ id: solo.id, name: solo.name }] : [])
                return (
                  <div key={side} className="flex flex-col gap-1.5">
                    <p className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>
                      {side === 'a' ? homeName : awayName}
                    </p>
                    {members.length === 0 && <p className={`text-xs ${subtleText}`}>No roster for this match.</p>}
                    {members.map((m) => {
                      const stat = playerStats[m.id]
                      return (
                        <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                          <input
                            value={jerseys[m.id] ?? ''}
                            onChange={(e) => setJersey(m.id, e.target.value)}
                            placeholder="#"
                            className={`w-10 shrink-0 rounded-md border px-1 py-1 text-center ${isDark ? 'border-slate-600 bg-slate-950 text-pure-white' : 'border-slate-200 bg-pure-white'}`}
                          />
                          <span className="flex-1 truncate font-medium">{m.name}</span>
                          <span className={subtleText}>{stat?.points_won ?? 0} pts</span>
                          {(['aces', 'winners', 'double_faults'] as const).map((key) => (
                            <button
                              key={key}
                              onClick={() => bumpStat(m.id, key)}
                              disabled={isDecided}
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {QUICK_STAT_LABEL[key]} {stat?.[key] ?? 0}
                            </button>
                          ))}
                          <span className={subtleText}>{stat?.unforced_errors ?? 0} err</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Match log */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setLogOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{logOpen ? '▾' : '▸'} Match log ({matchLog.length})</span>
          </button>
          {logOpen && (
            <div className="mt-3 flex flex-col gap-1">
              {matchLog.length === 0 ? (
                <p className={`text-xs ${subtleText}`}>No events yet. Points, games, sets, and tiebreaks will be logged here.</p>
              ) : (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
                  {matchLog.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2">
                      <span>{entry.text}</span>
                      <span className={subtleText}>{new Date(entry.at).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Rules reference */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setRulesOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{rulesOpen ? '▾' : '▸'} Tennis rules</span>
          </button>
          {rulesOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Points:</span> 0 (love) → 15 → 30 → 40 → game. At 40-40 (deuce), a
                player must win two points in a row (advantage → game) to take it.
              </p>
              <p>
                <span className="font-semibold">Game:</span> won by winning at least 4 points and being 2 points
                ahead.
              </p>
              <p>
                <span className="font-semibold">Set:</span> first to 6 games, at least a 2-game lead. At 6-6, a
                tiebreak is played (first to {TIEBREAK_TARGET}, win by 2) — points counted numerically instead of
                15-30-40.
              </p>
              <p>
                <span className="font-semibold">Match:</span> best of {totalPossibleSets} sets — first to {setsToWin}{' '}
                wins (men&apos;s Grand Slam matches are best of 5; most others best of 3).
              </p>
              <p>
                <span className="font-semibold">No-Ad scoring</span> (some doubles formats): deuce is a single
                deciding point instead of requiring advantage — toggle in Game settings.
              </p>
              <p>
                <span className="font-semibold">Super tiebreak</span>: sometimes played to {SUPER_TIEBREAK_TARGET}{' '}
                (win by 2) instead of a full third/deciding set — toggle in Game settings.
              </p>
            </div>
          )}
        </div>

        {/* Keyboard shortcuts */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setShortcutsOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{shortcutsOpen ? '▾' : '▸'} Keyboard shortcuts</span>
          </button>
          {shortcutsOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Home:</span> Q point, W opponent error (picks from {awayName}&apos;s
                side)
              </p>
              <p>
                <span className="font-semibold">Away:</span> O point, P opponent error (picks from {homeName}&apos;s
                side)
              </p>
              <p>
                <span className="font-semibold">Z</span> — undo the last point
              </p>
              <p className={subtleText}>Active when not editing team names; modifier keys (Ctrl/Cmd/Alt) are ignored.</p>
            </div>
          )}
        </div>

        {/* Nested inside containerRef (the fullscreen target), not a sibling
            of it — the Fullscreen API only renders the fullscreen element
            and its descendants. */}
        {pointRequest && (
          <PlayerPickerModal
            title={
              pointRequest.category === 'error'
                ? `Who made the error? (point to ${pointRequest.scoringSide === 'a' ? homeName : awayName})`
                : 'Who won the point?'
            }
            team={pickerTeam}
            jerseys={jerseys}
            isDark={isDark}
            onPick={choosePlayerForPoint}
            onCancel={() => setPointRequest(null)}
          />
        )}
      </div>
    </div>
  )
}
