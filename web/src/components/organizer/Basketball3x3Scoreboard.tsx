import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMatchRoster,
  toPlayerStatsPayload,
  updateMatchScore,
  type BracketMatch,
  type MatchRosterTeam,
  type PlayerStatEntry,
} from '../../lib/organizerApi'
import { buttonSecondary, buttonSuccess } from '../../lib/formStyles'

// FIBA Official 3x3 Basketball Rules — a separate discipline from 5v5, not
// a small-sided version of it, so this board is its own component rather
// than a variant of BasketballScoreboard: one basket, one 10-minute period
// (or first to 21), 1/2-point scoring instead of 2/3, a 12s shot clock, no
// personal foul-out (team penalty instead), and sudden-death overtime.
const REGULATION_SECONDS = 10 * 60
const SHOT_CLOCK_SECONDS = 12
const WIN_SCORE = 21
const OVERTIME_WIN_MARGIN = 2
const TEAM_FOUL_BONUS_THRESHOLD = 7
const TEAM_FOUL_TECHNICAL_THRESHOLD = 10

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

type RosterPlayer = { id: number; name: string }
// Same 5 pentagon axes as BasketballScoreboard.tsx (both share one Sport
// row — 3x3 is only a SportFormat, per SportsSeeder).
type PlayerStat = { points: number; rebounds: number; assists: number; steals: number; blocks: number; fouls: number }
type PlayerStats = Record<number, PlayerStat>
type QuickStatKey = 'rebounds' | 'assists' | 'steals' | 'blocks'

