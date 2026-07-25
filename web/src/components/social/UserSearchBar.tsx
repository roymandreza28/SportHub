import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { searchSocialUsers } from '../../lib/socialApi'
import { IconSearch } from '../layout/icons'
import { Avatar } from '../layout/Avatar'

export function UserSearchBar() {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['social', 'search', search],
    queryFn: () => searchSocialUsers(search),
    enabled: search.length > 0,
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-sm">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search players and coaches"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </div>

      {open && search.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-2xl">
          {data?.data.length === 0 && <p className="p-3 text-sm text-slate-400">No matches.</p>}
          {data?.data.map((result) => (
            <Link
              key={result.id}
              to={`/profile/${result.id}`}
              onClick={() => {
                setOpen(false)
                setSearch('')
              }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Avatar name={result.name} url={result.avatar_url} size="sm" />
              <span className="min-w-0 flex-1 truncate">{result.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
