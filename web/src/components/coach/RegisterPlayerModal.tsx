import { TeamTournamentWizard } from './TeamTournamentWizard'
import { buttonSecondary } from '../../lib/formStyles'
import type { Tournament } from '../../lib/coachApi'

export function RegisterPlayerModal({
  onClose,
  initialTournament,
}: {
  onClose: () => void
  initialTournament?: Tournament
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">Tournament registration</h3>
        <p className="mt-1 text-xs text-slate-500">
          {initialTournament ? initialTournament.name : 'Pick a sport, then a tournament, then register.'}
        </p>

        <div className="mt-4">
          <TeamTournamentWizard onClose={onClose} initialTournament={initialTournament} />
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className={buttonSecondary}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
