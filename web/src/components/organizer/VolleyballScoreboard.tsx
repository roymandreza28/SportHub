import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMatchRoster, updateMatchSets, type BracketMatch, type MatchRosterTeam, type SetScore, type Tournament } from '../../lib/organizerApi'
import { buttonSecondary } from '../../lib/formStyles'

// Volleyball Scoreboard Rules (rally scoring, no point cap, best-of-5,
// automatic technical timeouts) — see the "Volleyball rules" panel at the
// bottom of the board for the full reference this component implements.
const TECHNICAL_TIMEOUT_THRESHOLDS = [8, 16]
const SWITCH_SIDES_THRESHOLD = 8

type PointCategory = 'spike' | 'block' | 'ace' | 'error'
type RosterPlayer = { id: number; name: string }
type PlayerVolleyballStat = { spikes: number; blocks: number; aces: number; errors: number }
type PlayerStats = Record<number, PlayerVolleyballStat>
type PointRequest = { scoringSide: 'a' | 'b'; category: PointCategory }

type RallySnapshot = { a: number; b: number; server: 'a' | 'b'; playerStats: PlayerStats }
type LogEntry = { id: number; text: string; at: number }

const CATEGORY_LABEL: Record<PointCategory, string> = {
  spike: 'Spike',
  block: 'Block',
  ace: 'Serve ace',
  error: 'Opp. error',
}

function jerseyKey(matchId: number) {
  return `sporthub:scoreboard:volleyball:jerseys:${matchId}`
}

