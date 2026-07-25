import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateOwnAvatar } from './accountApi'
import { updateOwnCover } from './socialApi'
import { useAuth } from './AuthContext'

export function useProfileMediaMutations(profileId: number) {
  const queryClient = useQueryClient()
  const { refreshUser } = useAuth()

  const avatarMutation = useMutation({
    mutationFn: (file: File) => updateOwnAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'profile', profileId] })
      refreshUser()
    },
  })

  const coverMutation = useMutation({
    mutationFn: (file: File) => updateOwnCover(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'profile', profileId] }),
  })

  return { avatarMutation, coverMutation }
}
