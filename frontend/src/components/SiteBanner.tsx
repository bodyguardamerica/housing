'use client'

import { useEffect, useState } from 'react'
import type { ConfigResponse } from '@/lib/types'

// Prominent site-wide banner shown when monitoring is paused (off-season)
// or whenever an admin sets app_config.site_banner_message. Data source is
// /api/config, which returns both scraper_active and site_banner_message.
// The banner appears when scraping is paused OR a custom message is set.
export function SiteBanner() {
  const [config, setConfig] = useState<ConfigResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setConfig(data)
      })
      .catch(() => {
        /* non-fatal: banner just won't render */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!config) return null

  const paused = config.scraper_active === false
  const message =
    config.site_banner_message ||
    (paused
      ? '⏸️ Monitoring is paused for the off-season. Room data shown may be outdated.'
      : null)

  if (!paused && !message) return null

  return (
    <div
      role="status"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center shadow-sm"
    >
      <p className="text-sm font-semibold text-amber-800 sm:text-base">
        {message}
      </p>
    </div>
  )
}
