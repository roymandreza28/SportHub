import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L, { type LeafletMouseEvent } from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { formatPeso, type Venue } from '../../lib/venueApi'

// Optional fields so VenueMap still works for a caller with only the bare
// minimum (id/name/address/lat/lng) — but both real call sites
// (VenueDirectory.tsx, FacilitatorPage.tsx) already fetch full Venue
// objects, so the richer card below renders in practice everywhere this
// is actually used.
type MappableVenue = {
  id: number
  name: string
  address: string
  latitude: string
  longitude: string
  description?: string | null
  price_per_hour?: string | null
  opens_at?: string | null
  closes_at?: string | null
  courts?: { sports: { id: number; name: string }[] }[]
  media?: { id: number; url: string }[]
}

// Vite doesn't resolve Leaflet's default marker image paths automatically — wire them explicitly.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function VenuePopupCard({ venue }: { venue: MappableVenue }) {
  const sportNames = Array.from(new Set((venue.courts ?? []).flatMap((c) => c.sports.map((s) => s.name))))
  const photos = venue.media ?? []

  return (
    <div className="w-56">
      {photos.length > 0 && (
        <div className="-mx-3 -mt-3 mb-2 flex gap-0.5 overflow-hidden">
          {photos.slice(0, 3).map((photo, i) => (
            <img
              key={photo.id}
              src={photo.url}
              alt=""
              className={`h-24 flex-1 object-cover ${i === 0 && photos.length === 1 ? 'w-full' : ''}`}
            />
          ))}
        </div>
      )}

      <p className="font-semibold text-slate-900">{venue.name}</p>
      <p className="text-xs text-slate-500">{venue.address}</p>

      {sportNames.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {sportNames.map((sport) => (
            <span key={sport} className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
              {sport}
            </span>
          ))}
        </div>
      )}

      {(venue.price_per_hour || (venue.opens_at && venue.closes_at)) && (
        <p className="mt-1.5 text-xs text-slate-600">
          {venue.price_per_hour && <>{formatPeso(Number(venue.price_per_hour))}/hr</>}
          {venue.price_per_hour && venue.opens_at && venue.closes_at && ' — '}
          {venue.opens_at && venue.closes_at && `${venue.opens_at.slice(0, 5)}–${venue.closes_at.slice(0, 5)}`}
        </p>
      )}

      {venue.description && <p className="mt-1.5 line-clamp-3 text-xs text-slate-500">{venue.description}</p>}
    </div>
  )
}

export function VenueMap<T extends MappableVenue = Venue>({ venues, onSelect }: { venues: T[]; onSelect?: (venue: T) => void }) {
  // Falls back to Binangonan, Rizal when there are no venues yet.
  const center: [number, number] =
    venues.length > 0 ? [Number(venues[0].latitude), Number(venues[0].longitude)] : [14.4651, 121.1921]

  return (
    <MapContainer center={center} zoom={12} className="h-80 w-full rounded" scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {venues.map((venue) => (
        <Marker
          key={venue.id}
          position={[Number(venue.latitude), Number(venue.longitude)]}
          icon={defaultIcon}
          eventHandlers={{
            click: () => onSelect?.(venue),
            // Hovering the pin previews the venue without needing a click —
            // e.target is the marker itself (Leaflet's own event shape),
            // so this needs no separate ref to call openPopup/closePopup on.
            mouseover: (e: LeafletMouseEvent) => e.target.openPopup(),
            mouseout: (e: LeafletMouseEvent) => e.target.closePopup(),
          }}
        >
          <Popup minWidth={224} maxWidth={224}>
            <VenuePopupCard venue={venue} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
