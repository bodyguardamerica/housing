'use client'

import { cn } from '@/lib/utils'
import {
  getRelativeTime,
  getFreshnessStatus,
  getFreshnessColor,
} from '@/lib/utils'

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
                ? `Updated ${getRelativeTime(secondsAgo)}`
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
