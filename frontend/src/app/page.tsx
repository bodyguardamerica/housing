'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRooms } from '@/hooks/useRooms'
import { useAlerts } from '@/hooks/useAlerts'
import { useAuth } from '@/hooks/useAuth'
import { usePasskeyUrl } from '@/hooks/usePasskeyUrl'
import { StatusBar } from '@/components/StatusBar'
import { FilterBar } from '@/components/FilterBar'
import { RoomTable } from '@/components/RoomTable'
import { RoomCardList } from '@/components/RoomCard'
// import { HotelMap } from '@/components/HotelMap'  // Disabled for now
import { WatcherList } from '@/components/WatcherList'
import { AlertList } from '@/components/AlertList'
import { UnifiedAlertModal } from '@/components/UnifiedAlertModal'
import { MatchedRooms } from '@/components/MatchedRooms'
import { MatchAlertModal } from '@/components/MatchAlertModal'
import { PasskeySettings } from '@/components/PasskeySettings'
import type { RoomFilters, LocalAlert } from '@/lib/types'

export default function DashboardPage() {
  const [filters, setFilters] = useState<RoomFilters>({})
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<LocalAlert | null>(null)
  const [watcherRefreshKey, setWatcherRefreshKey] = useState(0)

  const { rooms, meta, loading, error } = useRooms(filters)
  const {
    alerts,
    matches,
    newMatches,
    soundMuted,
    alarmSound,
    volume,
    isLoaded: alertsLoaded,
    notificationPermission,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    toggleAlertSound,
    toggleMute,
    checkMatches,
    dismissMatch,
    clearAllMatches,
    acknowledgeNewMatches,
    requestNotifications,
    testSound,
    setAlarmSound,
    setVolume,
    setAlerts,
  } = useAlerts()
  const { session, isAuthenticated } = useAuth()
  const { passkeyUrl, setPasskeyUrl, isSyncing } = usePasskeyUrl()

  // Check for matches whenever rooms or alerts change
  useEffect(() => {
    if (alertsLoaded && rooms.length > 0) {
      checkMatches(rooms)
    }
  }, [rooms, alerts, alertsLoaded, checkMatches])

  // Fetch alerts from server when authenticated
  useEffect(() => {
    async function fetchServerAlerts() {
      if (!isAuthenticated || !session?.access_token) return

      try {
        const response = await fetch('/api/alerts', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          console.error('Failed to fetch alerts from server')
          return
        }

        const { data: serverAlerts } = await response.json()

        if (serverAlerts && serverAlerts.length > 0) {
          // Convert server alerts to LocalAlert format
          const convertedAlerts: LocalAlert[] = serverAlerts.map((sa: {
            id: string
            name: string
            hotel_name?: string
            max_price?: number
            max_distance?: number
            require_skywalk?: boolean
            require_downtown?: boolean
            enabled?: boolean
            sound_enabled?: boolean
            full_screen_enabled?: boolean
            discord_watcher_id?: string
            created_at: string
          }) => ({
            id: sa.id,
            name: sa.name,
            hotelName: sa.hotel_name,
            maxPrice: sa.max_price,
            maxDistance: sa.max_distance,
            requireSkywalk: sa.require_skywalk || false,
            requireDowntown: sa.require_downtown || false,
            createdAt: sa.created_at,
            enabled: sa.enabled ?? true,
            soundEnabled: sa.sound_enabled ?? true,
            fullScreenEnabled: sa.full_screen_enabled ?? true,
            discordWatcherId: sa.discord_watcher_id,
          }))

          setAlerts(convertedAlerts)
          console.log('Loaded alerts from server:', JSON.stringify(convertedAlerts, null, 2))
        }
      } catch (error) {
        console.error('Error fetching alerts from server:', error)
      }
    }

    fetchServerAlerts()
  }, [isAuthenticated, session?.access_token, setAlerts])

  // Save alert to server (when authenticated)
  const saveAlertToServer = useCallback(async (alertData: Omit<LocalAlert, 'id' | 'createdAt'> & { id?: string }) => {
    if (!isAuthenticated || !session?.access_token) return null

    console.log('Saving alert to server:', JSON.stringify(alertData, null, 2))

    try {
      const isUpdate = !!alertData.id
      const response = await fetch('/api/alerts', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: alertData.id,
          name: alertData.name,
          hotel_name: alertData.hotelName,
          max_price: alertData.maxPrice,
          max_distance: alertData.maxDistance,
          require_skywalk: alertData.requireSkywalk,
          require_downtown: alertData.requireDowntown,
          enabled: alertData.enabled,
          sound_enabled: alertData.soundEnabled,
          full_screen_enabled: alertData.fullScreenEnabled,
          discord_watcher_id: alertData.discordWatcherId,
        }),
      })

      if (!response.ok) {
        console.error('Failed to save alert to server')
        return null
      }

      const { data } = await response.json()
      return data
    } catch (error) {
      console.error('Error saving alert to server:', error)
      return null
    }
  }, [isAuthenticated, session?.access_token])

  // Delete alert from server (when authenticated)
  const deleteAlertFromServer = useCallback(async (alertId: string) => {
    if (!isAuthenticated || !session?.access_token) return

    try {
      await fetch(`/api/alerts?id=${alertId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
    } catch (error) {
      console.error('Error deleting alert from server:', error)
    }
  }, [isAuthenticated, session?.access_token])

  const handleEditAlert = (alert: LocalAlert) => {
    setEditingAlert(alert)
    setAlertModalOpen(true)
  }

  const handleSaveAlert = async (alertData: Omit<LocalAlert, 'id' | 'createdAt'>) => {
    if (editingAlert) {
      // Update existing alert
      updateAlert(editingAlert.id, alertData)
      // Also update on server if authenticated
      if (isAuthenticated) {
        await saveAlertToServer({ ...alertData, id: editingAlert.id })
      }
    } else {
      // Create new alert locally first
      const newAlert = createAlert(alertData)
      // Also save to server if authenticated
      if (isAuthenticated && newAlert) {
        const serverAlert = await saveAlertToServer(alertData)
        // Update the local alert with the server ID
        if (serverAlert?.id) {
          updateAlert(newAlert.id, { ...alertData, id: serverAlert.id } as Partial<LocalAlert>)
        }
      }
    }
    setEditingAlert(null)
  }

  const handleDeleteAlert = async (alertId: string) => {
    // Delete locally
    deleteAlert(alertId)
    // Also delete from server if authenticated
    if (isAuthenticated) {
      await deleteAlertFromServer(alertId)
    }
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

      {/* Passkey URL Settings */}
      <div className="mb-6">
        <PasskeySettings passkeyUrl={passkeyUrl} onUrlChange={setPasskeyUrl} isSyncing={isSyncing} />
      </div>

      {/* All Alerts Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Your Alerts</h2>
          <div className="flex items-center space-x-2">
            {/* Browser Notification Permission */}
            {notificationPermission === 'default' && (
              <button
                onClick={requestNotifications}
                className="flex items-center space-x-2 px-4 py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 shadow-md animate-pulse hover:animate-none"
                title="Enable browser notifications to get alerts even when this tab is in the background"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>Enable Notifications</span>
              </button>
            )}
            {notificationPermission === 'granted' && (
              <span className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Notifications Enabled</span>
              </span>
            )}
            {notificationPermission === 'denied' && (
              <span className="flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded" title="Notifications blocked. Enable in browser settings.">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Notifications Blocked</span>
              </span>
            )}
            <button
              onClick={() => {
                setEditingAlert(null)
                setAlertModalOpen(true)
              }}
              className="flex items-center space-x-2 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Add Alert</span>
            </button>
          </div>
        </div>

        {/* Local Browser Alerts */}
        {alertsLoaded && (
          <AlertList
            alerts={alerts}
            matches={matches}
            onEdit={handleEditAlert}
            onDelete={handleDeleteAlert}
            onToggle={toggleAlert}
            onToggleSound={toggleAlertSound}
            soundMuted={soundMuted}
            alarmSound={alarmSound}
            volume={volume}
            onToggleMute={toggleMute}
            onTestSound={testSound}
            onSetAlarmSound={setAlarmSound}
            onSetVolume={setVolume}
          />
        )}

        {/* Email/Discord Watchers (standalone ones not linked to alerts) */}
        <WatcherList
          key={watcherRefreshKey}
          excludeWatcherIds={alerts.filter(a => a.discordWatcherId).map(a => a.discordWatcherId!)}
        />
      </div>

      {/* Matched Rooms Section */}
      <MatchedRooms
        matches={matches}
        onDismiss={dismissMatch}
        onClearAll={clearAllMatches}
        bookingUrl={passkeyUrl}
      />

      {/* Filter Bar */}
      <FilterBar filters={filters} onFiltersChange={setFilters} />

      {/* View Mode Toggle */}
      <div className="flex items-center space-x-2 mb-6">
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
              <RoomTable rooms={rooms} bookingUrl={passkeyUrl} />
            </div>
          )}

          {viewMode === 'cards' && <RoomCardList rooms={rooms} bookingUrl={passkeyUrl} />}

          {/* Show cards on mobile when table is selected */}
          {viewMode === 'table' && (
            <div className="md:hidden">
              <RoomCardList rooms={rooms} bookingUrl={passkeyUrl} />
            </div>
          )}
        </>
      )}

      {/* Unified Alert Modal */}
      <UnifiedAlertModal
        isOpen={alertModalOpen}
        onClose={() => {
          setAlertModalOpen(false)
          setEditingAlert(null)
          setWatcherRefreshKey((k) => k + 1)
        }}
        onSaveLocal={handleSaveAlert}
        editingAlert={editingAlert}
      />

      {/* Full-screen Match Alert Modal */}
      <MatchAlertModal
        matches={newMatches}
        onClose={acknowledgeNewMatches}
        bookingUrl={passkeyUrl}
      />
    </div>
  )
}
