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

// GET - Check if current user is an admin
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ isAdmin: false }, { status: 200 })
  }

  // Verify the user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ isAdmin: false }, { status: 200 })
  }

  // Check if user's email is in admin_users table
  try {
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('email', user.email)
      .single()

    if (error || !adminUser) {
      return NextResponse.json({ isAdmin: false, email: user.email }, { status: 200 })
    }

    return NextResponse.json({
      isAdmin: true,
      email: user.email,
      adminId: adminUser.id
    }, { status: 200 })
  } catch (err) {
    // Table might not exist yet
    console.error('Admin check error:', err)
    return NextResponse.json({ isAdmin: false, email: user.email }, { status: 200 })
  }
}
