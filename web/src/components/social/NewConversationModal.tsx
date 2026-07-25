import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchFriends } from '../../lib/friendsApi'
import { createGroupConversation, startDirectConversation } from '../../lib/chatApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label } from '../../lib/formStyles'
import { Avatar } from '../layout/Avatar'

export function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (conversationId: number) => void
}) {
  const queryClient = useQueryClient()
  const { data: friends } = useQuery({ queryKey: ['social', 'friends'], queryFn: fetchFriends })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [groupName, setGroupName] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected)
      if (ids.length === 1 && !groupName) {
        return startDirectConversation(ids[0])
      }
      return createGroupConversation(groupName, ids)
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })
      onCreated(conversation.id)
    },
  })

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isGroup = selected.size > 1 || !!groupName

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">New conversation</h3>

        <div className="mt-4 flex flex-col gap-3">
          <div className={fieldGroup}>
            <label className={label}>Friends</label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100">
              {friends?.length === 0 && <p className="p-3 text-sm text-slate-400">Add a friend first.</p>}
              {friends?.map((friend) => (
                <label
                  key={friend.friendship_id}
                  className="flex items-center gap-2.5 border-b border-slate-50 px-3 py-2 text-sm font-medium text-slate-700 last:border-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(friend.user.id)}
                    onChange={() => toggle(friend.user.id)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <Avatar name={friend.user.name} url={friend.user.avatar_url} size="sm" />
                  {friend.user.name}
                </label>
              ))}
            </div>
          </div>

          {isGroup && (
            <div className={fieldGroup}>
              <label className={label}>Group name</label>
              <input
                type="text"
                placeholder="Weekend Squad"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={input}
              />
            </div>
          )}

          {mutation.isError && <p className="text-xs text-red-600">Couldn't start that conversation.</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={selected.size === 0 || (isGroup && !groupName) || mutation.isPending}
            className={buttonPrimary}
          >
            {mutation.isPending ? 'Starting...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  )
}
