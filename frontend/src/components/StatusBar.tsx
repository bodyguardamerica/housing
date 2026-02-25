'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  getFreshnessStatus,
  getFreshnessColor,
} from '@/lib/utils'

interface StatusBarProps {
  lastScrapeAt: string | null
  totalRooms: number
  totalHotels: number
  scraperActive: boolean
}

function formatTimeAgo(secondsAgo: number): string {
  if (secondsAgo < 60) {
    return `${secondsAgo}s ago`
  } else if (secondsAgo < 3600) {
    const minutes = Math.floor(secondsAgo / 60)
    return `${minutes}m ago`
  } else {
    const hours = Math.floor(secondsAgo / 3600)
    const minutes = Math.floor((secondsAgo % 3600) / 60)
    return minutes > 0 ? `${hours}h ${minutes}m ago` : `${hours}h ago`
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function StatusBar({
  lastScrapeAt,
  totalRooms,
  totalHotels,
  scraperActive,
}: StatusBarProps) {
  const [secondsAgo, setSecondsAgo] = useState(0)

  useEffect(() => {
    const calculateSecondsAgo = () => {
      if (!lastScrapeAt) return 999999
      return Math.floor((Date.now() - new Date(lastScrapeAt).getTime()) / 1000)
    }

    setSecondsAgo(calculateSecondsAgo())

    // Update every second to keep the "ago" time fresh
    const interval = setInterval(() => {
      setSecondsAgo(calculateSecondsAgo())
    }, 1000)

    return () => clearInterval(interval)
  }, [lastScrapeAt])

  const freshnessStatus = getFreshnessStatus(secondsAgo)
  const freshnessColor = getFreshnessColor(freshnessStatus)

  const lastScrapeDate = lastScrapeAt ? new Date(lastScrapeAt) : null

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={cn('w-3 h-3 rounded-full', freshnessColor)} />
            <span className="text-sm text-gray-600">
              {lastScrapeDate
                ? `Refreshed at ${formatTime(lastScrapeDate)} (${formatTimeAgo(secondsAgo)})`
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
