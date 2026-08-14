import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelMatchmakingRequest, createMatchmakingRequest, fetchMyMatchmakingRequests } from '../../lib/playerApi'
import { fetchSports, fetchSportFormats, fetchVenues } from '../../lib/venueApi'
import { fetchMyTeams } from '../../lib/teamsApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { buttonGhost, buttonPrimary, chip, fieldGroup, input, label, select } from '../../lib/formStyles'
import { MatchmakingLoader } from './MatchmakingLoader'
import { TeamPanel } from './TeamPanel'

const STATUS_LABEL: Record<string, string> = {
  open: 'Looking for a match...',
  matched: 'Matched!',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-teal-100 text-teal-700',
  matched: 'bg-green-100 text-green-700',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
}

type Mode = 'join' | 'create'

export function MatchmakingPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })
  const { data: teams } = useQuery({ queryKey: ['player', 'teams'], queryFn: fetchMyTeams })
  const { data: requests } = useQuery({
    queryKey: ['player', 'matchmaking'],
    queryFn: fetchMyMatchmakingRequests,
    // Real-time (below) is the primary update path; this is just a safety
    // net in case the socket connection drops.
    refetchInterval: 30000,
  })

  const [mode, setMode] = useState<Mode>('join')
  const [showTeams, setShowTeams] = useState(false)
  const [sportId, setSportId] = useState<number | ''>('')
  const [formatId, setFormatId] = useState<number | ''>('')
  const [teamId, setTeamId] = useState<number | ''>('')
  const [venueId, setVenueId] = useState<number | ''>('')
  const [startAt, setStartAt] = useState('')

  // Every sport has at least one format (a solo sport still gets a
  // players_per_side=1 "Individual"/"Singles" row) — this is how a player
  // picks 5v5 vs 3v3 for Basketball, or Singles vs Doubles for Badminton.
  const { data: formats } = useQuery({
    queryKey: ['sport-formats', sportId],
    queryFn: () => fetchSportFormats(sportId ? Number(sportId) : undefined),
    enabled: !!sportId,
  })

  const selectedFormat = formats?.find((f) => f.id === formatId)
  const needsTeam = !!selectedFormat && selectedFormat.players_per_side > 1
  const readyTeams = (teams ?? []).filter(
    (t) => t.is_captain && t.status === 'ready' && t.sport_format_id === formatId
  )

  // Only venues with a court for the selected sport — picking Soccer must
  // never surface a venue that has no soccer field.
  const { data: venues } = useQuery({
    queryKey: ['venues', 'for-sport', sportId],
    queryFn: () => fetchVenues(sportId ? Number(sportId) : undefined),
    enabled: mode === 'create' && !!sportId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['player', 'matchmaking'] })
  const invalidateTeams = () => queryClient.invalidateQueries({ queryKey: ['player', 'teams'] })

  useEffect(() => {
    if (!user) return

    const matchmakingChannel = echo.private(`matchmaking.${user.id}`)
    matchmakingChannel.listen('.MatchmakingPairFound', () => invalidate())

    const userChannel = echo.private(`App.Models.User.${user.id}`)
    userChannel.listen('.TeamInviteResponded', () => invalidateTeams())

    return () => {
      echo.leave(`matchmaking.${user.id}`)
      echo.leave(`App.Models.User.${user.id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const request = useMutation({
    mutationFn: () =>
      createMatchmakingRequest(
        mode === 'join'
          ? { sport_id: Number(sportId), sport_format_id: Number(formatId), team_id: needsTeam ? Number(teamId) : undefined }
          : {
              sport_id: Number(sportId),
              sport_format_id: Number(formatId),
              team_id: needsTeam ? Number(teamId) : undefined,
              venue_id: venueId ? Number(venueId) : undefined,
              preferred_start_at: startAt ? new Date(startAt).toISOString() : undefined,
            }
      ),
    onSuccess: () => {
      invalidate()
      setVenueId('')
      setStartAt('')
    },
  })

  const cancel = useMutation({
    mutationFn: cancelMatchmakingRequest,
    onSuccess: invalidate,
  })

  const switchMode = (next: Mode) => {
    setMode(next)
    setVenueId('')
  }

  const changeSport = (value: string) => {
    setSportId(value ? Number(value) : '')
    setFormatId('')
    setTeamId('')
    setVenueId('')
  }

  const changeFormat = (value: string) => {
    setFormatId(value ? Number(value) : '')
    setTeamId('')
  }

  const canSubmit = !!sportId && !!formatId && (!needsTeam || !!teamId) && !request.isPending

  // A player/coach can have more than one sport queued at once, so this is
  // "every still-searching request", not just the one just submitted — each
  // gets its own sport-specific loading card. Anything already resolved
  // (matched/expired/cancelled) moves down into the plain history list below
  // instead, so it isn't shown twice.
  const openRequests = (requests ?? []).filter((r) => r.status === 'open')
  const resolvedRequests = (requests ?? []).filter((r) => r.status !== 'open')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button type="button" className={chip(mode === 'join')} onClick={() => switchMode('join')}>
            Join Match
          </button>
          <button type="button" className={chip(mode === 'create')} onClick={() => switchMode('create')}>
            Create Match
          </button>
        </div>
        <button type="button" onClick={() => setShowTeams((s) => !s)} className={buttonGhost}>
          {showTeams ? 'Hide teams' : 'Manage teams'}
        </button>
      </div>

      {showTeams && (
        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <TeamPanel />
        </div>
      )}

      {openRequests.length > 0 && (
        <div className="flex flex-col gap-3">
          {openRequests.map((req) => (
            <MatchmakingLoader
              key={req.id}
              sportName={req.sport.name}
              cancelling={cancel.isPending}
              onCancel={() => cancel.mutate(req.id)}
            />
          ))}
        </div>
      )}

      <div className={mode === 'create' ? 'flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4' : 'flex flex-col gap-3'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={fieldGroup}>
            <label className={label}>Sport</label>
            <select data-testid="mm-sport" value={sportId} onChange={(e) => changeSport(e.target.value)} className={select}>
              <option value="">Choose a sport...</option>
              {sports?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className={fieldGroup}>
            <label className={label}>Format</label>
            <select
              data-testid="mm-format"
              value={formatId}
              onChange={(e) => changeFormat(e.target.value)}
              disabled={!sportId}
              className={select}
            >
              <option value="">{sportId ? 'Choose a format...' : 'Choose a sport first'}</option>
              {formats?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {needsTeam && (
          <div className={fieldGroup}>
            <label className={label}>Team</label>
            <select
              data-testid="mm-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : '')}
              className={select}
            >
              <option value="">Choose a ready team...</option>
              {readyTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {readyTeams.length === 0 && (
              <p className="text-xs text-slate-400">
                {selectedFormat?.name} needs a full {selectedFormat?.players_per_side}-player team — invite friends
                under "Manage teams" above before you can match.
              </p>
            )}
          </div>
        )}

        {mode === 'create' && (
          <>
            <div className={fieldGroup}>
              <label className={label}>Start time</label>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={input} />
            </div>

            <div className={fieldGroup}>
              <label className={label}>Venue</label>
              <select
                data-testid="mm-venue"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value ? Number(e.target.value) : '')}
                disabled={!sportId}
                className={select}
              >
                <option value="">{sportId ? 'Choose a venue...' : 'Choose a sport first'}</option>
                {venues?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {sportId && venues?.length === 0 && (
                <p className="text-xs text-slate-400">No venues have a court for this sport yet.</p>
              )}
            </div>
          </>
        )}

        <button onClick={() => request.mutate()} disabled={!canSubmit} className={`${buttonPrimary} self-start`}>
          {mode === 'join' ? 'Find a match' : 'Create match'}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {resolvedRequests.map((req) => (
          <li
            key={req.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-slate-800">
                {req.sport.name}
                {req.sport_format && <span className="font-normal text-slate-400"> — {req.sport_format.name}</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[req.status] ?? ''}`}>
                  {STATUS_LABEL[req.status] ?? req.status}
                </span>
                {req.opponent && ` with ${req.opponent.name} (${req.opponent.email})`}
                {req.opponent_team && ` vs ${req.opponent_team.name}`}
              </p>
              {req.team && <p className="mt-0.5 text-xs text-slate-400">Your team: {req.team.name}</p>}
              {(req.venue || req.preferred_start_at) && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {req.venue && req.venue.name}
                  {req.venue && req.preferred_start_at && ' · '}
                  {req.preferred_start_at && new Date(req.preferred_start_at).toLocaleString()}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
