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

// 🏓 Pickleball Scoring System — side-out scoring, not rally scoring like
// volleyball/badminton: only the serving side can score. A won rally scores
// a point and the server continues; a lost rally scores nothing but passes
// the serve on (in doubles, to the serving team's second server first, only
// then to the opponent). See the "Pickleball rules" panel at the bottom for
// the full reference this component implements.
const TARGET_OPTIONS = [11, 15, 21]

type ActionKind = 'point' | 'sideout'
type RosterPlayer = { id: number; name: string }
// Feeds the career stats pentagon (see api/app/Support/PlayerStatFieldSets.php).
type PlayerStat = { points_won: number; winners: number; net_points_won: number; unforced_errors: number; faults: number }
type PlayerStats = Record<number, PlayerStat>
type PendingAction = { kind: ActionKind }
type QuickStatKey = 'winners' | 'net_points_won' | 'unforced_errors'

const QUICK_STAT_LABEL: Record<QuickStatKey, string> = { winners: 'Winner', net_points_won: 'Net Pt', unforced_errors: 'UE' }

function emptyStat(): PlayerStat {
  return { points_won: 0, winners: 0, net_points_won: 0, unforced_errors: 0, faults: 0 }
}

type RallySnapshot = { a: number; b: number; servingSide: 'a' | 'b'; serverNumber: 1 | 2; playerStats: PlayerStats }
type LogEntry = { id: number; text: string; at: number }

function jerseyKey(matchId: number) {
  return `sporthub:scoreboard:pickleball:jerseys:${matchId}`
}

