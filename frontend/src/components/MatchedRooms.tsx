'use client'

import type { AlertMatch } from '@/lib/types'
import { buildHotelBookingUrl } from '@/lib/utils'

interface MatchedRoomsProps {
  matches: AlertMatch[]
  onDismiss: (alertId: string, snapshotId: string) => void
  onClearAll: () => void
  bookingUrl?: string
}

export function MatchedRooms({ matches, onDismiss, onClearAll, bookingUrl }: MatchedRoomsProps) {
  if (matches.length === 0) return null

  // Group matches by alert
  const groupedMatches = matches.reduce((acc, match) => {
    if (!acc[match.alertId]) {
      acc[match.alertId] = {
        alertName: match.alertName,
        matches: [],
      }
    }
    acc[match.alertId].matches.push(match)
    return acc
  }, {} as Record<string, { alertName: string; matches: AlertMatch[] }>)

  return (
    <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-4 shadow-lg animate-pulse-once">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-bold text-green-800">
            Alert Matches Found! ({matches.length})
          </h3>
        </div>
        <button
          onClick={onClearAll}
          className="text-sm text-green-700 hover:text-green-900 underline"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedMatches).map(([alertId, group]) => (
          <div key={alertId}>
            <h4 className="text-sm font-semibold text-green-700 mb-2">
              {group.alertName}
            </h4>
            <div className="grid gap-2">
              {group.matches.map((match) => (
                <div
                  key={`${match.alertId}-${match.room.snapshot_id}`}
                  className="bg-white rounded-md p-3 shadow-sm border border-green-200 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {match.room.hotel_name}
                      </span>
                      {match.room.has_skywalk && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                          Skywalk
                        </span>
                      )}
                      {match.room.partial_availability && (
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                          {match.room.nights_available}/{match.room.total_nights} nights
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      <span>{match.room.room_type}</span>
                      <span className="mx-2">|</span>
                      <span className="font-semibold text-green-700">
                        ${match.room.nightly_rate?.toFixed(0) ?? 'N/A'}/night
                      </span>
                      <span className="mx-2">|</span>
                      <span>{match.room.distance_from_icc} blocks</span>
                      <span className="mx-2">|</span>
                      <span>{match.room.available_count} available</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {(() => {
                      const hotelUrl = buildHotelBookingUrl(bookingUrl, match.room.hotel_name)
                      return hotelUrl ? (
                        <a
                          href={hotelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
                        >
                          Book Now
                        </a>
                      ) : (
                        <span
                          className="px-3 py-1.5 bg-gray-200 text-gray-400 text-sm font-medium rounded cursor-not-allowed"
                          title="Add your Passkey URL to enable booking"
                        >
                          Book Now
                        </span>
                      )
                    })()}
                    <button
                      onClick={() => onDismiss(match.alertId, match.room.snapshot_id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      title="Dismiss"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
