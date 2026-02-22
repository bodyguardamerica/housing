import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createHash, randomBytes } from 'crypto'

interface CreateWatcherRequest {
  email?: string
  discord_webhook_url?: string
  phone_number?: string
  push_subscription?: Record<string, unknown>
  hotel_id?: string
  max_price?: number
  max_distance?: number
  require_skywalk?: boolean
  room_type_pattern?: string
  cooldown_minutes?: number
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient()

  try {
    // Get watcher IDs from query param (comma-separated)
    const ids = request.nextUrl.searchParams.get('ids')

    if (!ids) {
      return NextResponse.json({ data: [] })
    }

    const idList = ids.split(',').filter(Boolean)

    if (idList.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const { data: watchers, error } = await supabase
      .from('watchers')
      .select(`
        id,
        email,
        discord_webhook_url,
        hotel_id,
        max_price,
        max_distance,
        require_skywalk,
        room_type_pattern,
        cooldown_minutes,
        active,
        created_at,
        hotels (name)
      `)
      .in('id', idList)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ data: watchers || [] })
  } catch (error) {
    console.error('Error fetching watchers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch watchers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()

  try {
    const body: CreateWatcherRequest = await request.json()

    // Validate at least one contact method
    if (
      !body.email &&
      !body.discord_webhook_url &&
      !body.phone_number &&
      !body.push_subscription
    ) {
      return NextResponse.json(
        { error: 'At least one contact method is required' },
        { status: 400 }
      )
    }

    // Get current year
    const { data: yearConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'current_year')
      .single() as { data: { value: unknown } | null }

    const currentYear = Number(yearConfig?.value) || new Date().getFullYear()

    // Generate manage token
    const manageToken = randomBytes(32).toString('hex')
    const manageTokenHash = hashToken(manageToken)

    // Create watcher
    const { data: watcher, error } = await supabase
      .from('watchers')
      .insert({
        email: body.email || null,
        discord_webhook_url: body.discord_webhook_url || null,
        phone_number: body.phone_number || null,
        push_subscription: body.push_subscription || null,
        manage_token_hash: manageTokenHash,
        hotel_id: body.hotel_id || null,
        max_price: body.max_price || null,
        max_distance: body.max_distance || null,
        require_skywalk: body.require_skywalk || false,
        room_type_pattern: body.room_type_pattern || null,
        cooldown_minutes: body.cooldown_minutes || 15,
        year: currentYear,
        active: true,
        notifications_sent_today: 0,
        max_notifications_per_day: 50,
      })
      .select('id')
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      id: watcher?.id,
      manage_token: manageToken,
      message:
        'Watcher created. Save your manage_token to modify or delete this watcher later.',
    })
  } catch (error) {
    console.error('Error creating watcher:', error)
    return NextResponse.json(
      { error: 'Failed to create watcher' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient()

  try {
    const watcherId = request.nextUrl.searchParams.get('id')
    const authHeader = request.headers.get('authorization')

    if (!watcherId) {
      return NextResponse.json(
        { error: 'Watcher ID is required' },
        { status: 400 }
      )
    }

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header is required' },
        { status: 401 }
      )
    }

    const manageToken = authHeader.replace('Bearer ', '')
    const manageTokenHash = hashToken(manageToken)

    // Verify token and delete
    const { data: watcher, error: fetchError } = await supabase
      .from('watchers')
      .select('id, manage_token_hash')
      .eq('id', watcherId)
      .single() as { data: { id: string; manage_token_hash: string } | null; error: Error | null }

    if (fetchError || !watcher) {
      return NextResponse.json(
        { error: 'Watcher not found' },
        { status: 404 }
      )
    }

    if (watcher.manage_token_hash !== manageTokenHash) {
      return NextResponse.json(
        { error: 'Invalid manage token' },
        { status: 401 }
      )
    }

    const { error: deleteError } = await supabase
      .from('watchers')
      .delete()
      .eq('id', watcherId)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({ message: 'Watcher deleted' })
  } catch (error) {
    console.error('Error deleting watcher:', error)
    return NextResponse.json(
      { error: 'Failed to delete watcher' },
      { status: 500 }
    )
  }
}
