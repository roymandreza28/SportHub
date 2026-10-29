import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createNews, fetchOrganizerTournaments, type Tournament } from '../../lib/organizerApi'
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
  const [postType, setPostType] = useState<'normal' | 'livestream'>('normal')
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | ''>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: tournaments } = useQuery({ queryKey: ['organizer', 'tournaments'], queryFn: fetchOrganizerTournaments })
  const activeTournaments = (tournaments ?? []).filter(
    (tournament: Tournament) => !['completed', 'cancelled', 'archived'].includes(tournament.status)
  )

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
    setPostType('normal')
    setSelectedTournamentId('')
  }

  const mutation = useMutation({
    mutationFn: () =>
      createNews({
        title,
        body,
        tournament_id: postType === 'livestream' && selectedTournamentId !== '' ? Number(selectedTournamentId) : undefined,
        media: attachments.map((a) => a.file),
      }),
    onSuccess: () => {
      reset()
      setSelectedTournamentId('')
      // ['news'] is the plain organizer/facilitator list (NewsFeed.tsx);
      // ['newsfeed'] is the shared feed OrganizerPage now also renders below
      // this editor — both need to pick up the freshly published post.
      queryClient.invalidateQueries({ queryKey: ['news'] })
      queryClient.invalidateQueries({ queryKey: ['newsfeed'] })
    },
  })

  return (
    <div className="flex w-full flex-col gap-4">
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

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setPostType('normal')
            setSelectedTournamentId('')
          }}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
            postType === 'normal' ? 'grad-brand text-pure-white' : 'grad-surface text-slate-700'
          }`}
        >
          Normal post
        </button>
        <button
          type="button"
          onClick={() => setPostType('livestream')}
          disabled={activeTournaments.length === 0}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
            postType === 'livestream' ? 'grad-brand text-pure-white' : 'grad-surface text-slate-700'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Live link
        </button>
      </div>

      {postType === 'livestream' && activeTournaments.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className={label}>Tournament</label>
            {selectedTournamentId !== '' && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-700">
                Linked
              </span>
            )}
          </div>
          <select
            value={selectedTournamentId}
            onChange={(e) => setSelectedTournamentId(e.target.value ? Number(e.target.value) : '')}
            className={`${input} bg-white/80`}
          >
            <option value="">Choose tournament</option>
            {activeTournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-slate-500">This post will be linked to the selected live tournament.</p>
        </div>
      )}

      {postType === 'livestream' && activeTournaments.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No active tournaments are available to link right now.
        </p>
      )}

      <div className="flex w-full items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className={`${buttonSecondary} flex-1`}>
          <IconImage className="h-4 w-4" />
          Photo/Video
        </button>

        <button
          onClick={() => mutation.mutate()}
          disabled={!title || !body || tooLarge || mutation.isPending}
          className={`${buttonPrimary} flex-1`}
        >
          {mutation.isPending ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
