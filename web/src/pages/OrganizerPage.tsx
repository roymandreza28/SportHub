import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchOrganizerTournaments, fetchLivestreams, type BracketMatch } from '../lib/organizerApi'
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
import { IconFileText, IconHome, IconRadio, IconTrophy } from '../components/layout/icons'
import { TournamentWizard } from '../components/organizer/TournamentWizard'
import { BracketView } from '../components/organizer/BracketView'
import { ScoreboardLive } from '../components/organizer/ScoreboardLive'
import { NewsEditor } from '../components/organizer/NewsEditor'
import { NewsFeed } from '../components/organizer/NewsFeed'
import { LivestreamCreateForm } from '../components/organizer/LivestreamCreateForm'
import { LivestreamEmbed } from '../components/organizer/LivestreamEmbed'
import { LivestreamChat } from '../components/organizer/LivestreamChat'

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: IconHome },
  { id: 'tournaments', label: 'Tournaments', icon: IconTrophy },
  { id: 'news', label: 'News', icon: IconFileText },
  { id: 'livestreams', label: 'Livestreams', icon: IconRadio },
]

export function OrganizerPage() {
  const { user } = useAuth()
  const { data: tournaments } = useQuery({ queryKey: ['organizer', 'tournaments'], queryFn: fetchOrganizerTournaments })
  const { data: livestreams } = useQuery({ queryKey: ['livestreams'], queryFn: fetchLivestreams })
  const [active, setActive] = useState(NAV_ITEMS[0].id)

  const myTournaments = (tournaments ?? []).slice(0, 20)
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [activeMatch, setActiveMatch] = useState<BracketMatch | null>(null)

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
            <h1 className="text-2xl font-bold text-slate-900">Organizer</h1>
            <p className="mt-1 text-sm text-slate-500">Tournaments, brackets, news, and livestreams.</p>
          </div>

          <StatCardGrid>
            <StatCard label="Tournaments" value={myTournaments.length} />
            <StatCard label="In progress" value={inProgressCount} />
            <StatCard label="Livestreams" value={myLivestreams.length} />
            <StatCard label="Live now" value={liveStreamCount} />
          </StatCardGrid>

          <ListPreview
            title="Your Tournaments"
            description="Every tournament you've created, most recent first."
            emptyText="No tournaments yet — create one in Tournaments."
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
                Create tournament &rarr;
              </button>
            }
          />
        </>
      )}

      {active === 'tournaments' && (
        <Section title="Tournaments" description="Create a tournament and manage its bracket.">
          <TournamentWizard />

          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-sm font-medium text-slate-700">Your tournaments</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {myTournaments.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTournamentId(t.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selectedTournamentId === t.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t.name} ({t.status})
                </button>
              ))}
            </div>
            {selectedTournamentId && (
              <BracketView tournamentId={selectedTournamentId} onSelectMatch={setActiveMatch} />
            )}
          </div>

          {activeMatch && selectedTournamentId && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ScoreboardLive match={activeMatch} tournamentId={selectedTournamentId} onClose={() => setActiveMatch(null)} />
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
