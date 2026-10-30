import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchPlayers, type PlayerSearchResult } from '../../lib/coachApi'
import { input } from '../../lib/formStyles'
import { Avatar } from '../layout/Avatar'

type SinglePickerProps = {
  selected: PlayerSearchResult | null
  onSelect: (player: PlayerSearchResult | null) => void
  multiple?: false
}

type MultiPickerProps = {
  selected: PlayerSearchResult[]
  onSelect: (players: PlayerSearchResult[]) => void
  multiple?: true
}

type PickerProps = SinglePickerProps | MultiPickerProps

export function PlayerSearchPicker(props: PickerProps) {
  const { selected, onSelect } = props
  const multiple = props.multiple ?? true
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const { data: results } = useQuery({
    queryKey: ['coach', 'players', search],
    queryFn: () => searchPlayers(search, true),
    enabled: search.trim().length > 0,
  })

  const normalizedSearch = search.trim().toLowerCase()
  const filteredResults = (results ?? []).filter((player) => {
    const nameParts = player.name.toLowerCase().split(/\s+/)
    const email = player.email.toLowerCase()
    return nameParts.some((part) => part.startsWith(normalizedSearch)) || email.startsWith(normalizedSearch)
  })
  const visibleResults = filteredResults.slice(0, 10)

  const selectedPlayers = multiple ? (selected as PlayerSearchResult[]) : selected ? [selected as PlayerSearchResult] : []

  const isSelected = (playerId: number) => {
    if (!multiple) {
      return (selected as PlayerSearchResult | null)?.id === playerId
    }

    return (selected as PlayerSearchResult[]).some((player) => player.id === playerId)
  }

  const togglePlayer = (player: PlayerSearchResult) => {
    if (!multiple) {
      const currentSelected = selected as PlayerSearchResult | null
      const singleOnSelect = onSelect as (player: PlayerSearchResult | null) => void
      singleOnSelect(currentSelected?.id === player.id ? null : player)
      setOpen(false)
      return
    }

    const currentSelected = selected as PlayerSearchResult[]
    const multiOnSelect = onSelect as (players: PlayerSearchResult[]) => void
    if (isSelected(player.id)) {
      multiOnSelect(currentSelected.filter((selectedPlayer) => selectedPlayer.id !== player.id))
      return
    }

    multiOnSelect([...currentSelected, player])
  }

  const selectedSingle = !multiple ? (selected as PlayerSearchResult | null) : null
  const triggerLabel = selectedSingle ? selectedSingle.name : 'Select player'

  return (
    <div className="relative flex flex-col gap-2">
      {!multiple ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
          >
            <span className="flex items-center gap-2 min-w-0">
              {selectedSingle ? <Avatar name={selectedSingle.name} url={selectedSingle.avatar_url ?? null} size="xs" /> : null}
              <span className="truncate">{triggerLabel}</span>
            </span>
            <span className="text-xs text-slate-400">{open ? 'Hide' : 'Show'}</span>
          </button>

          {open && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <input
                type="text"
                placeholder="Search friend by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${input} mb-2`}
              />

              {visibleResults.length > 0 ? (
                <ul className="max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/50 p-1">
                  {visibleResults.map((player) => (
                    <li key={player.id}>
                      <button
                        type="button"
                        onClick={() => togglePlayer(player)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition ${
                          isSelected(player.id) ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-200' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Avatar name={player.name} url={player.avatar_url ?? null} size="sm" />
                        <span className="min-w-0 flex-1 truncate">
                          {player.name} <span className="text-slate-400">({player.email})</span>
                        </span>
                        {isSelected(player.id) && <span className="text-xs font-semibold text-teal-700">Selected</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-3 text-xs text-slate-400">No matching players found.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Search friend by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={input}
          />

          {selectedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedPlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => togglePlayer(player)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  <Avatar name={player.name} url={player.avatar_url ?? null} size="xs" />
                  {player.name}
                </button>
              ))}
            </div>
          )}

          {visibleResults.length > 0 && (
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              {visibleResults.map((player) => {
                const checked = isSelected(player.id)
                return (
                  <li key={player.id}>
                    <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePlayer(player)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <Avatar name={player.name} url={player.avatar_url ?? null} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {player.name} <span className="text-slate-400">({player.email})</span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
