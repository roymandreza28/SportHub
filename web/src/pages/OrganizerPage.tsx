import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchOrganizerTournaments,
  fetchLivestreams,
  fetchBracket,
  updateTournament,
  proceedTournament,
  cancelTournament,
  generateBracket,
  exportTournamentRegistrations,
  exportTournamentResults,
  exportTournamentPlayerRankings,
  type Tournament,
  type BracketMatch,
} from '../lib/organizerApi'
import { useAuth } from '../lib/AuthContext'
import { formatPeso } from '../lib/venueApi'
import { extractDownloadErrorMessage } from '../lib/api'
import { fetchNotifications, markNotificationRead } from '../lib/notificationsApi'
import {
  DashboardShell,
  ListPreview,
  ListRow,
  Section,
  StatusBadge,
  type NavItem,
} from '../components/layout/DashboardShell'
import { IconChevronDown, IconFileText, IconHome, IconRadio, IconTrophy } from '../components/layout/icons'
import { buttonDanger, buttonPrimary, buttonSecondary, buttonSuccess } from '../lib/formStyles'
import { TournamentWizard } from '../components/organizer/TournamentWizard'
import { BracketView } from '../components/organizer/BracketView'
import { ChampionCongratsModal } from '../components/organizer/ChampionCongratsModal'
import { ScoreboardLive } from '../components/organizer/ScoreboardLive'
import { MatchStartOptionsModal } from '../components/organizer/MatchStartOptionsModal'
import { MatchScoreboardViewer } from '../components/organizer/MatchScoreboardViewer'
import { NewsEditor } from '../components/organizer/NewsEditor'
import { TournamentRegistrationsList } from '../components/organizer/TournamentRegistrationsList'
import { Newsfeed } from '../components/newsfeed/Newsfeed'
import { LivestreamCreateForm } from '../components/organizer/LivestreamCreateForm'
import { LivestreamBroadcast } from '../components/organizer/LivestreamBroadcast'
import { LivestreamViewer } from '../components/organizer/LivestreamViewer'
import { LivestreamChat } from '../components/organizer/LivestreamChat'
import { useTabParam } from '../lib/useTabParam'

