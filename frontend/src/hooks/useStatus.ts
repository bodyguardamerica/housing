'use client'

import { useEffect, useState, useCallback } from 'react'
import type { StatusResponse } from '@/lib/types'

export function useStatus(pollInterval = 30000) {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/status')
      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }

      const data: StatusResponse = await response.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(fetchStatus, pollInterval)
    return () => clearInterval(interval)
  }, [fetchStatus, pollInterval])

  return { status, loading, error, refetch: fetchStatus }
}
