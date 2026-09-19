import { useState } from 'react'
import { ImageCarousel } from '../layout/ImageCarousel'

type MediaItem = { id: number; type: 'image' | 'video'; url: string }

// A single photo goes full-width; 2+ photos become an Instagram-style
// swipeable carousel (ImageCarousel). Every video still gets its own
// full-width row with native controls, same as before — kept OUT of the
// image carousel rather than mixed into it, since autoplay/pause per-slide
// inside a swipeable strip is a lot of extra risk for a case this app's
// posts don't really call for. Tapping any photo opens a lightbox that
// reopens the SAME carousel at the slide that was tapped, not slide 0.
export function NewsMediaGrid({ media }: { media: MediaItem[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (media.length === 0) return null

  const images = media.filter((m) => m.type === 'image')
  const videos = media.filter((m) => m.type === 'video')

  return (
    <div className="mt-3 flex flex-col gap-2">
      {images.length === 1 && (
        <img
          src={images[0].url}
          alt=""
          onClick={() => setLightboxIndex(0)}
          className="max-h-96 w-full cursor-pointer rounded-lg object-cover"
        />
      )}

      {images.length > 1 && <ImageCarousel images={images} onImageClick={(i) => setLightboxIndex(i)} />}

      {videos.map((item) => (
        <video key={item.id} src={item.url} controls className="max-h-96 w-full rounded-lg bg-black" />
      ))}

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {images.length > 1 ? (
              <ImageCarousel images={images} initialIndex={lightboxIndex} slideClassName="max-h-[85vh] w-full object-contain" />
            ) : (
              <img src={images[0].url} alt="" className="mx-auto max-h-[85vh] max-w-full rounded-lg object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
