import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlayerProfile, fetchMySkillLevels, updatePlayerProfile } from '../../lib/playerApi'
import { fetchSports } from '../../lib/venueApi'
import { SkillLevelBadge } from './SkillLevelBadge'

export function PlayerProfileEditor() {
  const queryClient = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['player', 'profile'], queryFn: fetchPlayerProfile })
  const { data: skillLevels } = useQuery({ queryKey: ['player', 'skill-levels'], queryFn: fetchMySkillLevels })
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [bio, setBio] = useState('')
  const [primarySportId, setPrimarySportId] = useState<number | ''>('')

  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? '')
      setPrimarySportId(profile.primary_sport_id ?? '')
    }
  }, [profile])

  const mutation = useMutation({
    mutationFn: () => updatePlayerProfile({
      bio,
      primary_sport_id: primarySportId === '' ? undefined : primarySportId,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['player', 'profile'] }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <h3 className="text-sm font-medium">My profile</h3>

      <div className="flex flex-wrap gap-1">
        {skillLevels?.map((sl) => <SkillLevelBadge key={sl.id} skillLevel={sl} />)}
        {skillLevels?.length === 0 && <p className="text-xs text-gray-500">No skill evaluations yet.</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          placeholder="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <select
          value={primarySportId}
          onChange={(e) => setPrimarySportId(e.target.value ? Number(e.target.value) : '')}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">Primary sport...</option>
          {sports?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
