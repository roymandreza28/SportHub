import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMatchRoster,
  toPlayerStatsPayload,
  updateMatchClock,
  updateMatchScore,
  type BracketMatch,
  type MatchRosterTeam,
  type PlayerStatEntry,
} from '../../lib/organizerApi'
import { buttonSecondary, buttonSuccess } from '../../lib/formStyles'

type RulePresetKey = 'NBA' | 'FIBA' | 'NCAA' | 'HS'

// Simplified regulation presets — close enough to match each league's shape
// (period count/length, shot clock, timeout allotment) without trying to be
// a certified officiating tool. Timeouts in particular vary by half/overtime
// in real rulebooks; these are flat per-game allotments for simplicity.
const RULE_PRESETS: Record<RulePresetKey, { label: string; periods: number; periodSeconds: number; shotClock: number; timeouts: number }> = {
  NBA: { label: 'NBA (4 periods x 12 minutes)', periods: 4, periodSeconds: 12 * 60, shotClock: 24, timeouts: 7 },
  FIBA: { label: 'FIBA (4 periods x 10 minutes)', periods: 4, periodSeconds: 10 * 60, shotClock: 24, timeouts: 5 },
  NCAA: { label: 'NCAA (2 periods x 20 minutes)', periods: 2, periodSeconds: 20 * 60, shotClock: 30, timeouts: 4 },
  HS: { label: 'High School (4 periods x 8 minutes)', periods: 4, periodSeconds: 8 * 60, shotClock: 0, timeouts: 5 },
}

const OVERTIME_SECONDS = 5 * 60
const PERSONAL_FOUL_LIMIT = 5

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

// The name box itself is split into 5 equal segments (one per personal
// foul) — each foul fills one more segment red behind the text, left to
// right, so the box reads as a foul-trouble gauge at a glance. All five
// segments red means fouled out (ejected).
function FoulSegmentedName({ name, fouls, isDark }: { name: string; fouls: number; isDark: boolean }) {
  const filled = Math.min(fouls, PERSONAL_FOUL_LIMIT)
  return (
    <div className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-md">
      <div className="absolute inset-0 flex">
        {Array.from({ length: PERSONAL_FOUL_LIMIT }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            className={`h-full flex-1 ${n <= filled ? 'bg-red-600' : isDark ? 'bg-slate-700' : 'bg-slate-100'} ${
              n > 1 ? (isDark ? 'border-l border-slate-900/50' : 'border-l border-white') : ''
            }`}
          />
        ))}
      </div>
      <span
        className={`relative z-10 flex h-full items-center truncate px-2 text-xs font-medium ${
          filled >= 3 ? 'text-pure-white' : isDark ? 'text-slate-100' : 'text-slate-800'
        }`}
      >
        {name}
      </span>
    </div>
  )
}

type RosterPlayer = { id: number; name: string }
// Rebounds/assists/steals/blocks feed the player's career stats pentagon
// (see api/app/Support/PlayerStatFieldSets.php) — fouls stays tracked here
// too for the foul-trouble gauge, but isn't one of the 5 pentagon axes.
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
  timeoutsA: number
  timeoutsB: number
  period: number
  periodClock: number
  playerStats: PlayerStats
}

type LogEntry = { id: number; text: string; at: number }

function jerseyKey(matchId: number) {
  return `sporthub:scoreboard:jerseys:${matchId}`
}

