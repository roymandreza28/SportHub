import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createVenue, fetchSports, type Sport } from '../../lib/venueApi'
import { LocationPicker } from './LocationPicker'
import { buttonPrimary, buttonSecondary, chip, fieldGroup, input, label, textarea } from '../../lib/formStyles'

// Centered on Morong, Rizal — new venues default here until the facilitator
// clicks the map to set the real location.
const DEFAULT_LAT = 14.5192
const DEFAULT_LNG = 121.2331

type CourtDraft = { name: string; sportIds: number[] }
type EquipmentDraft = { name: string; quantity: number }

function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
}

function SportChips({
  sports,
  selected,
  onToggle,
  testId,
}: {
  sports?: Sport[]
  selected: number[]
  onToggle: (id: number) => void
  testId: string
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {sports?.map((s) => (
        <button key={s.id} type="button" className={chip(selected.includes(s.id))} onClick={() => onToggle(s.id)}>
          {s.name}
        </button>
      ))}
    </div>
  )
}

export function VenueForm({ onCreated }: { onCreated?: () => void }) {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [pricePerHour, setPricePerHour] = useState('')
  const [equipment, setEquipment] = useState<EquipmentDraft[]>([])
  const [equipmentName, setEquipmentName] = useState('')
  const [equipmentQty, setEquipmentQty] = useState(1)

  const [courts, setCourts] = useState<CourtDraft[]>([])

  // "Same courts for multiple sports" — e.g. 2 courts that are both Tennis
  // and Pickleball, since pickleball is commonly played on lined tennis
  // courts. Adds N identical court entries in one go.
  const [sharedSportIds, setSharedSportIds] = useState<number[]>([])
  const [sharedCount, setSharedCount] = useState(1)

  // Add one court at a time with its own name and sport(s) — for anything
  // that isn't identical/repeated.
  const [singleName, setSingleName] = useState('')
  const [singleSportIds, setSingleSportIds] = useState<number[]>([])

  const mutation = useMutation({
    mutationFn: createVenue,
    onSuccess: () => {
      setName('')
      setAddress('')
      setDescription('')
      setLat(DEFAULT_LAT)
      setLng(DEFAULT_LNG)
      setOpensAt('')
      setClosesAt('')
      setPricePerHour('')
      setEquipment([])
      setCourts([])
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
      onCreated?.()
    },
  })

  function addSharedCourts() {
    if (sharedSportIds.length === 0) return
    const additions = Array.from({ length: Math.max(1, sharedCount) }, () => ({ name: '', sportIds: sharedSportIds }))
    setCourts((list) => [...list, ...additions])
    setSharedSportIds([])
    setSharedCount(1)
  }

  function addSingleCourt() {
    setCourts((list) => [...list, { name: singleName.trim(), sportIds: singleSportIds }])
    setSingleName('')
    setSingleSportIds([])
  }

  function removeCourt(index: number) {
    setCourts((list) => list.filter((_, i) => i !== index))
  }

  function addEquipment() {
    if (!equipmentName.trim()) return
    setEquipment((list) => [...list, { name: equipmentName.trim(), quantity: equipmentQty }])
    setEquipmentName('')
    setEquipmentQty(1)
  }

  function removeEquipment(index: number) {
    setEquipment((list) => list.filter((_, i) => i !== index))
  }

  function sportNames(ids: number[]): string {
    return ids.map((id) => sports?.find((s) => s.id === id)?.name ?? '?').join(', ')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({
      name,
      address,
      latitude: lat,
      longitude: lng,
      description: description || undefined,
      courts: courts.length ? courts.map((c) => ({ name: c.name || undefined, sport_ids: c.sportIds })) : undefined,
      equipment: equipment.length ? equipment : undefined,
      opens_at: opensAt || undefined,
      closes_at: closesAt || undefined,
      price_per_hour: pricePerHour ? Number(pricePerHour) : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label} htmlFor="venue-name">Name</label>
          <input
            id="venue-name"
            type="text"
            placeholder="e.g. Morong Gymnasium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
            required
          />
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="venue-address">Address / Location</label>
          <input
            id="venue-address"
            type="text"
            placeholder="Barangay, Morong, Rizal"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={input}
            required
          />
        </div>
      </div>

      <div className={fieldGroup}>
        <label className={label} htmlFor="venue-description">Description (optional)</label>
        <textarea
          id="venue-description"
          placeholder="What's here — courts, fields, amenities..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={textarea}
          rows={2}
        />
      </div>

      <div className={fieldGroup}>
        <label className={label}>Courts (optional)</label>
        <p className="text-xs text-slate-500">
          Add courts one at a time, or add several at once that share the same sport(s) — e.g. 2 courts that are
          both Tennis and Pickleball.
        </p>

        {courts.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
            {courts.map((court, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-slate-700">
                  {court.name || `Court ${i + 1}`}
                  {court.sportIds.length > 0 && (
                    <span className="text-slate-400"> — {sportNames(court.sportIds)}</span>
                  )}
                </span>
                <button type="button" onClick={() => removeCourt(i)} className="text-xs font-medium text-red-600 hover:text-red-700">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-600">Add multiple courts that share sports</p>
            <SportChips
              sports={sports}
              selected={sharedSportIds}
              onToggle={(id) => setSharedSportIds((ids) => toggleId(ids, id))}
              testId="shared-court-sports"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500" htmlFor="shared-court-count">Number of courts</label>
              <input
                id="shared-court-count"
                type="number"
                min={1}
                max={20}
                value={sharedCount}
                onChange={(e) => setSharedCount(Number(e.target.value))}
                className={`${input} w-20`}
              />
              <button
                type="button"
                onClick={addSharedCourts}
                disabled={sharedSportIds.length === 0}
                className={`${buttonSecondary} ml-auto`}
              >
                + Add {sharedCount} shared court{sharedCount > 1 ? 's' : ''}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <p className="text-xs font-semibold text-slate-600">Add a single court</p>
            <input
              type="text"
              placeholder="Court name (optional)"
              value={singleName}
              onChange={(e) => setSingleName(e.target.value)}
              className={input}
            />
            <SportChips
              sports={sports}
              selected={singleSportIds}
              onToggle={(id) => setSingleSportIds((ids) => toggleId(ids, id))}
              testId="single-court-sports"
            />
            <button type="button" onClick={addSingleCourt} className={`${buttonSecondary} self-start`}>
              + Add court
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label} htmlFor="venue-opens-at">Opens at (optional)</label>
          <input
            id="venue-opens-at"
            type="time"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className={input}
          />
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="venue-closes-at">Closes at (optional)</label>
          <input
            id="venue-closes-at"
            type="time"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className={input}
          />
        </div>
        {(opensAt || closesAt) && !(opensAt && closesAt) && (
          <p className="text-xs text-amber-600 sm:col-span-2">Set both times, or leave both blank for no fixed hours.</p>
        )}
      </div>

      <div className={fieldGroup}>
        <label className={label} htmlFor="venue-price-per-hour">Price per hour (optional)</label>
        <input
          id="venue-price-per-hour"
          type="number"
          min={0}
          step="0.01"
          placeholder="e.g. 300"
          value={pricePerHour}
          onChange={(e) => setPricePerHour(e.target.value)}
          className={`${input} max-w-xs`}
        />
      </div>

      <div className={fieldGroup}>
        <label className={label}>Equipment available (optional)</label>
        {equipment.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
            {equipment.map((item, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-slate-700">
                  {item.name} <span className="text-slate-400">&times;{item.quantity}</span>
                </span>
                <button type="button" onClick={() => removeEquipment(i)} className="text-xs font-medium text-red-600 hover:text-red-700">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Equipment name"
            value={equipmentName}
            onChange={(e) => setEquipmentName(e.target.value)}
            className={`${input} flex-1`}
          />
          <input
            type="number"
            min={1}
            value={equipmentQty}
            onChange={(e) => setEquipmentQty(Number(e.target.value))}
            className={`${input} w-20`}
          />
          <button type="button" onClick={addEquipment} className={buttonSecondary}>
            + Add
          </button>
        </div>
      </div>

      <div className={fieldGroup}>
        <label className={label}>Pin location on map</label>
        <p className="text-xs text-slate-500">Click the map to set the venue's exact location.</p>
        <LocationPicker latitude={lat} longitude={lng} onChange={(la, lo) => { setLat(la); setLng(lo) }} />
        <p className="text-xs text-slate-400">
          Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}
        </p>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || Boolean(opensAt) !== Boolean(closesAt)}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Creating...' : 'Create venue'}
      </button>
    </form>
  )
}
