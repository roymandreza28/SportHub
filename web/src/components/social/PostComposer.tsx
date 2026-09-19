import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPost } from '../../lib/postsApi'
import { buttonPrimary, buttonSecondary, fieldGroup, label, textarea } from '../../lib/formStyles'
import { IconImage } from '../layout/icons'

const MAX_IMAGES = 10

type Attachment = { file: File; previewUrl: string }

// Instagram-style multi-photo post — pick 1 to MAX_IMAGES images, previewed
// as a removable thumbnail grid in upload order (that order becomes the
// carousel's slide order — see PostController::store()'s position field).
export function PostComposer() {
  const queryClient = useQueryClient()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [caption, setCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  useEffect(() => {
    return () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl))
  }, [])

  const mutation = useMutation({
    mutationFn: () =>
      createPost(
        attachments.map((a) => a.file),
        caption
      ),
    onSuccess: () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
      setAttachments([])
      setCaption('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      queryClient.invalidateQueries({ queryKey: ['social', 'posts'] })
    },
  })

  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const picked = Array.from(fileList).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setAttachments((prev) => [...prev, ...picked].slice(0, MAX_IMAGES))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={fieldGroup}>
        <label className={label}>Photos</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachments.length >= MAX_IMAGES}
          className={`${buttonSecondary} self-start disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <IconImage className="h-4 w-4" />
          {attachments.length > 0 ? 'Add more photos' : 'Choose photos'}
        </button>
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((a, i) => (
            <div key={a.previewUrl} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
              <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
              {attachments.length > 1 && (
                <span className="absolute left-1 top-1 rounded-full bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-medium text-pure-white">
                  {i + 1}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-pure-white opacity-0 transition group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={fieldGroup}>
        <label className={label}>Description</label>
        <textarea
          placeholder="Say something about these photos..."
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          className={textarea}
        />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">Couldn't post that. Try smaller JPG/PNG/WebP files, up to {MAX_IMAGES}.</p>}
      <button
        onClick={() => mutation.mutate()}
        disabled={attachments.length === 0 || mutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Posting...' : 'Post'}
      </button>
    </div>
  )
}
