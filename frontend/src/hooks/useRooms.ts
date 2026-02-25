'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RoomAvailability, RoomFilters, RoomsResponse } from '@/lib/types'

// Fallback poll interval (only if Realtime fails)
const FALLBACK_POLL_INTERVAL_MS = 60000

export function useRooms(filters: RoomFilters = {}) {
  const [rooms, setRooms] = useState<RoomAvailability[]>([])
  const [meta, setMeta] = useState<RoomsResponse['meta'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

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
    // Subscribe to scrape_runs table for INSERT events
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
          // New successful scrape completed - refetch rooms
          console.log('Realtime: New scrape completed, refreshing data...')
          fetchRooms()
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
