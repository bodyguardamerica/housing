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
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Chicago', // CST/CDT
  })
}

export function StatusBar({
  lastScrapeAt,
  totalRooms,
  totalHotels,
  scraperActive,
}: StatusBarProps) {
  const [secondsAgo, setSecondsAgo] = useState(0)

  // Parse the timestamp safely
  const parseTimestamp = (ts: string | null): Date | null => {
    if (!ts) return null
    try {
      // Handle various timestamp formats from Supabase
      // Could be: "2024-02-25T10:00:00" or "2024-02-25T10:00:00.123456" or with +00:00
      let normalized = ts
      if (!ts.endsWith('Z') && !ts.includes('+')) {
        normalized = ts + 'Z'
      }
      const date = new Date(normalized)
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date parsed from:', ts)
        return null
      }
      return date
    } catch {
      console.error('Failed to parse timestamp:', ts)
      return null
    }
  }

  const lastScrapeDate = parseTimestamp(lastScrapeAt)

  useEffect(() => {
    const calculateSecondsAgo = () => {
      if (!lastScrapeDate) return 999999
      const diff = Math.floor((Date.now() - lastScrapeDate.getTime()) / 1000)
      return diff > 0 ? diff : 0
    }

    setSecondsAgo(calculateSecondsAgo())

    // Update every second to keep the "ago" time fresh
    const interval = setInterval(() => {
      setSecondsAgo(calculateSecondsAgo())
    }, 1000)

    return () => clearInterval(interval)
  }, [lastScrapeDate])

  const freshnessStatus = getFreshnessStatus(secondsAgo)
  const freshnessColor = getFreshnessColor(freshnessStatus)

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
