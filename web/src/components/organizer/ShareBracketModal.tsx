import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNews } from '../../lib/organizerApi'
import { buttonPrimary, buttonSecondary, fieldGroup, input, label, textarea } from '../../lib/formStyles'
import { IconImage } from '../layout/icons'

// Stays safely under the API's combined-request ceiling so a couple of
// attachments together never risk the request getting silently truncated
// before Laravel's own per-file validation would otherwise catch it — same
// limit NewsEditor.tsx uses for the same reason.
const MAX_TOTAL_BYTES = 35 * 1024 * 1024

type Attachment = { file: File; previewUrl: string | null }

// Shares the WHOLE bracket (as opposed to ShareMatchModal, which shares one
// game) to the newsfeed — the post carries tournament_id only, no match_id.
// Newsfeed.tsx/PublicNewsModal.tsx render any tournament-tagged post with
// no attached match as an embedded, read-only BracketView complete with its
// own Bracket/Standings toggle, so a reader can explore every match (and
// drill into any one game's full record) without leaving the feed — and
// since that embed polls the same public bracket endpoint BracketView
// always has, it keeps updating live as the tournament progresses. Photos/
// videos attached here (e.g. a champion trophy shot) ride along on the same
// post, shown above that live embed — createNews() already accepts a
// `media` file list (NewsEditor.tsx's own composer already uses it), this
// just wires the same picker in here too.
export function ShareBracketModal({
  tournamentId,
  tournamentName,
  onClose,
}: {
  tournamentId: number
  tournamentName: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(`${tournamentName} — Bracket & Standings`)
  const [body, setBody] = useState(
    `Follow every match of ${tournamentName} right here — switch between bracket and standings view below.`
  )
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

  const mutation = useMutation({
    mutationFn: () =>
      createNews({ title, body, tournament_id: tournamentId, media: attachments.map((a) => a.file) }),
    onSuccess: () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl))
      queryClient.invalidateQueries({ queryKey: ['newsfeed'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'news'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Share the bracket</h3>
        <p className="mb-4 text-xs text-slate-500">
          Post {tournamentName}'s bracket to the newsfeed — readers get a live, interactive view with a
          bracket/standings toggle, not just a snapshot.
        </p>

        <div className="flex flex-col gap-4">
          <div className={fieldGroup}>
            <label className={label}>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
          <div className={fieldGroup}>
            <label className={label}>Context</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className={textarea} rows={4} />
          </div>

          {attachments.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
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

          <div>
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
          </div>
        </div>

        {tooLarge && (
          <p className="mt-3 text-xs text-red-600">
            Attachments are too large ({(totalBytes / (1024 * 1024)).toFixed(1)} MB) — keep the total under{' '}
            {MAX_TOTAL_BYTES / (1024 * 1024)} MB, or remove one.
          </p>
        )}

        {mutation.isError && <p className="mt-3 text-xs text-red-600">Could not post — try again.</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!title || !body || tooLarge || mutation.isPending}
            className={buttonPrimary}
          >
            {mutation.isPending ? 'Posting...' : 'Post to newsfeed'}
          </button>
        </div>
      </div>
    </div>
  )
}
