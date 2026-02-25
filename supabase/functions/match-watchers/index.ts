// Supabase Edge Function: Watcher Matcher
// Called via database webhook on room_snapshots INSERT
// Matches new snapshots against active watchers and dispatches notifications

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface InsertPayload {
  type: 'INSERT'
  table: string
  record: {
    id: string
    hotel_id: string
    room_type: string
    available_count: number
    nightly_rate: number
    total_price: number
    check_in: string
    check_out: string
    year: number
  }
}

serve(async (req) => {
  try {
    const payload: InsertPayload = await req.json()

    // Note: Availability filtering is now handled by the scraper before calling this function
    // The scraper only calls this for snapshots with availability (full or partial)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get hotel details
    const { data: hotel } = await supabase
      .from('hotels')
      .select('name, distance_from_icc, distance_unit, has_skywalk')
      .eq('id', payload.record.hotel_id)
      .single()

    // Get watcher details for discord_mention
    const { data: watcherDetails } = await supabase
      .from('watchers')
      .select('id, discord_mention')
      .not('discord_webhook_url', 'is', null)

    if (!hotel) {
      throw new Error('Hotel not found')
    }

    // Call the matcher function
    const { data: matches, error: matchError } = await supabase.rpc(
      'match_watchers_for_snapshot',
      { snapshot_id: payload.record.id }
    )

    if (matchError) {
      throw matchError
    }

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No matching watchers' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Format distance label
    const getDistanceLabel = (distance: number, unit: number, hasSkywalk: boolean) => {
      if (hasSkywalk) return 'Skywalk'
      const unitLabels: Record<number, string> = {
        1: 'blocks',
        2: 'yards',
        3: 'miles',
        4: 'meters',
        5: 'km',
      }
      return `${distance} ${unitLabels[unit] || 'units'}`
    }

    const distanceLabel = getDistanceLabel(
      hotel.distance_from_icc,
      hotel.distance_unit,
      hotel.has_skywalk
    )

    // Process each match
    const notifications = []

    for (const match of matches) {
      const notificationPayload = {
        watcher_id: match.watcher_id,
        hotel_name: hotel.name,
        room_type: payload.record.room_type,
        available_count: payload.record.available_count,
        nightly_rate: payload.record.nightly_rate,
        total_price: payload.record.total_price,
        check_in: payload.record.check_in,
        check_out: payload.record.check_out,
        has_skywalk: hotel.has_skywalk,
        distance_label: distanceLabel,
      }

      try {
        if (match.channel === 'discord') {
          // Get discord_mention for this watcher
          const watcherInfo = watcherDetails?.find(w => w.id === match.watcher_id)
          const discordMention = watcherInfo?.discord_mention || undefined

          // Call Discord notifier
          const response = await fetch(
            `${supabaseUrl}/functions/v1/notify-discord`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                ...notificationPayload,
                webhook_url: match.destination,
                discord_mention: discordMention,
              }),
            }
          )

          if (response.ok) {
            notifications.push({ watcher_id: match.watcher_id, channel: 'discord', status: 'sent' })
          } else {
            notifications.push({ watcher_id: match.watcher_id, channel: 'discord', status: 'failed' })
          }
        } else if (match.channel === 'web_push') {
          // Call Push notifier
          const subscription = JSON.parse(match.destination)
          const response = await fetch(
            `${supabaseUrl}/functions/v1/notify-push`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                ...notificationPayload,
                subscription,
              }),
            }
          )

          if (response.ok) {
            notifications.push({ watcher_id: match.watcher_id, channel: 'web_push', status: 'sent' })
          } else {
            notifications.push({ watcher_id: match.watcher_id, channel: 'web_push', status: 'failed' })
          }
        }

        // Update watcher's last_notified_at and increment counter
        await supabase
          .from('watchers')
          .update({
            last_notified_at: new Date().toISOString(),
            notifications_sent_today: supabase.rpc('increment_notification_count', {
              watcher_id: match.watcher_id,
            }),
          })
          .eq('id', match.watcher_id)

        // Log notification
        await supabase.from('notifications_log').insert({
          watcher_id: match.watcher_id,
          room_snapshot_id: payload.record.id,
          channel: match.channel,
          status: 'sent',
        })
      } catch (error) {
        console.error(`Error notifying watcher ${match.watcher_id}:`, error)

        // Log failed notification
        await supabase.from('notifications_log').insert({
          watcher_id: match.watcher_id,
          room_snapshot_id: payload.record.id,
          channel: match.channel,
          status: 'failed',
          error_message: error.message,
        })

        notifications.push({
          watcher_id: match.watcher_id,
          channel: match.channel,
          status: 'failed',
          error: error.message,
        })
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${matches.length} matches`,
        notifications,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in match-watchers:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
