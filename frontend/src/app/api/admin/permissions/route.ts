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

async function verifyAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email)
    .single()

  return adminUser ? { user, adminId: adminUser.id } : null
}

// GET - List all users with phone permissions
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

  // Get all phone permissions
  const { data: permissions, error } = await supabase
    .from('phone_permissions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching permissions:', error)
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 })
  }

  return NextResponse.json({ data: permissions })
}

// POST - Grant phone permissions to a user
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await verifyAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { user_id, user_email, sms_enabled, call_enabled, daily_sms_limit, daily_call_limit } = body

  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  // Insert or update permission
  const { data: permission, error } = await supabase
    .from('phone_permissions')
    .upsert({
      user_id,
      user_email,
      granted_by: admin.adminId,
      sms_enabled: sms_enabled ?? false,
      call_enabled: call_enabled ?? false,
      daily_sms_limit: daily_sms_limit ?? 10,
      daily_call_limit: daily_call_limit ?? 3,
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()

  if (error) {
    console.error('Error granting permission:', error)
    return NextResponse.json({ error: 'Failed to grant permission' }, { status: 500 })
  }

  return NextResponse.json({ data: permission })
}

// PUT - Update phone permissions
export async function PUT(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await verifyAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { id, sms_enabled, call_enabled, daily_sms_limit, daily_call_limit } = body

  if (!id) {
    return NextResponse.json({ error: 'Permission id is required' }, { status: 400 })
  }

  const { data: permission, error } = await supabase
    .from('phone_permissions')
    .update({
      sms_enabled,
      call_enabled,
      daily_sms_limit,
      daily_call_limit,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating permission:', error)
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 })
  }

  return NextResponse.json({ data: permission })
}

// DELETE - Revoke phone permissions
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const supabase = createAuthClient(authHeader)

  if (!supabase) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await verifyAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Permission id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('phone_permissions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting permission:', error)
    return NextResponse.json({ error: 'Failed to delete permission' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
