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

// POST - Make phone call via Twilio
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

  // Check user has call permission and hasn't exceeded limit
  const { data: canCall } = await supabase.rpc('increment_call_counter', {
    p_user_id: user.id
  })

  if (!canCall) {
    return NextResponse.json(
      { error: 'Call permission denied or daily limit reached' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { phone_number, hotel_name, room_type, price, available_count } = body

  if (!phone_number) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  // Generate TwiML for text-to-speech
  const twiml = generateTwiML(hotel_name, room_type, price, available_count)

  try {
    // Make call via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`
    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')

    const formData = new URLSearchParams()
    formData.append('To', phone_number)
    formData.append('From', twilioPhoneNumber)
    formData.append('Twiml', twiml)

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
        { error: errorData.message || 'Failed to make call' },
        { status: response.status }
      )
    }

    const result = await response.json()

    // Log the notification
    await supabase.from('notifications_log').insert({
      channel: 'phone_call',
      destination: phone_number,
      payload: { hotel_name, room_type, price, available_count },
      status: 'initiated',
      provider_message_id: result.sid,
    })

    return NextResponse.json({
      success: true,
      sid: result.sid,
      status: result.status,
    })
  } catch (error) {
    console.error('Call error:', error)
    return NextResponse.json(
      { error: 'Failed to make call' },
      { status: 500 }
    )
  }
}

function generateTwiML(
  hotelName?: string,
  roomType?: string,
  price?: number,
  availableCount?: number
): string {
  const parts: string[] = []

  parts.push('Alert from Lottery Losers.')

  if (hotelName) {
    parts.push(`A room is available at ${hotelName}.`)
  } else {
    parts.push('A hotel room is available.')
  }

  if (roomType) {
    parts.push(`Room type: ${roomType}.`)
  }

  if (price) {
    parts.push(`Price: ${price} dollars per night.`)
  }

  if (availableCount) {
    parts.push(`${availableCount} rooms remaining.`)
  }

  parts.push('Book now before they are gone.')

  const message = parts.join(' ')

  // Escape XML special characters
  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  return `<Response>
    <Say voice="alice">${escapedMessage}</Say>
    <Pause length="1"/>
    <Say voice="alice">Goodbye.</Say>
  </Response>`
}
