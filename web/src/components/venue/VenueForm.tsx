import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createVenue } from '../../lib/venueApi'
import { LocationPicker } from './LocationPicker'
import { buttonPrimary, fieldGroup, input, label, textarea } from '../../lib/formStyles'

// Centered on Morong, Rizal — new venues default here until the facilitator
// clicks the map to set the real location.
const DEFAULT_LAT = 14.5192
const DEFAULT_LNG = 121.2331

export function VenueForm() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)

  const mutation = useMutation({
    mutationFn: createVenue,
    onSuccess: () => {
      setName('')
      setAddress('')
      setDescription('')
      setLat(DEFAULT_LAT)
      setLng(DEFAULT_LNG)
      queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({ name, address, latitude: lat, longitude: lng, description: description || undefined })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-800">Add a venue</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label} htmlFor="venue-name">Name</label>
          <input
            id="venue-name"
            type="text"
            placeholder="e.g. Morong Sports Complex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
            required
          />
        </div>
        <div className={fieldGroup}>
          <label className={label} htmlFor="venue-address">Address</label>
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
        <label className={label}>Location</label>
        <p className="text-xs text-slate-500">Click the map to set the venue location.</p>
        <LocationPicker latitude={lat} longitude={lng} onChange={(la, lo) => { setLat(la); setLng(lo) }} />
        <p className="text-xs text-slate-400">
          Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}
        </p>
      </div>

      <button type="submit" disabled={mutation.isPending} className={`${buttonPrimary} self-start`}>
        {mutation.isPending ? 'Creating...' : 'Create venue'}
      </button>
    </form>
  )
}
