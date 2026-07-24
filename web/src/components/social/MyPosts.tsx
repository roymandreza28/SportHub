import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../lib/AuthContext'
import { deletePost, fetchPosts, type Post } from '../../lib/postsApi'
import { PostComposer } from './PostComposer'
import { PostGrid } from './PostGrid'

export function MyPosts() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['social', 'posts', user?.id],
    queryFn: () => fetchPosts(user?.id),
    enabled: !!user,
  })

  const deleteMutation = useMutation({
    mutationFn: (post: Post) => deletePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'posts', user?.id] }),
  })

  return (
    <div className="flex flex-col gap-6">
      <PostComposer />
      <PostGrid posts={data?.data ?? []} onDelete={(post) => deleteMutation.mutate(post)} />
    </div>
  )
}