const QUICK_STAT_LABEL: Record<QuickStatKey, string> = { rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK' }

function emptyStat(): PlayerStat {
  return { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0 }
}

type Snapshot = {
  scoreA: number
  scoreB: number
  periodClock: number
  inOvertime: boolean
  otBaselineA: number
  otBaselineB: number
  playerStats: PlayerStats
}

type LogEntry = { id: number; text: string; at: number }

function jerseyKey(matchId: number) {
  return `sporthub:scoreboard3x3:jerseys:${matchId}`
}

function statsKey(matchId: number) {
  return `sporthub:scoreboard3x3:stats:${matchId}`
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
  playerStats,
  isDark,
  onPick,
  onCancel,
}: {
  title: string
  team: MatchRosterTeam | null | undefined
  jerseys: Record<number, string>
  playerStats: PlayerStats
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
          {team?.members.map((m) => {
            const fouls = playerStats[m.id]?.fouls ?? 0
            return (
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
                {fouls > 0 && (
                  <span className={`shrink-0 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{fouls}F</span>
                )}
              </button>
            )
          })}
        </div>

        <button onClick={onCancel} className={`${buttonSecondary} mt-4 w-full`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

export function Basketball3x3Scoreboard({
  match,
  tournamentId,
  onClose,
}: {
  match: BracketMatch
  tournamentId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: roster } = useQuery({
    queryKey: ['organizer', 'match-roster', match.id],
    queryFn: () => fetchMatchRoster(match.id),
  })

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [homeName, setHomeName] = useState(match.participant_a?.name ?? 'Home')
  const [awayName, setAwayName] = useState(match.participant_b?.name ?? 'Away')
  const [shareCopied, setShareCopied] = useState(false)

  const [scoreA, setScoreA] = useState(match.score_a)
  const [scoreB, setScoreB] = useState(match.score_b)
  const [periodClock, setPeriodClock] = useState(REGULATION_SECONDS)
  const [clockRunning, setClockRunning] = useState(false)
  const [inOvertime, setInOvertime] = useState(false)
  const [otBaselineA, setOtBaselineA] = useState(0)
  const [otBaselineB, setOtBaselineB] = useState(0)

  const [shotClock, setShotClock] = useState(SHOT_CLOCK_SECONDS)
  const [shotClockEnabled, setShotClockEnabled] = useState(true)
  const [buzzerMuted, setBuzzerMuted] = useState(true)

  const historyRef = useRef<Snapshot[]>([])
  const [historyLength, setHistoryLength] = useState(0)

  const [matchLog, setMatchLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)

  const [jerseys, setJerseys] = useState<Record<number, string>>(() => loadJSON(jerseyKey(match.id), {}))
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadJSON(statsKey(match.id), {}))

  const [pointPicker, setPointPicker] = useState<{ side: 'a' | 'b'; delta: number } | null>(null)
  const [foulPicker, setFoulPicker] = useState<'a' | 'b' | null>(null)

  const [rosterOpen, setRosterOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    setScoreA(match.score_a)
    setScoreB(match.score_b)
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

  useEffect(() => {
    if (!clockRunning || inOvertime) return
    const interval = setInterval(() => {
      setPeriodClock((c) => (c > 0 ? c - 1 : 0))
      if (shotClockEnabled) setShotClock((c) => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [clockRunning, inOvertime, shotClockEnabled])

  function playBuzzer(durationSeconds: number) {
    if (buzzerMuted) return
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      osc.frequency.value = 440
      osc.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + durationSeconds)
      osc.onended = () => ctx.close()
    } catch {
      // Web Audio unavailable — silently skip the buzzer.
    }
  }

  // Regulation horn — 3 seconds, once the single 10-minute period runs out.
  useEffect(() => {
    if (!clockRunning || inOvertime || periodClock !== 0) return
    playBuzzer(3)
    setClockRunning(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodClock, clockRunning, inOvertime])

  // Shot-clock violation — a shorter 1 second buzzer; the game clock keeps running.
  useEffect(() => {
    if (!clockRunning || inOvertime || !shotClockEnabled || shotClock !== 0) return
    playBuzzer(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotClock, clockRunning, inOvertime, shotClockEnabled])

  const save = useMutation({
    mutationFn: (input: { score_a: number; score_b: number; status?: 'live' | 'completed'; player_stats?: PlayerStatEntry[] }) =>
      updateMatchScore(match.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  const canPlay = match.participant_a !== null && match.participant_b !== null
  const isDecided = match.status === 'completed'

  // Regulation ends the moment either side reaches 21, even before time
  // runs out — the clock keeps counting otherwise. Overtime is untimed
  // sudden-death: first team to score 2 points (from the OT start) wins.
  const wonByScore = !inOvertime && (scoreA >= WIN_SCORE || scoreB >= WIN_SCORE)
  const regulationTimeUp = !inOvertime && periodClock === 0
  const tiedAtTimeUp = regulationTimeUp && scoreA === scoreB
  const otWinnerReached = inOvertime && (scoreA - otBaselineA >= OVERTIME_WIN_MARGIN || scoreB - otBaselineB >= OVERTIME_WIN_MARGIN)
  const allowFinish = wonByScore || (regulationTimeUp && !tiedAtTimeUp) || otWinnerReached
  const leader = scoreA === scoreB ? null : scoreA > scoreB ? homeName : awayName

  function pushHistory() {
    const snapshot: Snapshot = { scoreA, scoreB, periodClock, inOvertime, otBaselineA, otBaselineB, playerStats: { ...playerStats } }
    historyRef.current = [...historyRef.current, snapshot].slice(-50)
    setHistoryLength(historyRef.current.length)
  }

  function undo() {
    const last = historyRef.current.pop()
    setHistoryLength(historyRef.current.length)
    if (!last) return
    setScoreA(last.scoreA)
    setScoreB(last.scoreB)
    setPeriodClock(last.periodClock)
    setInOvertime(last.inOvertime)
    setOtBaselineA(last.otBaselineA)
    setOtBaselineB(last.otBaselineB)
    setPlayerStats(last.playerStats)
    save.mutate({ score_a: last.scoreA, score_b: last.scoreB, status: 'live', player_stats: toPlayerStatsPayload(last.playerStats) })
    log('Undo')
  }

  function applyPoints(side: 'a' | 'b', delta: number, player?: RosterPlayer) {
    if (!canPlay || isDecided) return
    pushHistory()
    const teamName = side === 'a' ? homeName : awayName
    const nextStats = player
      ? { ...playerStats, [player.id]: { ...emptyStat(), ...playerStats[player.id], points: (playerStats[player.id]?.points ?? 0) + delta } }
      : playerStats
    if (player) setPlayerStats(nextStats)
    let nextA = scoreA
    let nextB = scoreB
    if (side === 'a') {
      nextA = Math.max(0, scoreA + delta)
      setScoreA(nextA)
    } else {
      nextB = Math.max(0, scoreB + delta)
      setScoreB(nextB)
    }
    save.mutate({ score_a: nextA, score_b: nextB, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
    const pointLabel = `${delta > 0 ? '+' : ''}${delta} point${Math.abs(delta) === 1 ? '' : 's'}`
    log(player ? `${player.name} (${teamName}) ${pointLabel}` : `${teamName} ${pointLabel}`)

    // Auto-stop the clock once a win condition is met so the organizer
    // isn't left running time on an already-decided game.
    const willWinByScore = !inOvertime && (nextA >= WIN_SCORE || nextB >= WIN_SCORE)
    const willWinOt = inOvertime && (nextA - otBaselineA >= OVERTIME_WIN_MARGIN || nextB - otBaselineB >= OVERTIME_WIN_MARGIN)
    if (willWinByScore || willWinOt) setClockRunning(false)
  }

  function requestPoints(side: 'a' | 'b', delta: number) {
    if (!canPlay || isDecided) return
    if (delta < 0) {
      applyPoints(side, delta)
      return
    }
    setPointPicker({ side, delta })
  }

  function choosePlayerForPoints(player: RosterPlayer) {
    if (!pointPicker) return
    applyPoints(pointPicker.side, pointPicker.delta, player)
    setPointPicker(null)
  }

  function requestFoul(side: 'a' | 'b') {
    if (isDecided) return
    setFoulPicker(side)
  }

  function choosePlayerForFoul(player: RosterPlayer) {
    if (!foulPicker) return
    pushHistory()
    const newCount = (playerStats[player.id]?.fouls ?? 0) + 1
    const nextStats = { ...playerStats, [player.id]: { ...emptyStat(), ...playerStats[player.id], fouls: newCount } }
    setPlayerStats(nextStats)
    const teamName = foulPicker === 'a' ? homeName : awayName
    log(`Foul — ${player.name} (${teamName}), personal foul ${newCount}`)
    save.mutate({ score_a: scoreA, score_b: scoreB, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
    setFoulPicker(null)
  }

  function bumpStat(playerId: number, key: QuickStatKey) {
    if (isDecided) return
    pushHistory()
    const nextStats = { ...playerStats, [playerId]: { ...emptyStat(), ...playerStats[playerId], [key]: (playerStats[playerId]?.[key] ?? 0) + 1 } }
    setPlayerStats(nextStats)
    save.mutate({ score_a: scoreA, score_b: scoreB, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
  }

  function teamFouls(side: 'a' | 'b'): number {
    const team = side === 'a' ? roster?.team_a : roster?.team_b
    if (!team) return 0
    return team.members.reduce((sum, m) => sum + (playerStats[m.id]?.fouls ?? 0), 0)
  }

  function startOvertime() {
    pushHistory()
    setInOvertime(true)
    setOtBaselineA(scoreA)
    setOtBaselineB(scoreB)
    setClockRunning(false)
    log('Overtime started — sudden death, first to +2 points wins')
  }

  function adjustClock(deltaSeconds: number) {
    setPeriodClock((c) => Math.max(0, c + deltaSeconds))
  }

  function resetShotClock() {
    setShotClock(SHOT_CLOCK_SECONDS)
  }

  function adjustShotClock(deltaSeconds: number) {
    setShotClock((c) => Math.max(0, Math.min(SHOT_CLOCK_SECONDS, c + deltaSeconds)))
  }

  function resetGame() {
    setScoreA(0)
    setScoreB(0)
    setPeriodClock(REGULATION_SECONDS)
    setShotClock(SHOT_CLOCK_SECONDS)
    setClockRunning(false)
    setInOvertime(false)
    setOtBaselineA(0)
    setOtBaselineB(0)
    setPlayerStats({})
    historyRef.current = []
    setHistoryLength(0)
    logIdRef.current += 1
    setMatchLog([{ id: logIdRef.current, text: 'Game reset — scores, fouls, and the clock cleared.', at: Date.now() }])
    save.mutate({ score_a: 0, score_b: 0, status: 'live', player_stats: [] })
  }

  function finishMatch() {
    save.mutate({ score_a: scoreA, score_b: scoreB, status: 'completed', player_stats: toPlayerStatsPayload(playerStats) })
    log('Match finished')
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

  // Q/W/A score the home side (+1/+2/-1 — 3x3 has no +3), O/P/L score the
  // away side, R/I foul home/away, Space toggles the clock, Z undoes.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'q':
          requestPoints('a', 1)
          break
        case 'w':
          requestPoints('a', 2)
          break
        case 'a':
          requestPoints('a', -1)
          break
        case 'o':
          requestPoints('b', 1)
          break
        case 'p':
          requestPoints('b', 2)
          break
        case 'l':
          requestPoints('b', -1)
          break
        case 'r':
          requestFoul('a')
          break
        case 'i':
          requestFoul('b')
          break
        case 'z':
          undo()
          break
        case ' ':
          if (!inOvertime) {
            e.preventDefault()
            setClockRunning((r) => !r)
          }
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
          <h3 className="text-base font-bold">3x3 Basketball Scoreboard</h3>
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

        {!canPlay && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Both participants aren&apos;t determined yet.
          </p>
        )}

        {isDecided && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            Match complete — {(scoreA > scoreB ? homeName : awayName) ?? 'Winner'} wins.
          </p>
        )}

        {!isDecided && wonByScore && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            🏀 {leader} reached {WIN_SCORE} points — ready to finish.
          </p>
        )}

        {!isDecided && tiedAtTimeUp && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Tied at time-up — start overtime (sudden death, first to +{OVERTIME_WIN_MARGIN} wins).
          </p>
        )}

        {!isDecided && otWinnerReached && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            🏀 {leader} wins it in overtime — ready to finish.
          </p>
        )}

        {/* Team / clock / team columns */}
        <div className="grid min-h-[78vh] grid-cols-1 gap-4 md:grid-cols-3">
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? homeName : awayName
            const setName = side === 'a' ? setHomeName : setAwayName
            const score = side === 'a' ? scoreA : scoreB
            const fouls = teamFouls(side)
            const bonus = fouls >= TEAM_FOUL_BONUS_THRESHOLD
            const technical = fouls >= TEAM_FOUL_TECHNICAL_THRESHOLD
            return (
              <div key={side} className={`${side === 'a' ? 'order-1' : 'order-3'} flex flex-col items-center justify-center gap-4 rounded-lg border p-6 text-center ${cardClass}`}>
                <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
                  {side === 'a' ? 'Home team' : 'Away team'}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-center text-3xl font-semibold ${isDark ? 'border-slate-600 bg-slate-950 text-pure-white' : 'border-slate-200 bg-pure-white text-[#241e17]'}`}
                />
                <p className="text-9xl font-bold leading-none tabular-nums">{score}</p>
                <div className="grid w-full grid-cols-2 gap-1.5">
                  <button onClick={() => requestPoints(side, 1)} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    +1 point
                  </button>
                  <button onClick={() => requestPoints(side, 2)} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    +2 points
                  </button>
                </div>
                <button onClick={() => requestPoints(side, -1)} disabled={!canPlay || isDecided} className={`w-full ${buttonSecondary}`}>
                  -1 point
                </button>
                <button
                  onClick={() => requestFoul(side)}
                  disabled={isDecided}
                  className={`w-full rounded-md px-2 py-1.5 text-xs font-medium ${
                    technical ? 'bg-red-600 text-pure-white' : bonus ? 'bg-red-100 text-red-700' : isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Team fouls: {fouls}
                  {technical ? ' — TECHNICAL' : bonus ? ' — bonus (2 FT)' : ''}
                </button>
              </div>
            )
          })}

          <div className={`order-2 flex flex-col items-center justify-center gap-4 rounded-lg border p-6 ${cardClass}`}>
            {inOvertime ? (
              <>
                <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>Overtime</label>
                <p className="text-4xl font-bold leading-none">Sudden death</p>
                <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>First to +{OVERTIME_WIN_MARGIN} wins</p>
              </>
            ) : (
              <>
                <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>Game clock</label>
                <p className="text-9xl font-bold leading-none tabular-nums">{formatClock(periodClock)}</p>
                <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>10-minute period · first to {WIN_SCORE}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setClockRunning((r) => !r)} className={buttonSecondary}>
                    {clockRunning ? 'Pause' : 'Start'}
                  </button>
                  <button onClick={() => { setClockRunning(false); setPeriodClock(REGULATION_SECONDS) }} className={buttonSecondary}>
                    Reset clock
                  </button>
                </div>
                {tiedAtTimeUp && (
                  <button onClick={startOvertime} className={buttonSecondary}>
                    Start overtime
                  </button>
                )}
                {shotClockEnabled && (
                  <>
                    <p className={`text-xs font-bold tabular-nums ${shotClock <= 3 ? 'text-red-600' : subtleText}`}>
                      Shot clock: {shotClock}s
                    </p>
                    <div className="flex gap-1">
                      <button onClick={resetShotClock} className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}>
                        Reset ({SHOT_CLOCK_SECONDS}s)
                      </button>
                      <button onClick={() => adjustShotClock(-1)} className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}>
                        -1s
                      </button>
                      <button onClick={() => adjustShotClock(1)} className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}>
                        +1s
                      </button>
                    </div>
                  </>
                )}
                <div className="flex gap-1">
                  {[-10, -1, 1, 10].map((delta) => (
                    <button
                      key={delta}
                      onClick={() => adjustClock(delta)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}
                    >
                      {delta > 0 ? `+${delta}s` : `${delta}s`}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={undo} disabled={historyLength === 0} className={buttonSecondary}>
              Undo ({historyLength})
            </button>
          </div>
        </div>

        {!isDecided && (
          <div className="flex flex-col items-end gap-1">
            <button onClick={finishMatch} disabled={!canPlay || save.isPending || !allowFinish} className={buttonSuccess}>
              Finish match
            </button>
            {canPlay && !allowFinish && (
              <p className={`text-xs ${subtleText}`}>
                {inOvertime ? 'Finish unlocks once someone scores in overtime.' : `Finish unlocks at ${WIN_SCORE} points or when time runs out.`}
              </p>
            )}
          </div>
        )}

        {/* Game settings */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{settingsOpen ? '▾' : '▸'} Game settings</span>
          </button>
          {settingsOpen && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Buzzer (3s period end / 1s shot clock)</label>
                <button onClick={() => setBuzzerMuted((m) => !m)} className={`self-start ${buttonSecondary}`}>
                  {buzzerMuted ? 'Muted' : 'On'}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Shot clock ({SHOT_CLOCK_SECONDS}s)</label>
                <button onClick={() => setShotClockEnabled((e) => !e)} className={`self-start ${buttonSecondary}`}>
                  {shotClockEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Player roster */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setRosterOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{rosterOpen ? '▾' : '▸'} Player roster</span>
          </button>
          {rosterOpen && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(['a', 'b'] as const).map((side) => {
                const team = side === 'a' ? roster?.team_a : roster?.team_b
                return (
                  <div key={side} className="flex flex-col gap-1.5">
                    <p className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>
                      {side === 'a' ? homeName : awayName}
                    </p>
                    {!team && <p className={`text-xs ${subtleText}`}>Loading roster...</p>}
                    {team?.members.map((m) => {
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
                          <span className={subtleText}>{stat?.points ?? 0} pts</span>
                          {(['rebounds', 'assists', 'steals', 'blocks'] as const).map((key) => (
                            <button
                              key={key}
                              onClick={() => bumpStat(m.id, key)}
                              disabled={isDecided}
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {QUICK_STAT_LABEL[key]} {stat?.[key] ?? 0}
                            </button>
                          ))}
                          <span className={subtleText}>{stat?.fouls ?? 0} F</span>
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
                <p className={`text-xs ${subtleText}`}>No events yet. Score, fouls, and overtime will be logged here.</p>
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

        {/* 3x3 rules reference */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setRulesOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{rulesOpen ? '▾' : '▸'} 3x3 rules (FIBA Official 3x3 Basketball Rules)</span>
          </button>
          {rulesOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Court:</span> one half court, one basket. Not small-sided 5v5 — 3x3 is
                its own FIBA discipline (3 players + 1 substitute per team).
              </p>
              <p>
                <span className="font-semibold">Scoring:</span> inside the arc (6.75m) = 1 point, beyond the arc = 2
                points, free throw = 1 point.
              </p>
              <p>
                <span className="font-semibold">Game length:</span> one 10-minute period, or first to {WIN_SCORE} points
                — whichever comes first. Overtime is sudden death: first team to score +{OVERTIME_WIN_MARGIN} points wins.
              </p>
              <p>
                <span className="font-semibold">Shot clock:</span> {SHOT_CLOCK_SECONDS} seconds.
              </p>
              <p>
                <span className="font-semibold">No foul-out:</span> players are never disqualified on personal fouls.
                Team penalty kicks in instead — fouls {TEAM_FOUL_BONUS_THRESHOLD}-{TEAM_FOUL_TECHNICAL_THRESHOLD - 1} give
                2 free throws, every foul from the {TEAM_FOUL_TECHNICAL_THRESHOLD}th on is a technical.
              </p>
              <p className={subtleText}>
                Check-ball &amp; clear the arc: play starts/restarts with a check-ball behind the arc, and after every
                basket conceded, defensive rebound, or steal, the ball must be taken back behind the arc before
                attacking — a physical-court rule this scoreboard doesn&apos;t enforce automatically.
              </p>
            </div>
          )}
        </div>

        {/* Nested inside containerRef (the fullscreen target), not siblings
            of it — the Fullscreen API only renders the fullscreen element
            and its descendants, so a sibling here would silently vanish
            whenever the scoreboard is fullscreened. */}
        {pointPicker && (
          <PlayerPickerModal
            title={`Who scored? (+${pointPicker.delta})`}
            team={pointPicker.side === 'a' ? roster?.team_a : roster?.team_b}
            jerseys={jerseys}
            playerStats={playerStats}
            isDark={isDark}
            onPick={choosePlayerForPoints}
            onCancel={() => setPointPicker(null)}
          />
        )}

        {foulPicker && (
          <PlayerPickerModal
            title="Who fouled?"
            team={foulPicker === 'a' ? roster?.team_a : roster?.team_b}
            jerseys={jerseys}
            playerStats={playerStats}
            isDark={isDark}
            onPick={choosePlayerForFoul}
            onCancel={() => setFoulPicker(null)}
          />
        )}
      </div>
    </div>
  )
}
