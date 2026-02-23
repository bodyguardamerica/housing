'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { LocalAlert, AlertMatch, AlertsState, RoomAvailability } from '@/lib/types'

const STORAGE_KEY = 'gencon-hotels-alerts'

const defaultState: AlertsState = {
  alerts: [],
  matches: [],
  lastMatchCheck: null,
  soundMuted: false,
}

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Play notification sound using Web Audio API
function playNotificationSound(): void {
  try {
    const AudioContextClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const audioContext = new AudioContextClass()

    // Create oscillator for a pleasant notification tone
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Two-tone "ding-ding" sound
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime) // A5 note
    oscillator.frequency.setValueAtTime(1108, audioContext.currentTime + 0.15) // C#6 note

    // Envelope for smooth attack and decay
    gainNode.gain.setValueAtTime(0, audioContext.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.15)
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.17)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)

    // Clean up
    setTimeout(() => audioContext.close(), 600)
  } catch (e) {
    console.error('Failed to play notification sound:', e)
  }
}

function loadFromStorage(): AlertsState {
  if (typeof window === 'undefined') return defaultState

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaultState, ...parsed }
    }
  } catch (e) {
    console.error('Failed to load alerts from localStorage:', e)
  }
  return defaultState
}

function saveToStorage(state: AlertsState): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save alerts to localStorage:', e)
  }
}

// Check if a room matches an alert's criteria
function roomMatchesAlert(room: RoomAvailability, alert: LocalAlert): boolean {
  if (!alert.enabled) return false

  // Hotel name partial match (case insensitive)
  if (alert.hotelName) {
    const searchName = alert.hotelName.toLowerCase()
    const hotelName = room.hotel_name.toLowerCase()
    if (!hotelName.includes(searchName)) return false
  }

  // Max price filter
  if (alert.maxPrice !== undefined && room.total_price !== null) {
    if (room.total_price > alert.maxPrice) return false
  }

  // Max distance filter
  if (alert.maxDistance !== undefined && room.distance_from_icc !== null) {
    if (room.distance_from_icc > alert.maxDistance) return false
  }

  // Skywalk requirement
  if (alert.requireSkywalk && !room.has_skywalk) return false

  // Minimum nights available (for partial availability)
  if (alert.minNightsAvailable !== undefined) {
    const nightsAvailable = room.nights_available ?? room.num_nights
    if (nightsAvailable < alert.minNightsAvailable) return false
  }

  return true
}

export function useAlerts() {
  const [state, setState] = useState<AlertsState>(defaultState)
  const [isLoaded, setIsLoaded] = useState(false)
  const previousMatchIdsRef = useRef<Set<string>>(new Set())

  // Load from localStorage on mount
  useEffect(() => {
    const loaded = loadFromStorage()
    setState(loaded)
    // Track existing matches so we don't play sound for them
    previousMatchIdsRef.current = new Set(
      loaded.matches.map((m) => `${m.alertId}-${m.room.snapshot_id}`)
    )
    setIsLoaded(true)
  }, [])

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (isLoaded) {
      saveToStorage(state)
    }
  }, [state, isLoaded])

  // Play notification sound
  const playSound = useCallback(() => {
    if (state.soundMuted) return
    playNotificationSound()
  }, [state.soundMuted])

  // Create a new alert
  const createAlert = useCallback((alert: Omit<LocalAlert, 'id' | 'createdAt'>) => {
    const newAlert: LocalAlert = {
      ...alert,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }

    setState((prev) => ({
      ...prev,
      alerts: [...prev.alerts, newAlert],
    }))

    return newAlert
  }, [])

  // Update an existing alert
  const updateAlert = useCallback((id: string, updates: Partial<LocalAlert>) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((alert) =>
        alert.id === id ? { ...alert, ...updates } : alert
      ),
    }))
  }, [])

  // Delete an alert
  const deleteAlert = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((alert) => alert.id !== id),
      matches: prev.matches.filter((match) => match.alertId !== id),
    }))
  }, [])

  // Toggle alert enabled state
  const toggleAlert = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((alert) =>
        alert.id === id ? { ...alert, enabled: !alert.enabled } : alert
      ),
    }))
  }, [])

  // Toggle sound for an alert
  const toggleAlertSound = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((alert) =>
        alert.id === id ? { ...alert, soundEnabled: !alert.soundEnabled } : alert
      ),
    }))
  }, [])

  // Toggle global sound mute
  const toggleMute = useCallback(() => {
    setState((prev) => ({
      ...prev,
      soundMuted: !prev.soundMuted,
    }))
  }, [])

  // Check rooms against alerts and update matches
  const checkMatches = useCallback((rooms: RoomAvailability[]) => {
    const enabledAlerts = state.alerts.filter((a) => a.enabled)
    if (enabledAlerts.length === 0) {
      setState((prev) => ({
        ...prev,
        matches: [],
        lastMatchCheck: new Date().toISOString(),
      }))
      return
    }

    const newMatches: AlertMatch[] = []
    const newMatchIds = new Set<string>()
    let hasNewMatch = false

    for (const alert of enabledAlerts) {
      for (const room of rooms) {
        if (roomMatchesAlert(room, alert)) {
          const matchKey = `${alert.id}-${room.snapshot_id}`
          newMatchIds.add(matchKey)

          newMatches.push({
            alertId: alert.id,
            alertName: alert.name,
            room,
            matchedAt: new Date().toISOString(),
          })

          // Check if this is a new match
          if (!previousMatchIdsRef.current.has(matchKey)) {
            hasNewMatch = true
            // Check if this specific alert has sound enabled
            if (alert.soundEnabled) {
              playSound()
            }
          }
        }
      }
    }

    // Update previous match IDs
    previousMatchIdsRef.current = newMatchIds

    setState((prev) => ({
      ...prev,
      matches: newMatches,
      lastMatchCheck: new Date().toISOString(),
    }))

    return hasNewMatch
  }, [state.alerts, playSound])

  // Clear a specific match (dismiss)
  const dismissMatch = useCallback((alertId: string, snapshotId: string) => {
    setState((prev) => ({
      ...prev,
      matches: prev.matches.filter(
        (m) => !(m.alertId === alertId && m.room.snapshot_id === snapshotId)
      ),
    }))
  }, [])

  // Clear all matches
  const clearAllMatches = useCallback(() => {
    setState((prev) => ({
      ...prev,
      matches: [],
    }))
  }, [])

  // Test sound playback (for user interaction to enable autoplay)
  const testSound = useCallback(() => {
    playNotificationSound()
  }, [])

  return {
    alerts: state.alerts,
    matches: state.matches,
    soundMuted: state.soundMuted,
    isLoaded,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    toggleAlertSound,
    toggleMute,
    checkMatches,
    dismissMatch,
    clearAllMatches,
    testSound,
  }
}
