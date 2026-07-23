import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlayerProfile, fetchMySkillLevels, updatePlayerProfile } from '../../lib/playerApi'
import { fetchSports } from '../../lib/venueApi'
import { SkillLevelBadge } from './SkillLevelBadge'
import { buttonPrimary, fieldGroup, label, select, textarea } from '../../lib/formStyles'

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
    <div className="flex flex-col gap-4">
      <div className={fieldGroup}>
        <p className={label}>Skill levels</p>
        <div className="flex flex-wrap gap-2">
          {skillLevels?.map((sl) => <SkillLevelBadge key={sl.id} skillLevel={sl} />)}
          {skillLevels?.length === 0 && <p className="text-sm text-slate-400">No skill evaluations yet.</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4 border-t border-slate-100 pt-4">
        <div className={fieldGroup}>
          <label className={label} htmlFor="player-bio">Bio</label>
          <textarea
            id="player-bio"
            placeholder="Tell us a bit about yourself"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={textarea}
            rows={2}
          />
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="player-primary-sport">Primary sport</label>
          <select
            id="player-primary-sport"
            value={primarySportId}
            onChange={(e) => setPrimarySportId(e.target.value ? Number(e.target.value) : '')}
            className={select}
          >
            <option value="">Primary sport...</option>
            {sports?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={mutation.isPending} className={`${buttonPrimary} self-start`}>
          {mutation.isPending ? 'Saving...' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
