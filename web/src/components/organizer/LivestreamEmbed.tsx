import type { LivestreamItem } from '../../lib/organizerApi'

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  ended: 'bg-slate-100 text-slate-500',
}

export function LivestreamEmbed({ livestream }: { livestream: LivestreamItem }) {
  const isSafeUrl = /^https:\/\//.test(livestream.embed_url)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{livestream.title}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[livestream.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {livestream.status}
        </span>
      </div>
      {isSafeUrl ? (
        <iframe
          src={livestream.embed_url}
          title={livestream.title}
          className="aspect-video w-full rounded-lg border border-slate-200"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <p className="text-sm text-red-600">Invalid embed URL.</p>
      )}
    </div>
  )
}
