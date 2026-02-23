'use client'

import { useState, useEffect } from 'react'

interface Watcher {
  id: string
  email?: string
  discord_webhook_url?: string
  hotel_id?: string
  max_price?: number
  max_distance?: number
  require_skywalk: boolean
  room_type_pattern?: string
  cooldown_minutes: number
  active: boolean
  created_at: string
  hotels?: { name: string }
}

interface WatcherListProps {
  onRefresh?: () => void
  excludeWatcherIds?: string[] // Watcher IDs that are linked to alerts (don't show separately)
}

export function WatcherList({ onRefresh, excludeWatcherIds = [] }: WatcherListProps) {
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchWatchers = async () => {
    setLoading(true)
    try {
      const tokens = JSON.parse(localStorage.getItem('watcher_tokens') || '{}')
      const ids = Object.keys(tokens)

      if (ids.length === 0) {
        setWatchers([])
        return
      }

      const response = await fetch(`/api/watchers?ids=${ids.join(',')}`)
      const data = await response.json()
      setWatchers(data.data || [])
    } catch (error) {
      console.error('Error fetching watchers:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWatchers()
  }, [])

  const deleteWatcher = async (id: string) => {
    const tokens = JSON.parse(localStorage.getItem('watcher_tokens') || '{}')
    const token = tokens[id]

    if (!token) {
      alert('Cannot delete: manage token not found')
      return
    }

    setDeleting(id)
    try {
      const response = await fetch(`/api/watchers?id=${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        // Remove from localStorage
        delete tokens[id]
        localStorage.setItem('watcher_tokens', JSON.stringify(tokens))
        // Remove from state
        setWatchers(watchers.filter((w) => w.id !== id))
        onRefresh?.()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete watcher')
      }
    } catch (error) {
      console.error('Error deleting watcher:', error)
      alert('Failed to delete watcher')
    } finally {
      setDeleting(null)
    }
  }

  // Filter out watchers that are linked to alerts
  const filteredWatchers = watchers.filter((w) => !excludeWatcherIds.includes(w.id))

  if (loading) {
    return (
      <div className="text-gray-500 text-sm py-4">Loading...</div>
    )
  }

  // Don't show anything if no standalone watchers
  if (filteredWatchers.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="text-md font-semibold text-gray-700">Standalone Email/Discord Watchers</h3>
      {filteredWatchers.map((watcher) => (
        <div
          key={watcher.id}
          className="bg-white border border-gray-200 rounded-lg p-4 flex items-start justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              {watcher.discord_webhook_url && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                  Discord
                </span>
              )}
              {watcher.email && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  Email
                </span>
              )}
              {!watcher.active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  Paused
                </span>
              )}
            </div>
            <div className="text-sm text-gray-700">
              {watcher.hotels?.name ? (
                <span>Hotel: {watcher.hotels.name}</span>
              ) : (
                <span>Any hotel</span>
              )}
              {watcher.max_price && (
                <span className="ml-3">Max: ${watcher.max_price}</span>
              )}
              {watcher.max_distance && (
                <span className="ml-3">Within {watcher.max_distance} blocks</span>
              )}
              {watcher.require_skywalk && (
                <span className="ml-3">Skywalk only</span>
              )}
              {watcher.room_type_pattern && (
                <span className="ml-3">Type: {watcher.room_type_pattern}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => deleteWatcher(watcher.id)}
            disabled={deleting === watcher.id}
            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
          >
            {deleting === watcher.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ))}
    </div>
  )
}
