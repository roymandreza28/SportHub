import { api } from './api'

export type Sport = { id: number; name: string; category: string | null }

export type Court = {
  id: number
  venue_id: number
  name: string
  // A court can support more than one sport (e.g. a tennis court also lined
  // for pickleball), so this is a list rather than a single sport.
  sports: Sport[]
  type: 'court' | 'field' | 'pool'
  capacity: number | null
  status: 'active' | 'maintenance'
  // Set only for a court sold as a fixed-length, fixed-price package
  // instead of the venue's flat price_per_hour (e.g. BRCC's badminton
  // gymnasium: ₱1,500 for an exact 3-hour block, no hourly rate at all).
  // When set, a booking's duration must be an exact multiple of
  // block_hours — enforced server-side in VenueRegistrationController.
  block_hours: number | null
  block_price: string | null
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
  opens_at: string | null
  closes_at: string | null
  price_per_hour: string | null
  status: 'active' | 'inactive'
  courts: Court[]
  equipment: Equipment[]
  facilitator?: { id: number; name: string; email: string }
  // Only present on the facilitator's own /venues/mine listing.
  venue_registrations_count?: number
  pending_bookings_count?: number
}

export type ScheduleEvent = {
  id: number
  title: string
  start: string
  end: string
  resourceId: number | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  purpose: string | null
  // Null for a facilitator-entered walk-in booking — see walk_in_name/is_walk_in below.
  user: { id: number; name: string; email: string } | null
  walk_in_name: string | null
  is_walk_in: boolean
  // Present the instant the booking is requested, not only once approved —
  // see MyVenueRegistration in playerApi.ts.
  conversation_id: number | null
}

// Mirrors the backend's VenueBookingService::calculateTotalAmount() — a
// block-priced court (e.g. BRCC's badminton gymnasium: ₱1,500 for an exact
// 3-hour block, no hourly rate at all) takes priority over the venue's flat
// price_per_hour whenever one applies; `court` is optional since most
// call sites (matchmaking, before a court is resolved) don't always have
// one in hand. Null whenever neither rate is published, rather than
// silently treating an unpublished rate as free.
export function calculateVenueRent(
  venue: Venue,
  startsAtIso: string,
  endsAtIso: string,
  court?: Court | null
): number | null {
  const hours = (new Date(endsAtIso).getTime() - new Date(startsAtIso).getTime()) / (1000 * 60 * 60)
  if (!Number.isFinite(hours) || hours <= 0) return null

  if (court?.block_hours && court.block_price !== null) {
    return (hours / court.block_hours) * Number(court.block_price)
  }

  if (!venue.price_per_hour) return null

  return Number(venue.price_per_hour) * hours
}

// A block-priced court (see calculateVenueRent above) only has a valid price
// for a duration that's an exact multiple of its block length — mirrors the
// same epsilon-guarded modulo check VenueRegistrationController::store()
// enforces server-side. Always true for a court with no block pricing.
export function isDurationValidForCourt(court: Court | null | undefined, hours: number): boolean {
  if (!court?.block_hours) return true

  const remainder = Math.round((hours % court.block_hours) * 10000) / 10000
  return remainder < 0.001 || remainder > court.block_hours - 0.001
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export async function fetchVenues(sportId?: number) {
  const { data } = await api.get<Venue[]>('/api/venues', { params: sportId ? { sport_id: sportId } : undefined })
  return data
}

export async function fetchMyVenues() {
  const { data } = await api.get<Venue[]>('/api/venues/mine')
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
  courts?: { name?: string; sport_ids: number[] }[]
  equipment?: { name: string; quantity: number }[]
  opens_at?: string
  closes_at?: string
  price_per_hour?: number
}) {
  const { data } = await api.post<Venue>('/api/venues', input)
  return data
}

export async function updateVenue(
  id: number,
  input: Partial<{
    name: string
    address: string
    latitude: number
    longitude: number
    description: string
    opens_at: string
    closes_at: string
    price_per_hour: number
    status: 'active' | 'inactive'
  }>
) {
  const { data } = await api.patch<Venue>(`/api/venues/${id}`, input)
  return data
}

export async function deleteVenue(id: number) {
  await api.delete(`/api/venues/${id}`)
}

export async function createCourt(
  venueId: number,
  input: { name: string; sport_ids?: number[]; type: 'court' | 'field' | 'pool'; capacity?: number }
) {
  const { data } = await api.post<Court>(`/api/venues/${venueId}/courts`, input)
  return data
}

export async function updateCourt(
  id: number,
  input: Partial<{ name: string; status: 'active' | 'maintenance'; sport_ids: number[] }>
) {
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

export async function createManualBooking(
  venueId: number,
  input: {
    court_id?: number
    starts_at: string
    ends_at: string
    walk_in_name: string
    walk_in_contact?: string
    purpose?: string
  }
) {
  const { data } = await api.post(`/api/venues/${venueId}/registrations/manual`, input)
  return data
}

export async function fetchSports() {
  const { data } = await api.get<Sport[]>('/api/sports')
  return data
}

export type SportFormat = { id: number; sport_id: number; name: string; players_per_side: number }

export async function fetchSportFormats(sportId?: number) {
  const { data } = await api.get<SportFormat[]>('/api/sport-formats', { params: sportId ? { sport_id: sportId } : undefined })
  return data
}

export type AvailabilityEvent = { id: number; title: string; start: string; end: string; resourceId: number | null }

export async function fetchVenueAvailability(venueId: number) {
  const { data } = await api.get<AvailabilityEvent[]>(`/api/venues/${venueId}/availability`)
  return data
}
