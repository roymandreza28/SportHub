import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptTeamInvite,
  createTeam,
  declineTeamInvite,
  disbandTeam,
  fetchMyTeams,
  inviteToTeam,
  removeTeamMember,
  type Team,
} from '../../lib/teamsApi'
import { fetchFriends, type Friend } from '../../lib/friendsApi'
import { fetchSports, fetchSportFormats } from '../../lib/venueApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { buttonGhost, buttonPrimary, buttonSecondary, fieldGroup, input, label, select } from '../../lib/formStyles'
import { Avatar } from '../layout/Avatar'

const STATUS_LABEL = (team: Team) => {
  if (team.status === 'ready') return 'Ready'
  if (team.status === 'disbanded') return 'Disbanded'
  const accepted = team.members.filter((m) => m.status === 'accepted').length
  return `Forming (${accepted}/${team.sport_format.players_per_side})`
}

const STATUS_STYLE: Record<Team['status'], string> = {
  forming: 'bg-amber-100 text-amber-800',
  ready: 'bg-green-100 text-green-700',
  disbanded: 'bg-slate-100 text-slate-500',
}

export function TeamPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: teams } = useQuery({ queryKey: ['player', 'teams'], queryFn: fetchMyTeams, refetchInterval: 30000 })
  const { data: friends } = useQuery({ queryKey: ['social', 'friends'], queryFn: fetchFriends })
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [showCreate, setShowCreate] = useState(false)
  const [sportId, setSportId] = useState<number | ''>('')
  const [formatId, setFormatId] = useState<number | ''>('')
  const [teamName, setTeamName] = useState('')

  const { data: formats } = useQuery({
    queryKey: ['sport-formats', sportId],
    queryFn: () => fetchSportFormats(sportId ? Number(sportId) : undefined),
    enabled: showCreate && !!sportId,
  })
  // Only formats that actually require a roster — a "Singles" format has no
  // business creating a team.
  const teamFormats = (formats ?? []).filter((f) => f.players_per_side > 1)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['player', 'teams'] })

  useEffect(() => {
    if (!user) return

    const channel = echo.private(`App.Models.User.${user.id}`)
    channel.listen('.TeamInviteSent', invalidate)
    channel.listen('.TeamInviteResponded', invalidate)

    return () => {
      echo.leave(`App.Models.User.${user.id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const create = useMutation({
    mutationFn: () =>
      createTeam({ sport_id: Number(sportId), sport_format_id: Number(formatId), name: teamName || undefined }),
    onSuccess: () => {
      invalidate()
      setShowCreate(false)
      setSportId('')
      setFormatId('')
      setTeamName('')
    },
  })

  const invite = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) => inviteToTeam(teamId, userId),
    onSuccess: invalidate,
  })
  const accept = useMutation({ mutationFn: acceptTeamInvite, onSuccess: invalidate })
  const decline = useMutation({ mutationFn: declineTeamInvite, onSuccess: invalidate })
  const remove = useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: number; memberId: number }) => removeTeamMember(teamId, memberId),
    onSuccess: invalidate,
  })
  const disband = useMutation({ mutationFn: disbandTeam, onSuccess: invalidate })

  const myPendingInvites = (teams ?? [])
    .filter((t) => !t.is_captain)
    .flatMap((t) =>
      t.members.filter((m) => m.user_id === user?.id && m.status === 'invited').map((m) => ({ team: t, member: m }))
    )

  return (
    <div className="flex flex-col gap-4">
      {myPendingInvites.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className={label}>Pending team invites</p>
          {myPendingInvites.map(({ team, member }) => (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
              <span>
                <strong>{team.captain.name}</strong> invited you to <strong>{team.name}</strong> ({team.sport.name} —{' '}
                {team.sport_format.name})
              </span>
              <div className="flex gap-2">
                <button onClick={() => accept.mutate(member.id)} className={buttonPrimary}>
                  Accept
                </button>
                <button onClick={() => decline.mutate(member.id)} className={buttonSecondary}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className={label}>My teams</p>
        <button type="button" onClick={() => setShowCreate((s) => !s)} className={buttonGhost}>
          {showCreate ? 'Cancel' : '+ Create a team'}
        </button>
      </div>

      {showCreate && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
          <div className={fieldGroup}>
            <label className={label}>Sport</label>
            <select
              data-testid="team-sport"
              value={sportId}
              onChange={(e) => {
                setSportId(e.target.value ? Number(e.target.value) : '')
                setFormatId('')
              }}
              className={select}
            >
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
              data-testid="team-format"
              value={formatId}
              onChange={(e) => setFormatId(e.target.value ? Number(e.target.value) : '')}
              disabled={!sportId}
              className={select}
            >
              <option value="">{sportId ? 'Choose a format...' : 'Choose a sport first'}</option>
              {teamFormats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.players_per_side} per side)
                </option>
              ))}
            </select>
            {sportId && teamFormats.length === 0 && (
              <p className="text-xs text-slate-400">
                This sport has no multi-player formats — use Join or Create Match directly instead.
              </p>
            )}
          </div>

          <div className={fieldGroup}>
            <label className={label}>Team name (optional)</label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className={input}
              placeholder="e.g. The Riverside Ballers"
            />
          </div>

          <button
            onClick={() => create.mutate()}
            disabled={!sportId || !formatId || create.isPending}
            className={`${buttonPrimary} self-start`}
          >
            Create team
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {teams?.map((team) => (
          <li key={team.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{team.name}</p>
                <p className="text-xs text-slate-500">
                  {team.sport.name} — {team.sport_format.name}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[team.status]}`}>
                {STATUS_LABEL(team)}
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-slate-50 text-xs text-slate-600">
              {team.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={m.user.name} size="sm" />
                    {m.user.name}
                    {m.status !== 'accepted' && <span className="text-slate-400"> ({m.status})</span>}
                  </span>
                  {team.is_captain && m.user_id !== team.captain_id && (
                    <button
                      onClick={() => remove.mutate({ teamId: team.id, memberId: m.id })}
                      className="font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {team.is_captain && team.status === 'forming' && (
              <TeamInviteRow
                existingMemberIds={team.members.map((m) => m.user_id)}
                friends={friends ?? []}
                onInvite={(userId) => invite.mutate({ teamId: team.id, userId })}
              />
            )}

            {team.is_captain && (
              <button
                onClick={() => disband.mutate(team.id)}
                className="self-start text-xs font-medium text-red-600 hover:text-red-700"
              >
                Disband team
              </button>
            )}
          </li>
        ))}
        {teams?.length === 0 && <p className="text-sm text-slate-400">No teams yet — create one for a team sport above.</p>}
      </ul>
    </div>
  )
}

function TeamInviteRow({
  existingMemberIds,
  friends,
  onInvite,
}: {
  existingMemberIds: number[]
  friends: Friend[]
  onInvite: (userId: number) => void
}) {
  const [friendId, setFriendId] = useState<number | ''>('')
  const invitable = friends.filter((f) => !existingMemberIds.includes(f.user.id))

  if (invitable.length === 0) {
    return <p className="text-xs text-slate-400">No more friends available to invite.</p>
  }

  return (
    <div className="flex gap-2">
      <select
        data-testid="team-invite-friend"
        value={friendId}
        onChange={(e) => setFriendId(e.target.value ? Number(e.target.value) : '')}
        className={`${select} flex-1`}
      >
        <option value="">Invite a friend...</option>
        {invitable.map((f) => (
          <option key={f.user.id} value={f.user.id}>
            {f.user.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (friendId) {
            onInvite(Number(friendId))
            setFriendId('')
          }
        }}
        disabled={!friendId}
        className={buttonSecondary}
      >
        Invite
      </button>
    </div>
  )
}
