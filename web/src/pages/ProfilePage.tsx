import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlayerStatSummary, fetchProfile } from '../lib/socialApi'
import { fetchPosts } from '../lib/postsApi'
import { acceptFriendRequest, declineFriendRequest, removeFriendship, sendFriendRequest } from '../lib/friendsApi'
import { startDirectConversation } from '../lib/chatApi'
import { useAuth } from '../lib/AuthContext'
import { useChatUI } from '../lib/ChatUIContext'
import { useProfileMediaMutations } from '../lib/useProfileMedia'
import { extractErrorMessage } from '../lib/errors'
import { primaryDashboardPath } from '../lib/roles'
import { SocialShell } from '../components/layout/SocialShell'
import { PostGrid } from '../components/social/PostGrid'
import { PostComposer } from '../components/social/PostComposer'
import { ProfileHeaderCard } from '../components/social/ProfileHeaderCard'
import { PlayerStatsPentagon } from '../components/social/PlayerStatsPentagon'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../lib/formStyles'

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const id = Number(userId)
  const { openChatWindow } = useChatUI()
  const { user: viewer } = useAuth()
  const queryClient = useQueryClient()
  const { avatarMutation, coverMutation } = useProfileMediaMutations(id)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['social', 'profile', id],
    queryFn: () => fetchProfile(id),
  })

  const { data: posts } = useQuery({
    queryKey: ['social', 'posts', id],
    queryFn: () => fetchPosts(id),
  })

  const { data: statSummary, isLoading: statsLoading } = useQuery({
    queryKey: ['social', 'stat-summary', id],
    queryFn: () => fetchPlayerStatSummary(id),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['social', 'profile', id] })
    queryClient.invalidateQueries({ queryKey: ['social', 'friends'] })
    queryClient.invalidateQueries({ queryKey: ['social', 'friend-requests'] })
  }

  const sendMutation = useMutation({ mutationFn: () => sendFriendRequest(id), onSuccess: invalidate })
  const acceptMutation = useMutation({
    mutationFn: () => acceptFriendRequest(profile!.friendship_id!),
    onSuccess: invalidate,
  })
  const declineMutation = useMutation({
    mutationFn: () => declineFriendRequest(profile!.friendship_id!),
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: () => removeFriendship(profile!.friendship_id!),
    onSuccess: invalidate,
  })
  const messageMutation = useMutation({
    mutationFn: () => startDirectConversation(id),
    onSuccess: (conversation) => openChatWindow(conversation.id),
  })

  if (isLoading) {
    return (
      <SocialShell>
        <p className="text-sm text-slate-500">Loading...</p>
      </SocialShell>
    )
  }

  if (!profile) {
    return (
      <SocialShell>
        <p className="text-sm text-slate-500">Profile not found.</p>
      </SocialShell>
    )
  }

  const { user, friendship_status } = profile
  const isSelf = friendship_status === 'self'

  const error = extractErrorMessage(
    sendMutation.error ??
      acceptMutation.error ??
      declineMutation.error ??
      removeMutation.error ??
      messageMutation.error ??
      avatarMutation.error ??
      coverMutation.error
  )
  const hasError =
    sendMutation.isError ||
    acceptMutation.isError ||
    declineMutation.isError ||
    removeMutation.isError ||
    messageMutation.isError ||
    avatarMutation.isError ||
    coverMutation.isError

  return (
    <SocialShell>
      <ProfileHeaderCard
        name={user.name}
        roles={user.roles}
        friendsCount={user.friends_count}
        avatarUrl={user.avatar_url}
        coverUrl={user.cover_url}
        editable={isSelf}
        onAvatarChange={(file) => avatarMutation.mutate(file)}
        avatarPending={avatarMutation.isPending}
        onCoverChange={(file) => coverMutation.mutate(file)}
        coverPending={coverMutation.isPending}
        error={hasError ? error : null}
        actions={
          <>
            {isSelf && (
              <Link to={`${primaryDashboardPath(viewer?.roles ?? [])}?tab=profile`} className={buttonSecondary}>
                Edit profile
              </Link>
            )}
            {friendship_status === 'none' && (
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className={buttonPrimary}>
                {sendMutation.isPending ? 'Sending...' : 'Add friend'}
              </button>
            )}
            {friendship_status === 'pending_sent' && (
              <button onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending} className={buttonSecondary}>
                Cancel request
              </button>
            )}
            {friendship_status === 'pending_received' && (
              <>
                <button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending} className={buttonPrimary}>
                  Accept request
                </button>
                <button onClick={() => declineMutation.mutate()} disabled={declineMutation.isPending} className={buttonSecondary}>
                  Decline
                </button>
              </>
            )}
            {friendship_status === 'friends' && (
              <>
                <button onClick={() => messageMutation.mutate()} disabled={messageMutation.isPending} className={buttonPrimary}>
                  Message
                </button>
                <button onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending} className={buttonDanger}>
                  Unfriend
                </button>
              </>
            )}
          </>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">About</h2>
            {user.bio ? (
              <p className="mt-3 text-sm text-slate-600">{user.bio}</p>
            ) : (
              <p className="mt-3 text-sm text-slate-400">{isSelf ? 'Add a bio from Edit profile.' : 'No bio yet.'}</p>
            )}
            {user.primary_sport && (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Primary sport</span>
                {user.primary_sport}
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Career Stats</h2>
            {statsLoading && <p className="mt-3 text-sm text-slate-500">Loading...</p>}
            {!statsLoading && !statSummary?.length && (
              <p className="mt-3 text-sm text-slate-400">
                {isSelf ? 'No stats recorded yet — play a scored tournament match to see your career pentagon.' : 'No stats recorded yet.'}
              </p>
            )}
            {statSummary?.map((entry) => (
              <PlayerStatsPentagon
                key={entry.sport_id}
                sportName={entry.sport_name}
                axes={entry.pentagon_fields}
                totals={entry.totals}
                matchesPlayed={entry.matches_played}
              />
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          {isSelf && (
            <div className="mb-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <PostComposer />
            </div>
          )}

          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Posts</h2>
          <PostGrid posts={posts?.data ?? []} />
        </div>
      </div>
    </SocialShell>
  )
}