function statsKey(matchId: number) {
  return `sporthub:scoreboard:volleyball:stats:${matchId}`
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
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/70 p-4">
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

export function VolleyballScoreboard({
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

  const setsToWin = tournament.sets_to_win ?? 3
  const totalPossibleSets = setsToWin * 2 - 1

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [homeName, setHomeName] = useState(match.participant_a?.name ?? 'Home')
  const [awayName, setAwayName] = useState(match.participant_b?.name ?? 'Away')
  const [shareCopied, setShareCopied] = useState(false)

  const [sets, setSets] = useState<SetScore[]>(match.sets ?? [])
  const [currentA, setCurrentA] = useState(0)
  const [currentB, setCurrentB] = useState(0)
  const [server, setServer] = useState<'a' | 'b'>('a')
  const rallyHistoryRef = useRef<RallySnapshot[]>([])
  const [rallyHistoryLength, setRallyHistoryLength] = useState(0)

  const [jerseys, setJerseys] = useState<Record<number, string>>(() => loadJSON(jerseyKey(match.id), {}))
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => loadJSON(statsKey(match.id), {}))
  const [pointRequest, setPointRequest] = useState<PointRequest | null>(null)

  const [matchLog, setMatchLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)
  const ttoAcknowledgedRef = useRef<Set<string>>(new Set())

  const [rosterOpen, setRosterOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

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

  // The deciding set is the last one the match could possibly need — e.g. set
  // 5 of a best-of-5, set 3 of a best-of-3 — and plays to 15 instead of 25.
  // FIVB rules: technical timeouts only exist in the 25-point sets, never in
  // the 15-point decider — the leading team switching sides at 8 there does
  // the same "break the run" job the TTOs do in every other set.
  const isDecidingSet = sets.length === totalPossibleSets - 1
  const targetPoints = isDecidingSet ? 15 : 25
  const showSwitchSides = isDecidingSet && (currentA >= SWITCH_SIDES_THRESHOLD || currentB >= SWITCH_SIDES_THRESHOLD)

  const leaderScore = Math.max(currentA, currentB)
  const technicalTimeoutNow =
    !isDecidingSet && currentA !== currentB && TECHNICAL_TIMEOUT_THRESHOLDS.includes(leaderScore)
  const technicalTimeoutLeader = currentA > currentB ? homeName : awayName

  // An "opponent error" credits the OTHER team's score, so the picker for it
  // has to show the opposite roster from the team that benefits.
  const pickerSide: 'a' | 'b' | null = pointRequest
    ? pointRequest.category === 'error'
      ? pointRequest.scoringSide === 'a'
        ? 'b'
        : 'a'
      : pointRequest.scoringSide
    : null
  const pickerTeam = pickerSide === 'a' ? roster?.team_a : pickerSide === 'b' ? roster?.team_b : null

  const save = useMutation({
    mutationFn: (nextSets: SetScore[]) => updateMatchSets(match.id, nextSets),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', tournamentId] })
    },
  })

  function pushRallyHistory() {
    rallyHistoryRef.current = [...rallyHistoryRef.current, { a: currentA, b: currentB, server, playerStats: { ...playerStats } }].slice(-100)
    setRallyHistoryLength(rallyHistoryRef.current.length)
  }

  function undoRally() {
    const last = rallyHistoryRef.current.pop()
    setRallyHistoryLength(rallyHistoryRef.current.length)
    if (!last) return
    setCurrentA(last.a)
    setCurrentB(last.b)
    setServer(last.server)
    setPlayerStats(last.playerStats)
    log('Undo point')
  }

  // Fires once, right when a team's score first reaches 8 or 16 — logged so
  // it's part of the permanent record even though the on-screen banner only
  // shows while the score sits exactly on that number.
  function maybeLogTechnicalTimeout(setIndex: number, side: 'a' | 'b', score: number) {
    if (isDecidingSet || !TECHNICAL_TIMEOUT_THRESHOLDS.includes(score)) return
    const key = `${setIndex}-${side}-${score}`
    if (ttoAcknowledgedRef.current.has(key)) return
    ttoAcknowledgedRef.current.add(key)
    log(`Technical timeout — ${side === 'a' ? homeName : awayName} reaches ${score}`)
  }

  // scoringSide is who the point goes to; player is who gets credit for
  // making it happen — for a 'spike'/'block'/'ace' that's a scoringSide
  // player, for an 'error' it's the opposing player who made the mistake.
  function applyPoint(scoringSide: 'a' | 'b', category: PointCategory, player: RosterPlayer) {
    if (isDecided || !canPlay) return
    pushRallyHistory()

    const nextA = scoringSide === 'a' ? currentA + 1 : currentA
    const nextB = scoringSide === 'b' ? currentB + 1 : currentB
    setCurrentA(nextA)
    setCurrentB(nextB)
    if (server !== scoringSide) setServer(scoringSide)

    setPlayerStats((s) => {
      const prev = s[player.id] ?? { spikes: 0, blocks: 0, aces: 0, errors: 0 }
      return {
        ...s,
        [player.id]: {
          spikes: prev.spikes + (category === 'spike' ? 1 : 0),
          blocks: prev.blocks + (category === 'block' ? 1 : 0),
          aces: prev.aces + (category === 'ace' ? 1 : 0),
          errors: prev.errors + (category === 'error' ? 1 : 0),
        },
      }
    })

    const scoringTeamName = scoringSide === 'a' ? homeName : awayName
    const logLine =
      category === 'error'
        ? `${player.name} error → point ${scoringTeamName} (${nextA}-${nextB})`
        : `${player.name} (${scoringTeamName}) ${CATEGORY_LABEL[category]} (${nextA}-${nextB})`
    log(logLine)
    maybeLogTechnicalTimeout(sets.length, scoringSide, scoringSide === 'a' ? nextA : nextB)

    const leader = nextA > nextB ? nextA : nextB
    const trailer = nextA > nextB ? nextB : nextA
    const setWon = leader >= targetPoints && leader - trailer >= 2

    if (setWon) {
      const nextSets = [...sets, { score_a: nextA, score_b: nextB }]
      setSets(nextSets)
      setCurrentA(0)
      setCurrentB(0)
      // Winner of the set serves first next set, per standard rotation rules.
      setServer(nextA > nextB ? 'a' : 'b')
      rallyHistoryRef.current = []
      setRallyHistoryLength(0)
      ttoAcknowledgedRef.current.clear()
      log(`Set ${nextSets.length} won by ${nextA > nextB ? homeName : awayName} (${nextA}-${nextB})`)
      save.mutate(nextSets)
    }
  }

  function requestPoint(scoringSide: 'a' | 'b', category: PointCategory) {
    if (isDecided || !canPlay) return
    setPointRequest({ scoringSide, category })
  }

  function choosePlayerForPoint(player: RosterPlayer) {
    if (!pointRequest) return
    applyPoint(pointRequest.scoringSide, pointRequest.category, player)
    setPointRequest(null)
  }

  function removeLastSet() {
    const nextSets = sets.slice(0, -1)
    setSets(nextSets)
    save.mutate(nextSets)
    log('Undo last set')
  }

  function resetGame() {
    setSets([])
    setCurrentA(0)
    setCurrentB(0)
    setServer('a')
    setPlayerStats({})
    rallyHistoryRef.current = []
    setRallyHistoryLength(0)
    ttoAcknowledgedRef.current.clear()
    logIdRef.current += 1
    setMatchLog([{ id: logIdRef.current, text: 'Game reset — all sets, points, and stats cleared.', at: Date.now() }])
    save.mutate([])
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

  // Home: Q spike, W block, E serve ace, R opponent error (picks from the
  // AWAY roster). Away: I spike, O block, P serve ace, [ opponent error
  // (picks from the HOME roster). Z undoes the last point — all ignored
  // while typing in a text field or with a modifier key held.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'q':
          requestPoint('a', 'spike')
          break
        case 'w':
          requestPoint('a', 'block')
          break
        case 'e':
          requestPoint('a', 'ace')
          break
        case 'r':
          requestPoint('a', 'error')
          break
        case 'i':
          requestPoint('b', 'spike')
          break
        case 'o':
          requestPoint('b', 'block')
          break
        case 'p':
          requestPoint('b', 'ace')
          break
        case '[':
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
  const panelClass = isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'
  const cardClass = isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-white'
  const subtleText = isDark ? 'text-slate-400' : 'text-slate-500'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={containerRef} className={`flex w-full max-w-7xl flex-col gap-4 overflow-y-auto rounded-xl p-6 shadow-2xl ${panelClass}`} style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/20 pb-3">
          <h3 className="text-base font-bold">Volleyball Scoreboard</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex rounded-full border p-0.5 text-xs font-semibold ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
              <button onClick={() => setTheme('light')} className={`rounded-full px-3 py-1 ${!isDark ? 'bg-teal-600 text-white' : subtleText}`}>
                Light
              </button>
              <button onClick={() => setTheme('dark')} className={`rounded-full px-3 py-1 ${isDark ? 'bg-teal-600 text-white' : subtleText}`}>
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
          Best of {totalPossibleSets} sets — first to {setsToWin} wins. Sets to 25 (15 in the deciding set), win by 2, no cap.
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

        {!isDecided && technicalTimeoutNow && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            🔔 Technical timeout — {technicalTimeoutLeader} reaches {leaderScore}.
          </p>
        )}

        {!isDecided && showSwitchSides && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            Switch sides — deciding set, a team has reached {SWITCH_SIDES_THRESHOLD}.
          </p>
        )}

        {/* Team / set columns */}
        <div className="grid min-h-[78vh] grid-cols-1 gap-4 md:grid-cols-3">
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? homeName : awayName
            const setName = side === 'a' ? setHomeName : setAwayName
            const current = side === 'a' ? currentA : currentB
            return (
              <div key={side} className={`${side === 'a' ? 'order-1' : 'order-3'} flex flex-col items-center justify-center gap-4 rounded-lg border p-6 text-center ${cardClass}`}>
                <label className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
                  {side === 'a' ? 'Home team' : 'Away team'}
                  {server === side ? ' · serving' : ''}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-center text-3xl font-semibold ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}
                />
                <p className={`text-sm font-semibold uppercase tracking-wide ${subtleText}`}>
                  {side === 'a' ? setsWonA : setsWonB} set{(side === 'a' ? setsWonA : setsWonB) === 1 ? '' : 's'} won
                </p>
                <p className="text-9xl font-bold leading-none tabular-nums">{current}</p>
                <div className="grid w-full grid-cols-2 gap-1.5">
                  <button onClick={() => requestPoint(side, 'spike')} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    Spike
                  </button>
                  <button onClick={() => requestPoint(side, 'block')} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    Block
                  </button>
                  <button onClick={() => requestPoint(side, 'ace')} disabled={!canPlay || isDecided} className={buttonSecondary}>
                    Serve ace
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
              {isDecidingSet ? 'Deciding set (to 15)' : `Set ${sets.length + 1} (to 25)`}
            </p>
            <p className={`text-xs ${subtleText}`}>Serving: {server === 'a' ? homeName : awayName}</p>

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
              {!isDecided && rallyHistoryLength > 0 && (
                <button onClick={undoRally} disabled={save.isPending} className={buttonSecondary}>
                  Undo point ({rallyHistoryLength})
                </button>
              )}
              {sets.length > 0 && !isDecided && currentA === 0 && currentB === 0 && (
                <button onClick={removeLastSet} disabled={save.isPending} className={buttonSecondary}>
                  Undo last set
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Player roster — jersey numbers plus a running breakdown of each
            player's spikes/blocks/aces/errors, fed directly by the pickers
            above. */}
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
                    {!team && <p className={`text-xs ${subtleText}`}>No roster for this match.</p>}
                    {team?.members.map((m) => {
                      const stat = playerStats[m.id]
                      return (
                        <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                          <input
                            value={jerseys[m.id] ?? ''}
                            onChange={(e) => setJersey(m.id, e.target.value)}
                            placeholder="#"
                            className={`w-10 shrink-0 rounded-md border px-1 py-1 text-center ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white'}`}
                          />
                          <span className="flex-1 truncate font-medium">{m.name}</span>
                          <span className={subtleText}>{stat?.spikes ?? 0} Sp</span>
                          <span className={subtleText}>{stat?.blocks ?? 0} Bl</span>
                          <span className={subtleText}>{stat?.aces ?? 0} Ace</span>
                          <span className={subtleText}>{stat?.errors ?? 0} Err</span>
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
                <p className={`text-xs ${subtleText}`}>No events yet. Points, sets, and technical timeouts will be logged here.</p>
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
            <span>{rulesOpen ? '▾' : '▸'} Volleyball rules</span>
          </button>
          {rulesOpen && (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <p>
                <span className="font-semibold">Rally scoring:</span> every rally earns a point for one team,
                regardless of who served.
              </p>
              <p>
                <span className="font-semibold">Sets:</span> played to 25 points (5th/deciding set to 15). A team must
                win by at least 2 points — no cap.
              </p>
              <p>
                <span className="font-semibold">Match format:</span> best of {totalPossibleSets} sets — first to{' '}
                {setsToWin} set wins takes the match.
              </p>
              <p>
                <span className="font-semibold">Scoring:</span> points come from attacks, blocks, and serves (or the
                opposing team's error) — each button opens a picker so the point is credited to the actual player.
              </p>
              <p>
                <span className="font-semibold">Technical timeout:</span> automatic when the leading team reaches 8 or
                16 points, in each 25-point set. The 15-point deciding set has none — teams switch sides instead once
                a team reaches 8.
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
                <span className="font-semibold">Home team:</span> Q spike, W block, E serve ace, R opponent error
                (picks from {awayName}&apos;s roster)
              </p>
              <p>
                <span className="font-semibold">Away team:</span> I spike, O block, P serve ace, [ opponent error
                (picks from {homeName}&apos;s roster)
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
                : `Who made the ${CATEGORY_LABEL[pointRequest.category].toLowerCase()}?`
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
