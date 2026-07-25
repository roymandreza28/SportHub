import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { acceptFriendRequest, declineFriendRequest, fetchFriendRequests } from '../../lib/friendsApi'
import { echo } from '../../lib/echo'
import { useAuth } from '../../lib/AuthContext'
import { IconBell } from './icons'

export function HeaderNotificationsMenu() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: incoming } = useQuery({
    queryKey: ['social', 'friend-requests', 'incoming'],
    queryFn: () => fetchFriendRequests('incoming'),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['social', 'friend-requests'] })
    queryClient.invalidateQueries({ queryKey: ['social', 'friends'] })
  }

  const acceptMutation = useMutation({ mutationFn: acceptFriendRequest, onSuccess: invalidate })
  const declineMutation = useMutation({ mutationFn: declineFriendRequest, onSuccess: invalidate })

  useEffect(() => {
    if (!user) return

    const channel = echo.private(`App.Models.User.${user.id}`)
    channel.listen('.FriendRequestSent', invalidate)
    channel.listen('.FriendRequestAccepted', invalidate)

    return () => {
      echo.leave(`App.Models.User.${user.id}`)
    }
    // Only re-subscribes when the user identity changes — invalidate() is
    // re-created every render but doesn't need to retrigger the subscription.
  }, [user])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const count = incoming?.length ?? 0

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
      >
        <IconBell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 w-80 pt-2">
          <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-2xl">
            <p className="px-2 py-1.5 text-sm font-semibold text-slate-900">Friend requests</p>
            {count === 0 && <p className="p-3 text-sm text-slate-400">No new requests.</p>}
            <ul className="flex flex-col divide-y divide-slate-100">
              {incoming?.map((req) => (
                <li key={req.id} className="flex items-center justify-between gap-2 px-2 py-2.5">
                  <p className="truncate text-sm font-medium text-slate-800">{req.requester.name}</p>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => acceptMutation.mutate(req.id)}
                      className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-teal-700"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineMutation.mutate(req.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
