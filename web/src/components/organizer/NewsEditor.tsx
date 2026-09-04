import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNews } from '../../lib/organizerApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, textarea } from '../../lib/formStyles'
import { IconImage } from '../layout/icons'

// Stays safely under the API's combined-request ceiling so a couple of
// attachments together never risk the request getting silently truncated
// before Laravel's own per-file validation would otherwise catch it.
const MAX_TOTAL_BYTES = 35 * 1024 * 1024

type Attachment = { file: File; previewUrl: string | null }

export function NewsEditor() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ref mirrors the latest attachments so the unmount cleanup below always
  // revokes whatever's actually pending, not a stale empty array captured
  // from the initial render.
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  useEffect(() => {
    return () => attachmentsRef.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl))
  }, [])

  const totalBytes = attachments.reduce((sum, a) => sum + a.file.size, 0)
  const tooLarge = totalBytes > MAX_TOTAL_BYTES

  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const next = Array.from(fileList).map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setAttachments((prev) => [...prev, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const removed = prev[index]
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function reset() {
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl))
    setTitle('')
    setBody('')
    setAttachments([])
  }

  const mutation = useMutation({
    mutationFn: () => createNews({ title, body, media: attachments.map((a) => a.file) }),
    onSuccess: () => {
      reset()
      queryClient.invalidateQueries({ queryKey: ['news'] })
    },
  })

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-800">Post news</h3>
      <div className={fieldGroup}>
        <label className={label}>Title</label>
        <input
          type="text"
          placeholder="What's the headline?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={input}
        />
      </div>
      <div className={fieldGroup}>
        <label className={label}>Body</label>
        <textarea
          placeholder="Tell the community what's happening in Binangonan..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={textarea}
          rows={4}
        />
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-slate-500">
                  <span aria-hidden="true">🎬</span>
                  <span className="w-full truncate">{a.file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${a.file.name}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-pure-white opacity-0 transition group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {tooLarge && (
        <p className="text-xs text-red-600">
          Attachments are too large ({(totalBytes / (1024 * 1024)).toFixed(1)} MB) — keep the total under{' '}
          {MAX_TOTAL_BYTES / (1024 * 1024)} MB, or remove one.
        </p>
      )}

      {mutation.isError && <p className="text-xs text-red-600">Couldn't publish that — check your attachments and try again.</p>}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonSecondary}>
          <IconImage className="h-4 w-4" />
          Photo/Video
        </button>

        <button
          onClick={() => mutation.mutate()}
          disabled={!title || !body || tooLarge || mutation.isPending}
          className={buttonPrimary}
        >
          {mutation.isPending ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
