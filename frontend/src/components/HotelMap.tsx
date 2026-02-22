'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { RoomAvailability } from '@/lib/types'
import { getDistanceLabel, formatPrice } from '@/lib/utils'

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)

interface HotelMapProps {
  rooms: RoomAvailability[]
}

// Group rooms by hotel for the map
interface HotelMarkerData {
  hotel_id: string
  hotel_name: string
  latitude: number
  longitude: number
  has_skywalk: boolean
  distance_from_icc: number | null
  distance_unit: number
  rooms: RoomAvailability[]
  total_available: number
  min_price: number | null
}

export function HotelMap({ rooms }: HotelMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Group rooms by hotel
  const hotelMap = new Map<string, HotelMarkerData>()

  for (const room of rooms) {
    if (room.latitude && room.longitude) {
      const existing = hotelMap.get(room.hotel_id)
      if (existing) {
        existing.rooms.push(room)
        existing.total_available += room.available_count
        if (
          room.total_price &&
          (existing.min_price === null || room.total_price < existing.min_price)
        ) {
          existing.min_price = room.total_price
        }
      } else {
        hotelMap.set(room.hotel_id, {
          hotel_id: room.hotel_id,
          hotel_name: room.hotel_name,
          latitude: room.latitude,
          longitude: room.longitude,
          has_skywalk: room.has_skywalk,
          distance_from_icc: room.distance_from_icc,
          distance_unit: room.distance_unit,
          rooms: [room],
          total_available: room.available_count,
          min_price: room.total_price,
        })
      }
    }
  }

  const hotels = Array.from(hotelMap.values())

  // ICC center coordinates
  const center: [number, number] = [39.7637, -86.1603]

  if (!mounted) {
    return (
      <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center">
        <p className="text-gray-500">Loading map...</p>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="h-96">
        <MapContainer
          center={center}
          zoom={15}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {hotels.map((hotel) => (
            <HotelMarker key={hotel.hotel_id} hotel={hotel} />
          ))}
        </MapContainer>
      </div>

      <div className="p-4 border-t">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            <span>Skywalk Connected</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            <span>Rooms Available</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HotelMarker({ hotel }: { hotel: HotelMarkerData }) {
  const [icon, setIcon] = useState<L.Icon | null>(null)

  useEffect(() => {
    // Import Leaflet dynamically
    import('leaflet').then((L) => {
      // Fix for default marker icons in Next.js
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      // Create custom icon based on hotel status
      const iconHtml = `
        <div style="
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background-color: ${hotel.has_skywalk ? '#10b981' : '#3b82f6'};
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 12px;
        ">
          ${hotel.total_available}
        </div>
      `

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      })

      setIcon(customIcon)
    })
  }, [hotel.has_skywalk, hotel.total_available])

  if (!icon) return null

  return (
    <Marker position={[hotel.latitude, hotel.longitude]} icon={icon}>
      <Popup>
        <div className="min-w-48">
          <h3 className="font-semibold text-gray-900">{hotel.hotel_name}</h3>
          <p className="text-sm text-gray-600">
            {getDistanceLabel(
              hotel.distance_from_icc,
              hotel.distance_unit,
              hotel.has_skywalk
            )}
          </p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              <span className="font-medium">{hotel.total_available}</span> rooms
              available
            </p>
            {hotel.min_price && (
              <p className="text-sm">
                From{' '}
                <span className="font-medium">
                  {formatPrice(hotel.min_price)}
                </span>
              </p>
            )}
          </div>
          <a
            href="https://book.passkey.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block px-3 py-1 bg-gencon-blue text-white text-sm rounded hover:bg-blue-700"
          >
            Book Now
          </a>
        </div>
      </Popup>
    </Marker>
  )
}
