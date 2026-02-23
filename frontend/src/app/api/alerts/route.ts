import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Create a client that can verify JWT tokens
function createAuthClient(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.substring(7)
  return createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
}

// GET - Fetch user's alerts
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch alerts
  const { data: alerts, error } = await supabase
    .from('user_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }

  return NextResponse.json({ data: alerts })
}

// POST - Create a new alert
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  // Validate required fields
  if (!body.name) {
    return NextResponse.json({ error: 'Alert name is required' }, { status: 400 })
  }

  // Insert alert
  const { data: alert, error } = await supabase
    .from('user_alerts')
    .insert({
      user_id: user.id,
      name: body.name,
      hotel_name: body.hotel_name || null,
      max_price: body.max_price || null,
      max_distance: body.max_distance || null,
      require_skywalk: body.require_skywalk || false,
      min_nights_available: body.min_nights_available || null,
      enabled: body.enabled ?? true,
      sound_enabled: body.sound_enabled ?? true,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating alert:', error)
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 })
  }

  return NextResponse.json({ data: alert })
}

// PUT - Update an alert
export async function PUT(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  if (!body.id) {
    return NextResponse.json({ error: 'Alert ID is required' }, { status: 400 })
  }

  // Update alert (RLS ensures user can only update their own)
  const { data: alert, error } = await supabase
    .from('user_alerts')
    .update({
      name: body.name,
      hotel_name: body.hotel_name,
      max_price: body.max_price,
      max_distance: body.max_distance,
      require_skywalk: body.require_skywalk,
      min_nights_available: body.min_nights_available,
      enabled: body.enabled,
      sound_enabled: body.sound_enabled,
    })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Error updating alert:', error)
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 })
  }

  return NextResponse.json({ data: alert })
}

// DELETE - Delete an alert
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Alert ID is required' }, { status: 400 })
  }

  // Delete alert (RLS ensures user can only delete their own)
  const { error } = await supabase
    .from('user_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting alert:', error)
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
