import { useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { fetchProfile } from '../lib/socialApi'
import { fetchPosts } from '../lib/postsApi'
import { acceptFriendRequest, declineFriendRequest, removeFriendship, sendFriendRequest } from '../lib/friendsApi'
import { startDirectConversation } from '../lib/chatApi'
import { useChatUI } from '../lib/ChatUIContext'
import { SocialShell } from '../components/layout/SocialShell'
import { PostGrid } from '../components/social/PostGrid'
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
  const queryClient = useQueryClient()

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

  return (
    <SocialShell>
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xl font-semibold text-teal-700">
            {user.name[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{user.name}</h1>
            <div className="mt-1 flex flex-wrap gap-1">
              {user.roles.map((role) => (
                <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
                  {role.replace('_', ' ')}
                </span>
              ))}
            </div>
            {user.bio && <p className="mt-2 text-sm text-slate-600">{user.bio}</p>}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
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

        {(sendMutation.isError || acceptMutation.isError || declineMutation.isError || removeMutation.isError || messageMutation.isError) && (
          <p className="mt-2 text-xs text-red-600">
            {extractErrorMessage(
              sendMutation.error ?? acceptMutation.error ?? declineMutation.error ?? removeMutation.error ?? messageMutation.error
            )}
          </p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Posts</h2>
        <PostGrid posts={posts?.data ?? []} />
      </div>
    </SocialShell>
  )
}
