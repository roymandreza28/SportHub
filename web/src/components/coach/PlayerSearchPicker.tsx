import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchPlayers, type PlayerSearchResult } from '../../lib/coachApi'
import { input } from '../../lib/formStyles'

export function PlayerSearchPicker({
  selected,
  onSelect,
}: {
  selected: PlayerSearchResult | null
  onSelect: (player: PlayerSearchResult | null) => void
}) {
  const [search, setSearch] = useState('')
  const { data: results } = useQuery({
    queryKey: ['coach', 'players', search],
    queryFn: () => searchPlayers(search),
    enabled: search.length > 0,
  })

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <span className="font-medium text-slate-800">
          {selected.name} <span className="font-normal text-slate-500">({selected.email})</span>
        </span>
        <button type="button" onClick={() => onSelect(null)} className="text-xs font-medium text-red-600 hover:text-red-700">
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-1">
      <input
        type="text"
        placeholder="Search player by name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={input}
      />
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {results.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(player)
                  setSearch('')
                }}
                className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                {player.name} <span className="text-slate-400">({player.email})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
