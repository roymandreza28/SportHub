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

// 🏓 Table Tennis Scoring System — rally scoring like volleyball/badminton
// (every rally scores, regardless of server), but who serves is on a fixed
// rotation instead of "winner serves next": every 2 points, alternating
// every 1 point once both sides reach 10 (deuce). See the "Table tennis
// rules" panel at the bottom for the full reference this component
// implements.
const GAME_TARGET = 11
const SWITCH_ENDS_THRESHOLD = 5

type PointCategory = 'point' | 'error'
type RosterPlayer = { id: number; name: string }
// Feeds the career stats pentagon (see api/app/Support/PlayerStatFieldSets.php).
type PlayerStat = { points_won: number; winners: number; service_points: number; unforced_errors: number; forced_errors_won: number }
type PlayerStats = Record<number, PlayerStat>
type PointRequest = { scoringSide: 'a' | 'b'; category: PointCategory }
type QuickStatKey = 'winners' | 'service_points' | 'forced_errors_won'

const QUICK_STAT_LABEL: Record<QuickStatKey, string> = { winners: 'Winner', service_points: 'Serve Pt', forced_errors_won: 'FE Won' }

function emptyStat(): PlayerStat {
  return { points_won: 0, winners: 0, service_points: 0, unforced_errors: 0, forced_errors_won: 0 }
}

type RallySnapshot = { a: number; b: number; firstServer: 'a' | 'b'; playerStats: PlayerStats }
type LogEntry = { id: number; text: string; at: number }

// Serve changes every 2 points normally; from 10-10 onward it changes every
// 1 point instead. Since the game always auto-completes the instant someone
// wins (see checkGameWon), the only way total points can reach 20 while
// still in progress is an actual 10-10 — any other 20-point split would
// already have ended the game — so this is safe without tracking a
// separate deuce flag.
function computeServingSide(currentA: number, currentB: number, firstServer: 'a' | 'b'): 'a' | 'b' {
  const total = currentA + currentB
  const flips = total < 20 ? Math.floor(total / 2) : 10 + (total - 20)
  const flipped = flips % 2 === 1
  return flipped ? (firstServer === 'a' ? 'b' : 'a') : firstServer
}

function jerseyKey(matchId: number) {
  return `sporthub:scoreboard:tabletennis:jerseys:${matchId}`
}

