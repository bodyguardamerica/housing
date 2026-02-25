import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

// GET - Fetch current user's phone permissions
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

  try {
    // Reset daily counters if needed (ignore errors if function doesn't exist)
    await supabase.rpc('reset_daily_phone_counters').catch(() => {})

    // Fetch user's phone permissions
    const { data: permissions, error } = await supabase
      .from('phone_permissions')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      // No permission record or table doesn't exist means no phone access
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return NextResponse.json({ data: null })
      }
      console.error('Error fetching phone permissions:', error)
      return NextResponse.json({ data: null })
    }

    return NextResponse.json({ data: permissions })
  } catch (err) {
    // Table might not exist yet
    console.error('Phone permissions error:', err)
    return NextResponse.json({ data: null })
  }
}
