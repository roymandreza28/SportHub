import { useLayoutEffect, useRef, useState } from 'react'
import { IconChevronLeft } from './icons'

export type CarouselImage = { id: number; url: string }

// Instagram-style swipeable carousel for a post/newsfeed item's images —
// only ever rendered for 2+ images (a single image keeps its own plain
// <img>, unchanged, in every caller). One slide fully visible at a time via
// native scroll-snap (real touch swipe on mobile, drag-scroll on desktop —
// no library), a "1/N" counter, dot indicators, and hover-reveal chevrons
// on desktop for a mouse — same scrollBy-driven chevron pattern as
// UpcomingEventsStrip.tsx, just snapping to a whole slide instead of a
// fixed pixel offset.
export function ImageCarousel({
  images,
  alt = '',
  onImageClick,
  slideClassName = 'aspect-square w-full object-cover',
  initialIndex = 0,
}: {
  images: CarouselImage[]
  alt?: string
  onImageClick?: (index: number) => void
  slideClassName?: string
  // Lets a lightbox reopen the carousel at whichever slide the viewer
  // actually clicked in the feed, instead of always restarting at 0.
  initialIndex?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(initialIndex)

  // Jumps to the starting slide the instant the container has a real
  // width, with no visible scroll animation (a smooth-scrolled trip across
  // several slides on first paint would look like the carousel glitching)
  // — a plain effect would fire before layout, when clientWidth is still 0.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || initialIndex === 0) return
    el.scrollLeft = initialIndex * el.clientWidth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (images.length === 0) return null

  function handleScroll() {
    const el = scrollRef.current
    if (!el || el.clientWidth === 0) return
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goTo(index: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
    // scroll-snap fires its own scroll events as it settles, but setting
    // this immediately keeps the dots/counter in sync with the click that
    // triggered the scroll rather than waiting on it.
    setActiveIndex(index)
  }

  return (
    <div className="group relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-lg [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image, i) => (
          <img
            key={image.id}
            src={image.url}
            alt={alt}
            onClick={() => onImageClick?.(i)}
            className={`shrink-0 snap-center ${onImageClick ? 'cursor-pointer' : ''} ${slideClassName}`}
          />
        ))}
      </div>

      {activeIndex > 0 && (
        <button
          type="button"
          onClick={() => goTo(activeIndex - 1)}
          aria-label="Previous image"
          className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/50 text-pure-white opacity-0 transition hover:bg-slate-900/70 group-hover:opacity-100"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      )}
      {activeIndex < images.length - 1 && (
        <button
          type="button"
          onClick={() => goTo(activeIndex + 1)}
          aria-label="Next image"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/50 text-pure-white opacity-0 transition hover:bg-slate-900/70 group-hover:opacity-100"
        >
          <IconChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      )}

      <span className="absolute right-2 top-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-[11px] font-medium text-pure-white">
        {activeIndex + 1}/{images.length}
      </span>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {images.map((image, i) => (
          <button
            key={image.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to image ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-4 bg-teal-600' : 'w-1.5 bg-slate-300'}`}
          />
        ))}
      </div>
    </div>
  )
}
