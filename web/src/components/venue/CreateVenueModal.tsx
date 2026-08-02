import { VenueForm } from './VenueForm'
import { buttonGhost } from '../../lib/formStyles'

export function CreateVenueModal({ onClose }: { onClose: () => void }) {
  return (
    // Leaflet's own panes/controls use z-index up to 1000 — the background
    // VenueMap on this same page would otherwise render on top of a z-30
    // modal instead of behind it.
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/60 p-4" data-testid="create-venue-modal">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Add a venue</h3>
          <button onClick={onClose} className={buttonGhost}>
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          <VenueForm onCreated={onClose} />
        </div>
      </div>
    </div>
  )
}
