'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { LocalAlert, AlertMatch, AlertsState, RoomAvailability } from '@/lib/types'

const STORAGE_KEY = 'gencon-hotels-alerts'

const defaultState: AlertsState = {
  alerts: [],
  matches: [],
  lastMatchCheck: null,
  soundMuted: false,
  alarmSound: 'chime',
  volume: 0.5,
}

// Browser notification helpers
function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  const permission = await Notification.requestPermission()
  return permission
}

function sendBrowserNotification(title: string, body: string, onClick?: () => void): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'gencon-hotel-match', // Replaces existing notifications with same tag
      requireInteraction: true, // Keep notification visible until user interacts
    })

    if (onClick) {
      notification.onclick = () => {
        window.focus()
        onClick()
        notification.close()
      }
    }
  } catch (e) {
    console.error('Failed to send browser notification:', e)
  }
}

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Persistent audio context for notifications
let audioContext: AudioContext | null = null

// Available alarm sounds
export const ALARM_SOUNDS = {
  chime: 'Chime',
  alert: 'Alert',
  bell: 'Bell',
  urgent: 'Urgent',
  gentle: 'Gentle',
} as const

export type AlarmSoundType = keyof typeof ALARM_SOUNDS

// Get or create the audio context
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (!audioContext) {
    const AudioContextClass = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass()
  }
  return audioContext
}

// Play notification sound using Web Audio API
async function playNotificationSound(soundType: AlarmSoundType = 'chime', volume: number = 0.5): Promise<void> {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    // Resume if suspended (required after user interaction)
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // Clamp volume between 0 and 1
    const vol = Math.max(0, Math.min(1, volume))

    switch (soundType) {
      case 'chime':
        await playChime(ctx, vol)
        break
      case 'alert':
        await playAlert(ctx, vol)
        break
      case 'bell':
        await playBell(ctx, vol)
        break
      case 'urgent':
        await playUrgent(ctx, vol)
        break
      case 'gentle':
        await playGentle(ctx, vol)
        break
      default:
        await playChime(ctx, vol)
    }
  } catch (e) {
    console.error('Failed to play notification sound:', e)
  }
}

// Chime - Two-tone pleasant ding
async function playChime(ctx: AudioContext, volume: number): Promise<void> {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, ctx.currentTime)
  oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.15)

  gainNode.gain.setValueAtTime(0, ctx.currentTime)
  gainNode.gain.linearRampToValueAtTime(0.3 * volume, ctx.currentTime + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.1 * volume, ctx.currentTime + 0.15)
  gainNode.gain.linearRampToValueAtTime(0.3 * volume, ctx.currentTime + 0.17)
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + 0.5)
}

// Alert - Three quick beeps
async function playAlert(ctx: AudioContext, volume: number): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(800, ctx.currentTime + i * 0.15)

    const startTime = ctx.currentTime + i * 0.15
    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(0.2 * volume, startTime + 0.01)
    gainNode.gain.linearRampToValueAtTime(0, startTime + 0.1)

    oscillator.start(startTime)
    oscillator.stop(startTime + 0.1)
  }
}

// Bell - Deep resonant tone
async function playBell(ctx: AudioContext, volume: number): Promise<void> {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(440, ctx.currentTime)

  gainNode.gain.setValueAtTime(0, ctx.currentTime)
  gainNode.gain.linearRampToValueAtTime(0.4 * volume, ctx.currentTime + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5)

  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + 1.5)
}

// Urgent - Rapid high-pitched alarm
async function playUrgent(ctx: AudioContext, volume: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = 'sawtooth'
    const freq = i % 2 === 0 ? 1200 : 900
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1)

    const startTime = ctx.currentTime + i * 0.1
    gainNode.gain.setValueAtTime(0.25 * volume, startTime)
    gainNode.gain.linearRampToValueAtTime(0, startTime + 0.08)

    oscillator.start(startTime)
    oscillator.stop(startTime + 0.08)
  }
}

// Gentle - Soft rising tone
async function playGentle(ctx: AudioContext, volume: number): Promise<void> {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(400, ctx.currentTime)
  oscillator.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5)

  gainNode.gain.setValueAtTime(0, ctx.currentTime)
  gainNode.gain.linearRampToValueAtTime(0.15 * volume, ctx.currentTime + 0.2)
  gainNode.gain.linearRampToValueAtTime(0.15 * volume, ctx.currentTime + 0.4)
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6)

  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + 0.6)
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

  // Only match rooms with FULL availability (not partial, not sold out)
  // Must have at least 1 room available
  if (room.available_count <= 0) return false

  // Exclude partial availability rooms (only some nights available)
  if (room.partial_availability === true) return false

  // Hotel name partial match (case insensitive)
  if (alert.hotelName) {
    const searchName = alert.hotelName.toLowerCase()
    const hotelName = room.hotel_name.toLowerCase()
    if (!hotelName.includes(searchName)) return false
  }

  // Max price per night filter
  if (alert.maxPrice !== undefined && room.nightly_rate !== null) {
    if (room.nightly_rate > alert.maxPrice) return false
  }

  // Max distance filter
  if (alert.maxDistance !== undefined && room.distance_from_icc !== null) {
    if (room.distance_from_icc > alert.maxDistance) return false
  }

  // Skywalk requirement
  if (alert.requireSkywalk && !room.has_skywalk) return false

  // Downtown requirement
  if (alert.requireDowntown && room.area !== 'downtown') return false

  return true
}

