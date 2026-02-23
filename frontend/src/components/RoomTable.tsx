'use client'

import type { RoomAvailability } from '@/lib/types'
import { getDistanceLabel, formatPrice, buildHotelBookingUrl } from '@/lib/utils'

interface RoomTableProps {
  rooms: RoomAvailability[]
  bookingUrl?: string
}

export function RoomTable({ rooms, bookingUrl }: RoomTableProps) {
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
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Distance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hotel
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Room Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Available
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Per Night
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rooms.map((room) => (
              <tr key={room.snapshot_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
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
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {room.hotel_name}
                  </div>
                  {room.address && (
                    <div className="text-xs text-gray-500">{room.address}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {room.room_type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {room.partial_availability ? (
                    <span className="inline-flex flex-col items-start">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Partial
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        {room.nights_available}/{room.total_nights} nights
                      </span>
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        room.available_count > 3
                          ? 'bg-green-100 text-green-800'
                          : room.available_count > 1
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {room.available_count}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatPrice(room.nightly_rate)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {(() => {
                    const hotelUrl = buildHotelBookingUrl(bookingUrl, room.hotel_name)
                    return hotelUrl ? (
                      <a
                        href={hotelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gencon-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gencon-blue"
                      >
                        Book Now
                      </a>
                    ) : (
                      <span
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-400 bg-gray-100 cursor-not-allowed"
                        title="Add your Passkey URL above to enable booking"
                      >
                        Book Now
                      </span>
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