function statsKey(matchId: number) {
  return `sporthub:scoreboard:stats:${matchId}`
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
    <div className="scoreboard-palette fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4">
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
                <FoulSegmentedName name={m.name} fouls={fouls} isDark={isDark} />
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

export function BasketballScoreboard({
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
  const [homeName, setHomeName] = useState(match.participant_a?.name ?? 'Home')
  const [awayName, setAwayName] = useState(match.participant_b?.name ?? 'Away')
  const [shareCopied, setShareCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [presetKey, setPresetKey] = useState<RulePresetKey>('NBA')
  const preset = RULE_PRESETS[presetKey]

  const [scoreA, setScoreA] = useState(match.score_a)
  const [scoreB, setScoreB] = useState(match.score_b)
  const [period, setPeriod] = useState(1)
  const [periodClock, setPeriodClock] = useState(preset.periodSeconds)
  const [shotClock, setShotClock] = useState(preset.shotClock)
  const [clockRunning, setClockRunning] = useState(false)
  const [timeoutsA, setTimeoutsA] = useState(preset.timeouts)
  const [timeoutsB, setTimeoutsB] = useState(preset.timeouts)
  const historyRef = useRef<Snapshot[]>([])
  const [historyLength, setHistoryLength] = useState(0)

  const [buzzerMuted, setBuzzerMuted] = useState(true)
  const [shotClockEnabled, setShotClockEnabled] = useState(false)
  const [foulsTimeoutsEnabled, setFoulsTimeoutsEnabled] = useState(false)

  const [matchLog, setMatchLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)

  // Jersey numbers and per-player point/foul tallies are per-match scoring
  // notes, not tournament data — they live in localStorage rather than the
  // backend (which has no per-player stat columns), keyed by match id so a
  // page refresh mid-game doesn't lose them.
  const [jerseys, setJerseys] = useState<Record<number, string>>(() => loadJSON(jerseyKey(match.id), {}))
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadJSON(statsKey(match.id), {}))

  const [pointPicker, setPointPicker] = useState<{ side: 'a' | 'b'; delta: number } | null>(null)
  const [foulPicker, setFoulPicker] = useState<'a' | 'b' | null>(null)

  const [logOpen, setLogOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    setScoreA(match.score_a)
    setScoreB(match.score_b)
  }, [match])

  // Keeps the "Enter/Exit fullscreen" button label correct even when the
  // organizer leaves fullscreen via Esc or the browser's own UI rather than
  // the button itself.
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

  // Switching rule presets resets the game — matches the reference tool's
  // "changing rules starts fresh" behavior rather than trying to reconcile
  // in-progress state against a different period/clock shape.
  function applyPreset(key: RulePresetKey) {
    const p = RULE_PRESETS[key]
    setPresetKey(key)
    setPeriod(1)
    setPeriodClock(p.periodSeconds)
    setShotClock(p.shotClock)
    setClockRunning(false)
    setTimeoutsA(p.timeouts)
    setTimeoutsB(p.timeouts)
    setPlayerStats({})
    historyRef.current = []
    setHistoryLength(0)
    log(`Rule set changed to ${p.label}`)
    updateMatchClock(match.id, {
      clock_seconds_remaining: p.periodSeconds,
      clock_shot_seconds_remaining: shotClockEnabled && p.shotClock > 0 ? p.shotClock : null,
      clock_running: false,
      clock_period_label: `Period 1 / ${p.periods}`,
    }).catch(() => {})
  }

  useEffect(() => {
    if (!clockRunning) return
    const interval = setInterval(() => {
      setPeriodClock((c) => (c > 0 ? c - 1 : 0))
      if (shotClockEnabled && preset.shotClock > 0) setShotClock((c) => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [clockRunning, preset.shotClock, shotClockEnabled])

  // A real gym horn is a harsh, buzzing low tone, not a clean sine beep —
  // two slightly-detuned sawtooth oscillators beating against each other
  // through a lowpass filter gets much closer to that than a single pure
  // tone. The shot-clock violation reuses the same rig pitched up into a
  // sharper, shorter "beep-buzz", matching how an actual shot-clock unit's
  // horn sounds distinctly different (higher, shorter) from the game/period
  // horn on a real court. Both skippable via the mute toggle.
  function playBuzzer(durationSeconds: number, variant: 'horn' | 'shotclock' = 'horn') {
    if (buzzerMuted) return
    try {
      const ctx = new AudioContext()
      const peak = variant === 'horn' ? 0.4 : 0.3

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.02)
      gain.gain.setValueAtTime(peak, ctx.currentTime + Math.max(0.02, durationSeconds - 0.05))
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds)
      gain.connect(ctx.destination)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = variant === 'horn' ? 650 : 1800
      filter.connect(gain)

      const baseFreq = variant === 'horn' ? 110 : 880
      const osc1 = ctx.createOscillator()
      osc1.type = 'sawtooth'
      osc1.frequency.value = baseFreq
      osc1.connect(filter)

      const osc2 = ctx.createOscillator()
      osc2.type = 'sawtooth'
      osc2.frequency.value = baseFreq * 1.02
      osc2.connect(filter)

      osc1.start()
      osc2.start()
      osc1.stop(ctx.currentTime + durationSeconds)
      osc2.stop(ctx.currentTime + durationSeconds)
      osc2.onended = () => ctx.close()
    } catch {
      // Web Audio unavailable — silently skip the buzzer.
    }
  }

  // Quarter/period horn — 3 seconds, matching a real end-of-period buzzer.
  useEffect(() => {
    if (!clockRunning || periodClock !== 0) return
    playBuzzer(3, 'horn')
    setClockRunning(false)
    syncClock({ periodClock: 0, running: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodClock, clockRunning])

  // Shot-clock violation — a shorter 1 second buzzer; the game clock keeps
  // running since a shot-clock violation doesn't end the period.
  useEffect(() => {
    if (!clockRunning || !shotClockEnabled || preset.shotClock === 0 || shotClock !== 0) return
    playBuzzer(1, 'shotclock')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotClock, clockRunning, shotClockEnabled, preset.shotClock])

  const save = useMutation({
    mutationFn: (input: { score_a: number; score_b: number; status?: 'live' | 'completed'; player_stats?: PlayerStatEntry[] }) =>
      updateMatchScore(match.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  // The game clock lives only in this browser tab — nothing about it is
  // fetched back from the server on mount. This just PUSHES a snapshot out
  // whenever the clock actually changes state (never once per tick, that
  // would be a websocket message a second for every live match), so the
  // shared-post widget (LiveMatchScore.tsx) can extrapolate a live countdown
  // for anyone watching. periodLabel is computed here — not on the viewer's
  // side — since only this component actually knows the rule preset
  // (periods/overtime numbering) a public viewer never sees.
  function periodLabel(periodNumber: number, overtime: boolean): string {
    return overtime ? `Overtime ${periodNumber - preset.periods}` : `Period ${periodNumber} / ${preset.periods}`
  }

  function syncClock(overrides: { periodClock?: number; shotClock?: number; running?: boolean; period?: number } = {}) {
    const nextPeriodNumber = overrides.period ?? period
    const nextShotClock = overrides.shotClock ?? shotClock
    updateMatchClock(match.id, {
      clock_seconds_remaining: overrides.periodClock ?? periodClock,
      clock_shot_seconds_remaining: shotClockEnabled && preset.shotClock > 0 ? nextShotClock : null,
      clock_running: overrides.running ?? clockRunning,
      clock_period_label: periodLabel(nextPeriodNumber, nextPeriodNumber > preset.periods),
    }).catch(() => {})
  }

  const canPlay = match.participant_a !== null && match.participant_b !== null
  const isDecided = match.status === 'completed'
  const inOvertime = period > preset.periods
  // "Finish match" only unlocks once the current period has actually run
  // its full clock — reaching the last regulation period isn't enough on
  // its own, it has to have played out (or an overtime period, if the game
  // went there).
  const allPeriodsComplete = period >= preset.periods && periodClock === 0

  function pushHistory() {
    const snapshot: Snapshot = { scoreA, scoreB, timeoutsA, timeoutsB, period, periodClock, playerStats: { ...playerStats } }
    historyRef.current = [...historyRef.current, snapshot].slice(-50)
    setHistoryLength(historyRef.current.length)
  }

  function undo() {
    const last = historyRef.current.pop()
    setHistoryLength(historyRef.current.length)
    if (!last) return
    setScoreA(last.scoreA)
    setScoreB(last.scoreB)
    setTimeoutsA(last.timeoutsA)
    setTimeoutsB(last.timeoutsB)
    setPeriod(last.period)
    setPeriodClock(last.periodClock)
    setPlayerStats(last.playerStats)
    save.mutate({ score_a: last.scoreA, score_b: last.scoreB, status: 'live', player_stats: toPlayerStatsPayload(last.playerStats) })
    syncClock({ periodClock: last.periodClock, period: last.period, running: false })
    log('Undo')
  }

  function applyPoints(side: 'a' | 'b', delta: number, player?: RosterPlayer) {
    if (!canPlay || isDecided) return
    pushHistory()
    const teamName = side === 'a' ? homeName : awayName

    // Computed explicitly (not read back from state after setState) so the
    // save.mutate() call below always sends the up-to-date value — React
    // state updates are async, so playerStats itself would still be one
    // update behind at this point in the same function.
    const nextStats = player
      ? { ...playerStats, [player.id]: { ...emptyStat(), ...playerStats[player.id], points: (playerStats[player.id]?.points ?? 0) + delta } }
      : playerStats
    if (player) setPlayerStats(nextStats)

    if (side === 'a') {
      const next = Math.max(0, scoreA + delta)
      setScoreA(next)
      save.mutate({ score_a: next, score_b: scoreB, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
    } else {
      const next = Math.max(0, scoreB + delta)
      setScoreB(next)
      save.mutate({ score_a: scoreA, score_b: next, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
    }
    const pointLabel = `${delta > 0 ? '+' : ''}${delta} point${Math.abs(delta) === 1 ? '' : 's'}`
    log(player ? `${player.name} (${teamName}) ${pointLabel}` : `${teamName} ${pointLabel}`)
  }

  // Positive points require picking who scored (so every point is
  // attributed to a roster player); a -1 correction skips the picker since
  // it's fixing a misclick, not crediting anyone.
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
    log(`Foul — ${player.name} (${teamName}), ${newCount}${newCount >= PERSONAL_FOUL_LIMIT ? ' — fouled out' : ''}`)
    save.mutate({ score_a: scoreA, score_b: scoreB, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
    setFoulPicker(null)
  }

  // Rebounds/assists/steals/blocks — supplementary box-score taps in the
  // roster panel (not the main scoring buttons, which stay fast/uncluttered
  // for live play). No picker modal needed since these are tapped directly
  // on the already-visible roster row.
  function bumpStat(playerId: number, key: QuickStatKey) {
    if (isDecided) return
    pushHistory()
    const nextStats = { ...playerStats, [playerId]: { ...emptyStat(), ...playerStats[playerId], [key]: (playerStats[playerId]?.[key] ?? 0) + 1 } }
    setPlayerStats(nextStats)
    save.mutate({ score_a: scoreA, score_b: scoreB, status: 'live', player_stats: toPlayerStatsPayload(nextStats) })
  }

  function useTimeout(side: 'a' | 'b') {
    pushHistory()
    if (side === 'a') setTimeoutsA((t) => Math.max(0, t - 1))
    else setTimeoutsB((t) => Math.max(0, t - 1))
    log(`Timeout — ${side === 'a' ? homeName : awayName}`)
  }

  function teamFouls(side: 'a' | 'b'): number {
    const team = side === 'a' ? roster?.team_a : roster?.team_b
    if (!team) return 0
    return team.members.reduce((sum, m) => sum + (playerStats[m.id]?.fouls ?? 0), 0)
  }

  function nextPeriod() {
    pushHistory()
    const newPeriod = period + 1
    const newClock = newPeriod > preset.periods ? OVERTIME_SECONDS : preset.periodSeconds
    setPeriod(newPeriod)
    setPeriodClock(newClock)
    setShotClock(preset.shotClock)
    setClockRunning(false)
    syncClock({ periodClock: newClock, shotClock: preset.shotClock, period: newPeriod, running: false })
    log(newPeriod > preset.periods ? 'Overtime started' : `Period ${newPeriod} started`)
  }

  function adjustClock(deltaSeconds: number) {
    setPeriodClock((c) => {
      const next = Math.max(0, c + deltaSeconds)
      syncClock({ periodClock: next })
      return next
    })
  }

  function toggleClock() {
    setClockRunning((r) => {
      const next = !r
      syncClock({ running: next })
      return next
    })
  }

  function resetShotClock() {
    setShotClock(preset.shotClock)
    syncClock({ shotClock: preset.shotClock })
  }

  function adjustShotClock(deltaSeconds: number) {
    setShotClock((c) => {
      const next = Math.max(0, Math.min(preset.shotClock, c + deltaSeconds))
      syncClock({ shotClock: next })
      return next
    })
  }

  function toggleShotClockEnabled() {
    setShotClockEnabled((e) => {
      const next = !e
      updateMatchClock(match.id, {
        clock_seconds_remaining: periodClock,
        clock_shot_seconds_remaining: next && preset.shotClock > 0 ? shotClock : null,
        clock_running: clockRunning,
        clock_period_label: periodLabel(period, inOvertime),
      }).catch(() => {})
      return next
    })
  }

  // A full reset of the game's live state — scores, every player's points
  // and fouls, timeouts, and the period/clock all go back to a fresh start.
  // Team names and jersey numbers are setup, not game content, so they're
  // deliberately left untouched. Disabled once the match is completed (same
  // as the old Clear scores button) so it can't quietly undo a finished,
  // bracket-advanced result.
  function resetGame() {
    setScoreA(0)
    setScoreB(0)
    setPeriod(1)
    setPeriodClock(preset.periodSeconds)
    setShotClock(preset.shotClock)
    setClockRunning(false)
    setTimeoutsA(preset.timeouts)
    setTimeoutsB(preset.timeouts)
    setPlayerStats({})
    historyRef.current = []
    setHistoryLength(0)
    logIdRef.current += 1
    setMatchLog([{ id: logIdRef.current, text: 'Game reset — scores, fouls, and periods cleared.', at: Date.now() }])
    save.mutate({ score_a: 0, score_b: 0, status: 'live', player_stats: [] })
    syncClock({ periodClock: preset.periodSeconds, shotClock: preset.shotClock, period: 1, running: false })
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

  // Q/W/E/A score the home side, O/P/[/L score the away side, R/I foul the
  // home/away side, Space toggles the clock, Z undoes — all ignored while
  // typing in a text field or with a modifier key held, so they never fight
  // normal browser shortcuts. Positive-point keys open the same player
  // picker as the on-screen buttons; foul keys only fire once "Fouls &
  // timeouts" is enabled in Game settings, matching the on-screen button's
  // own visibility. Bound in the capture phase so no other handler in the
  // page (e.g. a focused button's own keydown handling) can swallow the key
  // first.
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
        case 'e':
          requestPoints('a', 3)
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
        case '[':
          requestPoints('b', 3)
          break
        case 'l':
          requestPoints('b', -1)
          break
        case 'r':
          if (foulsTimeoutsEnabled) requestFoul('a')
          break
        case 'i':
          if (foulsTimeoutsEnabled) requestFoul('b')
          break
        case 'z':
          undo()
          break
        case ' ':
          // Always prevent the default page-scroll behavior, so Space works
          // as a clock toggle everywhere — not just in fullscreen.
          e.preventDefault()
          toggleClock()
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
          <h3 className="text-base font-bold">Basketball Scoreboard</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex rounded-full border p-0.5 text-xs font-semibold ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
              <button
                onClick={() => setTheme('light')}
                className={`rounded-full px-3 py-1 ${!isDark ? 'bg-teal-600 text-pure-white' : subtleText}`}
              >
                Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`rounded-full px-3 py-1 ${isDark ? 'bg-teal-600 text-pure-white' : subtleText}`}
              >
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

        {/* Team / clock / team columns — deliberately tall (min-h-[78vh]) so
            this hero section alone fills nearly the whole modal viewport;
            Game settings and everything below it starts right at the fold
            and only comes into view once the organizer scrolls down. */}
        <div className="grid min-h-[78vh] grid-cols-1 gap-4 md:grid-cols-3">
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? homeName : awayName
            const setName = side === 'a' ? setHomeName : setAwayName
            const score = side === 'a' ? scoreA : scoreB
            const fouls = teamFouls(side)
            const timeouts = side === 'a' ? timeoutsA : timeoutsB
            const bonus = fouls >= PERSONAL_FOUL_LIMIT
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
                  <button onClick={() => requestPoints(side, 3)} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    +3 points
                  </button>
                  <button onClick={() => requestPoints(side, -1)} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    -1 point
                  </button>
                </div>
                {foulsTimeoutsEnabled && (
                  <div className="mt-1 flex w-full items-center justify-between text-xs">
                    <button
                      onClick={() => requestFoul(side)}
                      disabled={isDecided}
                      className={`rounded-md px-2 py-1 font-medium ${bonus ? 'bg-red-100 text-red-700' : isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}
                    >
                      Fouls: {fouls}
                      {bonus ? ' (bonus)' : ''}
                    </button>
                    <button
                      onClick={() => useTimeout(side)}
                      disabled={timeouts === 0 || isDecided}
                      className={`rounded-md px-2 py-1 font-medium disabled:opacity-50 ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}
                    >
                      Timeouts: {timeouts}
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <div className={`order-2 flex flex-col items-center justify-center gap-4 rounded-lg border p-6 ${cardClass}`}>
            <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>Game clock</label>
            <p className="text-9xl font-bold leading-none tabular-nums">{formatClock(periodClock)}</p>
            <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
              {inOvertime ? `OVERTIME ${period - preset.periods}` : `PERIOD ${period} / ${preset.periods}`}
            </p>
            <div className="flex gap-1.5">
              <button onClick={toggleClock} className={buttonSecondary}>
                {clockRunning ? 'Pause' : 'Start'}
              </button>
              <button
                onClick={() => {
                  const resetSeconds = inOvertime ? OVERTIME_SECONDS : preset.periodSeconds
                  setClockRunning(false)
                  setPeriodClock(resetSeconds)
                  syncClock({ periodClock: resetSeconds, running: false })
                }}
                className={buttonSecondary}
              >
                Reset clock
              </button>
            </div>
            <div className="flex gap-1.5">
              <button onClick={nextPeriod} disabled={!canPlay || isDecided} className={buttonSecondary}>
                Next period
              </button>
              <button onClick={undo} disabled={historyLength === 0} className={buttonSecondary}>
                Undo ({historyLength})
              </button>
            </div>
            {shotClockEnabled && preset.shotClock > 0 && (
              <>
                <p className={`text-xs font-bold tabular-nums ${shotClock <= 5 ? 'text-red-600' : subtleText}`}>
                  Shot clock: {shotClock}s
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={resetShotClock}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}
                  >
                    Reset ({preset.shotClock}s)
                  </button>
                  <button
                    onClick={() => adjustShotClock(-5)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}
                  >
                    -5s
                  </button>
                  <button
                    onClick={() => adjustShotClock(-1)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${isDark ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-100'}`}
                  >
                    -1s
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
          </div>
        </div>

        {!isDecided && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={finishMatch}
              disabled={!canPlay || save.isPending || !allPeriodsComplete}
              className={buttonSuccess}
            >
              Finish match
            </button>
            {canPlay && !allPeriodsComplete && (
              <p className={`text-xs ${subtleText}`}>
                Finish unlocks once {inOvertime ? 'this overtime period' : `period ${preset.periods}`} runs out.
              </p>
            )}
          </div>
        )}

        {/* Game settings — collapsed by default so the team/clock panels
            above get the most vertical room; the toggles inside still take
            effect immediately regardless of whether this is expanded. */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{settingsOpen ? '▾' : '▸'} Game settings</span>
          </button>
          {settingsOpen && (
            <>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Rule set</label>
                  <select
                    value={presetKey}
                    onChange={(e) => applyPreset(e.target.value as RulePresetKey)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${isDark ? 'border-slate-600 bg-slate-950 text-pure-white' : 'border-slate-200 bg-pure-white text-[#241e17]'}`}
                  >
                    {Object.entries(RULE_PRESETS).map(([key, p]) => (
                      <option key={key} value={key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Period summary</label>
                  <p className="py-1.5 text-xs">{preset.periods} periods x {preset.periodSeconds / 60} minutes</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Buzzer (3s period end / 1s shot clock)</label>
                  <button onClick={() => setBuzzerMuted((m) => !m)} className={buttonSecondary}>
                    {buzzerMuted ? 'Muted' : 'On'}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Shot clock ({preset.shotClock || 'n/a'}s)</label>
                  <button onClick={toggleShotClockEnabled} disabled={preset.shotClock === 0} className={buttonSecondary}>
                    {shotClockEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                <label className={`text-xs font-semibold uppercase tracking-wide ${subtleText}`}>Fouls &amp; timeouts</label>
                <button onClick={() => setFoulsTimeoutsEnabled((e) => !e)} className={`self-start ${buttonSecondary}`}>
                  {foulsTimeoutsEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Player roster — shown before/throughout the game so the organizer
            can jot each player's jersey number and see running point/foul
            tallies, which the score/foul pickers below feed directly. */}
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
                      const fouls = stat?.fouls ?? 0
                      const fouledOut = fouls >= PERSONAL_FOUL_LIMIT
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                            fouledOut
                              ? isDark
                                ? 'border-red-800 bg-red-950/40'
                                : 'border-red-200 bg-red-50'
                              : isDark
                                ? 'border-slate-700'
                                : 'border-slate-100'
                          }`}
                        >
                          <input
                            value={jerseys[m.id] ?? ''}
                            onChange={(e) => setJersey(m.id, e.target.value)}
                            placeholder="#"
                            className={`w-10 shrink-0 rounded-md border px-1 py-1 text-center ${isDark ? 'border-slate-600 bg-slate-950 text-pure-white' : 'border-slate-200 bg-pure-white'}`}
                          />
                          <FoulSegmentedName name={m.name} fouls={fouls} isDark={isDark} />
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
                          <span className={fouledOut ? 'font-semibold text-red-600' : subtleText}>
                            {fouls} F{fouledOut ? ' (out)' : ''}
                          </span>
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
                <p className={`text-xs ${subtleText}`}>No events yet. Score, fouls, timeouts, and period changes will be logged here.</p>
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

        {/* Keyboard shortcuts */}
        <div className={`rounded-lg border p-4 ${cardClass}`}>
          <button onClick={() => setShortcutsOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm font-bold">
            <span>{shortcutsOpen ? '▾' : '▸'} Keyboard shortcuts</span>
          </button>
          {shortcutsOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Home team:</span> Q +1 point, W +2 points, E +3 points, A -1 point, R Foul
              </p>
              <p>
                <span className="font-semibold">Away team:</span> O +1 point, P +2 points, [ +3 points, L -1 point, I Foul
              </p>
              <p>
                <span className="font-semibold">Game clock:</span> Space Start/Pause, Z Undo
              </p>
              <p className={subtleText}>
                Positive-point keys open the same "who scored" picker as the buttons; R/I open the same "who fouled"
                picker and only work once Fouls &amp; timeouts is enabled below. Active when not editing team names;
                modifier keys (Ctrl/Cmd/Alt) are ignored.
              </p>
            </div>
          )}
        </div>

        {scoreA === scoreB && !isDecided && periodClock === 0 && period >= preset.periods && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Tied at end of regulation — start overtime before finishing.
          </p>
        )}

        {/* The picker modals must be nested inside the fullscreen target
            (containerRef), not siblings of it — the Fullscreen API only
            renders the fullscreen element and its descendants, so a sibling
            silently doesn't appear at all once fullscreen is active. This
            was why the "who scored"/"who fouled" picker seemed to vanish
            after adding a point or foul while fullscreened. */}
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
