import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchOrganizerTournaments, fetchLivestreams, type BracketMatch } from '../lib/organizerApi'
import { useAuth } from '../lib/AuthContext'
import { TournamentWizard } from '../components/organizer/TournamentWizard'
import { BracketView } from '../components/organizer/BracketView'
import { ScoreboardLive } from '../components/organizer/ScoreboardLive'
import { NewsEditor } from '../components/organizer/NewsEditor'
import { NewsFeed } from '../components/organizer/NewsFeed'
import { LivestreamCreateForm } from '../components/organizer/LivestreamCreateForm'
import { LivestreamEmbed } from '../components/organizer/LivestreamEmbed'
import { LivestreamChat } from '../components/organizer/LivestreamChat'

export function OrganizerPage() {
  const { user } = useAuth()
  const { data: tournaments } = useQuery({ queryKey: ['organizer', 'tournaments'], queryFn: fetchOrganizerTournaments })
  const { data: livestreams } = useQuery({ queryKey: ['livestreams'], queryFn: fetchLivestreams })

  const myTournaments = (tournaments ?? []).slice(0, 20)
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [activeMatch, setActiveMatch] = useState<BracketMatch | null>(null)

  const myLivestreams = livestreams ?? []
  const [selectedLivestreamId, setSelectedLivestreamId] = useState<number | null>(null)
  const selectedLivestream = myLivestreams.find((l) => l.id === selectedLivestreamId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizer</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600">
          Back to dashboard
        </Link>
      </div>

      <TournamentWizard />

      <div className="rounded border p-3">
        <h3 className="mb-2 text-sm font-medium">Tournaments</h3>
        <div className="mb-2 flex flex-wrap gap-2">
          {myTournaments.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTournamentId(t.id)}
              className={`rounded px-2 py-1 text-xs ${
                selectedTournamentId === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'
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
        <ScoreboardLive match={activeMatch} tournamentId={selectedTournamentId} onClose={() => setActiveMatch(null)} />
      )}

      <NewsEditor />
      <NewsFeed />

      <LivestreamCreateForm tournaments={myTournaments} />
      <div className="rounded border p-3">
        <h3 className="mb-2 text-sm font-medium">Livestreams</h3>
        <div className="mb-2 flex flex-wrap gap-2">
          {myLivestreams.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedLivestreamId(l.id)}
              className={`rounded px-2 py-1 text-xs ${
                selectedLivestreamId === l.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'
              }`}
            >
              {l.title}
            </button>
          ))}
        </div>
        {selectedLivestream && (
          <div className="flex flex-col gap-2">
            <LivestreamEmbed livestream={selectedLivestream} />
            {user && <LivestreamChat livestreamId={selectedLivestream.id} />}
          </div>
        )}
      </div>
    </div>
  )
}
