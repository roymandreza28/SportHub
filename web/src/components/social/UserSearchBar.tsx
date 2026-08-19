import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { searchSocialUsers } from '../../lib/socialApi'
import { IconSearch, IconX } from '../layout/icons'
import { Avatar } from '../layout/Avatar'

export function UserSearchBar({ onExpandedChange }: { onExpandedChange?: (expanded: boolean) => void } = {}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  // Mobile only — the input is always visible at md: and up regardless of
  // this. Collapsed to an icon by default on narrow screens to save header
  // space, expanding into the real input on tap. Reported up via
  // onExpandedChange so DashboardShell can hide the logo/other header icons
  // and let the search bar take the full header width while expanded.
  const [mobileOpen, setMobileOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['social', 'search', search],
    queryFn: () => searchSocialUsers(search),
    enabled: search.length > 0,
  })

  useEffect(() => {
    onExpandedChange?.(mobileOpen)
    // Only mobileOpen itself should retrigger this — onExpandedChange is
    // commonly an inline setState function that's a new reference every
    // parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setMobileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative ${mobileOpen ? 'w-full' : 'w-9'} md:w-full md:max-w-sm`}>
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 md:hidden"
        >
          <IconSearch className="h-5 w-5" />
        </button>
      )}
      <div className={`relative ${mobileOpen ? 'block' : 'hidden'} md:block`}>
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
          className={`w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 ${
            mobileOpen ? 'pr-9 md:pr-4' : 'pr-4'
          }`}
        />
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600 md:hidden"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
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
