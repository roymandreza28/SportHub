import { useRef } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { fetchProfile, updateOwnCover } from '../lib/socialApi'
import { fetchPosts } from '../lib/postsApi'
import { acceptFriendRequest, declineFriendRequest, removeFriendship, sendFriendRequest } from '../lib/friendsApi'
import { startDirectConversation } from '../lib/chatApi'
import { updateOwnAvatar } from '../lib/accountApi'
import { useAuth } from '../lib/AuthContext'
import { useChatUI } from '../lib/ChatUIContext'
import { primaryDashboardPath } from '../lib/roles'
import { SocialShell } from '../components/layout/SocialShell'
import { PostGrid } from '../components/social/PostGrid'
import { Avatar } from '../components/layout/Avatar'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../lib/formStyles'

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return 'Something went wrong. Please try again.'
}

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const id = Number(userId)
  const { openChatWindow } = useChatUI()
  const { user: viewer, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['social', 'profile', id],
    queryFn: () => fetchProfile(id),
  })

  const { data: posts } = useQuery({
    queryKey: ['social', 'posts', id],
    queryFn: () => fetchPosts(id),
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

  const avatarMutation = useMutation({
    mutationFn: (file: File) => updateOwnAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'profile', id] })
      refreshUser()
    },
  })
  const coverMutation = useMutation({
    mutationFn: (file: File) => updateOwnCover(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'profile', id] }),
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

  return (
    <SocialShell>
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="relative h-40 bg-gradient-to-br from-teal-100 via-teal-50 to-slate-100 sm:h-56">
          {user.cover_url && <img src={user.cover_url} alt="" className="h-full w-full object-cover" />}

          {isSelf && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) coverMutation.mutate(file)
                }}
              />
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={coverMutation.isPending}
                className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow transition hover:bg-white disabled:opacity-50"
              >
                {coverMutation.isPending ? 'Uploading...' : user.cover_url ? 'Change cover photo' : 'Add cover photo'}
              </button>
            </>
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="relative -mt-12 inline-block sm:-mt-16">
            {isSelf ? (
              <>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) avatarMutation.mutate(file)
                  }}
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarMutation.isPending}
                  className="group relative block rounded-full"
                  aria-label={user.avatar_url ? 'Change profile photo' : 'Add profile photo'}
                >
                  <Avatar name={user.name} url={user.avatar_url} size="xl" className="border-4 border-white shadow" />
                  <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-xs font-semibold text-white group-hover:flex">
                    {avatarMutation.isPending ? '...' : 'Change'}
                  </span>
                </button>
              </>
            ) : (
              <Avatar name={user.name} url={user.avatar_url} size="xl" className="border-4 border-white shadow" />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
              <div className="mt-1 flex flex-wrap gap-1">
                {user.roles.map((role) => (
                  <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                    {role.replace('_', ' ')}
                  </span>
                ))}
              </div>
              {user.bio && <p className="mt-2 text-sm text-slate-600">{user.bio}</p>}
            </div>

            <div className="flex shrink-0 gap-2">
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
            </div>
          </div>

          {(sendMutation.isError ||
            acceptMutation.isError ||
            declineMutation.isError ||
            removeMutation.isError ||
            messageMutation.isError ||
            avatarMutation.isError ||
            coverMutation.isError) && (
            <p className="mt-2 text-xs text-red-600">
              {extractErrorMessage(
                sendMutation.error ??
                  acceptMutation.error ??
                  declineMutation.error ??
                  removeMutation.error ??
                  messageMutation.error ??
                  avatarMutation.error ??
                  coverMutation.error
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Posts</h2>
        <PostGrid posts={posts?.data ?? []} />
      </div>
    </SocialShell>
  )
}
