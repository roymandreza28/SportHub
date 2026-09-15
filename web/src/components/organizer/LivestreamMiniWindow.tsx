import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createLivestream, type BracketMatch, type LivestreamItem } from '../../lib/organizerApi'
import { useAuth } from '../../lib/AuthContext'
import { buttonLive } from '../../lib/formStyles'
import { LivestreamBroadcast } from './LivestreamBroadcast'
import { LivestreamViewer } from './LivestreamViewer'

// A small floating window docked over the scoreboard so whoever's scoring a
// game — often the same venue facilitator who's also its livestream
// organizer, since a facilitator fills both jobs themselves — can start or
// watch this exact match's broadcast without ever leaving the scoring
// screen. Deliberately tiny and collapsible: the scoreboard underneath
// stays the main focus, this is a glanceable corner, not a second full-size
// video call.
export function LivestreamMiniWindow({
  match,
  livestream,
  canGoLive,
}: {
  match: BracketMatch
  // The livestream already tied to THIS match (Livestream.match_id), if
  // any — the caller resolves this from the same ['livestreams'] list
  // OrganizerPage already fetches, so opening this window costs no extra
  // network round trip.
  livestream: LivestreamItem | null
  // Mirrors LivestreamController::store()'s own authorization check
  // (tournament.organizer_id or tournament.livestream_organizer_id ===
  // the caller) rather than a role name, so it stays correct for a venue
  // facilitator (who holds this via a direct permission grant, not the
  // 'livestream_organizer' role) without special-casing that role here.
  canGoLive: boolean
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const aName = match.participant_a?.name ?? 'TBD'
  const bName = match.participant_b?.name ?? 'TBD'

  const goLive = useMutation({
    mutationFn: () => createLivestream({ match_id: match.id, title: `${aName} vs ${bName}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['livestreams'] }),
  })

  if (dismissed || (!livestream && !canGoLive)) return null

  const isBroadcaster = livestream != null && user?.id === livestream.broadcaster?.id

  return (
    <div className="fixed bottom-4 right-4 z-40 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
          {livestream?.status === 'live' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
          Broadcast
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="text-[11px] text-white/70 hover:text-white">
            {collapsed ? 'Expand' : 'Minimize'}
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="text-[11px] text-white/70 hover:text-white">
            ✕
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-2">
          {!livestream ? (
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <p className="text-[11px] text-slate-500">No broadcast running for this game yet.</p>
              <button type="button" onClick={() => goLive.mutate()} disabled={goLive.isPending} className={buttonLive}>
                {goLive.isPending ? 'Starting...' : '🔴 Go live'}
              </button>
              {goLive.isError && <p className="text-[10px] text-red-600">Could not start the broadcast.</p>}
            </div>
          ) : isBroadcaster ? (
            <LivestreamBroadcast livestream={livestream} />
          ) : (
            <LivestreamViewer livestream={livestream} />
          )}
        </div>
      )}
    </div>
  )
}