export function useAlerts() {
  const [state, setState] = useState<AlertsState>(defaultState)
  const [isLoaded, setIsLoaded] = useState(false)
  const [alarmActive, setAlarmActive] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [newMatches, setNewMatches] = useState<AlertMatch[]>([]) // Tracks brand new matches for full-screen modal
  const previousMatchIdsRef = useRef<Set<string>>(new Set())
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load from localStorage on mount and check notification permission
  useEffect(() => {
    const loaded = loadFromStorage()
    setState(loaded)
    // Track existing matches so we don't play sound for them
    previousMatchIdsRef.current = new Set(
      loaded.matches.map((m) => `${m.alertId}-${m.room.snapshot_id}`)
    )
    setIsLoaded(true)
    // Check notification permission
    setNotificationPermission(getNotificationPermission())
  }, [])

  // Request notification permission
  const requestNotifications = useCallback(async () => {
    const permission = await requestNotificationPermission()
    setNotificationPermission(permission)
    return permission
  }, [])

  // Acknowledge new matches (close full-screen modal)
  const acknowledgeNewMatches = useCallback(() => {
    setNewMatches([])
  }, [])

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (isLoaded) {
      saveToStorage(state)
    }
  }, [state, isLoaded])

  // Play notification sound (checks muted state via ref to avoid stale closure)
  const soundMutedRef = useRef(state.soundMuted)
  soundMutedRef.current = state.soundMuted

  const alarmSoundRef = useRef(state.alarmSound)
  alarmSoundRef.current = state.alarmSound

  const volumeRef = useRef(state.volume)
  volumeRef.current = state.volume

  const playSound = useCallback(() => {
    if (soundMutedRef.current) return
    playNotificationSound(alarmSoundRef.current, volumeRef.current)
  }, [])

  // Start repeating alarm
  const startAlarm = useCallback(() => {
    if (alarmIntervalRef.current) return // Already running

    // Play immediately
    playNotificationSound(alarmSoundRef.current, volumeRef.current)
    setAlarmActive(true)

    // Then repeat every 3 seconds
    alarmIntervalRef.current = setInterval(() => {
      if (!soundMutedRef.current) {
        playNotificationSound(alarmSoundRef.current, volumeRef.current)
      }
    }, 3000)
  }, [])

  // Stop the alarm
  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
    setAlarmActive(false)
  }, [])

  // Use refs for matches and alerts to check in the mute effect
  const matchesRef = useRef(state.matches)
  matchesRef.current = state.matches

  const alertsRef = useRef(state.alerts)
  alertsRef.current = state.alerts

  // Stop alarm when muted, restart when unmuted if matches exist
  useEffect(() => {
    if (state.soundMuted) {
      // Muting - stop the alarm
      if (alarmIntervalRef.current) {
        stopAlarm()
      }
    } else {
      // Unmuting - restart alarm if there are matches with sound-enabled alerts
      if (matchesRef.current.length > 0 && !alarmIntervalRef.current) {
        const hasMatchWithSound = matchesRef.current.some((match) => {
          const alert = alertsRef.current.find((a) => a.id === match.alertId)
          return alert?.soundEnabled
        })
        if (hasMatchWithSound) {
          startAlarm()
        }
      }
    }
  }, [state.soundMuted, stopAlarm, startAlarm])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current)
      }
    }
  }, [])

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

  // Delete an alert (and its linked Discord watcher if any)
  const deleteAlert = useCallback(async (id: string) => {
    // Find the alert to check for linked Discord watcher
    const alertToDelete = state.alerts.find((a) => a.id === id)

    // Delete linked Discord watcher if exists
    if (alertToDelete?.discordWatcherId) {
      try {
        const tokens = JSON.parse(localStorage.getItem('watcher_tokens') || '{}')
        const token = tokens[alertToDelete.discordWatcherId]
        if (token) {
          await fetch(`/api/watchers?id=${alertToDelete.discordWatcherId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
          // Remove token from localStorage
          delete tokens[alertToDelete.discordWatcherId]
          localStorage.setItem('watcher_tokens', JSON.stringify(tokens))
        }
      } catch (error) {
        console.error('Failed to delete linked Discord watcher:', error)
      }
    }

    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((alert) => alert.id !== id),
      matches: prev.matches.filter((match) => match.alertId !== id),
    }))
  }, [state.alerts])

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
    const currentAlerts = alertsRef.current
    const enabledAlerts = currentAlerts.filter((a) => a.enabled)
    if (enabledAlerts.length === 0) {
      setState((prev) => ({
        ...prev,
        matches: [],
        lastMatchCheck: new Date().toISOString(),
      }))
      return false
    }

    const allMatches: AlertMatch[] = []
    const brandNewMatches: AlertMatch[] = [] // Matches we haven't seen before
    const newMatchIds = new Set<string>()

    for (const alert of enabledAlerts) {
      for (const room of rooms) {
        if (roomMatchesAlert(room, alert)) {
          const matchKey = `${alert.id}-${room.snapshot_id}`
          newMatchIds.add(matchKey)

          const match: AlertMatch = {
            alertId: alert.id,
            alertName: alert.name,
            room,
            matchedAt: new Date().toISOString(),
          }
          allMatches.push(match)

          // Check if this is a brand new match
          if (!previousMatchIdsRef.current.has(matchKey)) {
            brandNewMatches.push(match)
            // Check if this specific alert has sound enabled - start repeating alarm
            if (alert.soundEnabled && !alarmIntervalRef.current) {
              startAlarm()
            }
          }
        }
      }
    }

    // Update previous match IDs
    previousMatchIdsRef.current = newMatchIds

    setState((prev) => ({
      ...prev,
      matches: allMatches,
      lastMatchCheck: new Date().toISOString(),
    }))

    // If there are brand new matches, send browser notification and set newMatches for full-screen modal
    if (brandNewMatches.length > 0) {
      // Send browser notification
      const roomCount = brandNewMatches.length
      const hotelNames = [...new Set(brandNewMatches.map(m => m.room.hotel_name))].slice(0, 3)
      const notificationBody = roomCount === 1
        ? `${brandNewMatches[0].room.hotel_name} - ${brandNewMatches[0].room.room_type}`
        : `${roomCount} rooms found at ${hotelNames.join(', ')}${hotelNames.length < brandNewMatches.length ? '...' : ''}`

      sendBrowserNotification(
        'Hotel Room Found!',
        notificationBody,
        () => window.focus()
      )

      // Filter matches to only show full-screen modal for alerts with fullScreenEnabled
      const fullScreenMatches = brandNewMatches.filter((match) => {
        const alert = alertsRef.current.find((a) => a.id === match.alertId)
        return alert?.fullScreenEnabled
      })

      // Set new matches for full-screen modal (only those with fullScreenEnabled)
      if (fullScreenMatches.length > 0) {
        setNewMatches(fullScreenMatches)
      }
    }

    // If there are matches with sound-enabled alerts and alarm isn't running, start it
    if (allMatches.length > 0 && !alarmIntervalRef.current) {
      const hasMatchWithSound = allMatches.some((match) => {
        const alert = alertsRef.current.find((a) => a.id === match.alertId)
        return alert?.soundEnabled
      })
      if (hasMatchWithSound) {
        startAlarm()
      }
    }

    return brandNewMatches.length > 0
  }, [startAlarm])

  // Clear a specific match (dismiss)
  const dismissMatch = useCallback((alertId: string, snapshotId: string) => {
    setState((prev) => {
      const newMatches = prev.matches.filter(
        (m) => !(m.alertId === alertId && m.room.snapshot_id === snapshotId)
      )
      // Stop alarm if no more matches
      if (newMatches.length === 0) {
        stopAlarm()
      }
      return {
        ...prev,
        matches: newMatches,
      }
    })
  }, [stopAlarm])

  // Clear all matches
  const clearAllMatches = useCallback(() => {
    stopAlarm()
    setState((prev) => ({
      ...prev,
      matches: [],
    }))
  }, [stopAlarm])

  // Set the alarm sound type
  const setAlarmSound = useCallback((sound: AlarmSoundType) => {
    setState((prev) => ({ ...prev, alarmSound: sound }))
  }, [])

  // Set the volume level
  const setVolume = useCallback((vol: number) => {
    setState((prev) => ({ ...prev, volume: Math.max(0, Math.min(1, vol)) }))
  }, [])

  // Test sound playback (for user interaction to enable autoplay)
  const testSound = useCallback((sound?: AlarmSoundType) => {
    playNotificationSound(sound || alarmSoundRef.current, volumeRef.current)
  }, [])

  // Set alerts from external source (e.g., server sync)
  const setAlerts = useCallback((alerts: LocalAlert[]) => {
    setState((prev) => ({
      ...prev,
      alerts,
    }))
    // Update the ref
    alertsRef.current = alerts
  }, [])

  return {
    alerts: state.alerts,
    matches: state.matches,
    newMatches, // Brand new matches for full-screen modal
    soundMuted: state.soundMuted,
    alarmSound: state.alarmSound,
    volume: state.volume,
    alarmActive,
    isLoaded,
    notificationPermission,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
    toggleAlertSound,
    toggleMute,
    checkMatches,
    dismissMatch,
    clearAllMatches,
    acknowledgeNewMatches, // Close full-screen modal
    requestNotifications, // Request browser notification permission
    stopAlarm,
    testSound,
    setAlarmSound,
    setVolume,
    setAlerts, // Set alerts from external source (server sync)
  }
}
