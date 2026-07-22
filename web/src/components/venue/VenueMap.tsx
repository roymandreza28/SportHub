import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import type { Venue } from '../../lib/venueApi'

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

export function VenueMap({ venues, onSelect }: { venues: Venue[]; onSelect?: (venue: Venue) => void }) {
  const center: [number, number] =
    venues.length > 0 ? [Number(venues[0].latitude), Number(venues[0].longitude)] : [39.78, -89.65]

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
          eventHandlers={onSelect ? { click: () => onSelect(venue) } : undefined}
        >
          <Popup>
            <strong>{venue.name}</strong>
            <br />
            {venue.address}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
