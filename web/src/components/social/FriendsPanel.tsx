import { UserSearchBar } from './UserSearchBar'
import { FriendRequestsPanel } from './FriendRequestsPanel'
import { FriendsList } from './FriendsList'

export function FriendsPanel({ onMessage }: { onMessage: (conversationId: number) => void }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Find people</h3>
        <UserSearchBar />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Requests</h3>
        <FriendRequestsPanel />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Friends</h3>
        <FriendsList onMessage={onMessage} />
      </div>
    </div>
  )
}
