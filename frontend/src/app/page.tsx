'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRooms } from '@/hooks/useRooms'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/hooks/useAuth'
import { StatusBar } from '@/components/StatusBar'
import { FilterBar } from '@/components/FilterBar'
import { RoomTable } from '@/components/RoomTable'
import { RoomCardList } from '@/components/RoomCard'
// import { HotelMap } from '@/components/HotelMap'  // Disabled for now
import { WatcherModal } from '@/components/WatcherModal'
import { WatcherList } from '@/components/WatcherList'
import { AlertModal } from '@/components/AlertModal'
import { AlertList } from '@/components/AlertList'
import { MatchedRooms } from '@/components/MatchedRooms'
import { supabase } from '@/lib/supabase'
import type { RoomFilters, Hotel, LocalAlert } from '@/lib/types'

export default function DashboardPage() {
  const [filters, setFilters] = useState<RoomFilters>({})
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [watcherModalOpen, setWatcherModalOpen] = useState(false)
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<LocalAlert | null>(null)
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [watcherRefreshKey, setWatcherRefreshKey] = useState(0)

  const { rooms, meta, loading, error } = useRooms(filters)
  const {
    alerts,
    matches,
    soundMuted,
    isLoaded: alertsLoaded,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    toggleAlertSound,
    toggleMute,
    checkMatches,
    dismissMatch,
    clearAllMatches,
    testSound,
  } = useAlerts()
  const { session, isAuthenticated } = useAuth()

  // Check for matches whenever rooms change
  useEffect(() => {
    if (alertsLoaded && rooms.length > 0) {
      checkMatches(rooms)
    }
  }, [rooms, alertsLoaded, checkMatches])

  // Sync local alerts to cloud when authenticated
  const syncAlerts = useCallback(async () => {
    if (!isAuthenticated || !session?.access_token) {
      console.log('Not authenticated, cannot sync')
      return
    }

    try {
      // Upload local alerts to the server
      for (const alert of alerts) {
        await fetch('/api/alerts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: alert.name,
            hotel_name: alert.hotelName,
            max_price: alert.maxPrice,
            max_distance: alert.maxDistance,
            require_skywalk: alert.requireSkywalk,
            min_nights_available: alert.minNightsAvailable,
            enabled: alert.enabled,
            sound_enabled: alert.soundEnabled,
          }),
        })
      }
      alert('Alerts synced to cloud!')
    } catch (error) {
      console.error('Failed to sync alerts:', error)
      alert('Failed to sync alerts')
    }
  }, [isAuthenticated, session, alerts])

  // Fetch hotels for the watcher modal
  useEffect(() => {
    fetch('/api/hotels')
      .then((res) => res.json())
      .then((data) => setHotels(data.data || []))
      .catch(console.error)
  }, [])

  const handleEditAlert = (alert: LocalAlert) => {
    setEditingAlert(alert)
    setAlertModalOpen(true)
  }

  const handleSaveAlert = (alertData: Omit<LocalAlert, 'id' | 'createdAt'>) => {
    if (editingAlert) {
      updateAlert(editingAlert.id, alertData)
    } else {
      createAlert(alertData)
    }
    setEditingAlert(null)
  }

  const handleCloseAlertModal = () => {
    setAlertModalOpen(false)
    setEditingAlert(null)
  }

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

      {/* Matched Rooms Section */}
      <MatchedRooms
        matches={matches}
        onDismiss={dismissMatch}
        onClearAll={clearAllMatches}
      />

      {/* Filter Bar */}
      <FilterBar filters={filters} onFiltersChange={setFilters} />

      {/* View Mode Toggle & Alert Buttons */}
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

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setEditingAlert(null)
              setAlertModalOpen(true)
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700"
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
            <span>Local Alert</span>
            {alerts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-green-800 text-xs rounded-full">
                {alerts.length}
              </span>
            )}
          </button>
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span>Email/Discord</span>
          </button>
        </div>
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

      {/* Your Local Alerts */}
      {alertsLoaded && (
        <div className="mt-8 pt-8 border-t border-gray-200">
          <AlertList
            alerts={alerts}
            onEdit={handleEditAlert}
            onDelete={deleteAlert}
            onToggle={toggleAlert}
            onToggleSound={toggleAlertSound}
            soundMuted={soundMuted}
            onToggleMute={toggleMute}
            onTestSound={testSound}
            onSyncAlerts={isAuthenticated ? syncAlerts : undefined}
          />
        </div>
      )}

      {/* Email/Discord Watchers */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <WatcherList key={watcherRefreshKey} />
      </div>

      {/* Alert Modal (Local) */}
      <AlertModal
        isOpen={alertModalOpen}
        onClose={handleCloseAlertModal}
        onSave={handleSaveAlert}
        editingAlert={editingAlert}
      />

      {/* Watcher Modal (Email/Discord) */}
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
