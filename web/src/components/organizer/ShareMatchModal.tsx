import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNews, fetchBracket, fetchLivestreams, freshBracketMatch, type BracketMatch } from '../../lib/organizerApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, textarea } from '../../lib/formStyles'
import { IconRadio } from '../layout/icons'

// The main organizer's bracket grid only refreshes on match COMPLETION
// (BracketUpdated/RoundAdvanced) — a still-live match's score can be stale
// on screen if a venue organizer has been tapping points since the page
// last loaded. Re-fetching the bracket fresh right when this modal opens
// (rather than trusting the cached card) means the prefilled score always
// reflects the real DB row, not whatever happened to be on screen at click
// time. freshBracketMatch (not a plain bracket.matches lookup) matters here
// specifically for participant names — bracket.matches' own participant_a/
// participant_b are the raw (often-null, team-match-blind) user relations,
// not the {id, name} shape a team tournament needs; using the wrong one is
// exactly what showed "TBD" for a team whose name was known perfectly well.
function prefillFor(match: BracketMatch, tournamentName: string, round: number) {
  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'
  const roundLabel = `Round ${round}`
  const venueLine = match.court ? ` at ${match.court.venue.name} (${match.court.name})` : ''

  if (match.status === 'completed') {
    const winnerName = match.winner?.name
    const loserName = winnerName === aName ? bName : winnerName === bName ? aName : null

    if (match.won_by_default && winnerName && loserName) {
      return {
        title: `${winnerName} wins by default!`,
        body: `${loserName} forfeited ${roundLabel} of ${tournamentName}${venueLine} — ${winnerName} advances.`,
      }
    }

    return {
      title: winnerName && loserName ? `${winnerName} defeats ${loserName}!` : `${aName} ${match.score_a} – ${match.score_b} ${bName}`,
      body: `Final score from ${roundLabel} of ${tournamentName}${venueLine}: ${aName} ${match.score_a} – ${match.score_b} ${bName}.`,
    }
  }

  return {
    title: `🔴 LIVE: ${aName} vs ${bName}`,
    body: `${aName} and ${bName} are going head-to-head right now in ${roundLabel} of ${tournamentName}${venueLine}. Current score: ${match.score_a}–${match.score_b}.`,
  }
}

export function ShareMatchModal({
  tournamentId,
  tournamentName,
  match,
  onClose,
}: {
  tournamentId: number
  tournamentName: string
  match: BracketMatch
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  // Fresh snapshot, not the (possibly stale) card that was clicked.
  const { data: bracket } = useQuery({
    queryKey: ['organizer', 'bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId),
  })
  const liveMatch = freshBracketMatch(bracket, match.id) ?? match

  // Candidates for the "link a livestream" picker below — every broadcast
  // this tournament has that isn't already over. Left as an explicit choice
  // rather than silently auto-picking, since a tournament can have more
  // than one court/feed running (e.g. one per livestream organizer) and
  // guessing wrong would link the post to the wrong game's video.
  const { data: livestreams } = useQuery({ queryKey: ['livestreams'], queryFn: fetchLivestreams })
  const candidateStreams = (livestreams ?? [])
    .filter((l) => l.tournament_id === tournamentId && l.status !== 'ended')
    .sort((a, b) => (a.status === 'live' ? -1 : 1) - (b.status === 'live' ? -1 : 1))

  const initial = prefillFor(liveMatch, tournamentName, liveMatch.round)
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [edited, setEdited] = useState(false)
  const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null)
  const [streamChoiceMade, setStreamChoiceMade] = useState(false)

  // Pre-select automatically the instant there's exactly one live broadcast
  // to choose from (the common case) — still fully visible/overridable
  // above, just saves a click when there's nothing to actually decide.
  useEffect(() => {
    if (streamChoiceMade) return
    const liveOnly = candidateStreams.filter((l) => l.status === 'live')
    if (liveOnly.length === 1) setSelectedStreamId(liveOnly[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateStreams.length, streamChoiceMade])

  // Re-prefill if a fresher snapshot lands (e.g. the match just completed,
  // or its score ticked, while this modal was open) — but only until the
  // organizer actually starts editing, so their own wording is never
  // clobbered mid-typing.
  useEffect(() => {
    if (edited) return
    const fresh = prefillFor(liveMatch, tournamentName, liveMatch.round)
    setTitle(fresh.title)
    setBody(fresh.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMatch.status, liveMatch.score_a, liveMatch.score_b])

  const mutation = useMutation({
    mutationFn: () =>
      createNews({
        title,
        body,
        tournament_id: tournamentId,
        match_id: match.id,
        livestream_id: selectedStreamId ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsfeed'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'news'] })
      onClose()
    },
  })

  const aName = liveMatch.participant_a?.name ?? 'TBD'
  const bName = liveMatch.participant_b?.name ?? 'TBD'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          {liveMatch.status === 'completed' ? '🏁' : '🔴'} Share {aName} vs {bName}
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Post this {liveMatch.status === 'completed' ? 'result' : 'game, live'} to the newsfeed and news page.
        </p>

        <div className="flex flex-col gap-4">
          <div className={fieldGroup}>
            <label className={label}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setEdited(true)
              }}
              className={input}
            />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Context</label>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setEdited(true)
              }}
              className={textarea}
              rows={4}
            />
          </div>
          {candidateStreams.length > 0 && (
            <div className={fieldGroup}>
              <label className={label}>
                <IconRadio className="mr-1 inline h-3.5 w-3.5" />
                Livestream broadcast of this game
              </label>
              <div className="flex flex-col gap-1.5">
                {candidateStreams.map((stream) => (
                  <button
                    key={stream.id}
                    type="button"
                    onClick={() => {
                      setSelectedStreamId((id) => (id === stream.id ? null : stream.id))
                      setStreamChoiceMade(true)
                    }}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selectedStreamId === stream.id
                        ? 'border-teal-300 bg-teal-50 text-teal-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {stream.title}
                      {stream.broadcaster && <span className="text-slate-400"> — {stream.broadcaster.name}</span>}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        stream.status === 'live' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {stream.status}
                    </span>
                  </button>
                ))}
              </div>
              {selectedStreamId && (
                <p className="mt-1 text-xs text-slate-500">
                  The post will show the live scoreboard and this broadcast together.
                </p>
              )}
            </div>
          )}
        </div>

        {mutation.isError && <p className="mt-3 text-xs text-red-600">Could not post — try again.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button onClick={() => mutation.mutate()} disabled={!title || !body || mutation.isPending} className={buttonPrimary}>
            {mutation.isPending ? 'Posting...' : 'Post to newsfeed'}
          </button>
        </div>
      </div>
    </div>
  )
}
