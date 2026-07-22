import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCourt,
  createEquipment,
  deleteCourt,
  deleteEquipment,
  updateCourt,
  type Venue,
} from '../../lib/venueApi'

export function CourtEquipmentManager({ venue }: { venue: Venue }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })

  const [courtName, setCourtName] = useState('')
  const [equipmentName, setEquipmentName] = useState('')
  const [equipmentQty, setEquipmentQty] = useState(1)

  const addCourt = useMutation({
    mutationFn: () => createCourt(venue.id, { name: courtName, type: 'court' }),
    onSuccess: () => {
      setCourtName('')
      invalidate()
    },
  })

  const toggleCourtStatus = useMutation({
    mutationFn: (courtId: number) => {
      const court = venue.courts.find((c) => c.id === courtId)
      const nextStatus = court?.status === 'active' ? 'maintenance' : 'active'
      return updateCourt(courtId, { status: nextStatus })
    },
    onSuccess: invalidate,
  })

  const removeCourt = useMutation({ mutationFn: deleteCourt, onSuccess: invalidate })

  const addEquipment = useMutation({
    mutationFn: () => createEquipment(venue.id, {
      name: equipmentName,
      quantity_total: equipmentQty,
      quantity_available: equipmentQty,
    }),
    onSuccess: () => {
      setEquipmentName('')
      setEquipmentQty(1)
      invalidate()
    },
  })

  const removeEquipment = useMutation({ mutationFn: deleteEquipment, onSuccess: invalidate })

  function handleAddCourt(e: FormEvent) {
    e.preventDefault()
    addCourt.mutate()
  }

  function handleAddEquipment(e: FormEvent) {
    e.preventDefault()
    addEquipment.mutate()
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <h4 className="text-sm font-medium">{venue.name} — courts &amp; equipment</h4>

      <div>
        <ul className="mb-2 flex flex-col gap-1 text-sm">
          {venue.courts.map((court) => (
            <li key={court.id} className="flex items-center justify-between">
              <span>
                {court.name} ({court.status})
              </span>
              <span className="flex gap-2 text-xs">
                <button onClick={() => toggleCourtStatus.mutate(court.id)} className="text-indigo-600">
                  Toggle status
                </button>
                <button onClick={() => removeCourt.mutate(court.id)} className="text-red-600">
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddCourt} className="flex gap-2">
          <input
            type="text"
            placeholder="Court name"
            value={courtName}
            onChange={(e) => setCourtName(e.target.value)}
            className="flex-1 rounded border px-2 py-1 text-sm"
            required
          />
          <button type="submit" className="rounded bg-gray-800 px-2 py-1 text-xs text-white">
            Add court
          </button>
        </form>
      </div>

      <div>
        <ul className="mb-2 flex flex-col gap-1 text-sm">
          {venue.equipment.map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <span>
                {item.name}: {item.quantity_available}/{item.quantity_total}
              </span>
              <button onClick={() => removeEquipment.mutate(item.id)} className="text-xs text-red-600">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddEquipment} className="flex gap-2">
          <input
            type="text"
            placeholder="Equipment name"
            value={equipmentName}
            onChange={(e) => setEquipmentName(e.target.value)}
            className="flex-1 rounded border px-2 py-1 text-sm"
            required
          />
          <input
            type="number"
            min={1}
            value={equipmentQty}
            onChange={(e) => setEquipmentQty(Number(e.target.value))}
            className="w-16 rounded border px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-gray-800 px-2 py-1 text-xs text-white">
            Add
          </button>
        </form>
      </div>
    </div>
  )
}
