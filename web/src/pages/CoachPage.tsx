import { Link } from 'react-router'
import { TournamentRegistrationForm } from '../components/coach/TournamentRegistrationForm'
import { EvaluationForm } from '../components/coach/EvaluationForm'

export function CoachPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Coach</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600">
          Back to dashboard
        </Link>
      </div>

      <TournamentRegistrationForm />
      <EvaluationForm />
    </div>
  )
}
