import { useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchNewsFeed, type NewsItem } from '../../lib/newsApi'
import { LiveRelayVideo } from '../newsfeed/LiveRelayVideo'

// Fully public, view-only — no comment input, no reaction button anywhere
// in this component. Anonymous visitors reach the same live broadcast as
// logged-in users via the shared LiveRelayVideo (hop 2 of the relay), just
// without any of the interaction UI that requires an account.
export function PublicNewsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { data: news, isLoading } = useQuery({ queryKey: ['newsfeed'], queryFn: fetchNewsFeed, enabled: open })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const [featured, ...rest] = news ?? []

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="fixed inset-0 m-auto h-fit max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-sm border-none bg-[#fbf8f1] p-0 shadow-2xl backdrop:bg-slate-900/70"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed right-6 top-6 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/80 text-lg leading-none text-white hover:bg-slate-900"
      >
        &times;
      </button>

      <div className="font-serif text-slate-900">
        {/* Masthead */}
        <header className="border-b-4 border-double border-slate-900 px-6 pb-4 pt-8 text-center sm:px-10">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Morong, Rizal &mdash; Municipal Sports Bulletin</p>
          <h1 className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-5xl">The Sporthub Gazette</h1>
          <p className="mt-2 border-t border-slate-300 pt-2 text-xs uppercase tracking-widest text-slate-500">{today}</p>
        </header>

        <div className="px-6 py-6 sm:px-10">
          {isLoading && <p className="text-center text-sm text-slate-500">Loading the latest edition...</p>}
          {!isLoading && (news?.length ?? 0) === 0 && (
            <p className="text-center text-sm text-slate-500">No stories published yet — check back soon.</p>
          )}

          {featured && <FeaturedArticle item={featured} />}

          {rest.length > 0 && (
            <div className="mt-8 grid gap-x-8 gap-y-8 border-t-2 border-slate-900 pt-6 sm:grid-cols-2">
              {rest.map((item) => (
                <ColumnArticle key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-slate-300 px-6 py-4 text-center text-[11px] uppercase tracking-widest text-slate-400 sm:px-10">
          Sporthub &mdash; Sign in for the full story, to react, and to join the conversation
        </footer>
      </div>
    </dialog>
  )
}

function LiveRibbon() {
  return (
    <span className="flex w-fit items-center gap-1.5 bg-red-700 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live now
    </span>
  )
}

function FeaturedArticle({ item }: { item: NewsItem }) {
  const liveStream = item.livestreams.find((l) => l.status === 'live')

  return (
    <article className="border-b-2 border-slate-900 pb-6">
      {liveStream && <div className="mb-3"><LiveRibbon /></div>}
      <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{item.title}</h2>
      <p className="mt-1 text-xs italic text-slate-500">
        By {item.author.is_organizer ? 'Organizer' : item.author.name}
        {item.published_at && ` — ${new Date(item.published_at).toLocaleDateString()}`}
      </p>
      {liveStream && (
        <div className="mt-4">
          <LiveRelayVideo livestreamId={liveStream.id} />
        </div>
      )}
      <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-slate-800 first-letter:float-left first-letter:mr-2 first-letter:text-6xl first-letter:font-black first-letter:leading-[0.8]">
        {item.body}
      </p>
    </article>
  )
}

function ColumnArticle({ item }: { item: NewsItem }) {
  const liveStream = item.livestreams.find((l) => l.status === 'live')

  return (
    <article className="border-t border-slate-300 pt-4 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0 sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:pt-4">
      {liveStream && <div className="mb-2"><LiveRibbon /></div>}
      <h3 className="text-xl font-bold leading-snug">{item.title}</h3>
      <p className="mt-0.5 text-xs italic text-slate-500">
        By {item.author.is_organizer ? 'Organizer' : item.author.name}
        {item.published_at && ` — ${new Date(item.published_at).toLocaleDateString()}`}
      </p>
      {liveStream && (
        <div className="mt-3">
          <LiveRelayVideo livestreamId={liveStream.id} />
        </div>
      )}
      <p className="mt-2 line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{item.body}</p>
    </article>
  )
}
