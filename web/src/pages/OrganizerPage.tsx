import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchOrganizerTournaments, fetchLivestreams, fetchBracket, updateTournament, type Tournament } from '../lib/organizerApi'
import { useAuth } from '../lib/AuthContext'
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
import { buttonPrimary } from '../lib/formStyles'
import { TournamentWizard } from '../components/organizer/TournamentWizard'
import { BracketView } from '../components/organizer/BracketView'
import { ScoreboardLive } from '../components/organizer/ScoreboardLive'
import { NewsEditor } from '../components/organizer/NewsEditor'
import { NewsFeed } from '../components/organizer/NewsFeed'
import { LivestreamCreateForm } from '../components/organizer/LivestreamCreateForm'
import { LivestreamEmbed } from '../components/organizer/LivestreamEmbed'
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
    ...(isMainOrganizer ? [{ id: 'news', label: 'News', icon: IconFileText }] : []),
    ...(canManageLivestreams ? [{ id: 'livestreams', label: 'Livestreams', icon: IconRadio }] : []),
  ]

  const queryClient = useQueryClient()
  const { data: tournaments } = useQuery({ queryKey: ['organizer', 'tournaments'], queryFn: fetchOrganizerTournaments })
  const { data: livestreams } = useQuery({ queryKey: ['livestreams'], queryFn: fetchLivestreams })
  const [active, setActive] = useState(NAV_ITEMS[0].id)

  // A new tournament starts as a draft so an organizer can finish setting
  // it up before coaches see it — but coaches only ever fetch status=open
  // tournaments to register for, so this is the step that actually makes
  // a tournament joinable. Without it, every tournament stays invisible to
  // coaches indefinitely.
  const openRegistrationMutation = useMutation({
    mutationFn: (tournamentId: number) => updateTournament(tournamentId, { status: 'open' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] }),
  })

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
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null)

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
  const activeMatch = activeBracket?.structure.flat().find((m) => m.id === activeMatchId) ?? null

  const myLivestreams = livestreams ?? []
  const [selectedLivestreamId, setSelectedLivestreamId] = useState<number | null>(null)
  const selectedLivestream = myLivestreams.find((l) => l.id === selectedLivestreamId)

  const inProgressCount = myTournaments.filter((t) => t.status === 'in_progress').length
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
                {isMainOrganizer && myTournaments.find((t) => t.id === selectedTournamentId)?.status === 'draft' && (
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
                )}
                <BracketView tournamentId={selectedTournamentId} onSelectMatch={(match) => setActiveMatchId(match.id)} />
              </>
            )}
          </div>

          {activeMatch && selectedTournamentId && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ScoreboardLive
                match={activeMatch}
                tournamentId={selectedTournamentId}
                tournament={myTournaments.find((t) => t.id === selectedTournamentId)}
                onClose={() => setActiveMatchId(null)}
              />
            </div>
          )}
        </Section>
      )}

      {active === 'news' && (
        <Section title="News" description="Publish an update for the community.">
          <NewsEditor />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <NewsFeed />
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
                    selectedLivestreamId === l.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {l.title}
                </button>
              ))}
            </div>
            {selectedLivestream && (
              <div className="flex flex-col gap-3">
                <LivestreamEmbed livestream={selectedLivestream} />
                {user && <LivestreamChat livestreamId={selectedLivestream.id} />}
              </div>
            )}
          </div>
        </Section>
      )}
    </DashboardShell>
  )
}
