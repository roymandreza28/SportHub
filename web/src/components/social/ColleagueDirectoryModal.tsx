import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contactColleague, fetchOrganizerDirectory } from '../../lib/chatApi'
import { buttonSecondary } from '../../lib/formStyles'
import { Avatar } from '../layout/Avatar'

const ROLE_LABEL: Record<string, string> = {
  organizer: 'Organizer',
  venue_organizer: 'Venue Organizer',
  livestream_organizer: 'Livestream Organizer',
}

// The organizer-family equivalent of NewConversationModal — that one lists
// friends and requires 'manage friendships' (player/coach only), which
// organizer/venue_organizer/livestream_organizer never hold. This lists the
// whole organizer "staff directory" instead (see
// ConversationController::organizerDirectory()) and skips straight to
// opening a thread on click — there's no group-chat concept here, just
// "message this colleague."
export function ColleagueDirectoryModal({
  onClose,
  onOpened,
}: {
  onClose: () => void
  onOpened: (conversationId: number) => void
}) {
  const queryClient = useQueryClient()
  const { data: colleagues, isLoading } = useQuery({
    queryKey: ['social', 'organizer-directory'],
    queryFn: fetchOrganizerDirectory,
  })

  const mutation = useMutation({
    mutationFn: contactColleague,
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['social', 'conversations'] })
      onOpened(conversation.id)
    },
  })

  // Portaled to <body> for the same reason as NewConversationModal — opened
  // from inside the header's backdrop-blur dropdown, which would otherwise
  // squeeze "fixed inset-0" into a thin strip instead of the real viewport.
  return createPortal(
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Message a colleague</h3>
        <p className="mt-1 text-sm text-slate-500">
          Every organizer, venue organizer, and livestream organizer on the platform.
        </p>

        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
          {isLoading && <p className="p-3 text-sm text-slate-400">Loading...</p>}
          {!isLoading && colleagues?.length === 0 && (
            <p className="p-3 text-sm text-slate-400">No other organizer-team accounts yet.</p>
          )}
          {colleagues?.map((colleague) => (
            <button
              key={colleague.id}
              onClick={() => mutation.mutate(colleague.id)}
              disabled={mutation.isPending}
              className="flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-700 last:border-0 hover:bg-slate-50 disabled:opacity-50"
            >
              <Avatar name={colleague.name} url={colleague.avatar_url} size="sm" />
              <span className="min-w-0 flex-1 truncate">{colleague.name}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {ROLE_LABEL[colleague.role] ?? colleague.role}
              </span>
            </button>
          ))}
        </div>

        {mutation.isError && <p className="mt-2 text-xs text-red-600">Couldn't open that conversation.</p>}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
