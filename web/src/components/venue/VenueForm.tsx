import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createVenue } from '../../lib/venueApi'
import { LocationPicker } from './LocationPicker'

const DEFAULT_LAT = 39.78
const DEFAULT_LNG = -89.65

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded border p-3">
      <h3 className="text-sm font-medium">Add a venue</h3>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        required
      />
      <input
        type="text"
        placeholder="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
        required
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
      <p className="text-xs text-gray-600">Click the map to set the venue location</p>
      <LocationPicker latitude={lat} longitude={lng} onChange={(la, lo) => { setLat(la); setLng(lo) }} />
      <p className="text-xs text-gray-500">
        Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}
      </p>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? 'Creating...' : 'Create venue'}
      </button>
    </form>
  )
}
