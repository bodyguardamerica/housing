import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// POST - Seed the initial admin from ADMIN_EMAIL environment variable
// This is called once to set up the initial admin user
export async function POST() {
  const adminEmail = process.env.ADMIN_EMAIL

  if (!adminEmail) {
    return NextResponse.json(
      { error: 'ADMIN_EMAIL environment variable not set' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Check if admin already exists
  const { data: existing } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', adminEmail)
    .single() as { data: { id: string } | null }

  if (existing) {
    return NextResponse.json({
      message: 'Admin already exists',
      email: adminEmail
    })
  }

  // Insert admin
  const { error } = await supabase
    .from('admin_users')
    .insert({ email: adminEmail } as Record<string, unknown>)

  if (error) {
    console.error('Error seeding admin:', error)
    return NextResponse.json(
      { error: 'Failed to seed admin' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    message: 'Admin seeded successfully',
    email: adminEmail
  })
}
