// Supabase Edge Function: Discord Webhook Notifier
// Sends notifications to Discord when matching rooms become available

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

// GenCon Passkey booking URL
const PASSKEY_BOOK_URL = 'https://book.passkey.com/event/50910675/owner/10909638/home'
const SITE_URL = 'https://lotterylosers.com'

serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json()

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
      description: `**[📲 BOOK NOW](${PASSKEY_BOOK_URL})** | [View on Lottery Losers](${SITE_URL})`,
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
