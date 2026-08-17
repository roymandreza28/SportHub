import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSports } from '../../lib/venueApi'
import { fetchTournaments, registerTeamForTournament, type Tournament } from '../../lib/coachApi'
import { createTeam, addTeamMemberDirect, removeTeamMember, type Team } from '../../lib/teamsApi'
import { fetchFriends, type Friend } from '../../lib/friendsApi'
import { TournamentRegistrationForm } from './TournamentRegistrationForm'
import { useAuth } from '../../lib/AuthContext'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, select } from '../../lib/formStyles'

type Step = 'sport' | 'tournament' | 'register'

export function TeamTournamentWizard({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const isVerified = user?.verification_status === 'verified'

  const [step, setStep] = useState<Step>('sport')
  const [sportId, setSportId] = useState<number | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)

  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })
  const { data: tournaments } = useQuery({
    queryKey: ['coach', 'tournaments', 'open', sportId],
    queryFn: () => fetchTournaments('open', sportId ?? undefined),
    enabled: step === 'tournament' && !!sportId,
  })

  function pickSport(id: number) {
    setSportId(id)
    setStep('tournament')
  }

  function pickTournament(t: Tournament) {
    setTournament(t)
    setStep('register')
  }

  function back() {
    if (step === 'register') setStep('tournament')
    else if (step === 'tournament') setStep('sport')
  }

  return (
    <div className="flex flex-col gap-3">
      {step !== 'sport' && (
        <button onClick={back} className="self-start text-xs font-medium text-teal-600 hover:text-teal-700">
          &larr; Back
        </button>
      )}

      {step === 'sport' && (
        <div className={fieldGroup}>
          <label className={label}>1. Choose a sport</label>
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sports?.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => pickSport(s.id)}
                  className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'tournament' && (
        <div className={fieldGroup}>
          <label className={label}>2. Choose a tournament</label>
          {tournaments?.length === 0 && <p className="text-sm text-slate-400">No open tournaments for this sport.</p>}
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {tournaments?.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => pickTournament(t)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span>{t.name}</span>
                  {t.sport_format_id && (
                    <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      Team ({t.sport_format?.players_per_side} per side)
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 'register' && tournament && (
        <div className={fieldGroup}>
          <label className={label}>3. {tournament.sport_format_id ? 'Build your team' : 'Register a player'}</label>
          <p className="text-sm text-slate-600">{tournament.name}</p>
          {!isVerified && (
            <p className="text-xs text-amber-700">Tournament registration is unavailable until your account is verified.</p>
          )}
          {tournament.sport_format_id ? (
            <TeamBuilder tournament={tournament} onRegistered={onClose} />
          ) : (
            <TournamentRegistrationForm tournamentId={tournament.id} onRegistered={onClose} />
          )}
        </div>
      )}
    </div>
  )
}

function TeamBuilder({ tournament, onRegistered }: { tournament: Tournament; onRegistered: () => void }) {
  const queryClient = useQueryClient()
  const playersPerSide = tournament.sport_format?.players_per_side ?? 1

  const { data: friends } = useQuery({ queryKey: ['social', 'friends'], queryFn: fetchFriends })

  const [team, setTeam] = useState<Team | null>(null)
  const [teamName, setTeamName] = useState('')
  const [friendId, setFriendId] = useState<number | ''>('')
  const [message, setMessage] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      createTeam({
        sport_id: tournament.sport.id,
        sport_format_id: tournament.sport_format_id!,
        name: teamName || undefined,
      }),
    onSuccess: (createdTeam) => setTeam(createdTeam),
  })

  const addMemberMutation = useMutation({
    mutationFn: (userId: number) => addTeamMemberDirect(team!.id, userId),
    onSuccess: (member) => {
      setTeam((t) => (t ? { ...t, members: [...t.members, member] } : t))
      setFriendId('')
    },
    onError: () => setMessage('Could not add that player — you can only add friends to a team.'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => removeTeamMember(team!.id, memberId),
    onSuccess: (_data, memberId) => {
      setTeam((t) => (t ? { ...t, members: t.members.filter((m) => m.id !== memberId) } : t))
    },
    onError: () => setMessage('Could not remove that player.'),
  })

  const registerMutation = useMutation({
    mutationFn: () => registerTeamForTournament(tournament.id, team!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'tournament-registrations', 'mine'] })
      onRegistered()
    },
    onError: (err: unknown) => {
      const text =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not register this team.'
      setMessage(text)
    },
  })

  const acceptedCount = team?.members.filter((m) => m.status === 'accepted').length ?? 0
  const isReady = acceptedCount >= playersPerSide

  if (!team) {
    return (
      <div className="flex flex-col gap-3">
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
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className={`${buttonPrimary} self-start`}
        >
          {createMutation.isPending ? 'Creating...' : 'Create team'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <p className="text-sm font-medium text-slate-800">{team.name}</p>
        <p className="text-xs text-slate-500">
          {acceptedCount} player{acceptedCount === 1 ? '' : 's'} (minimum {playersPerSide})
          {isReady && <span className="ml-1 font-medium text-green-600">✓ minimum met</span>}
        </p>
        {team.members.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {team.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                <span className="truncate">{m.user.name}</span>
                <button
                  onClick={() => removeMemberMutation.mutate(m.id)}
                  disabled={removeMemberMutation.isPending}
                  className="shrink-0 font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* No maximum — bench/substitute players can keep being added even
          after the format's minimum roster size is reached. Friends only —
          this reuses the same friendship requirement as the peer team-invite
          flow, just without a separate accept step. */}
      <div className={fieldGroup}>
        <label className={label}>Add player (friends only)</label>
        {(() => {
          const existingIds = new Set(team.members.map((m) => m.user_id))
          const invitable = (friends ?? []).filter((f) => !existingIds.has(f.user.id))

          if ((friends ?? []).length === 0) {
            return <p className="text-xs text-slate-400">You have no friends yet — add some from the Newsfeed or search first.</p>
          }
          if (invitable.length === 0) {
            return <p className="text-xs text-slate-400">Every friend eligible to add is already on this team.</p>
          }

          return (
            <div className="flex gap-2">
              <select
                value={friendId}
                onChange={(e) => setFriendId(e.target.value ? Number(e.target.value) : '')}
                className={`${select} flex-1`}
              >
                <option value="">Choose a friend...</option>
                {invitable.map((f: Friend) => (
                  <option key={f.user.id} value={f.user.id}>
                    {f.user.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => friendId && addMemberMutation.mutate(Number(friendId))}
                disabled={!friendId || addMemberMutation.isPending}
                className={buttonSecondary}
              >
                {addMemberMutation.isPending ? 'Adding...' : 'Add to roster'}
              </button>
            </div>
          )
        })()}
      </div>

      <button
        onClick={() => registerMutation.mutate()}
        disabled={!isReady || registerMutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {registerMutation.isPending
          ? 'Registering...'
          : isReady
            ? 'Register team'
            : `Need ${playersPerSide - acceptedCount} more player(s)`}
      </button>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