function statsKey(matchId: number) {
  return `sporthub:scoreboard:pickleball:stats:${matchId}`
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

export function PickleballScoreboard({
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

  const gamesToWin = tournament.sets_to_win ?? 2
  const totalPossibleGames = gamesToWin * 2 - 1

  const isDoubles = (roster?.team_a?.members.length ?? 0) > 1 || (roster?.team_b?.members.length ?? 0) > 1

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [homeName, setHomeName] = useState(match.participant_a?.name ?? 'Home')
  const [awayName, setAwayName] = useState(match.participant_b?.name ?? 'Away')
  const [shareCopied, setShareCopied] = useState(false)

  const [targetPoints, setTargetPoints] = useState(11)
  const [games, setGames] = useState<SetScore[]>(match.sets ?? [])
  const [currentA, setCurrentA] = useState(0)
  const [currentB, setCurrentB] = useState(0)
  const [servingSide, setServingSide] = useState<'a' | 'b'>('a')
  const [serverNumber, setServerNumber] = useState<1 | 2>(1)
  const rallyHistoryRef = useRef<RallySnapshot[]>([])
  const [rallyHistoryLength, setRallyHistoryLength] = useState(0)

  const [jerseys, setJerseys] = useState<Record<number, string>>(() => loadJSON(jerseyKey(match.id), {}))
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadJSON(statsKey(match.id), {}))
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const [matchLog, setMatchLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)

  const [rosterOpen, setRosterOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const servingTeam = servingSide === 'a' ? roster?.team_a : roster?.team_b
  const servingTeamName = servingSide === 'a' ? homeName : awayName

  const save = useMutation({
    mutationFn: (input: { sets: SetScore[]; player_stats?: PlayerStatEntry[] }) => updateMatchSets(match.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  function pushRallyHistory() {
    rallyHistoryRef.current = [...rallyHistoryRef.current, { a: currentA, b: currentB, servingSide, serverNumber, playerStats: { ...playerStats } }].slice(-150)
    setRallyHistoryLength(rallyHistoryRef.current.length)
  }

  function undoRally() {
    const last = rallyHistoryRef.current.pop()
    setRallyHistoryLength(rallyHistoryRef.current.length)
    if (!last) return
    setCurrentA(last.a)
    setCurrentB(last.b)
    setServingSide(last.servingSide)
    setServerNumber(last.serverNumber)
    setPlayerStats(last.playerStats)
    log('Undo')
  }

  // Only the serving team's second player (doubles) gets a turn before the
  // serve fully passes to the opponent — singles side-outs immediately.
  function rotateServer() {
    if (isDoubles && serverNumber === 1) {
      setServerNumber(2)
      log(`Second server up for ${servingTeamName}`)
      return
    }
    const nextSide = servingSide === 'a' ? 'b' : 'a'
    setServingSide(nextSide)
    setServerNumber(1)
    log(`Side out — serve to ${nextSide === 'a' ? homeName : awayName}`)
  }

  function checkGameWon(nextA: number, nextB: number, statsForSave: PlayerStats) {
    const leader = Math.max(nextA, nextB)
    const trailer = Math.min(nextA, nextB)
    if (!(leader >= targetPoints && leader - trailer >= 2)) return

    const nextGames = [...games, { score_a: nextA, score_b: nextB }]
    setGames(nextGames)
    setCurrentA(0)
    setCurrentB(0)
    // Loser of the game serves first in the next one.
    setServingSide(nextA > nextB ? 'b' : 'a')
    setServerNumber(1)
    rallyHistoryRef.current = []
    setRallyHistoryLength(0)
    log(`Game ${nextGames.length} won by ${nextA > nextB ? homeName : awayName} (${nextA}-${nextB})`)
    save.mutate({ sets: nextGames, player_stats: toPlayerStatsPayload(statsForSave) })
  }

  // Only the serving side can act each rally — 'point' means they won the
  // rally (score + keep serving), 'sideout' means they lost it (no score,
  // serve passes on). `player` is whoever on the serving team gets credit.
  function applyAction(kind: ActionKind, player: RosterPlayer) {
    if (isDecided || !canPlay) return
    pushRallyHistory()

    if (kind === 'point') {
      const nextA = servingSide === 'a' ? currentA + 1 : currentA
      const nextB = servingSide === 'b' ? currentB + 1 : currentB
      setCurrentA(nextA)
      setCurrentB(nextB)
      const nextStats = { ...playerStats, [player.id]: { ...emptyStat(), ...playerStats[player.id], points_won: (playerStats[player.id]?.points_won ?? 0) + 1 } }
      setPlayerStats(nextStats)
      log(`${player.name} (${servingTeamName}) point (${nextA}-${nextB})`)
      checkGameWon(nextA, nextB, nextStats)
    } else {
      const nextStats = { ...playerStats, [player.id]: { ...emptyStat(), ...playerStats[player.id], faults: (playerStats[player.id]?.faults ?? 0) + 1 } }
      setPlayerStats(nextStats)
      log(`${player.name} (${servingTeamName}) fault`)
      rotateServer()
    }
  }

  // Winners / net points won / unforced errors are supplementary box-score
  // taps — the Point/Fault buttons above don't distinguish how a rally was
  // won or lost, so these are tapped directly on the roster row and
  // round-trip immediately with the current (not-yet-finished) game score.
  function bumpStat(playerId: number, key: QuickStatKey) {
    if (isDecided) return
    const nextStats = { ...playerStats, [playerId]: { ...emptyStat(), ...playerStats[playerId], [key]: (playerStats[playerId]?.[key] ?? 0) + 1 } }
    setPlayerStats(nextStats)
    save.mutate({ sets: games, player_stats: toPlayerStatsPayload(nextStats) })
  }

  function requestAction(side: 'a' | 'b', kind: ActionKind) {
    if (isDecided || !canPlay || side !== servingSide) return

    // Doubles — either of the two teammates could be the one who wins the
    // rally or faults, so ask who.
    if (servingTeam && servingTeam.members.length > 1) {
      setPendingAction({ kind })
      return
    }

    // Singles (or a still-loading roster) — only one possible player.
    const soloPlayer = servingTeam?.members[0] ?? (side === 'a' ? match.participant_a : match.participant_b)
    if (soloPlayer) {
      applyAction(kind, soloPlayer)
    } else {
      setPendingAction({ kind })
    }
  }

  function choosePlayerForAction(player: RosterPlayer) {
    if (!pendingAction) return
    applyAction(pendingAction.kind, player)
    setPendingAction(null)
  }

  function removeLastGame() {
    const nextGames = games.slice(0, -1)
    setGames(nextGames)
    save.mutate({ sets: nextGames, player_stats: toPlayerStatsPayload(playerStats) })
    log('Undo last game')
  }

  function changeTargetPoints(points: number) {
    setTargetPoints(points)
    setCurrentA(0)
    setCurrentB(0)
    setServingSide('a')
    setServerNumber(1)
    rallyHistoryRef.current = []
    setRallyHistoryLength(0)
    log(`Target points changed to ${points} — current game reset`)
  }

  function resetGame() {
    setGames([])
    setCurrentA(0)
    setCurrentB(0)
    setServingSide('a')
    setServerNumber(1)
    setPlayerStats({})
    rallyHistoryRef.current = []
    setRallyHistoryLength(0)
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

  // Q home point, W home fault (side out); O away point, P away fault — all
  // no-ops unless that side is the one currently serving, same as the
  // on-screen buttons. Z undoes the last action.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'q':
          requestAction('a', 'point')
          break
        case 'w':
          requestAction('a', 'sideout')
          break
        case 'o':
          requestAction('b', 'point')
          break
        case 'p':
          requestAction('b', 'sideout')
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
          <h3 className="text-base font-bold">🏓 Pickleball Scoreboard</h3>
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
          Best of {totalPossibleGames} games — first to {gamesToWin} wins. Games to {targetPoints}, win by 2, no cap. Only
          the serving side can score.
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

        {/* Team / game columns */}
        <div className="grid min-h-[78vh] grid-cols-1 gap-4 md:grid-cols-3">
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? homeName : awayName
            const setName = side === 'a' ? setHomeName : setAwayName
            const current = side === 'a' ? currentA : currentB
            const isServing = servingSide === side
            return (
              <div key={side} className={`${side === 'a' ? 'order-1' : 'order-3'} flex flex-col items-center justify-center gap-4 rounded-lg border p-6 text-center ${cardClass}`}>
                <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
                  {side === 'a' ? 'Home' : 'Away'}
                  {isServing ? ` · serving${isDoubles ? ` (S${serverNumber})` : ''}` : ''}
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
                  <button onClick={() => requestAction(side, 'point')} disabled={!canPlay || isDecided || !isServing} className={buttonSecondary}>
                    Point
                  </button>
                  <button onClick={() => requestAction(side, 'sideout')} disabled={!canPlay || isDecided || !isServing} className={buttonSecondary}>
                    Fault (side out)
                  </button>
                </div>
                {!isServing && canPlay && !isDecided && (
                  <p className={`text-[11px] ${subtleText}`}>Only the serving side can score.</p>
                )}
              </div>
            )
          })}

          <div className={`order-2 flex flex-col items-center justify-center gap-4 rounded-lg border p-6 ${cardClass}`}>
            <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>Games</label>
            <p className="text-6xl font-bold leading-none tabular-nums">
              {gamesWonA} - {gamesWonB}
            </p>
            <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
              Game {games.length + 1} (to {targetPoints})
            </p>
            <p className={`text-xs ${subtleText}`}>
              Serving: {servingTeamName}
              {isDoubles ? ` — Server ${serverNumber}` : ''}
            </p>

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
                  Undo ({rallyHistoryLength})
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

        {/* Game settings */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{settingsOpen ? '▾' : '▸'} Game settings</span>
          </button>
          {settingsOpen && (
            <div className="mt-3 flex flex-col gap-1">
              <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Points to win a game</label>
              <div className="flex gap-1.5">
                {TARGET_OPTIONS.map((points) => (
                  <button
                    key={points}
                    onClick={() => changeTargetPoints(points)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      targetPoints === points ? 'bg-teal-600 text-pure-white' : isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {points}
                  </button>
                ))}
              </div>
              <p className={`text-xs ${subtleText}`}>Changing this resets the current game (completed games are kept).</p>
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
                          {(['winners', 'net_points_won', 'unforced_errors'] as const).map((key) => (
                            <button
                              key={key}
                              onClick={() => bumpStat(m.id, key)}
                              disabled={isDecided}
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {QUICK_STAT_LABEL[key]} {stat?.[key] ?? 0}
                            </button>
                          ))}
                          <span className={subtleText}>{stat?.faults ?? 0} faults</span>
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
                <p className={`text-xs ${subtleText}`}>No events yet. Points, faults, and games will be logged here.</p>
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
            <span>{rulesOpen ? '▾' : '▸'} Pickleball rules</span>
          </button>
          {rulesOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Match format:</span> games to {targetPoints} points (win by 2), best of{' '}
                {totalPossibleGames} games — first to {gamesToWin} wins the match.
              </p>
              <p>
                <span className="font-semibold">Point system:</span> only the serving side can score. If they win the
                rally, they score a point and keep serving. If they lose it, no point is awarded — the serve passes to
                the opponent.
              </p>
              <p>
                <span className="font-semibold">Serve rotation:</span> in doubles, both players on a team serve before
                the serve switches sides; in singles, serve alternates between players after each side out.
              </p>
              <p>
                <span className="font-semibold">Winning a game:</span> first to {targetPoints}, must win by 2 — some
                tournaments play to 15 or 21 instead (adjustable in Game settings), always win by 2, no cap.
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
                <span className="font-semibold">Home:</span> Q point, W fault (side out)
              </p>
              <p>
                <span className="font-semibold">Away:</span> O point, P fault (side out)
              </p>
              <p>
                <span className="font-semibold">Z</span> — undo the last action
              </p>
              <p className={subtleText}>
                Only work for whichever side is currently serving, same as the on-screen buttons. Active when not
                editing team names; modifier keys (Ctrl/Cmd/Alt) are ignored.
              </p>
            </div>
          )}
        </div>

        {/* Nested inside containerRef (the fullscreen target), not a sibling
            of it — the Fullscreen API only renders the fullscreen element
            and its descendants. */}
        {pendingAction && (
          <PlayerPickerModal
            title={pendingAction.kind === 'point' ? 'Who won the rally?' : 'Who faulted?'}
            team={servingTeam}
            jerseys={jerseys}
            isDark={isDark}
            onPick={choosePlayerForAction}
            onCancel={() => setPendingAction(null)}
          />
        )}
      </div>
    </div>
  )
}
