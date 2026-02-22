// Supabase Edge Function: Discord Webhook Notifier
// Sends notifications to Discord when matching rooms become available

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface NotificationPayload {
  watcher_id: string
  webhook_url: string
  hotel_name: string
  room_type: string
  available_count: number
  nightly_rate: number
  total_price: number
  check_in: string
  check_out: string
  has_skywalk: boolean
  distance_label: string
}

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
      fields: [
        {
          name: 'Hotel',
          value: `**${payload.hotel_name}**${payload.has_skywalk ? ' (Skywalk)' : ''}`,
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
          value: `$${payload.nightly_rate}/night ($${payload.total_price} total)`,
          inline: true,
        },
        {
          name: 'Dates',
          value: `${checkIn} - ${checkOut}`,
          inline: true,
        },
      ],
      footer: {
        text: 'GenCon Hotels | Book quickly - rooms go fast!',
      },
      timestamp: new Date().toISOString(),
    }

    const discordPayload = {
      content: '🚨 **New Room Alert!**',
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
