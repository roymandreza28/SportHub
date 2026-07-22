import { api } from './api'

export type Sport = { id: number; name: string; category: string | null }

export type Court = {
  id: number
  venue_id: number
  name: string
  sport_id: number | null
  sport: Sport | null
  type: 'court' | 'field' | 'pool'
  capacity: number | null
  status: 'active' | 'maintenance'
}

export type Equipment = {
  id: number
  venue_id: number
  name: string
  quantity_total: number
  quantity_available: number
}

export type Venue = {
  id: number
  facilitator_id: number
  name: string
  address: string
  latitude: string
  longitude: string
  description: string | null
  amenities: string[] | null
  courts: Court[]
  equipment: Equipment[]
  facilitator?: { id: number; name: string; email: string }
}

export type ScheduleEvent = {
  id: number
  title: string
  start: string
  end: string
  resourceId: number | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  purpose: string | null
  user: { id: number; name: string; email: string }
}

export async function fetchVenues() {
  const { data } = await api.get<Venue[]>('/api/venues')
  return data
}

export async function fetchVenue(id: number) {
  const { data } = await api.get<Venue>(`/api/venues/${id}`)
  return data
}

export async function createVenue(input: {
  name: string
  address: string
  latitude: number
  longitude: number
  description?: string
}) {
  const { data } = await api.post<Venue>('/api/venues', input)
  return data
}

export async function updateVenue(id: number, input: Partial<{ name: string; address: string; description: string }>) {
  const { data } = await api.patch<Venue>(`/api/venues/${id}`, input)
  return data
}

export async function deleteVenue(id: number) {
  await api.delete(`/api/venues/${id}`)
}

export async function createCourt(
  venueId: number,
  input: { name: string; sport_id?: number | null; type: 'court' | 'field' | 'pool'; capacity?: number }
) {
  const { data } = await api.post<Court>(`/api/venues/${venueId}/courts`, input)
  return data
}

export async function updateCourt(id: number, input: Partial<{ name: string; status: 'active' | 'maintenance' }>) {
  const { data } = await api.patch<Court>(`/api/courts/${id}`, input)
  return data
}

export async function deleteCourt(id: number) {
  await api.delete(`/api/courts/${id}`)
}

export async function createEquipment(
  venueId: number,
  input: { name: string; quantity_total: number; quantity_available: number }
) {
  const { data } = await api.post<Equipment>(`/api/venues/${venueId}/equipment`, input)
  return data
}

export async function updateEquipment(id: number, input: Partial<{ quantity_available: number }>) {
  const { data } = await api.patch<Equipment>(`/api/equipment/${id}`, input)
  return data
}

export async function deleteEquipment(id: number) {
  await api.delete(`/api/equipment/${id}`)
}

export async function fetchVenueSchedule(venueId: number) {
  const { data } = await api.get<ScheduleEvent[]>(`/api/venues/${venueId}/schedule`)
  return data
}

export async function updateVenueRegistration(id: number, status: 'approved' | 'rejected') {
  const { data } = await api.patch(`/api/venue-registrations/${id}`, { status })
  return data
}

export async function fetchSports() {
  const { data } = await api.get<Sport[]>('/api/sports')
  return data
}
