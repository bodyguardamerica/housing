import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { StatusResponse } from '@/lib/types'

export async function GET() {
  const supabase = createServerClient()

  try {
    // Get scraper active status
    const { data: activeConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'scraper_active')
      .single() as { data: { value: unknown } | null }

    // Get banner message
    const { data: bannerConfig } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'site_banner_message')
      .single() as { data: { value: unknown } | null }

    // Get last scrape
    const { data: lastScrape } = await supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single() as { data: Record<string, unknown> | null }

    // Get scrapes in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: scrapesLastHour } = await supabase
      .from('scrape_runs')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', oneHourAgo)

    // Get error count in last hour
    const { count: errorsLastHour } = await supabase
      .from('scrape_runs')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', oneHourAgo)
      .eq('status', 'error')

    const totalScrapes = scrapesLastHour || 0
    const totalErrors = errorsLastHour || 0
    const errorRate = totalScrapes > 0 ? totalErrors / totalScrapes : 0

    const response: StatusResponse = {
      scraper_active: activeConfig?.value === true || activeConfig?.value === 'true',
      last_scrape: lastScrape || null,
      scrapes_last_hour: totalScrapes,
      error_rate_last_hour: errorRate,
      database_size_mb: null, // Would require admin access to get
      banner_message: bannerConfig?.value as string | null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    )
  }
}
