'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

interface PhonePermissions {
  sms_enabled: boolean
  call_enabled: boolean
  daily_sms_limit: number
  daily_call_limit: number
  sms_sent_today: number
  calls_made_today: number
}

interface PhonePermissionsState {
  permissions: PhonePermissions | null
  loading: boolean
  error: string | null
}

export function usePhonePermissions() {
  const { session, isAuthenticated } = useAuth()
  const [state, setState] = useState<PhonePermissionsState>({
    permissions: null,
    loading: true,
    error: null,
  })

  const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated || !session?.access_token) {
      setState({
        permissions: null,
        loading: false,
        error: null,
      })
      return
    }

    try {
      // The user can only view their own permissions via RLS
      const response = await fetch('/api/user/phone-permissions', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        setState({
          permissions: null,
          loading: false,
          error: null, // No permissions is not an error
        })
        return
      }

      const data = await response.json()
      setState({
        permissions: data.data || null,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState({
        permissions: null,
        loading: false,
        error: 'Failed to fetch permissions',
      })
    }
  }, [isAuthenticated, session?.access_token])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  // Send test SMS
  const sendTestSms = async (phoneNumber: string) => {
    if (!session?.access_token) {
      return { success: false, error: 'Not authenticated' }
    }

    try {
      const response = await fetch('/api/twilio/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          message: 'Test SMS from Lottery Losers - Your alerts are working!',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to send SMS' }
      }

      // Refresh permissions to update usage count
      await fetchPermissions()
      return { success: true, sid: data.sid }
    } catch (err) {
      return { success: false, error: 'Network error' }
    }
  }

  // Make test call
  const makeTestCall = async (phoneNumber: string) => {
    if (!session?.access_token) {
      return { success: false, error: 'Not authenticated' }
    }

    try {
      const response = await fetch('/api/twilio/make-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          hotel_name: 'Test Hotel',
          room_type: 'Standard Room',
          price: 199,
          available_count: 1,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to make call' }
      }

      // Refresh permissions to update usage count
      await fetchPermissions()
      return { success: true, sid: data.sid }
    } catch (err) {
      return { success: false, error: 'Network error' }
    }
  }

  return {
    ...state,
    canSms: state.permissions?.sms_enabled &&
            (state.permissions.sms_sent_today < state.permissions.daily_sms_limit),
    canCall: state.permissions?.call_enabled &&
             (state.permissions.calls_made_today < state.permissions.daily_call_limit),
    smsRemaining: state.permissions
      ? state.permissions.daily_sms_limit - state.permissions.sms_sent_today
      : 0,
    callsRemaining: state.permissions
      ? state.permissions.daily_call_limit - state.permissions.calls_made_today
      : 0,
    sendTestSms,
    makeTestCall,
    refresh: fetchPermissions,
  }
}
