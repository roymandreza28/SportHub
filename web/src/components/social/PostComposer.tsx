import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPost } from '../../lib/postsApi'
import { buttonPrimary, fieldGroup, label, textarea } from '../../lib/formStyles'

export function PostComposer() {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: () => createPost(file!, caption),
    onSuccess: () => {
      setFile(null)
      setCaption('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
    },
  })

  return (
    <div className="flex flex-col gap-3">
      <div className={fieldGroup}>
        <label className={label}>Photo</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-700 hover:file:bg-teal-100"
        />
      </div>
      <div className={fieldGroup}>
        <label className={label}>Description</label>
        <textarea
          placeholder="Say something about this photo..."
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          className={textarea}
        />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">Couldn't post that image. Try a smaller JPG/PNG/WebP file.</p>}
      <button onClick={() => mutation.mutate()} disabled={!file || mutation.isPending} className={`${buttonPrimary} self-start`}>
        {mutation.isPending ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}
