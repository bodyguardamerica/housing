import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const searchParams = request.nextUrl.searchParams

  const hotelId = searchParams.get('hotel_id')
  const hours = parseInt(searchParams.get('hours') || '24')
  const roomType = searchParams.get('room_type')

  if (!hotelId) {
    return NextResponse.json(
      { error: 'hotel_id is required' },
      { status: 400 }
    )
  }

  try {
    // Calculate the timestamp for the lookback period
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    // Get hotel name
    const { data: hotel } = await supabase
      .from('hotels')
      .select('name')
      .eq('id', hotelId)
      .single()

    // Query room_availability_history view or room_snapshots directly
    let query = supabase
      .from('room_snapshots')
      .select('scraped_at, room_type, available_count, total_price')
      .eq('hotel_id', hotelId)
      .gte('scraped_at', since)
      .order('scraped_at', { ascending: true })

    if (roomType) {
      query = query.ilike('room_type', `%${roomType}%`)
    }

    const { data: snapshots, error } = await query

    if (error) {
      throw error
    }

    // Format the data
    const formattedData = (snapshots || []).map((snapshot) => ({
      timestamp: snapshot.scraped_at,
      room_type: snapshot.room_type,
      available_count: snapshot.available_count,
      total_price: snapshot.total_price,
    }))

    return NextResponse.json({
      hotel_name: hotel?.name || 'Unknown Hotel',
      data: formattedData,
    })
  } catch (error) {
    console.error('Error fetching room history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch room history' },
      { status: 500 }
    )
  }
}
