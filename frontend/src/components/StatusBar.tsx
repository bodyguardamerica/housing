'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  getFreshnessStatus,
  getFreshnessColor,
} from '@/lib/utils'

const REFRESH_INTERVAL = 60 // Scraper runs every 60 seconds

interface StatusBarProps {
  lastScrapeAt: string | null
  totalRooms: number
  totalHotels: number
  scraperActive: boolean
}

export function StatusBar({
  lastScrapeAt,
  totalRooms,
  totalHotels,
  scraperActive,
}: StatusBarProps) {
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(REFRESH_INTERVAL)

  useEffect(() => {
    const calculateTimeUntilRefresh = () => {
      if (!lastScrapeAt) return REFRESH_INTERVAL
      const secondsAgo = Math.floor((Date.now() - new Date(lastScrapeAt).getTime()) / 1000)
      const remaining = REFRESH_INTERVAL - (secondsAgo % REFRESH_INTERVAL)
      return remaining > 0 ? remaining : REFRESH_INTERVAL
    }

    setSecondsUntilRefresh(calculateTimeUntilRefresh())

    const interval = setInterval(() => {
      setSecondsUntilRefresh(calculateTimeUntilRefresh())
    }, 1000)

    return () => clearInterval(interval)
  }, [lastScrapeAt])

  const secondsAgo = lastScrapeAt
    ? Math.floor((Date.now() - new Date(lastScrapeAt).getTime()) / 1000)
    : 999999

  const freshnessStatus = getFreshnessStatus(secondsAgo)
  const freshnessColor = getFreshnessColor(freshnessStatus)

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={cn('w-3 h-3 rounded-full', freshnessColor)} />
            <span className="text-sm text-gray-600">
              {lastScrapeAt
                ? `Next update in ${secondsUntilRefresh}s`
                : 'No data yet'}
            </span>
          </div>

          {!scraperActive && (
            <span className="text-sm text-amber-600 font-medium">
              Scraper paused
            </span>
          )}
        </div>

        <div className="flex items-center space-x-6 text-sm">
          <div>
            <span className="text-gray-500">Available Rooms:</span>{' '}
            <span className="font-semibold text-gray-900">{totalRooms}</span>
          </div>
          <div>
            <span className="text-gray-500">Hotels:</span>{' '}
            <span className="font-semibold text-gray-900">{totalHotels}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
