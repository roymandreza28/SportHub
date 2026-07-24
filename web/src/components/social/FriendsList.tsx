import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchFriends, removeFriendship } from '../../lib/friendsApi'
import { startDirectConversation } from '../../lib/chatApi'
import { buttonGhost, buttonSecondary } from '../../lib/formStyles'

export function FriendsList({ onMessage }: { onMessage: (conversationId: number) => void }) {
  const queryClient = useQueryClient()

  const { data: friends } = useQuery({ queryKey: ['social', 'friends'], queryFn: fetchFriends })

  const removeMutation = useMutation({
    mutationFn: removeFriendship,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'friends'] }),
  })

  const messageMutation = useMutation({
    mutationFn: (userId: number) => startDirectConversation(userId),
    onSuccess: (conversation) => onMessage(conversation.id),
  })

  if (friends?.length === 0) {
    return <p className="text-sm text-slate-400">No friends yet — search for players and coaches to add.</p>
  }

  return (
    <ul className="flex flex-col divide-y divide-slate-100">
      {friends?.map((friend) => (
        <li key={friend.friendship_id} className="flex items-center justify-between gap-3 py-2.5">
          <Link to={`/profile/${friend.user.id}`} className="text-sm font-medium text-slate-800 hover:text-teal-700">
            {friend.user.name}
          </Link>
          <div className="flex gap-2">
            <button onClick={() => messageMutation.mutate(friend.user.id)} className={buttonGhost}>
              Message
            </button>
            <button onClick={() => removeMutation.mutate(friend.friendship_id)} className={buttonSecondary}>
              Unfriend
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
