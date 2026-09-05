import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchOrganizerTournaments,
  fetchLivestreams,
  fetchBracket,
  updateTournament,
  proceedTournament,
  cancelTournament,
  generateBracket,
  type Tournament,
  type BracketMatch,
} from '../lib/organizerApi'
import { useAuth } from '../lib/AuthContext'
import { fetchNotifications, markNotificationRead } from '../lib/notificationsApi'
import {
  DashboardShell,
  ListPreview,
  ListRow,
  Section,
  StatCard,
  StatCardGrid,
  StatusBadge,
  type NavItem,
} from '../components/layout/DashboardShell'
import { IconChevronDown, IconFileText, IconHome, IconRadio, IconTrophy } from '../components/layout/icons'
import { buttonDanger, buttonPrimary, buttonSuccess } from '../lib/formStyles'
import { TournamentWizard } from '../components/organizer/TournamentWizard'
import { BracketView } from '../components/organizer/BracketView'
import { ChampionCongratsModal } from '../components/organizer/ChampionCongratsModal'
import { ScoreboardLive } from '../components/organizer/ScoreboardLive'
import { MatchStartOptionsModal } from '../components/organizer/MatchStartOptionsModal'
import { MatchScoreboardViewer } from '../components/organizer/MatchScoreboardViewer'
import { NewsEditor } from '../components/organizer/NewsEditor'
import { Newsfeed } from '../components/newsfeed/Newsfeed'
import { LivestreamCreateForm } from '../components/organizer/LivestreamCreateForm'
import { LivestreamBroadcast } from '../components/organizer/LivestreamBroadcast'
import { LivestreamViewer } from '../components/organizer/LivestreamViewer'
import { LivestreamChat } from '../components/organizer/LivestreamChat'

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
  const canScoreMatches = isMainOrganizer || hasRole('venue_organizer')
  const canManageLivestreams = isMainOrganizer || hasRole('livestream_organizer')

  const NAV_ITEMS: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: IconHome },
    ...(canScoreMatches
      ? [{ id: 'tournaments', label: isMainOrganizer ? 'Tournaments' : 'Tournament to Facilitate', icon: IconTrophy }]
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
  const [searchParams] = useSearchParams()
  const [active, setActive] = useState(searchParams.get('tab') ?? NAV_ITEMS[0].id)

  // Lets a notification (e.g. "you've been assigned to X") deep-link into a
  // tab even when the user is already mounted on /organizer — a plain
  // useState initializer only runs once, so without this, clicking the
  // notification while already on this route silently did nothing (same fix
  // as PlayerPage/CoachPage's own ?tab= effect).
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) setActive(tab)
  }, [searchParams])

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

  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null)
  // A not-yet-started match a venue organizer just clicked — shown the
  // win-by-default/start-game choice (MatchStartOptionsModal) before the
  // real scoreboard ever opens. A match already live/completed skips this
  // and opens the scoreboard directly, same as before.
  const [pendingMatch, setPendingMatch] = useState<BracketMatch | null>(null)
  // The main organizer's read-only counterpart to the venue organizer's
  // editable scoreboard above — see MatchScoreboardViewer.
  const [viewingMatch, setViewingMatch] = useState<BracketMatch | null>(null)

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
  const { data: notifications } = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications, enabled: isMainOrganizer })
  const [championModal, setChampionModal] = useState<{ id: number; name: string; championName: string | null } | null>(null)

  useEffect(() => {
    if (!isMainOrganizer || championModal) return

    const unread = (notifications ?? []).find((n) => n.type === 'tournament_champion_crowned' && !n.read_at)
    if (!unread) return

    setChampionModal({
      id: Number(unread.data.tournament_id),
      name: String(unread.data.tournament_name ?? ''),
      championName: unread.data.champion_name != null ? String(unread.data.champion_name) : null,
    })
    markNotificationRead(unread.id).then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
  }, [notifications, isMainOrganizer, championModal, queryClient])

  const myTournaments = (tournaments ?? [])
    .filter((t) => {
      if (isMainOrganizer) return true
      if (hasRole('venue_organizer')) return t.venue_organizer_id === user?.id
      if (hasRole('livestream_organizer')) return t.livestream_organizer_id === user?.id
      return false
    })
    .slice(0, 20)
  const activeTournaments = myTournaments.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
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

  return (
    <DashboardShell navItems={NAV_ITEMS} activeId={active} onNavigate={setActive}>
      {active === 'overview' && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">
              {isMainOrganizer ? 'Organizer' : canScoreMatches ? 'Venue Organizer' : 'Livestream Organizer'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isMainOrganizer
                ? 'Tournaments, brackets, news, and livestreams.'
                : canScoreMatches
                  ? 'Run the live scoreboard for any ongoing tournament.'
                  : 'Feed camera footage into any tournament livestream.'}
            </p>
          </div>

          <StatCardGrid>
            {canScoreMatches && (
              <>
                <StatCard label="Tournaments" value={myTournaments.length} />
                <StatCard label="In progress" value={inProgressCount} />
              </>
            )}
            {canManageLivestreams && (
              <>
                <StatCard label="Livestreams" value={myLivestreams.length} />
                <StatCard label="Live now" value={liveStreamCount} />
              </>
            )}
          </StatCardGrid>

          {canScoreMatches && (
            <ListPreview
              title={isMainOrganizer ? 'Your Tournaments' : 'Tournaments'}
              description={isMainOrganizer ? "Every tournament you've created, most recent first." : "Every tournament you've been assigned to, most recent first."}
              emptyText={isMainOrganizer ? 'No tournaments yet.' : 'No tournaments assigned to you yet.'}
              rows={myTournaments.map((t) => (
                <ListRow
                  key={t.id}
                  primary={t.name}
                  secondary={`${t.sport.name} — ${new Date(t.starts_at).toLocaleDateString()}${t.venue ? ` at ${t.venue.name}` : ''}`}
                  badge={<StatusBadge status={t.status} />}
                />
              ))}
              action={
                <button
                  onClick={() => setActive('tournaments')}
                  className="text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {isMainOrganizer ? 'Create tournament' : 'Open scoreboard'} &rarr;
                </button>
              }
            />
          )}
        </>
      )}

      {active === 'tournaments' && (
        <Section
          title={isMainOrganizer ? 'Tournaments' : 'Tournament to Facilitate'}
          description={
            isMainOrganizer
              ? 'Create a tournament and manage its bracket.'
              : 'Pick a tournament to run its live scoreboard.'
          }
        >
          {isMainOrganizer && <TournamentWizard />}

          <div className={isMainOrganizer ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              {isMainOrganizer ? 'Your tournaments' : 'Tournaments'}
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
                  if (!isMainOrganizer || !selected) return null

                  if (selected.status === 'draft') {
                    return (
                      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="flex-1 text-xs text-amber-800">
                          This tournament is still a draft — coaches can&apos;t see it or register players until you
                          open it for registration.
                        </p>
                        <button
                          onClick={() => openRegistrationMutation.mutate(selectedTournamentId)}
                          disabled={openRegistrationMutation.isPending}
                          className={buttonPrimary}
                        >
                          {openRegistrationMutation.isPending ? 'Opening...' : 'Open for registration'}
                        </button>
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
                    )
                  }

                  if (selected.status === 'preparation') {
                    return (
                      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="flex-1 text-xs text-amber-800">
                          Registration closed. Schedule each match below, then proceed once you&apos;re ready to
                          play.
                        </p>
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
                    )
                  }

                  return null
                })()}
                {proceedMutation.isError && (
                  <p className="mb-3 text-xs text-red-600">
                    Could not proceed — this tournament has no bracket yet (not enough registrants?). Cancel it
                    instead.
                  </p>
                )}
                {/* The main organizer gets a read-only scoreboard VIEW —
                    results are the outcome of matches facilitated by
                    whichever venue organizer they designated, not something
                    the main organizer scores themselves — while a venue
                    organizer viewing their own "Tournament to Facilitate"
                    tab keeps full click-to-score access. Scheduling
                    matches, though, is the main organizer's job
                    specifically — canScheduleMatches is the opposite gate
                    from the editable half of onSelectMatch. */}
                <BracketView
                  tournamentId={selectedTournamentId}
                  tournamentName={myTournaments.find((t) => t.id === selectedTournamentId)?.name}
                  onSelectMatch={
                    isMainOrganizer
                      ? (match) => {
                          if (match.status === 'live' || match.status === 'completed') setViewingMatch(match)
                        }
                      : (match) => {
                          // A still-scheduled game with both sides determined
                          // gets the win-by-default/start-game choice first;
                          // a match already live/completed (re-opening the
                          // scoreboard, e.g. after closing it) skips straight
                          // to the scoreboard as before.
                          if (match.status === 'scheduled' && match.participant_a_id && match.participant_b_id) {
                            setPendingMatch(match)
                          } else {
                            setActiveMatchId(match.id)
                          }
                        }
                  }
                  canScheduleMatches={isMainOrganizer}
                  canShareMatches={isMainOrganizer}
                />
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
              tournamentName={myTournaments.find((t) => t.id === selectedTournamentId)?.name}
              onClose={() => setViewingMatch(null)}
            />
          )}
        </Section>
      )}

      {active === 'news' && (
        <Section title="News" description="Publish an update, and browse the same newsfeed the community sees.">
          <NewsEditor />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Newsfeed />
          </div>
        </Section>
      )}

      {active === 'livestreams' && (
        <Section title="Livestreams" description="Start a livestream tied to a tournament.">
          <LivestreamCreateForm tournaments={myTournaments} />

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {myLivestreams.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLivestreamId(l.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selectedLivestreamId === l.id ? 'bg-teal-600 text-pure-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {l.title}
                </button>
              ))}
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
