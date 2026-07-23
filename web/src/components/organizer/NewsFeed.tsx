import { useQuery } from '@tanstack/react-query'
import { fetchNews } from '../../lib/organizerApi'

export function NewsFeed() {
  const { data: news, isLoading } = useQuery({ queryKey: ['news'], queryFn: fetchNews })

  if (isLoading) return <p className="text-sm text-slate-500">Loading news...</p>

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-800">News</h3>
      {news?.length === 0 && <p className="text-sm text-slate-400">No news yet.</p>}
      {news?.map((item) => (
        <article key={item.id} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.author.name} — {item.published_at && new Date(item.published_at).toLocaleDateString()}
          </p>
          <p className="mt-2 text-sm text-slate-700">{item.body}</p>
        </article>
      ))}
    </div>
  )
}
