import { useState } from 'react'

type MediaItem = { id: number; type: 'image' | 'video'; url: string }

// Facebook-style layout: photos share a responsive grid (single photo goes
// full-width; two or more share equal-sized tiles), while every video gets
// its own full-width row with native controls rather than being squeezed
// into a small grid cell where playback controls would be unusable.
export function NewsMediaGrid({ media }: { media: MediaItem[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (media.length === 0) return null

  const images = media.filter((m) => m.type === 'image')
  const videos = media.filter((m) => m.type === 'video')

  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length > 0 && (
        <div className={images.length === 1 ? '' : 'grid grid-cols-2 gap-1'}>
          {images.map((item) =>
            images.length === 1 ? (
              <img
                key={item.id}
                src={item.url}
                alt=""
                onClick={() => setLightbox(item.url)}
                className="max-h-96 w-full cursor-pointer rounded-lg object-cover"
              />
            ) : (
              <img
                key={item.id}
                src={item.url}
                alt=""
                onClick={() => setLightbox(item.url)}
                className="aspect-square w-full cursor-pointer rounded-lg object-cover"
              />
            )
          )}
        </div>
      )}

      {videos.map((item) => (
        <video key={item.id} src={item.url} controls className="max-h-96 w-full rounded-lg bg-black" />
      ))}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
