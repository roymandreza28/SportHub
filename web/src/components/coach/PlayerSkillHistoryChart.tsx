import { useQuery } from '@tanstack/react-query'
import { fetchEvaluations } from '../../lib/coachApi'

const LEVEL_HEIGHT: Record<string, string> = {
  beginner: '25%',
  intermediate: '50%',
  advanced: '75%',
  pro: '100%',
}

export function PlayerSkillHistoryChart({ playerId }: { playerId: number }) {
  const { data: evaluations } = useQuery({
    queryKey: ['coach', 'evaluations', playerId],
    queryFn: () => fetchEvaluations(playerId),
  })

  if (!evaluations || evaluations.length === 0) {
    return <p className="text-xs text-gray-500">No evaluation history for this player yet.</p>
  }

  // Oldest first, so the bar chart reads left-to-right as a timeline.
  const chronological = [...evaluations].reverse()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-24 items-end gap-1 rounded border p-2">
        {chronological.map((evaluation) => (
          <div
            key={evaluation.id}
            title={`${evaluation.skill_level.sport.name}: ${evaluation.skill_level.level} on ${new Date(evaluation.created_at).toLocaleDateString()}`}
            className="w-4 rounded-t bg-indigo-500"
            style={{ height: LEVEL_HEIGHT[evaluation.skill_level.level] }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-xs text-gray-600">
        {evaluations.map((evaluation) => (
          <li key={evaluation.id}>
            {new Date(evaluation.created_at).toLocaleDateString()} — {evaluation.skill_level.sport.name}:{' '}
            <strong>{evaluation.skill_level.level}</strong>
            {evaluation.skill_level.score && ` (${evaluation.skill_level.score})`} by {evaluation.coach.name}
            {evaluation.notes && ` — "${evaluation.notes}"`}
          </li>
        ))}
      </ul>
    </div>
  )
}
