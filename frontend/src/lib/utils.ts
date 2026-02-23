import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get a human-readable distance label.
 */
export function getDistanceLabel(
  distance: number | null,
  unit: number,
  hasSkywalk: boolean
): string {
  if (hasSkywalk) return 'Skywalk'
  if (distance === null || distance === 0) return 'Adjacent'

  const unitLabels: Record<number, string> = {
    1: 'blocks',
    2: 'yards',
    3: 'miles',
    4: 'meters',
    5: 'km',
  }

  // Round to 2 decimal places
  const roundedDistance = Math.round(distance * 100) / 100

  return `${roundedDistance} ${unitLabels[unit] || 'units'}`
}

/**
 * Format a price as USD currency.
 */
export function formatPrice(price: number | null): string {
  if (price === null) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

/**
 * Format a date as a short string.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  })
}

/**
 * Get a relative time string (e.g., "2 minutes ago").
 */
export function getRelativeTime(secondsAgo: number): string {
  if (secondsAgo < 60) {
    return `${secondsAgo}s ago`
  }
  if (secondsAgo < 3600) {
    const minutes = Math.floor(secondsAgo / 60)
    return `${minutes}m ago`
  }
  if (secondsAgo < 86400) {
    const hours = Math.floor(secondsAgo / 3600)
    return `${hours}h ago`
  }
  const days = Math.floor(secondsAgo / 86400)
  return `${days}d ago`
}

/**
 * Get the freshness status based on seconds since last update.
 */
export function getFreshnessStatus(
  secondsAgo: number
): 'fresh' | 'stale' | 'error' {
  if (secondsAgo < 120) return 'fresh' // < 2 minutes
  if (secondsAgo < 300) return 'stale' // < 5 minutes
  return 'error'
}

/**
 * Get the CSS color class for freshness status.
 */
export function getFreshnessColor(status: 'fresh' | 'stale' | 'error'): string {
  switch (status) {
    case 'fresh':
      return 'bg-green-500'
    case 'stale':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
  }
}

/**
 * Returns the Passkey URL if provided, otherwise null.
 * The second parameter is unused but kept for backwards compatibility.
 */
export function buildHotelBookingUrl(
  basePasskeyUrl: string | undefined,
  _unused?: string | number
): string | null {
  return basePasskeyUrl || null
}
