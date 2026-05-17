// Supabase Edge Function: Discord Webhook Notifier
// Sends notifications to Discord when matching rooms become available

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface NotificationPayload {
  watcher_id: string
  webhook_url: string
  discord_mention?: string // Optional mention like <@123456789>
  hotel_name: string
  room_type: string
  available_count: number
  nightly_rate: number
  total_price: number
  check_in: string
  check_out: string
  has_skywalk: boolean
  distance_label: string
  passkey_hotel_id?: number
}

// Fallback Passkey URL when the watcher's owning user has no personal
// entry-token URL set. Built from env vars so it tracks the current
// year's event without a redeploy. (Previously hardcoded to event
// 50910675 — the prior year's event, which broke booking from Discord
// after the Gen Con 2026 event id rolled over to 51118112.)
const PASSKEY_EVENT_ID = Deno.env.get('PASSKEY_EVENT_ID') ?? '51118112'
const PASSKEY_OWNER_ID = Deno.env.get('PASSKEY_OWNER_ID') ?? '10909638'
const FALLBACK_PASSKEY_BOOK_URL = `https://book.passkey.com/event/${PASSKEY_EVENT_ID}/owner/${PASSKEY_OWNER_ID}/home`
const SITE_URL = 'https://lotterylosers.com'

// Look up the user's personal Passkey entry-token URL for a given
// watcher. Chain: watchers.id -> user_alerts.discord_watcher_id ->
// user_alerts.user_id -> user_settings.passkey_url. Returns null when
// any link is missing or the user hasn't configured a URL.
async function resolveBookUrl(
  supabase: ReturnType<typeof createClient>,
  watcherId: string,
): Promise<string> {
  try {
    const { data: alert } = await supabase
      .from('user_alerts')
      .select('user_id')
      .eq('discord_watcher_id', watcherId)
      .limit(1)
      .maybeSingle()
    if (!alert?.user_id) return FALLBACK_PASSKEY_BOOK_URL

    const { data: settings } = await supabase
      .from('user_settings')
      .select('passkey_url')
      .eq('user_id', alert.user_id)
      .maybeSingle()
    const url = settings?.passkey_url
    if (typeof url === 'string' && url.startsWith('https://book.passkey.com/')) {
      return url
    }
    return FALLBACK_PASSKEY_BOOK_URL
  } catch (err) {
    console.error('resolveBookUrl failed; using fallback:', err)
    return FALLBACK_PASSKEY_BOOK_URL
  }
}

serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Use the watcher-owner's personal entry-token URL when available
    // so clicking BOOK NOW lands them logged in on the right event.
    const bookUrl = await resolveBookUrl(supabase, payload.watcher_id)

    // Format dates
    const checkIn = new Date(payload.check_in).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    const checkOut = new Date(payload.check_out).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

    // Build Discord embed
    const embed = {
      title: '🏨 Room Available!',
      color: 0x10b981, // Green
      description: `**[📲 BOOK NOW](${bookUrl})** | [View on Lottery Losers](${SITE_URL})`,
      fields: [
        {
          name: 'Hotel',
          value: `**${payload.hotel_name}**${payload.has_skywalk ? ' 🌉 Skywalk' : ''}`,
          inline: false,
        },
        {
          name: 'Room Type',
          value: payload.room_type,
          inline: true,
        },
        {
          name: 'Available',
          value: `${payload.available_count} room${payload.available_count > 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: 'Distance',
          value: payload.distance_label,
          inline: true,
        },
        {
          name: 'Price',
          value: `$${payload.nightly_rate?.toLocaleString() || 'N/A'}/night ($${payload.total_price?.toLocaleString() || 'N/A'} total)`,
          inline: true,
        },
        {
          name: 'Dates',
          value: `${checkIn} - ${checkOut}`,
          inline: true,
        },
      ],
      footer: {
        text: 'Lottery Losers | Book quickly - rooms go fast!',
      },
      timestamp: new Date().toISOString(),
    }

    // Build content with optional mention
    const mentionPrefix = payload.discord_mention ? `${payload.discord_mention} ` : ''

    const discordPayload = {
      content: `${mentionPrefix}🚨 **New Room Alert!**`,
      embeds: [embed],
    }

    // Send to Discord
    const response = await fetch(payload.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discordPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Discord API error: ${response.status} - ${errorText}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending Discord notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
