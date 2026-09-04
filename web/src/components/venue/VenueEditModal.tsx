import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVenue, type Venue } from '../../lib/venueApi'
import { LocationPicker } from './LocationPicker'
import { CourtEquipmentManager } from './CourtEquipmentManager'
import { buttonGhost, buttonPrimary, buttonSecondary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

export function VenueEditModal({ venue, onClose }: { venue: Venue; onClose: () => void }) {
  const queryClient = useQueryClient()

  const [name, setName] = useState(venue.name)
  const [address, setAddress] = useState(venue.address)
  const [description, setDescription] = useState(venue.description ?? '')
  const [lat, setLat] = useState(Number(venue.latitude))
  const [lng, setLng] = useState(Number(venue.longitude))
  const [opensAt, setOpensAt] = useState(venue.opens_at?.slice(0, 5) ?? '')
  const [closesAt, setClosesAt] = useState(venue.closes_at?.slice(0, 5) ?? '')
  const [pricePerHour, setPricePerHour] = useState(venue.price_per_hour ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateVenue(venue.id, {
        name,
        address,
        latitude: lat,
        longitude: lng,
        description: description || undefined,
        opens_at: opensAt || undefined,
        closes_at: closesAt || undefined,
        price_per_hour: pricePerHour ? Number(pricePerHour) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
      onClose()
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }

  const hoursMismatched = Boolean(opensAt) !== Boolean(closesAt)

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4" data-testid="edit-venue-modal">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Edit {venue.name}</h3>
          <button onClick={onClose} className={buttonGhost}>
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldGroup}>
                <label className={label} htmlFor="edit-venue-name">Name</label>
                <input
                  id="edit-venue-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={input}
                  required
                />
              </div>
              <div className={fieldGroup}>
                <label className={label} htmlFor="edit-venue-address">Address / Location</label>
                <input
                  id="edit-venue-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={input}
                  required
                />
              </div>
            </div>

            <div className={fieldGroup}>
              <label className={label} htmlFor="edit-venue-description">Description (optional)</label>
              <textarea
                id="edit-venue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={textarea}
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldGroup}>
                <label className={label} htmlFor="edit-venue-opens-at">Opens at (optional)</label>
                <input
                  id="edit-venue-opens-at"
                  type="time"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                  className={input}
                />
              </div>
              <div className={fieldGroup}>
                <label className={label} htmlFor="edit-venue-closes-at">Closes at (optional)</label>
                <input
                  id="edit-venue-closes-at"
                  type="time"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className={input}
                />
              </div>
              {hoursMismatched && (
                <p className="text-xs text-amber-600 sm:col-span-2">Set both times, or leave both blank for no fixed hours.</p>
              )}
            </div>

            <div className={fieldGroup}>
              <label className={label} htmlFor="edit-venue-price-per-hour">Price per hour (optional)</label>
              <input
                id="edit-venue-price-per-hour"
                type="number"
                min={0}
                step="0.01"
                value={pricePerHour}
                onChange={(e) => setPricePerHour(e.target.value)}
                className={`${input} max-w-xs`}
              />
            </div>

            <div className={fieldGroup}>
              <label className={label}>Pin location on map</label>
              <LocationPicker latitude={lat} longitude={lng} onChange={(la, lo) => { setLat(la); setLng(lo) }} />
              <p className="text-xs text-slate-400">
                Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={buttonSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={mutation.isPending || hoursMismatched} className={buttonPrimary}>
                {mutation.isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <CourtEquipmentManager venue={venue} />
          </div>
        </div>
      </div>
    </div>
  )
}
