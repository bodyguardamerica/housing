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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyAdmin(supabase: any) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user || !user.email) return null

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email)
    .single() as { data: { id: string } | null }

  return adminUser ? { user, adminId: adminUser.id } : null
}

// GET - List all users (admin only)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await verifyAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Use service role client to list users
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data, error } = await serviceClient.auth.admin.listUsers()

    if (error) {
      console.error('Error listing users:', error)
      return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
    }

    // Return simplified user list
    const users = data.users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
    }))

    return NextResponse.json({ data: users })
  } catch (err) {
    console.error('Error listing users:', err)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
}
