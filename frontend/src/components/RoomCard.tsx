'use client'

import type { RoomAvailability } from '@/lib/types'
import {
  getDistanceLabel,
  formatPrice,
  formatDate,
  getRelativeTime,
} from '@/lib/utils'

interface RoomCardProps {
  room: RoomAvailability
}

export function RoomCard({ room }: RoomCardProps) {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {room.hotel_name}
          </h3>
          <p className="text-sm text-gray-600">{room.room_type}</p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            room.has_skywalk
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {getDistanceLabel(
            room.distance_from_icc,
            room.distance_unit,
            room.has_skywalk
          )}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Available</p>
          {room.partial_availability ? (
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                Partial
              </span>
              <p className="text-sm text-gray-600 mt-1">
                {room.nights_available}/{room.total_nights} nights
              </p>
            </div>
          ) : (
            <p
              className={`text-lg font-semibold ${
                room.available_count > 3
                  ? 'text-green-600'
                  : room.available_count > 1
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }`}
            >
              {room.available_count} rooms
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Price</p>
          <p className="text-lg font-semibold text-gray-900">
            {formatPrice(room.total_price)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Per Night</p>
          <p className="text-sm text-gray-700">
            {formatPrice(room.nightly_rate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Dates</p>
          <p className="text-sm text-gray-700">
            {formatDate(room.check_in)} - {formatDate(room.check_out)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Updated {getRelativeTime(room.seconds_ago)}
        </span>
        <a
          href="https://book.passkey.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gencon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gencon-blue"
        >
          Book Now
        </a>
      </div>
    </div>
  )
}

interface RoomCardListProps {
  rooms: RoomAvailability[]
}

export function RoomCardList({ rooms }: RoomCardListProps) {
  if (rooms.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
        <p className="text-lg">No rooms available matching your criteria.</p>
        <p className="text-sm mt-2">
          Try adjusting your filters or check back later.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rooms.map((room) => (
        <RoomCard key={room.snapshot_id} room={room} />
      ))}
    </div>
  )
}