function statsKey(matchId: number) {
  return `sporthub:scoreboard:tabletennis:stats:${matchId}`
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
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
    <div className="scoreboard-palette fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4">
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

export function TableTennisScoreboard({
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

  // Best of 5 (first to 3) is the more common table tennis format, so it's
  // the default — an organizer picking "Best of 7 sets" at tournament
  // creation (sets_to_win=4) is respected the same way volleyball/badminton
  // already are.
  const gamesToWin = tournament.sets_to_win ?? 3
  const totalPossibleGames = gamesToWin * 2 - 1

  const isDoubles = (roster?.team_a?.members.length ?? 0) > 1 || (roster?.team_b?.members.length ?? 0) > 1

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [homeName, setHomeName] = useState(match.participant_a?.name ?? 'Home')
  const [awayName, setAwayName] = useState(match.participant_b?.name ?? 'Away')
  const [shareCopied, setShareCopied] = useState(false)

  const [games, setGames] = useState<SetScore[]>(match.sets ?? [])
  const [currentA, setCurrentA] = useState(0)
  const [currentB, setCurrentB] = useState(0)
  // Who served first in the CURRENT game — alternates game to game per ITTF
  // rules. The actual current server is derived from this plus the score.
  const [firstServer, setFirstServer] = useState<'a' | 'b'>('a')
  const rallyHistoryRef = useRef<RallySnapshot[]>([])
  const [rallyHistoryLength, setRallyHistoryLength] = useState(0)

  const [jerseys, setJerseys] = useState<Record<number, string>>(() => loadJSON(jerseyKey(match.id), {}))
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadJSON(statsKey(match.id), {}))
  const [pointRequest, setPointRequest] = useState<PointRequest | null>(null)

  const [matchLog, setMatchLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)
  const switchEndsAcknowledgedRef = useRef(false)

  const [rosterOpen, setRosterOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    setGames(match.sets ?? [])
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
  const gamesWonA = games.filter((g) => g.score_a > g.score_b).length
  const gamesWonB = games.filter((g) => g.score_b > g.score_a).length
  const isDecided = match.status === 'completed'

  const servingSide = computeServingSide(currentA, currentB, firstServer)
  const servingTeamName = servingSide === 'a' ? homeName : awayName

  const isDecidingGame = games.length === totalPossibleGames - 1
  const switchEndsNow = !isDecided && isDecidingGame && currentA !== currentB && Math.max(currentA, currentB) === SWITCH_ENDS_THRESHOLD
  const betweenGamesBreak = !isDecided && games.length > 0 && games.length < totalPossibleGames && currentA === 0 && currentB === 0

  // An "opponent error" credits the OTHER side's score, so the picker for
  // it shows the opposite roster from the side that benefits.
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

  function pushRallyHistory() {
    rallyHistoryRef.current = [...rallyHistoryRef.current, { a: currentA, b: currentB, firstServer, playerStats: { ...playerStats } }].slice(-150)
    setRallyHistoryLength(rallyHistoryRef.current.length)
  }

  function undoRally() {
    const last = rallyHistoryRef.current.pop()
    setRallyHistoryLength(rallyHistoryRef.current.length)
    if (!last) return
    setCurrentA(last.a)
    setCurrentB(last.b)
    setFirstServer(last.firstServer)
    setPlayerStats(last.playerStats)
    log('Undo point')
  }

  // Fires once per deciding game, the moment either side's score first
  // reaches 5 — logged permanently even though the on-screen banner only
  // shows while the score sits exactly on 5.
  function maybeLogSwitchEnds(nextA: number, nextB: number) {
    if (!isDecidingGame || Math.max(nextA, nextB) !== SWITCH_ENDS_THRESHOLD) return
    if (switchEndsAcknowledgedRef.current) return
    switchEndsAcknowledgedRef.current = true
    log(`Switch ends — final game, a side reaches ${SWITCH_ENDS_THRESHOLD}`)
  }

  function applyPoint(scoringSide: 'a' | 'b', category: PointCategory, player: RosterPlayer) {
    if (isDecided || !canPlay) return
    pushRallyHistory()

    const nextA = scoringSide === 'a' ? currentA + 1 : currentA
    const nextB = scoringSide === 'b' ? currentB + 1 : currentB
    setCurrentA(nextA)
    setCurrentB(nextB)

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
        ? `${player.name} error → point ${scoringTeamName} (${nextA}-${nextB})`
        : `${player.name} (${scoringTeamName}) point (${nextA}-${nextB})`
    log(logLine)
    maybeLogSwitchEnds(nextA, nextB)

    const leader = Math.max(nextA, nextB)
    const trailer = Math.min(nextA, nextB)
    const gameWon = leader >= GAME_TARGET && leader - trailer >= 2

    if (gameWon) {
      const nextGames = [...games, { score_a: nextA, score_b: nextB }]
      setGames(nextGames)
      setCurrentA(0)
      setCurrentB(0)
      // First server alternates game to game, per ITTF rules.
      setFirstServer((f) => (f === 'a' ? 'b' : 'a'))
      rallyHistoryRef.current = []
      setRallyHistoryLength(0)
      switchEndsAcknowledgedRef.current = false
      log(`Game ${nextGames.length} won by ${nextA > nextB ? homeName : awayName} (${nextA}-${nextB})`)
      save.mutate({ sets: nextGames, player_stats: toPlayerStatsPayload(nextStats) })
    }
  }

  // Winners / service points / forced errors won are supplementary
  // box-score taps — the Point/Opp. error buttons above don't distinguish
  // how a rally was won or lost, so these are tapped directly on the roster
  // row and round-trip immediately with the current (not-yet-finished) game
  // score.
  function bumpStat(playerId: number, key: QuickStatKey) {
    if (isDecided) return
    const nextStats = { ...playerStats, [playerId]: { ...emptyStat(), ...playerStats[playerId], [key]: (playerStats[playerId]?.[key] ?? 0) + 1 } }
    setPlayerStats(nextStats)
    save.mutate({ sets: games, player_stats: toPlayerStatsPayload(nextStats) })
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

  function removeLastGame() {
    const nextGames = games.slice(0, -1)
    setGames(nextGames)
    save.mutate({ sets: nextGames, player_stats: toPlayerStatsPayload(playerStats) })
    log('Undo last game')
  }

  function resetGame() {
    setGames([])
    setCurrentA(0)
    setCurrentB(0)
    setFirstServer('a')
    setPlayerStats({})
    rallyHistoryRef.current = []
    setRallyHistoryLength(0)
    switchEndsAcknowledgedRef.current = false
    logIdRef.current += 1
    setMatchLog([{ id: logIdRef.current, text: 'Game reset — all games, points, and stats cleared.', at: Date.now() }])
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
          undoRally()
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
    <div className="scoreboard-palette fixed inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4">
      <div ref={containerRef} className={`flex w-full max-w-7xl flex-col gap-4 overflow-y-auto rounded-xl p-6 shadow-2xl ${panelClass}`} style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/20 pb-3">
          <h3 className="text-base font-bold">🏓 Table Tennis Scoreboard</h3>
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
          Best of {totalPossibleGames} games — first to {gamesToWin} wins. Games to {GAME_TARGET}, win by 2, no cap.
        </p>

        {!canPlay && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Both participants aren&apos;t determined yet.
          </p>
        )}

        {isDecided && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            Match complete — {(gamesWonA > gamesWonB ? homeName : awayName) ?? 'Winner'} wins.
          </p>
        )}

        {switchEndsNow && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            🔄 Switch ends — final game, {currentA > currentB ? homeName : awayName} reaches {SWITCH_ENDS_THRESHOLD}.
          </p>
        )}

        {betweenGamesBreak && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            🕑 1-minute break — switch ends. Game {games.length} complete, Game {games.length + 1} starts next.
          </p>
        )}

        {/* Team / game columns */}
        <div className="grid min-h-[78vh] grid-cols-1 gap-4 md:grid-cols-3">
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? homeName : awayName
            const setName = side === 'a' ? setHomeName : setAwayName
            const current = side === 'a' ? currentA : currentB
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
                  {side === 'a' ? gamesWonA : gamesWonB} game{(side === 'a' ? gamesWonA : gamesWonB) === 1 ? '' : 's'} won
                </p>
                <p className="text-9xl font-bold leading-none tabular-nums">{current}</p>
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
            <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>Games</label>
            <p className="text-6xl font-bold leading-none tabular-nums">
              {gamesWonA} - {gamesWonB}
            </p>
            <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
              Game {games.length + 1} (to {GAME_TARGET})
            </p>
            <p className={`text-xs ${subtleText}`}>Serving: {servingTeamName}</p>

            {games.length > 0 && (
              <ul className="flex w-full flex-col gap-1 text-xs">
                {games.map((g, i) => (
                  <li key={i} className={`flex items-center justify-between rounded-md border px-2 py-1 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <span>Game {i + 1}</span>
                    <span className="tabular-nums font-medium">
                      {g.score_a} - {g.score_b}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap justify-center gap-1.5">
              {!isDecided && rallyHistoryLength > 0 && (
                <button onClick={undoRally} disabled={save.isPending} className={buttonSecondary}>
                  Undo point ({rallyHistoryLength})
                </button>
              )}
              {games.length > 0 && !isDecided && currentA === 0 && currentB === 0 && (
                <button onClick={removeLastGame} disabled={save.isPending} className={buttonSecondary}>
                  Undo last game
                </button>
              )}
            </div>
          </div>
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
                          {(['winners', 'service_points', 'forced_errors_won'] as const).map((key) => (
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
                <p className={`text-xs ${subtleText}`}>No events yet. Points, games, and switch-ends will be logged here.</p>
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
            <span>{rulesOpen ? '▾' : '▸'} Table tennis rules</span>
          </button>
          {rulesOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Match format:</span> best of {totalPossibleGames} games — first to{' '}
                {gamesToWin} game wins takes the match. Games to {GAME_TARGET} points.
              </p>
              <p>
                <span className="font-semibold">Point system:</span> a point is scored on every rally, regardless of
                who served — the winner of the rally earns the point.
              </p>
              <p>
                <span className="font-semibold">Winning a game:</span> first to {GAME_TARGET} points, must win by at
                least 2 (e.g. 11-9). At 10-10, play continues until one side leads by 2 — no cap.
              </p>
              <p>
                <span className="font-semibold">Serve rotation:</span> players alternate serves every 2 points; at
                10-10, serve alternates every 1 point instead.
              </p>
              <p>
                <span className="font-semibold">Intervals:</span> a 1-minute break between games. Players switch ends
                after each game, and in the final game once either side reaches {SWITCH_ENDS_THRESHOLD} points.
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
                : 'Who won the rally?'
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
