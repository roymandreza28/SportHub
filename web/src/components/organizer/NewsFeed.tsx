import { useQuery } from '@tanstack/react-query'
import { fetchNews } from '../../lib/organizerApi'

export function NewsFeed() {
  const { data: news, isLoading } = useQuery({ queryKey: ['news'], queryFn: fetchNews })

  if (isLoading) return <p className="text-sm text-gray-500">Loading news...</p>

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <h3 className="text-sm font-medium">News</h3>
      {news?.length === 0 && <p className="text-xs text-gray-500">No news yet.</p>}
      {news?.map((item) => (
        <article key={item.id} className="border-b pb-2 last:border-0">
          <h4 className="text-sm font-semibold">{item.title}</h4>
          <p className="text-xs text-gray-500">
            {item.author.name} — {item.published_at && new Date(item.published_at).toLocaleDateString()}
          </p>
          <p className="mt-1 text-sm">{item.body}</p>
        </article>
      ))}
    </div>
  )
}
