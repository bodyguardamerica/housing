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

    // Hotels reference data changes only on rare scraper updates. Cache at
    // the edge for 5 min, serve-stale for 1 hr. Cuts function invocations
    // dramatically for repeated history-page loads.
    return NextResponse.json(
      { data: hotels || [] },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          'CDN-Cache-Control': 'public, s-maxage=300',
        },
      }
    )
  } catch (error) {
    console.error('Error fetching hotels:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hotels' },
      { status: 500 }
    )
  }
}
