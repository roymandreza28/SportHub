import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchPlayers, type PlayerSearchResult } from '../../lib/coachApi'

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
      <div className="flex items-center justify-between rounded border px-2 py-1 text-sm">
        <span>
          {selected.name} ({selected.email})
        </span>
        <button type="button" onClick={() => onSelect(null)} className="text-xs text-red-600">
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        placeholder="Search player by name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border p-1">
          {results.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(player)
                  setSearch('')
                }}
                className="w-full rounded px-2 py-1 text-left text-sm hover:bg-gray-100"
              >
                {player.name} ({player.email})
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
