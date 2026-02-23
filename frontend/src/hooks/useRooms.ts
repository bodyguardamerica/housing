'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RoomAvailability, RoomFilters, RoomsResponse } from '@/lib/types'

export function useRooms(filters: RoomFilters = {}) {
  const [rooms, setRooms] = useState<RoomAvailability[]>([])
  const [meta, setMeta] = useState<RoomsResponse['meta'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      // Always send show_partial with default of false (hide partial availability by default)
      params.set('show_partial', (filters.showPartial ?? false).toString())

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

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('room-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_snapshots',
        },
        () => {
          // Refetch when new data arrives
          fetchRooms()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchRooms])

  return { rooms, meta, loading, error, refetch: fetchRooms }
}
