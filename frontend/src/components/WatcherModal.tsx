'use client'

import { useState } from 'react'
import type { Hotel } from '@/lib/types'

interface WatcherModalProps {
  isOpen: boolean
  onClose: () => void
  hotels: Hotel[]
}

export function WatcherModal({ isOpen, onClose, hotels }: WatcherModalProps) {
  const [email, setEmail] = useState('')
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [hotelId, setHotelId] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [maxDistance, setMaxDistance] = useState<string>('')
  const [requireSkywalk, setRequireSkywalk] = useState(false)
  const [roomTypePattern, setRoomTypePattern] = useState('')
  const [cooldownMinutes, setCooldownMinutes] = useState('15')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/watchers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email || undefined,
          discord_webhook_url: discordWebhook || undefined,
          hotel_id: hotelId || undefined,
          max_price: maxPrice ? parseFloat(maxPrice) : undefined,
          max_distance: maxDistance ? parseFloat(maxDistance) : undefined,
          require_skywalk: requireSkywalk,
          room_type_pattern: roomTypePattern || undefined,
          cooldown_minutes: parseInt(cooldownMinutes),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create watcher')
      }

      const data = await response.json()

      // Store manage token in localStorage
      const existingTokens = JSON.parse(
        localStorage.getItem('watcher_tokens') || '{}'
      )
      existingTokens[data.id] = data.manage_token
      localStorage.setItem('watcher_tokens', JSON.stringify(existingTokens))

      setSuccess(
        'Watcher created! You will be notified when matching rooms become available.'
      )

      // Reset form
      setEmail('')
      setDiscordWebhook('')
      setHotelId('')
      setMaxPrice('')
      setMaxDistance('')
      setRequireSkywalk(false)
      setRoomTypePattern('')
      setCooldownMinutes('15')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div
          className="fixed inset-0 bg-black opacity-50"
          onClick={onClose}
        ></div>

        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Create Room Watcher
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (for notifications)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discord Webhook URL
              </label>
              <input
                type="url"
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                placeholder="https://discord.com/api/webhooks/..."
              />
            </div>

            <hr className="my-4" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specific Hotel (optional)
              </label>
              <select
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
              >
                <option value="">Any hotel</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Total Price
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                  placeholder="Any"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Distance (blocks)
                </label>
                <input
                  type="number"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                  placeholder="Any"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room Type Keyword
              </label>
              <input
                type="text"
                value={roomTypePattern}
                onChange={(e) => setRoomTypePattern(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                placeholder="e.g., king, suite"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="require-skywalk"
                checked={requireSkywalk}
                onChange={(e) => setRequireSkywalk(e.target.checked)}
                className="w-4 h-4 text-gencon-blue border-gray-300 rounded"
              />
              <label
                htmlFor="require-skywalk"
                className="text-sm text-gray-700"
              >
                Require skywalk access
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cooldown between notifications
              </label>
              <select
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
              >
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (!email && !discordWebhook)}
                className="px-4 py-2 text-sm font-medium text-white bg-gencon-blue rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Watcher'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
