import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createHash, randomBytes } from 'crypto'

interface CreateWatcherRequest {
  email?: string
  discord_webhook_url?: string
  discord_mention?: string // Discord mention string like <@123456789>
  phone_number?: string
  push_subscription?: Record<string, unknown>
  hotel_id?: string
  max_price?: number
  max_distance?: number
  require_skywalk?: boolean
  room_type_pattern?: string
  cooldown_minutes?: number
  alert_name?: string // Used for test message
}

// Send a test message to Discord webhook
async function sendDiscordTestMessage(webhookUrl: string, alertName: string): Promise<void> {
  try {
    const message = {
      embeds: [{
        title: '✅ Alert Created',
        description: `Alert **"${alertName}"** has been set up successfully!`,
        color: 0x22c55e, // green
        fields: [
          {
            name: 'What happens next?',
            value: 'You will receive notifications here when hotel rooms matching your criteria become available.',
          }
        ],
        footer: {
          text: 'GenCon Hotel Tracker',
        },
        timestamp: new Date().toISOString(),
      }]
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
    console.log('POST /api/watchers - Discord test message sent')
  } catch (error) {
    console.error('POST /api/watchers - Failed to send Discord test message:', error)
    // Don't throw - test message failure shouldn't fail the watcher creation
  }
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
  console.log('POST /api/watchers - Starting')

  // Check env vars
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('NEXT_PUBLIC_SUPABASE_URL is not set')
    return NextResponse.json(
      { error: 'Server configuration error: missing Supabase URL' },
      { status: 500 }
    )
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set')
    return NextResponse.json(
      { error: 'Server configuration error: missing service role key' },
      { status: 500 }
    )
  }

  const supabase = createServerClient()

  try {
    const body: CreateWatcherRequest = await request.json()
    console.log('POST /api/watchers - Body received')

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

    // Get current year (with timeout protection)
    console.log('POST /api/watchers - Fetching current year')
    const { data: yearConfig, error: yearError } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'current_year')
      .single() as { data: { value: unknown } | null; error: Error | null }

    if (yearError) {
      console.log('POST /api/watchers - Year config error (using default):', yearError.message)
    }

    const currentYear = Number(yearConfig?.value) || new Date().getFullYear()
    console.log('POST /api/watchers - Using year:', currentYear)

    // Generate manage token
    const manageToken = randomBytes(32).toString('hex')
    const manageTokenHash = hashToken(manageToken)

    // Create watcher
    const watcherData = {
      email: body.email || null,
      discord_webhook_url: body.discord_webhook_url || null,
      discord_mention: body.discord_mention || null,
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
    }

    console.log('POST /api/watchers - Inserting watcher')
    const { data: watcher, error } = await supabase
      .from('watchers')
      .insert(watcherData as never)
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null }

    if (error) {
      console.error('POST /api/watchers - Insert error:', error)
      throw error
    }

    console.log('POST /api/watchers - Success, id:', watcher?.id)

    // Send test message to Discord if webhook provided
    if (body.discord_webhook_url && body.alert_name) {
      await sendDiscordTestMessage(body.discord_webhook_url, body.alert_name)
    }

    return NextResponse.json({
      id: watcher?.id,
      manage_token: manageToken,
      message:
        'Watcher created. Save your manage_token to modify or delete this watcher later.',
    })
  } catch (error) {
    console.error('POST /api/watchers - Error:', error)
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
