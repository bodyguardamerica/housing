'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RoomAvailability, RoomFilters, RoomsResponse } from '@/lib/types'

// Polling interval as fallback when realtime doesn't work (30 seconds)
const POLL_INTERVAL_MS = 30000

export function useRooms(filters: RoomFilters = {}) {
  const [rooms, setRooms] = useState<RoomAvailability[]>([])
  const [meta, setMeta] = useState<RoomsResponse['meta'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastScrapeRef = useRef<string | null>(null)

  const fetchRooms = useCallback(async () => {
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

      const response = await fetch(`/api/rooms?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch rooms')
      }

      const data: RoomsResponse = await response.json()
      setRooms(data.data)
      setMeta(data.meta)
      setError(null)

      // Track last scrape time to detect changes
      lastScrapeRef.current = data.meta.last_scrape_at
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

  // Subscribe to realtime updates on scrape_runs (more reliable than room_snapshots)
  useEffect(() => {
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
        () => {
          // Refetch when a scrape completes successfully
          fetchRooms()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime subscription failed, falling back to polling')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchRooms])

  // Polling fallback - check every 30s in case realtime isn't working
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchRooms()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollInterval)
  }, [fetchRooms])

  return { rooms, meta, loading, error, refetch: fetchRooms }
}
