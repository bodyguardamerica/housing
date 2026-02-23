'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

const STORAGE_KEY = 'gencon-hotels-passkey-url'

export function usePasskeyUrl() {
  const { session, isAuthenticated } = useAuth()
  const [passkeyUrl, setPasskeyUrlState] = useState<string>('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Load from localStorage first, then override with cloud data if authenticated
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setPasskeyUrlState(stored)
      }
      setIsLoaded(true)
    }
  }, [])

  // Load from cloud when authenticated
  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      loadFromCloud()
    }
  }, [isAuthenticated, session?.access_token])

  const loadFromCloud = async () => {
    if (!session?.access_token) return

    try {
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const { data } = await response.json()
        if (data?.passkey_url) {
          setPasskeyUrlState(data.passkey_url)
          // Also update localStorage for offline access
          localStorage.setItem(STORAGE_KEY, data.passkey_url)
        }
      }
    } catch (error) {
      console.error('Error loading settings from cloud:', error)
    }
  }

  const saveToCloud = async (url: string) => {
    if (!session?.access_token) return

    setIsSyncing(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passkey_url: url }),
      })
    } catch (error) {
      console.error('Error saving settings to cloud:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  // Save to localStorage and cloud
  const setPasskeyUrl = useCallback((url: string) => {
    setPasskeyUrlState(url)
    if (typeof window !== 'undefined') {
      if (url) {
        localStorage.setItem(STORAGE_KEY, url)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    // Sync to cloud if authenticated
    if (isAuthenticated) {
      saveToCloud(url)
    }
  }, [isAuthenticated, session?.access_token])

  return {
    passkeyUrl,
    setPasskeyUrl,
    isLoaded,
    isSyncing,
    hasPasskeyUrl: !!passkeyUrl,
  }
}
