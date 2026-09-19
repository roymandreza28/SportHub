import { buttonGhost } from '../../lib/formStyles'
import { TeamPanel } from './TeamPanel'

// A real popup instead of MatchmakingPanel's old inline expand/collapse —
// team management (creating a team, inviting friends, accepting invites,
// removing members) is its own multi-step task, not a quick glance, so it
// gets a proper modal the same way CreateVenueModal does rather than
// pushing the rest of the matchmaking form down the page while open.
export function ManageTeamsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Manage teams</h3>
          <button onClick={onClose} className={buttonGhost}>
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          <TeamPanel />
        </div>
      </div>
    </div>
  )
}
