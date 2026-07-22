import type { LivestreamItem } from '../../lib/organizerApi'

export function LivestreamEmbed({ livestream }: { livestream: LivestreamItem }) {
  const isSafeUrl = /^https:\/\//.test(livestream.embed_url)

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{livestream.title}</h3>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{livestream.status}</span>
      </div>
      {isSafeUrl ? (
        <iframe
          src={livestream.embed_url}
          title={livestream.title}
          className="aspect-video w-full rounded"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <p className="text-xs text-red-600">Invalid embed URL.</p>
      )}
    </div>
  )
}
