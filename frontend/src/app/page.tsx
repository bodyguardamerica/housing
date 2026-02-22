'use client'

import { useState, useEffect } from 'react'
import { useRooms } from '@/hooks/useRooms'
import { StatusBar } from '@/components/StatusBar'
import { FilterBar } from '@/components/FilterBar'
import { RoomTable } from '@/components/RoomTable'
import { RoomCardList } from '@/components/RoomCard'
// import { HotelMap } from '@/components/HotelMap'  // Disabled for now
import { WatcherModal } from '@/components/WatcherModal'
import { WatcherList } from '@/components/WatcherList'
import type { RoomFilters, Hotel } from '@/lib/types'

export default function DashboardPage() {
  const [filters, setFilters] = useState<RoomFilters>({})
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [watcherModalOpen, setWatcherModalOpen] = useState(false)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [watcherRefreshKey, setWatcherRefreshKey] = useState(0)

  const { rooms, meta, loading, error } = useRooms(filters)

  // Fetch hotels for the watcher modal
  useEffect(() => {
    fetch('/api/hotels')
      .then((res) => res.json())
      .then((data) => setHotels(data.data || []))
      .catch(console.error)
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Status Bar */}
      {meta && (
        <StatusBar
          lastScrapeAt={meta.last_scrape_at}
          totalRooms={meta.total_rooms_available}
          totalHotels={meta.total_hotels_with_availability}
          scraperActive={meta.scraper_active}
        />
      )}

      {/* Filter Bar */}
      <FilterBar filters={filters} onFiltersChange={setFilters} />

      {/* View Mode Toggle & Notification Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('table')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              viewMode === 'table'
                ? 'bg-gencon-blue text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              viewMode === 'cards'
                ? 'bg-gencon-blue text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Cards
          </button>
        </div>

        <button
          onClick={() => setWatcherModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-gencon-gold text-gray-900 font-medium rounded-md hover:bg-yellow-400"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span>Set Alert</span>
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gencon-blue"></div>
          <span className="ml-3 text-gray-600">Loading rooms...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Error loading data: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {viewMode === 'table' && (
            <div className="hidden md:block">
              <RoomTable rooms={rooms} />
            </div>
          )}

          {viewMode === 'cards' && <RoomCardList rooms={rooms} />}

          {/* Show cards on mobile when table is selected */}
          {viewMode === 'table' && (
            <div className="md:hidden">
              <RoomCardList rooms={rooms} />
            </div>
          )}
        </>
      )}

      {/* Your Alerts */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <WatcherList key={watcherRefreshKey} />
      </div>

      {/* Watcher Modal */}
      <WatcherModal
        isOpen={watcherModalOpen}
        onClose={() => {
          setWatcherModalOpen(false)
          setWatcherRefreshKey((k) => k + 1)
        }}
        hotels={hotels}
      />
    </div>
  )
}
