'use client'

import { useState, useEffect } from 'react'
import { AvailabilityChart } from '@/components/AvailabilityChart'
import type { Hotel } from '@/lib/types'

interface HistoryDataPoint {
  timestamp: string
  room_type: string
  available_count: number
  total_price: number
}

export default function HistoryPage() {
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [selectedHotelId, setSelectedHotelId] = useState<string>('')
  const [selectedHotelName, setSelectedHotelName] = useState<string>('')
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([])
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [loading, setLoading] = useState(false)

  // Fetch hotels on mount
  useEffect(() => {
    fetch('/api/hotels')
      .then((res) => res.json())
      .then((data) => {
        const hotelList = data.data || []
        setHotels(hotelList)
        if (hotelList.length > 0) {
          setSelectedHotelId(hotelList[0].id)
          setSelectedHotelName(hotelList[0].name)
        }
      })
      .catch(console.error)
  }, [])

  // Fetch history when hotel or time range changes
  useEffect(() => {
    if (!selectedHotelId) return

    setLoading(true)

    const hours = {
      '24h': 24,
      '7d': 168,
      '30d': 720,
    }[timeRange]

    fetch(`/api/rooms/history?hotel_id=${selectedHotelId}&hours=${hours}`)
      .then((res) => res.json())
      .then((data) => {
        setHistoryData(data.data || [])
        if (data.hotel_name) {
          setSelectedHotelName(data.hotel_name)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedHotelId, timeRange])

  const handleHotelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const hotelId = e.target.value
    setSelectedHotelId(hotelId)
    const hotel = hotels.find((h) => h.id === hotelId)
    if (hotel) {
      setSelectedHotelName(hotel.name)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Availability History
        </h1>
        <p className="mt-2 text-gray-600">
          Track how room availability has changed over time.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Hotel
            </label>
            <select
              value={selectedHotelId}
              onChange={handleHotelChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue"
            >
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Range
            </label>
            <div className="flex space-x-2">
              {(['24h', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    timeRange === range
                      ? 'bg-gencon-blue text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gencon-blue"></div>
          <span className="ml-3 text-gray-600">Loading history...</span>
        </div>
      ) : (
        <AvailabilityChart data={historyData} hotelName={selectedHotelName} />
      )}

      {/* Info */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900">
          Understanding the Chart
        </h3>
        <ul className="mt-4 space-y-2 text-sm text-blue-800">
          <li>
            Each line represents a different room type at the selected hotel.
          </li>
          <li>
            The Y-axis shows the number of rooms available at any given time.
          </li>
          <li>
            Drops in availability often indicate rooms being booked.
          </li>
          <li>
            Sudden increases may indicate cancellations or new block releases.
          </li>
        </ul>
      </div>
    </div>
  )
}
