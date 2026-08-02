import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCourt,
  createEquipment,
  deleteCourt,
  deleteEquipment,
  fetchSports,
  updateCourt,
  type Venue,
} from '../../lib/venueApi'
import { buttonGhost, buttonSecondary, card, chip, input } from '../../lib/formStyles'

export function CourtEquipmentManager({ venue }: { venue: Venue }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })

  const [courtName, setCourtName] = useState('')
  const [courtSportIds, setCourtSportIds] = useState<number[]>([])
  const [equipmentName, setEquipmentName] = useState('')
  const [equipmentQty, setEquipmentQty] = useState(1)

  const addCourt = useMutation({
    mutationFn: () => createCourt(venue.id, { name: courtName, type: 'court', sport_ids: courtSportIds }),
    onSuccess: () => {
      setCourtName('')
      setCourtSportIds([])
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

  function toggleCourtSport(id: number) {
    setCourtSportIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))
  }

  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-sm font-semibold text-slate-800">{venue.name} — courts &amp; equipment</h4>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Courts</p>
          <ul className="flex flex-col gap-1.5">
            {venue.courts.map((court) => (
              <li key={court.id} className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">
                    {court.name}{' '}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        court.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {court.status}
                    </span>
                  </span>
                  <span className="flex gap-3 text-xs">
                    <button onClick={() => toggleCourtStatus.mutate(court.id)} className={buttonGhost}>
                      Toggle
                    </button>
                    <button onClick={() => removeCourt.mutate(court.id)} className="font-medium text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  </span>
                </div>
                {court.sports.length > 0 && (
                  <span className="text-xs text-slate-400">{court.sports.map((s) => s.name).join(', ')}</span>
                )}
              </li>
            ))}
            {venue.courts.length === 0 && <p className="text-sm text-slate-400">No courts yet.</p>}
          </ul>
          <form onSubmit={handleAddCourt} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Court name"
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
                className={`${input} flex-1`}
                required
              />
              <button type="submit" className={buttonSecondary}>
                Add
              </button>
            </div>
            {/* A court can support more than one sport — e.g. a tennis court
                also lined for pickleball — so this is a multi-select. */}
            <div className="flex flex-wrap gap-1.5">
              {sports?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={chip(courtSportIds.includes(s.id))}
                  onClick={() => toggleCourtSport(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </form>
        </div>

        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment</p>
          <ul className="flex flex-col gap-1.5">
            {venue.equipment.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span className="font-medium text-slate-800">
                  {item.name}{' '}
                  <span className="ml-1 font-normal text-slate-500">
                    {item.quantity_available}/{item.quantity_total} available
                  </span>
                </span>
                <button onClick={() => removeEquipment.mutate(item.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                  Remove
                </button>
              </li>
            ))}
            {venue.equipment.length === 0 && <p className="text-sm text-slate-400">No equipment yet.</p>}
          </ul>
          <form onSubmit={handleAddEquipment} className="flex gap-2">
            <input
              type="text"
              placeholder="Equipment name"
              value={equipmentName}
              onChange={(e) => setEquipmentName(e.target.value)}
              className={`${input} flex-1`}
              required
            />
            <input
              type="number"
              min={1}
              value={equipmentQty}
              onChange={(e) => setEquipmentQty(Number(e.target.value))}
              className={`${input} w-20`}
            />
            <button type="submit" className={buttonSecondary}>
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
