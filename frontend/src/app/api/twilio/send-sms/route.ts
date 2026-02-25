import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID!
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN!
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER!

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

// POST - Send SMS via Twilio
export async function POST(request: NextRequest) {
  // Check Twilio credentials
  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    return NextResponse.json(
      { error: 'Twilio not configured' },
      { status: 500 }
    )
  }

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

  // Check user has SMS permission and hasn't exceeded limit
  const { data: canSend } = await supabase.rpc('increment_sms_counter', {
    p_user_id: user.id
  }) as { data: boolean | null }

  if (!canSend) {
    return NextResponse.json(
      { error: 'SMS permission denied or daily limit reached' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { phone_number, message, hotel_name, room_type, price, available_count } = body

  if (!phone_number) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  // Format message if not provided directly
  const smsMessage = message || formatHotelAlert(hotel_name, room_type, price, available_count)

  try {
    // Send SMS via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`
    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')

    const formData = new URLSearchParams()
    formData.append('To', phone_number)
    formData.append('From', twilioPhoneNumber)
    formData.append('Body', smsMessage)

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Twilio error:', errorData)
      return NextResponse.json(
        { error: errorData.message || 'Failed to send SMS' },
        { status: response.status }
      )
    }

    const result = await response.json()

    // Log the notification (ignore errors if table doesn't exist)
    try {
      await supabase.from('notifications_log').insert({
        channel: 'sms',
        destination: phone_number,
        payload: { message: smsMessage, hotel_name, room_type, price },
        status: 'sent',
        provider_message_id: result.sid,
      } as Record<string, unknown>)
    } catch {
      // Table may not exist
    }

    return NextResponse.json({
      success: true,
      sid: result.sid,
      status: result.status,
    })
  } catch (error) {
    console.error('SMS send error:', error)
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    )
  }
}

function formatHotelAlert(
  hotelName?: string,
  roomType?: string,
  price?: number,
  availableCount?: number
): string {
  const lines = ['HOTEL ALERT']

  if (hotelName) {
    lines.push(hotelName)
  }

  if (roomType) {
    lines.push(roomType)
  }

  if (price) {
    lines.push(`$${price}/night`)
  }

  if (availableCount) {
    lines.push(`${availableCount} available`)
  }

  lines.push('Book now: lotterylosers.com')

  return lines.join('\n')
}
