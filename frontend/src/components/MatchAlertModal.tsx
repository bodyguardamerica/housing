'use client'

import type { AlertMatch } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

interface MatchAlertModalProps {
  matches: AlertMatch[]
  onClose: () => void
  bookingUrl?: string
}

export function MatchAlertModal({ matches, onClose, bookingUrl }: MatchAlertModalProps) {
  if (matches.length === 0) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop with pulsing animation */}
      <div
        className="absolute inset-0 bg-black/80 animate-pulse-slow"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Header with attention-grabbing style */}
        <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="animate-bounce">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {matches.length === 1 ? 'Room Found!' : `${matches.length} Rooms Found!`}
                </h2>
                <p className="text-green-100 text-sm">
                  Your alert criteria matched {matches.length === 1 ? 'a room' : 'rooms'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Room list */}
        <div className="bg-white rounded-b-xl overflow-y-auto max-h-[60vh]">
          <div className="divide-y divide-gray-200">
            {matches.map((match, index) => (
              <div
                key={`${match.alertId}-${match.room.snapshot_id}`}
                className={`p-4 ${index === 0 ? 'bg-green-50' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Alert name badge */}
                    <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded mb-2">
                      {match.alertName}
                    </span>

                    {/* Hotel name */}
                    <h3 className="text-lg font-bold text-gray-900">
                      {match.room.hotel_name}
                    </h3>

                    {/* Room type */}
                    <p className="text-gray-600">{match.room.room_type}</p>

                    {/* Details row */}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                      {/* Price */}
                      <span className="font-bold text-green-700 text-lg">
                        {formatPrice(match.room.total_price)}
                      </span>

                      {/* Distance */}
                      <span className="text-gray-600">
                        {match.room.distance_from_icc} blocks
                      </span>

                      {/* Skywalk badge */}
                      {match.room.has_skywalk && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                          Skywalk
                        </span>
                      )}

                      {/* Available count */}
                      <span className="text-gray-600">
                        {match.room.available_count} available
                      </span>
                    </div>
                  </div>

                  {/* Book Now button */}
                  <div className="ml-4 flex-shrink-0">
                    {bookingUrl ? (
                      <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        Book Now
                        <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <span
                        className="inline-flex items-center px-6 py-3 bg-gray-200 text-gray-400 font-bold rounded-lg cursor-not-allowed"
                        title="Add your Passkey URL to enable booking"
                      >
                        Book Now
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-6 py-4 rounded-b-xl border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.8;
          }
          50% {
            opacity: 0.9;
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
