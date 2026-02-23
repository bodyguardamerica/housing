import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { RoomsResponse, RoomAvailability } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const searchParams = request.nextUrl.searchParams

  // Parse query parameters
  const maxDistance = searchParams.get('max_distance')
  const maxPrice = searchParams.get('max_price')
  const skywalkOnly = searchParams.get('skywalk_only') === 'true'
  const hotelName = searchParams.get('hotel_name')
  const roomType = searchParams.get('room_type')
  const checkIn = searchParams.get('check_in')
  const checkOut = searchParams.get('check_out')
  const sortBy = searchParams.get('sort_by') || 'distance'
  const sortDir = searchParams.get('sort_dir') || 'asc'

  try {
    // Fetch from the view
    let query = supabase.from('latest_room_availability').select('*')

    // Apply filters
    if (maxDistance) {
      query = query.lte('distance_from_icc', parseFloat(maxDistance))
    }
    if (maxPrice) {
      query = query.lte('total_price', parseFloat(maxPrice))
    }
    if (skywalkOnly) {
      query = query.eq('has_skywalk', true)
    }
    if (hotelName) {
      query = query.ilike('hotel_name', `%${hotelName}%`)
    }
    if (roomType) {
      query = query.ilike('room_type', `%${roomType}%`)
    }
    if (checkIn) {
      query = query.gte('check_in', checkIn)
    }
    if (checkOut) {
      query = query.lte('check_out', checkOut)
    }

    // Filter out sold-out rooms (available_count = 0) by default
    const showSoldOut = searchParams.get('show_sold_out') === 'true'
    if (!showSoldOut) {
      query = query.gt('available_count', 0)
    }

    // Apply sorting
    const sortColumn = {
      distance: 'distance_from_icc',
      price: 'total_price',
      hotel_name: 'hotel_name',
      available: 'available_count',
    }[sortBy] || 'distance_from_icc'

    query = query.order(sortColumn, { ascending: sortDir === 'asc' })

    const { data: rooms, error: roomsError } = await query

    if (roomsError) {
      throw roomsError
    }

    // Get last scrape info
    const { data: lastScrape } = await supabase
      .from('scrape_runs')
      .select('*')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single() as { data: { completed_at: string; status: string } | null }

    // Get scraper active status from config
    const { data: configData } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'scraper_active')
      .single() as { data: { value: unknown } | null }

    // Calculate metadata
    const roomsData = (rooms || []) as RoomAvailability[]
    const uniqueHotels = new Set(roomsData.map((r) => r.hotel_id))
    const totalRooms = roomsData.reduce((sum, r) => sum + r.available_count, 0)

    const response: RoomsResponse = {
      data: roomsData,
      meta: {
        last_scrape_at: lastScrape?.completed_at || null,
        last_scrape_status: lastScrape?.status || null,
        total_rooms_available: totalRooms,
        total_hotels_with_availability: uniqueHotels.size,
        scraper_active: configData?.value === true || configData?.value === 'true',
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching rooms:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rooms' },
      { status: 500 }
    )
  }
}
