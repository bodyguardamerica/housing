import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()

  try {
    // Get current year from config
    const { data: yearConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'current_year')
      .single() as { data: { value: unknown } | null }

    const currentYear = Number(yearConfig?.value) || new Date().getFullYear()

    // Fetch hotels for current year
    const { data: hotels, error } = await supabase
      .from('hotels')
      .select('*')
      .eq('year', currentYear)
      .order('distance_from_icc', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ data: hotels || [] })
  } catch (error) {
    console.error('Error fetching hotels:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hotels' },
      { status: 500 }
    )
  }
}
