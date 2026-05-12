'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RoomAvailability, RoomFilters, RoomsResponse } from '@/lib/types'

// Safety-net poll cadence when Realtime IS connected. The push channel
// fires on every scrape with changes, so this only catches the rare case
// of a silently-dropped WebSocket. Bumped 60s -> 300s (5 min): Realtime
// is doing the heavy lifting, and a 5-minute "are we still receiving
// pushes?" check is plenty. ~80% reduction in /api/rooms invocations
// from connected users; no impact on alert latency (Discord goes through
// the scraper -> Supabase -> edge function path, never through here).
const FALLBACK_POLL_INTERVAL_MS = 300000

export function useRooms(filters: RoomFilters = {}) {
  const [rooms, setRooms] = useState<RoomAvailability[]>([])
  const [meta, setMeta] = useState<RoomsResponse['meta'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchRooms = useCallback(async (opts?: { skipCache?: boolean }) => {
    try {
      const params = new URLSearchParams()

      if (filters.maxDistance !== undefined) {
        params.set('max_distance', filters.maxDistance.toString())
      }
      if (filters.maxPrice !== undefined) {
        params.set('max_price', filters.maxPrice.toString())
      }
      if (filters.skywalkOnly) {
        params.set('skywalk_only', 'true')
      }
      if (filters.downtownOnly) {
        params.set('downtown_only', 'true')
      }
      if (filters.hotelName) {
        params.set('hotel_name', filters.hotelName)
      }
      if (filters.roomType) {
        params.set('room_type', filters.roomType)
      }
      if (filters.sortBy) {
        params.set('sort_by', filters.sortBy)
      }
      if (filters.sortDir) {
        params.set('sort_dir', filters.sortDir)
      }
      if (filters.checkIn) {
        params.set('check_in', filters.checkIn)
      }
      if (filters.checkOut) {
        params.set('check_out', filters.checkOut)
      }
      // Send show_sold_out if enabled
      if (filters.showSoldOut) {
        params.set('show_sold_out', 'true')
      }

      // When called from a Realtime change event, bypass the edge cache so
      // the fresh post-change room data is read from PostgREST rather than
      // the 60s-old cached response. Bare polls and the initial fetch
      // happily use the cache.
      const response = await fetch(
        `/api/rooms?${params.toString()}`,
        opts?.skipCache ? { cache: 'no-store' } : undefined
      )
      if (!response.ok) {
        throw new Error('Failed to fetch rooms')
      }

      const data: RoomsResponse = await response.json()
      setRooms(data.data)
      setMeta(data.meta)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Initial fetch
  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // Realtime subscription - listen for new successful scrapes
  useEffect(() => {
    // Subscribe to scrape_runs table for UPDATE events
    const channel = supabase
      .channel('scrape-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scrape_runs',
          filter: 'status=eq.success',
        },
        (payload) => {
          // Immediately reflect the new scrape time in the UI — the edge
          // cache on /api/rooms holds responses for 60s, so a fetchRooms()
          // right now would re-serve a response with a stale
          // last_scrape_at, making the "X seconds ago" indicator tick up
          // past a minute even though the scraper is firing every 25s.
          // The Realtime payload already carries the fresh timestamp;
          // use it directly.
          const newRow = (payload.new ?? {}) as { completed_at?: string; no_changes?: boolean; status?: string }
          if (newRow.completed_at) {
            setMeta((prev) =>
              prev
                ? { ...prev, last_scrape_at: newRow.completed_at!, last_scrape_status: newRow.status ?? prev.last_scrape_status }
                : prev
            )
          }
          // Only refetch room data when the scrape actually changed
          // something. ~95% of scrapes are no_changes — refetching those
          // just serves cached bytes and burns Vercel quota for no win.
          if (newRow.no_changes === false) {
            console.log('Realtime: scrape detected changes, refreshing rooms (cache-busted)')
            fetchRooms({ skipCache: true })
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime: Connected to scrape updates')
          setRealtimeConnected(true)
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log('Realtime: Disconnected, falling back to polling')
          setRealtimeConnected(false)
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [fetchRooms])

  // Fallback polling (only if Realtime is not connected)
  useEffect(() => {
    if (realtimeConnected) {
      // Realtime is working, no need to poll frequently
      // Still poll every 60s as a safety net
      const fallbackInterval = setInterval(() => {
        fetchRooms()
      }, FALLBACK_POLL_INTERVAL_MS)
      return () => clearInterval(fallbackInterval)
    } else {
      // Realtime not connected, poll more frequently
      const pollInterval = setInterval(() => {
        fetchRooms()
      }, 15000)
      return () => clearInterval(pollInterval)
    }
  }, [fetchRooms, realtimeConnected])

  return { rooms, meta, loading, error, refetch: fetchRooms, realtimeConnected }
}
