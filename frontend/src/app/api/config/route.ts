import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { ConfigResponse } from '@/lib/types'

export async function GET() {
  const supabase = createServerClient()

  try {
    // Fetch all config values
    const { data: configs, error } = await supabase
      .from('app_config')
      .select('key, value')

    if (error) {
      throw error
    }

    // Build config object
    const configMap: Record<string, unknown> = {}
    for (const config of configs || []) {
      configMap[config.key] = config.value
    }

    const parseJsonString = (value: unknown): string | null => {
      if (typeof value === 'string') {
        // Remove quotes if it's a JSON string
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      }
      return value as string | null
    }

    const response: ConfigResponse = {
      current_year: Number(configMap.current_year) || new Date().getFullYear(),
      convention_start_date: parseJsonString(configMap.convention_start_date) || '',
      convention_end_date: parseJsonString(configMap.convention_end_date) || '',
      default_check_in: parseJsonString(configMap.default_check_in) || '',
      default_check_out: parseJsonString(configMap.default_check_out) || '',
      housing_first_day: parseJsonString(configMap.housing_first_day) || '',
      housing_last_day: parseJsonString(configMap.housing_last_day) || '',
      scraper_active: configMap.scraper_active === true || configMap.scraper_active === 'true',
      site_banner_message: parseJsonString(configMap.site_banner_message),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    )
  }
}