function TournamentPickerDropdown({
  label,
  tournaments,
  selectedId,
  onSelect,
  emptyText,
}: {
  label: string
  tournaments: Tournament[]
  selectedId: number | null
  onSelect: (id: number) => void
  emptyText: string
}) {
  const [open, setOpen] = useState(false)
  const selected = tournaments.find((t) => t.id === selectedId)

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.status})` : label}</span>
        <IconChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {tournaments.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">{emptyText}</p>}
          {tournaments.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSelect(t.id)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-sm transition ${
                selectedId === t.id ? 'bg-teal-50 text-teal-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="truncate font-medium">{t.name}</span>
              <StatusBadge status={t.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function OrganizerPage() {
  const { user, hasRole } = useAuth()
  const isMainOrganizer = hasRole('organizer')
  // A venue facilitator gets the exact same tournament create/manage/
  // bracket powers as the main organizer role here — the one restriction
  // (which venue they're allowed to pick) is enforced server-side in
  // TournamentController, not in this page. They're never simultaneously
  // 'organizer'/'venue_organizer'/'livestream_organizer' (see roles.ts'
  // own ROLE_PRIORITY comment), so this never doubles up with those.
  const isVenueFacilitator = hasRole('venue_facilitator')
  const canManageTournaments = isMainOrganizer || isVenueFacilitator
  const canScoreMatches = canManageTournaments || hasRole('venue_organizer')
  // A venue facilitator holds 'manage livestreams' via a direct permission
  // grant (LivestreamPolicy::create checks $user->can(...), not a role
  // name — see RolesAndPermissionsSeeder), not the 'livestream_organizer'
  // role itself, so this needs its own OR clause rather than falling out of
  // hasRole('livestream_organizer') the way it does for a real livestream
  // organizer account.
  const canManageLivestreams = isMainOrganizer || isVenueFacilitator || hasRole('livestream_organizer')

  const NAV_ITEMS: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: IconHome },
    ...(canScoreMatches
      ? [{ id: 'tournaments', label: canManageTournaments ? 'Tournaments' : 'Tournament to Facilitate', icon: IconTrophy }]
      : []),
    // Newsfeed posting is open to the whole organizer family, not just the
    // main organizer — see NewsController/NewsPolicy's 'manage news'
    // permission, now also granted to venue_organizer/livestream_organizer.
    { id: 'news', label: 'News', icon: IconFileText },
    ...(canManageLivestreams ? [{ id: 'livestreams', label: 'Livestreams', icon: IconRadio }] : []),
  ]

  const queryClient = useQueryClient()
  const { data: tournaments } = useQuery({ queryKey: ['organizer', 'tournaments'], queryFn: fetchOrganizerTournaments })
  const { data: livestreams } = useQuery({ queryKey: ['livestreams'], queryFn: fetchLivestreams })
  const [active, setActive] = useTabParam(NAV_ITEMS[0].id)

  // A new tournament starts as a draft so an organizer can finish setting
  // it up before coaches see it — but coaches only ever fetch
  // status=registration tournaments to register for, so this is the step
  // that actually makes a tournament joinable. Without it, every tournament
  // stays invisible to coaches indefinitely.
  const openRegistrationMutation = useMutation({
    mutationFn: (tournamentId: number) => updateTournament(tournamentId, { status: 'registration' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] }),
  })

  const proceedMutation = useMutation({
    mutationFn: proceedTournament,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] }),
  })

  const cancelMutation = useMutation({
    mutationFn: cancelTournament,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] }),
  })

  const editMutation = useMutation({
    mutationFn: ({ tournamentId, name, starts_at }: { tournamentId: number; name: string; starts_at: string }) =>
      updateTournament(tournamentId, { name, starts_at }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] })
      setEditingTournamentId(null)
      setEditDraft({ name: '', starts_at: '' })
    },
  })

  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [editingTournamentId, setEditingTournamentId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', starts_at: '' })
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportingKind, setExportingKind] = useState<'registrations' | 'results' | 'rankings' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const EXPORT_KIND_LABEL: Record<'registrations' | 'results' | 'rankings', string> = {
    registrations: 'Export registrations',
    results: 'Export full report',
    rankings: 'Export player rankings',
  }

  async function runExport(kind: 'registrations' | 'results' | 'rankings', tournamentId: number) {
    setExportMenuOpen(false)
    setExportingKind(kind)
    setExportError(null)
    try {
      if (kind === 'registrations') await exportTournamentRegistrations(tournamentId)
      else if (kind === 'results') await exportTournamentResults(tournamentId)
      else await exportTournamentPlayerRankings(tournamentId)
    } catch (error) {
      setExportError(await extractDownloadErrorMessage(error))
    } finally {
      setExportingKind(null)
    }
  }
  // A not-yet-started match a venue organizer just clicked — shown the
  // win-by-default/start-game choice (MatchStartOptionsModal) before the
  // real scoreboard ever opens. A match already live/completed skips this
  // and opens the scoreboard directly, same as before.
  const [pendingMatch, setPendingMatch] = useState<BracketMatch | null>(null)
  // The main organizer's read-only counterpart to the venue organizer's
  // editable scoreboard above — see MatchScoreboardViewer.
  const [viewingMatch, setViewingMatch] = useState<BracketMatch | null>(null)

  // Shared by both the match card's own onClick and ShareMatchModal's "Go
  // live & score" button (via onGoLive below) — the same "which screen does
  // this match open into" decision either way, so going live and clicking
  // straight into a match land in the same place.
  function openMatch(match: BracketMatch) {
    const tournament = myTournaments.find((t) => t.id === selectedTournamentId)
    // A main organizer runs the scoreboard themselves once no venue
    // organizer has been delegated that job for this tournament — mirrors
    // MatchPolicy::updateScore()'s own organizer_id fallback exactly, so
    // this never opens a scoreboard the backend would then 403 on. Once a
    // venue organizer IS assigned, scoring stays exclusively theirs and the
    // main organizer keeps the read-only viewer, same as before.
    const organizerRunsItThemselves = isMainOrganizer && tournament != null && tournament.venue_organizer_id == null

    if (isMainOrganizer && !organizerRunsItThemselves) {
      if (match.status === 'live' || match.status === 'completed') setViewingMatch(match)
      return
    }
    // A still-scheduled game with both sides determined gets the
    // win-by-default/start-game choice first; a match already live/completed
    // (re-opening the scoreboard, e.g. after closing it) skips straight to
    // the scoreboard as before.
    if (match.status === 'scheduled' && match.participant_a_id && match.participant_b_id) {
      setPendingMatch(match)
    } else {
      setActiveMatchId(match.id)
    }
  }

  // The organizer's "close registration early" option — the same action
  // BracketService::autoStartExpired() performs automatically once starts_at
  // passes, exposed here for a tournament already selected in the list
  // (distinct from TournamentWizard's own copy of this mutation, which only
  // applies to a tournament just created in that form).
  const bracketMutation = useMutation({
    mutationFn: generateBracket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', selectedTournamentId] })
    },
  })

  // The one place a notification type drives a pop-up rather than just
  // dropdown text/read-state — every other notification is a passive read,
  // but crowning a champion needs the organizer to actually act (post a
  // congratulations) right when it happens. Shares HeaderNotificationsMenu's
  // ['notifications'] query/socket subscription rather than opening a second
  // echo.private() connection to the same channel — laravel-echo's `.leave()`
  // tears down the whole shared channel, so a second subscriber unmounting
  // here would silently kill the header's listeners too.
  const { data: notifications } = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications, enabled: canManageTournaments })
  const [championModal, setChampionModal] = useState<{ id: number; name: string; championName: string | null } | null>(null)
  // markNotificationRead()'s invalidateQueries() refetch is async — the
  // 'notifications' cache isn't guaranteed to reflect read_at yet by the
  // time this modal closes (a fast Skip click routinely beats that round
  // trip). Tracking shown ids locally, instead of trusting the cache, is
  // what actually stops the same champion popup reopening the instant it's
  // dismissed.
  const shownChampionIds = useRef(new Set<number>())

  useEffect(() => {
    if (!canManageTournaments || championModal) return

    const unread = (notifications ?? []).find(
      (n) => n.type === 'tournament_champion_crowned' && !n.read_at && !shownChampionIds.current.has(n.id)
    )
    if (!unread) return

    shownChampionIds.current.add(unread.id)
    setChampionModal({
      id: Number(unread.data.tournament_id),
      name: String(unread.data.tournament_name ?? ''),
      championName: unread.data.champion_name != null ? String(unread.data.champion_name) : null,
    })
    markNotificationRead(unread.id).then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }, [notifications, canManageTournaments, championModal, queryClient])

  const myTournaments = (tournaments ?? [])
    .filter((t) => {
      if (isMainOrganizer) return true
      // Unlike the main organizer (who sees every tournament platform-
      // wide, per today's existing behavior above), a venue facilitator
      // only ever sees tournaments they themselves created — matches how
      // every other permission this role has is already self-scoped (its
      // own venues, its own bookings).
      if (isVenueFacilitator) return t.organizer_id === user?.id
      if (hasRole('venue_organizer')) return t.venue_organizer_id === user?.id
      if (hasRole('livestream_organizer')) return t.livestream_organizer_id === user?.id
      return false
    })
    .slice(0, 20)
  const activeTournaments = myTournaments.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived')
  const inactiveTournaments = myTournaments.filter((t) => t.status === 'completed' || t.status === 'cancelled')

  // Shares its query key with BracketView's own bracket query, so once a
  // score/finish mutation invalidates ['organizer', 'bracket', id] (already
  // done inside the scoreboard components), this refetches too — keeping
  // the open scoreboard's `match` prop live instead of the stale snapshot
  // captured at the moment the match card was first clicked. Without this,
  // finishing a match updated the bracket underneath but the scoreboard
  // modal on top never reflected the win or unlocked its "completed" state.
  const { data: activeBracket } = useQuery({
    queryKey: ['organizer', 'bracket', selectedTournamentId],
    queryFn: () => fetchBracket(selectedTournamentId!),
    enabled: selectedTournamentId != null && activeMatchId != null,
    retry: false,
  })
  // `structure` (not the flat `matches` relation) is what carries the
  // normalized participant_a/participant_b/winner shape — the raw `matches`
  // relation's participant_a is the individual-player relation, which is
  // null for every team match regardless of who's actually seeded in it.
  const activeMatch = activeBracket?.structure?.flat().find((m) => m.id === activeMatchId) ?? null

  const myLivestreams = livestreams ?? []
  const [selectedLivestreamId, setSelectedLivestreamId] = useState<number | null>(null)
  const selectedLivestream = myLivestreams.find((l) => l.id === selectedLivestreamId)

  const inProgressCount = myTournaments.filter((t) => t.status === 'ongoing').length
  const liveStreamCount = myLivestreams.filter((l) => l.status === 'live').length
  const registrationOpenCount = myTournaments.filter((t) => t.status === 'registration').length
  const completedCount = myTournaments.filter((t) => t.status === 'completed').length
  const trendData = [18, 23, 31, 38, 46, 54]
  const insights = [
    { title: 'Tournament pipeline', value: `${myTournaments.length}`, description: 'Total tournaments under your management' },
    { title: 'Live stream activity', value: `${liveStreamCount}`, description: 'Currently broadcasting events to your audience' },
    { title: 'Open registrations', value: `${registrationOpenCount}`, description: 'Stages currently accepting sign-ups' },
  ]
  const topTournaments = [...myTournaments]
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 4)

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
      {active === 'overview' && (
        <>
          <div className="mb-8 overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-900 via-violet-900 to-indigo-700 p-6 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-200/80">Operations overview</p>
                <h1 className="mt-2 text-3xl font-bold text-pure-white sm:text-4xl">
                  {isMainOrganizer
                    ? 'Organizer Dashboard'
                    : isVenueFacilitator
                      ? 'Venue Facilitator Dashboard'
                      : canScoreMatches
                        ? 'Venue Organizer Dashboard'
                        : 'Livestream Organizer Dashboard'}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">
                  {canManageTournaments
                    ? 'Track tournament momentum, schedule health, and the next actions that need your attention.'
                    : canScoreMatches
                      ? 'Monitor active tournaments and the live matches that need direction.'
                      : 'Keep livestreams and broadcast activity aligned with your events.'}
                </p>
              </div>

              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-50 backdrop-blur-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                {inProgressCount + liveStreamCount} active items
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Tournaments</p>
                <p className="mt-2 text-3xl font-bold text-white">{myTournaments.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">In progress</p>
                <p className="mt-2 text-3xl font-bold text-white">{inProgressCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-200/80">Livestreams</p>
                <p className="mt-2 text-3xl font-bold text-white">{liveStreamCount}</p>
              </div>
            </div>
          </div>

          <div className="mb-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Monthly trends</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Competition momentum</h2>
                </div>
                <div className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">+26.8%</div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
                <div>
                  <svg viewBox="0 0 460 170" className="h-40 w-full" role="img" aria-label="Monthly organizer trend chart">
                    <defs>
                      <linearGradient id="organizer-trend-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(124,58,237,0.28)" />
                        <stop offset="100%" stopColor="rgba(124,58,237,0.02)" />
                      </linearGradient>
                    </defs>
                    {[0, 1, 2, 3].map((line) => (
                      <line
                        key={line}
                        x1={20}
                        x2={440}
                        y1={20 + line * 34}
                        y2={20 + line * 34}
                        stroke="rgba(148,163,184,0.18)"
                        strokeDasharray="4 6"
                      />
                    ))}
                    <polyline
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points="20,120 95,110 170,88 245,70 320,58 395,40"
                    />
                    <polygon
                      points="20,150 20,120 95,110 170,88 245,70 320,58 395,40 440,150"
                      fill="url(#organizer-trend-fill)"
                      opacity="0.95"
                    />
                  </svg>
                  <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month) => (
                      <span key={month}>{month}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tournaments</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{Math.max(myTournaments.length, 1)}</p>
                    <p className="mt-1 text-xs text-emerald-600">Active portfolio</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{completedCount}</p>
                    <p className="mt-1 text-xs text-violet-600">Events wrapped up</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-slate-900 p-6 text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Insights</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What needs attention</h2>
              <div className="mt-5 space-y-3">
                {insights.map((card) => (
                  <div key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-200">{card.title}</span>
                      <span className="text-lg font-bold text-violet-400">{card.value}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{card.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-8 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Performance</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Recent momentum</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">6m</span>
              </div>

              <div className="mt-4 flex h-36 items-end gap-3">
                {trendData.map((value, index) => (
                  <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="flex h-full w-full items-end justify-center rounded-t-2xl bg-gradient-to-t from-violet-600 to-indigo-400/90 shadow-[0_10px_24px_rgba(124,58,237,0.18)]"
                      style={{ height: `${(value / Math.max(...trendData)) * 100}%` }}
                    />
                    <span className="text-[11px] font-medium text-slate-500">{['J', 'F', 'M', 'A', 'M', 'J'][index]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Priority list</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">Latest tournaments</h2>
                </div>
              </div>

              <div className="space-y-3">
                {topTournaments.length > 0 ? (
                  topTournaments.map((t, index) => (
                    <div key={t.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{t.name}</p>
                          <p className="text-xs text-slate-500">{t.sport.name}</p>
                        </div>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No tournament data available yet.</p>
                )}
              </div>
            </div>
          </div>

          {canScoreMatches && (
            <ListPreview
              title={canManageTournaments ? 'Your Tournaments' : 'Tournaments'}
              description={canManageTournaments ? "Every tournament you've created, most recent first." : "Every tournament you've been assigned to, most recent first."}
              emptyText={canManageTournaments ? 'No tournaments yet.' : 'No tournaments assigned to you yet.'}
              rows={myTournaments.map((t) => (
                <ListRow
                  key={t.id}
                  primary={t.name}
                  secondary={`${t.sport.name} — ${new Date(t.starts_at).toLocaleDateString()}${t.venue ? ` at ${t.venue.name}` : ''}${t.registration_fee ? ` · ${formatPeso(Number(t.registration_fee))} entry` : ' · Free entry'}`}
                  badge={<StatusBadge status={t.status} />}
                />
              ))}
              action={
                <button
                  onClick={() => setActive('tournaments')}
                  className="text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {canManageTournaments ? 'Create tournament' : 'Open scoreboard'} &rarr;
                </button>
              }
            />
          )}
        </>
      )}

      {active === 'tournaments' && (
        <Section
          title={canManageTournaments ? 'Tournaments' : 'Tournament to Facilitate'}
          description={
            canManageTournaments
              ? 'Create a tournament and manage its bracket.'
              : 'Pick a tournament to run its live scoreboard.'
          }
        >
          {canManageTournaments && <TournamentWizard />}

          <div className={canManageTournaments ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              {canManageTournaments ? 'Your tournaments' : 'Tournaments'}
            </h3>
            <TournamentPickerDropdown
              label="Active tournaments"
              tournaments={activeTournaments}
              selectedId={selectedTournamentId}
              onSelect={setSelectedTournamentId}
              emptyText="No active tournaments."
            />
            <TournamentPickerDropdown
              label="Inactive tournaments"
              tournaments={inactiveTournaments}
              selectedId={selectedTournamentId}
              onSelect={setSelectedTournamentId}
              emptyText="No completed or cancelled tournaments."
            />
            {selectedTournamentId && (
              <>
                {(() => {
                  const selected = myTournaments.find((t) => t.id === selectedTournamentId)
                  if (!canManageTournaments || !selected) return null

                  if (editingTournamentId === selected.id) {
                    return (
                      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Edit tournament</p>
                          <button onClick={() => setEditingTournamentId(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                            Cancel
                          </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-xs font-medium text-slate-600">
                            Name
                            <input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Start date
                            <input
                              type="datetime-local"
                              value={editDraft.starts_at}
                              onChange={(e) => setEditDraft((d) => ({ ...d, starts_at: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700"
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingTournamentId(null)
                              setEditDraft({ name: '', starts_at: '' })
                            }}
                            className={buttonSecondary}
                          >
                            Discard
                          </button>
                          <button
                            onClick={() => {
                              if (!editDraft.name.trim() || !editDraft.starts_at) return
                              editMutation.mutate({
                                tournamentId: selected.id,
                                name: editDraft.name.trim(),
                                starts_at: new Date(editDraft.starts_at).toISOString(),
                              })
                            }}
                            disabled={editMutation.isPending}
                            className={buttonPrimary}
                          >
                            {editMutation.isPending ? 'Saving...' : 'Save changes'}
                          </button>
                        </div>
                      </div>
                    )
                  }

                  if (selected.status === 'draft') {
                    return (
                      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="flex-1 text-xs text-amber-800">
                          This tournament is still a draft — coaches can&apos;t see it or register players until you
                          open it for registration.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              setEditDraft({
                                name: selected.name,
                                starts_at: selected.starts_at ? new Date(selected.starts_at).toISOString().slice(0, 16) : '',
                              })
                              setEditingTournamentId(selected.id)
                            }}
                            className={buttonSecondary}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openRegistrationMutation.mutate(selectedTournamentId)}
                            disabled={openRegistrationMutation.isPending}
                            className={buttonPrimary}
                          >
                            {openRegistrationMutation.isPending ? 'Opening...' : 'Open for registration'}
                          </button>
                        </div>
                      </div>
                    )
                  }

                  if (selected.status === 'registration') {
                    return (
                      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3">
                        <p className="flex-1 text-xs text-teal-800">
                          Registration is open. Close it early to generate the bracket, or cancel if turnout is too
                          low.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              setEditDraft({
                                name: selected.name,
                                starts_at: selected.starts_at ? new Date(selected.starts_at).toISOString().slice(0, 16) : '',
                              })
                              setEditingTournamentId(selected.id)
                            }}
                            className={buttonSecondary}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => bracketMutation.mutate(selectedTournamentId)}
                            disabled={bracketMutation.isPending}
                            className={buttonSuccess}
                          >
                            {bracketMutation.isPending ? 'Generating...' : 'Close registration & generate bracket'}
                          </button>
                          <button
                            onClick={() => cancelMutation.mutate(selectedTournamentId)}
                            disabled={cancelMutation.isPending}
                            className={buttonDanger}
                          >
                            Cancel tournament
                          </button>
                        </div>
                      </div>
                    )
                  }

                  if (selected.status === 'preparation') {
                    return (
                      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="flex-1 text-xs text-amber-800">
                          Registration closed. Schedule each match below, then proceed once you&apos;re ready to
                          play.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              setEditDraft({
                                name: selected.name,
                                starts_at: selected.starts_at ? new Date(selected.starts_at).toISOString().slice(0, 16) : '',
                              })
                              setEditingTournamentId(selected.id)
                            }}
                            className={buttonSecondary}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => proceedMutation.mutate(selectedTournamentId)}
                            disabled={proceedMutation.isPending}
                            className={buttonSuccess}
                          >
                            {proceedMutation.isPending ? 'Starting...' : 'Proceed to ongoing'}
                          </button>
                          <button
                            onClick={() => cancelMutation.mutate(selectedTournamentId)}
                            disabled={cancelMutation.isPending}
                            className={buttonDanger}
                          >
                            Cancel tournament
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return null
                })()}
                {canManageTournaments && myTournaments.find((t) => t.id === selectedTournamentId)?.status === 'registration' && (
                  <TournamentRegistrationsList
                    tournamentId={selectedTournamentId}
                    registrationFee={myTournaments.find((t) => t.id === selectedTournamentId)?.registration_fee ?? null}
                  />
                )}
                {proceedMutation.isError && (
                  <p className="mb-3 text-xs text-red-600">
                    Could not proceed — this tournament has no bracket yet (not enough registrants?). Cancel it
                    instead.
                  </p>
                )}
                {canManageTournaments && (
                  <div className="relative mb-3 flex flex-col items-end gap-1">
                    <button
                      onClick={() => setExportMenuOpen((v) => !v)}
                      disabled={exportingKind !== null}
                      className={`${buttonSecondary} flex items-center gap-1.5 text-xs`}
                    >
                      {exportingKind ? `${EXPORT_KIND_LABEL[exportingKind]}...` : 'Export'}
                      {!exportingKind && (
                        <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>

                    {exportMenuOpen && (
                      <div className="absolute top-full z-10 mt-1 w-64 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-lg">
                        <button
                          onClick={() => runExport('registrations', selectedTournamentId)}
                          className="block w-full px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-800">Registrations</span>
                          <p className="mt-0.5 text-slate-500">Who's registered — players, team rosters, status.</p>
                        </button>
                        <button
                          onClick={() => runExport('results', selectedTournamentId)}
                          className="block w-full px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-800">Full tournament report (PDF)</span>
                          <p className="mt-0.5 text-slate-500">
                            Bracket results, per-match stat lines, point-by-point match logs, and rankings —
                            the complete report.
                          </p>
                        </button>
                        <button
                          onClick={() => runExport('rankings', selectedTournamentId)}
                          className="block w-full px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-800">Player rankings</span>
                          <p className="mt-0.5 text-slate-500">
                            Every player ranked individually by their top stat — even in a team sport.
                          </p>
                        </button>
                      </div>
                    )}

                    {exportError && <p className="text-xs text-red-600">{exportError}</p>}
                  </div>
                )}
                {/* The main organizer gets a read-only scoreboard VIEW —
                    results are the outcome of matches facilitated by
                    whichever venue organizer they designated, not something
                    the main organizer scores themselves. A venue
                    facilitator is different: they have no separate venue
                    organizer to designate (see TournamentController::
                    store()'s own comment — they're auto-assigned to that
                    job themselves), so they keep full click-to-score access
                    same as a real venue organizer would, even though they
                    also get the main-organizer-style management actions
                    above (bracket generation, proceed/cancel). Scheduling
                    matches, though, is the tournament manager's job
                    specifically — canScheduleMatches stays keyed off
                    canManageTournaments, not this narrower read-only-vs-
                    editable split. */}
                {myTournaments.find((t) => t.id === selectedTournamentId)?.status !== 'archived' && (
                  <BracketView
                    tournamentId={selectedTournamentId}
                    tournamentName={myTournaments.find((t) => t.id === selectedTournamentId)?.name}
                    scoringType={myTournaments.find((t) => t.id === selectedTournamentId)?.scoring_type}
                    onSelectMatch={openMatch}
                    onGoLive={canManageLivestreams ? openMatch : undefined}
                    canScheduleMatches={canManageTournaments}
                    canShareMatches={canManageTournaments}
                    canShareBracket={canManageTournaments}
                  />
                )}
              </>
            )}
          </div>

          {!isMainOrganizer && activeMatch && selectedTournamentId && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ScoreboardLive
                match={activeMatch}
                tournamentId={selectedTournamentId}
                tournament={myTournaments.find((t) => t.id === selectedTournamentId)}
                onClose={() => setActiveMatchId(null)}
              />
            </div>
          )}

          {pendingMatch && selectedTournamentId && (
            <MatchStartOptionsModal
              match={pendingMatch}
              tournamentId={selectedTournamentId}
              onStartGame={() => {
                setActiveMatchId(pendingMatch.id)
                setPendingMatch(null)
              }}
              onClose={() => setPendingMatch(null)}
            />
          )}

          {viewingMatch && (
            <MatchScoreboardViewer
              match={viewingMatch}
              tournament={myTournaments.find((t) => t.id === selectedTournamentId)}
              onClose={() => setViewingMatch(null)}
            />
          )}
        </Section>
      )}

      {active === 'news' && (
        <Section
          title="News"
          description={
            isMainOrganizer
              ? 'Publish an update, and browse the same newsfeed the community sees.'
              : 'Browse the same newsfeed the community sees.'
          }
        >
          {isMainOrganizer && <NewsEditor />}
          <div className={isMainOrganizer ? 'mt-4 border-t border-slate-100 pt-4' : undefined}>
            <Newsfeed />
          </div>
        </Section>
      )}

      {active === 'livestreams' && (
        <Section title="Livestreams" description="Start a livestream tied to a tournament.">
          <LivestreamCreateForm tournaments={myTournaments} />

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {myLivestreams.map((l) => {
                // A tournament can have several of these live at once now
                // (one per court) — tag each button with its tournament and
                // whether it's tied to one specific game, so they're
                // distinguishable beyond just the organizer-chosen title.
                const tournamentName = myTournaments.find((t) => t.id === l.tournament_id)?.name
                return (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLivestreamId(l.id)}
                    className={`flex flex-col items-start rounded-lg px-3 py-1.5 text-left text-xs font-medium ${
                      selectedLivestreamId === l.id ? 'bg-teal-600 text-pure-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {l.status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                      {l.title}
                    </span>
                    {tournamentName && (
                      <span className={`text-[10px] font-normal ${selectedLivestreamId === l.id ? 'text-teal-100' : 'text-slate-400'}`}>
                        {tournamentName}
                        {l.match_id !== null ? ' — one game' : ' — whole tournament'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {selectedLivestream && (
              <div className="flex flex-col gap-3">
                {user?.id === selectedLivestream.broadcaster?.id ? (
                  <LivestreamBroadcast livestream={selectedLivestream} />
                ) : (
                  <LivestreamViewer livestream={selectedLivestream} />
                )}
                {user && <LivestreamChat livestreamId={selectedLivestream.id} />}
              </div>
            )}
          </div>
        </Section>
      )}

      {championModal && (
        <ChampionCongratsModal
          tournamentId={championModal.id}
          tournamentName={championModal.name}
          championName={championModal.championName}
          onClose={() => setChampionModal(null)}
        />
      )}
    </DashboardShell>
  )
}
