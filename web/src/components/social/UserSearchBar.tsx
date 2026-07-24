import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { searchSocialUsers } from '../../lib/socialApi'
import { input } from '../../lib/formStyles'

export function UserSearchBar() {
  const [search, setSearch] = useState('')

  const { data } = useQuery({
    queryKey: ['social', 'search', search],
    queryFn: () => searchSocialUsers(search),
    enabled: search.length > 0,
  })

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Search players and coaches by name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={input}
      />

      {search.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-100">
          {data?.data.length === 0 && <li className="p-3 text-sm text-slate-400">No matches.</li>}
          {data?.data.map((result) => (
            <li key={result.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{result.name}</p>
                <div className="mt-0.5 flex gap-1">
                  {result.roles.map((r) => (
                    <span key={r.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">
                      {r.name.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
              <Link to={`/profile/${result.id}`} className="text-sm font-medium text-teal-600 hover:text-teal-700">
                View profile
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
