import { useState } from 'react'
import type { Post } from '../../lib/postsApi'
import { ImageCarousel } from '../layout/ImageCarousel'
import { IconStack } from '../layout/icons'

export function PostGrid({ posts, onDelete }: { posts: Post[]; onDelete?: (post: Post) => void }) {
  const [selected, setSelected] = useState<Post | null>(null)

  if (posts.length === 0) {
    return <p className="text-sm text-slate-400">No posts yet.</p>
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => setSelected(post)}
            className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 transition hover:opacity-90"
          >
            <img src={post.media[0]?.url} alt={post.caption ?? ''} className="h-full w-full object-cover" />
            {post.media.length > 1 && (
              <IconStack className="absolute right-1.5 top-1.5 h-4 w-4 text-pure-white drop-shadow" />
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setSelected(null)}>
          <div className="max-w-lg rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {selected.media.length > 1 ? (
              <ImageCarousel
                images={selected.media}
                alt={selected.caption ?? ''}
                slideClassName="max-h-[70vh] w-full object-contain"
              />
            ) : (
              <img
                src={selected.media[0]?.url}
                alt={selected.caption ?? ''}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            )}
            {selected.caption && <p className="mt-3 text-sm text-slate-700">{selected.caption}</p>}
            <div className="mt-3 flex justify-end gap-2">
              {onDelete && (
                <button
                  onClick={() => {
                    onDelete(selected)
                    setSelected(null)
                  }}
                  className="text-sm font-medium text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              )}
              <button onClick={() => setSelected(null)} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
