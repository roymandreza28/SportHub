import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNewsFeed, displayNewsTitle, type NewsItem } from '../../lib/newsApi'
import { LiveRelayVideo } from '../newsfeed/LiveRelayVideo'
import { LiveMatchScore } from '../newsfeed/LiveMatchScore'
import { NewsMediaGrid } from '../newsfeed/NewsMediaGrid'
import { IconChevronLeft, IconHeart, IconMessageCircle, IconX } from '../layout/icons'

const SLIDER_SIZE = 5
const AUTOPLAY_MS = 6000

// Fully public, view-only — no comment input, no reaction button anywhere
// in this component. Anonymous visitors reach the same live broadcast as
// logged-in users via the shared LiveRelayVideo (hop 2 of the relay), just
// without any of the interaction UI that requires an account. Reaction/
// comment counts still show as plain metadata (not buttons) — a modern news
// card reads incomplete without them, they just aren't clickable here.
export function PublicNewsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { data: news, isLoading } = useQuery({ queryKey: ['newsfeed'], queryFn: fetchNewsFeed, enabled: open })
  const [selected, setSelected] = useState<NewsItem | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Every reopen starts back at the grid, not wherever the visitor last
  // drilled into — closing and reopening the modal reads as "start over."
  useEffect(() => {
    if (!open) {
      setSelected(null)
      setSlideIndex(0)
    }
  }, [open])

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const sliderItems = (news ?? []).slice(0, SLIDER_SIZE)
  const gridItems = (news ?? []).slice(SLIDER_SIZE)

  // Autoplay pauses whenever an article is open or there's nothing to
  // rotate through, and never runs at all under prefers-reduced-motion.
  useEffect(() => {
    if (!open || selected || sliderItems.length <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setSlideIndex((i) => (i + 1) % sliderItems.length), AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [open, selected, sliderItems.length])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="modal-dialog fixed inset-0 m-auto h-fit max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border-none bg-white p-0 shadow-2xl backdrop:bg-slate-950/70"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur sm:px-8">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-full object-cover" />
          <div>
            <p className="text-sm font-bold leading-none text-slate-900">SportHub News</p>
            <p className="mt-1 text-xs leading-none text-slate-500">{today}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <IconX className="h-4 w-4" />
        </button>
      </header>

      <div className="px-5 py-6 sm:px-8">
        {isLoading && <p className="py-10 text-center text-sm text-slate-500">Loading the latest stories...</p>}
        {!isLoading && (news?.length ?? 0) === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">No stories published yet — check back soon.</p>
        )}

        {selected ? (
          <ArticleDetail item={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            {sliderItems.length > 0 && (
              <FeaturedSlider
                items={sliderItems}
                index={slideIndex}
                onIndexChange={setSlideIndex}
                onSelect={setSelected}
              />
            )}

            {gridItems.length > 0 && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {gridItems.map((item) => (
                  <NewsCard key={item.id} item={item} onSelect={setSelected} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-slate-100 px-5 py-4 text-center text-xs text-slate-400 sm:px-8">
        Sign in for the full story, to react, and to join the conversation
      </footer>
    </dialog>
  )
}

function LiveBadge() {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-pure-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pure-white" /> Live
    </span>
  )
}

function CardMeta({ item }: { item: NewsItem }) {
  return (
    <div className="mt-2.5 flex items-center gap-3.5 text-xs text-slate-400">
      <span className="flex items-center gap-1">
        <IconHeart className="h-3.5 w-3.5" /> {item.reactions_count}
      </span>
      <span className="flex items-center gap-1">
        <IconMessageCircle className="h-3.5 w-3.5" /> {item.comments_count}
      </span>
    </div>
  )
}

// Fallback tile for a post with no cover image and no photo attachments —
// a branded gradient card rather than a broken/blank image, so the grid
// never has a visibly empty slot.
function GradientFallback() {
  return <div className="h-full w-full bg-gradient-to-br from-teal-600 to-teal-800" />
}

function coverImageFor(item: NewsItem): string | null {
  return item.cover_image_url ?? item.media.find((m) => m.type === 'image')?.url ?? null
}

function byline(item: NewsItem): string {
  return item.author.is_organizer ? 'Organizer' : item.author.name
}

// The strip-track carousel — every slide sits side by side in one flex row
// that's exactly `items.length * 100%` wide, and the whole row translates by
// `-index * (100 / items.length)%` to bring one slide at a time into the
// frame. Every slide shares the same overlay-text layout regardless of
// whether it's a photo, a live broadcast, or a text-only post, so the arrow/
// dot controls sit in a consistent spot no matter which slide is showing.
function FeaturedSlider({
  items,
  index,
  onIndexChange,
  onSelect,
}: {
  items: NewsItem[]
  index: number
  onIndexChange: (i: number) => void
  onSelect: (item: NewsItem) => void
}) {
  const go = (delta: number) => onIndexChange((index + delta + items.length) % items.length)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ width: `${items.length * 100}%`, transform: `translateX(-${index * (100 / items.length)}%)` }}
      >
        {items.map((item) => (
          <div key={item.id} style={{ width: `${100 / items.length}%` }} className="shrink-0">
            <SlideCard item={item} onSelect={onSelect} />
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous story"
            className="absolute left-3 top-1/2 z-[2] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-pure-white/85 text-[#241e17] shadow transition hover:bg-pure-white"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next story"
            className="absolute right-3 top-1/2 z-[2] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-pure-white/85 text-[#241e17] shadow transition hover:bg-pure-white"
          >
            <IconChevronLeft className="h-4 w-4 rotate-180" />
          </button>

          <div className="absolute inset-x-0 bottom-3 z-[2] flex justify-center gap-1.5">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Go to story ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-pure-white' : 'w-1.5 bg-pure-white/50 hover:bg-pure-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SlideCard({ item, onSelect }: { item: NewsItem; onSelect: (item: NewsItem) => void }) {
  const liveStream =
    item.livestreams.find((l) => l.status === 'live') ??
    item.livestreams.find((l) => l.status === 'ended' && l.recording_url)
  const isActuallyLive = liveStream?.status === 'live'
  const hasLiveMatch = item.match?.status === 'live'
  const image = coverImageFor(item)

  return (
    <div className="relative aspect-[16/9] w-full sm:aspect-[21/9]">
      {liveStream ? (
        <>
          <LiveRelayVideo livestreamId={liveStream.id} status={liveStream.status} recordingUrl={liveStream.recording_url} />
          {isActuallyLive && (
            <div className="absolute left-3 top-3 z-[1]">
              <LiveBadge />
            </div>
          )}
          {/* Only the caption strip opens the article here — the video area
              above it stays untouched so LiveRelayVideo's own "Click to
              watch" control keeps working instead of being swallowed by an
              inset-0 click target sitting on top of it. */}
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="absolute inset-x-0 bottom-0 flex flex-col items-start bg-gradient-to-t from-slate-950/90 to-transparent px-5 pb-10 pt-10 text-left sm:px-6 sm:pb-11"
          >
            <h2 className="text-xl font-bold leading-tight text-pure-white sm:text-2xl">{displayNewsTitle(item)}</h2>
            <p className="mt-1.5 text-xs text-pure-white/70">
              {byline(item)}
              {item.published_at && ` · ${new Date(item.published_at).toLocaleDateString()}`}
            </p>
          </button>
        </>
      ) : (
        <>
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <GradientFallback />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/10 to-transparent" />
          {hasLiveMatch && (
            <div className="absolute left-3 top-3 z-[1]">
              <LiveBadge />
            </div>
          )}
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="absolute inset-0 flex flex-col justify-end px-5 pb-10 pt-4 text-left sm:px-6 sm:pb-11"
          >
            <h2 className="text-xl font-bold leading-tight text-pure-white sm:text-2xl">{displayNewsTitle(item)}</h2>
            <p className="mt-1.5 text-xs text-pure-white/70">
              {byline(item)}
              {item.published_at && ` · ${new Date(item.published_at).toLocaleDateString()}`}
            </p>
          </button>
        </>
      )}
    </div>
  )
}

function NewsCard({ item, onSelect }: { item: NewsItem; onSelect: (item: NewsItem) => void }) {
  const liveStream =
    item.livestreams.find((l) => l.status === 'live') ??
    item.livestreams.find((l) => l.status === 'ended' && l.recording_url)
  const isActuallyLive = liveStream?.status === 'live'
  const hasLiveMatch = item.match?.status === 'live'
  const image = coverImageFor(item)

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video w-full shrink-0">
        {liveStream ? (
          <LiveRelayVideo livestreamId={liveStream.id} status={liveStream.status} recordingUrl={liveStream.recording_url} />
        ) : image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <GradientFallback />
        )}
        {(isActuallyLive || hasLiveMatch) && (
          <div className="absolute left-3 top-3 z-[1]">
            <LiveBadge />
          </div>
        )}
      </div>

      <button type="button" onClick={() => onSelect(item)} className="flex flex-1 flex-col px-4 py-3.5 text-left">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">{displayNewsTitle(item)}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {byline(item)}
          {item.published_at && ` · ${new Date(item.published_at).toLocaleDateString()}`}
        </p>
        <p className="mt-2 line-clamp-2 flex-1 whitespace-pre-line text-xs leading-relaxed text-slate-500">
          {item.body}
        </p>
        <CardMeta item={item} />
      </button>
    </article>
  )
}

function ArticleDetail({ item, onBack }: { item: NewsItem; onBack: () => void }) {
  const liveStream =
    item.livestreams.find((l) => l.status === 'live') ??
    item.livestreams.find((l) => l.status === 'ended' && l.recording_url)
  const isActuallyLive = liveStream?.status === 'live'
  const image = coverImageFor(item)

  return (
    <div className="modal-content-fade mx-auto max-w-2xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <IconChevronLeft className="h-4 w-4" /> Back to News
      </button>

      {/* Title, byline, details, then — for a live game share — the live
          scoreboard and finally the live stream, in that order. A plain
          (non-live) post keeps its cover image/media up top instead. */}
      <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{displayNewsTitle(item)}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {byline(item)}
        {item.published_at && ` · ${new Date(item.published_at).toLocaleDateString()}`}
      </p>

      {!liveStream && item.media.length > 0 && (
        <div className="mt-5">
          <NewsMediaGrid media={item.media} />
        </div>
      )}
      {!liveStream && item.media.length === 0 && image && (
        <img src={image} alt="" className="mt-5 aspect-video w-full rounded-xl object-cover" />
      )}

      <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-slate-700">{item.body}</p>

      {item.match && <LiveMatchScore match={item.match} />}

      {liveStream && (
        <div className="mt-4">
          {isActuallyLive && (
            <div className="mb-2">
              <LiveBadge />
            </div>
          )}
          <LiveRelayVideo livestreamId={liveStream.id} status={liveStream.status} recordingUrl={liveStream.recording_url} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-5 border-t border-slate-100 pt-4 text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <IconHeart className="h-4 w-4" /> {item.reactions_count} reactions
        </span>
        <span className="flex items-center gap-1.5">
          <IconMessageCircle className="h-4 w-4" /> {item.comments_count} comments
        </span>
      </div>
    </div>
  )
}
