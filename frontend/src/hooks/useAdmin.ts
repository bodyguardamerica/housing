'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

interface AdminStatus {
  isAdmin: boolean
  email: string | null
  adminId: string | null
  loading: boolean
  error: string | null
}

interface PhonePermission {
  id: string
  user_id: string
  user_email: string | null
  sms_enabled: boolean
  call_enabled: boolean
  daily_sms_limit: number
  daily_call_limit: number
  sms_sent_today: number
  calls_made_today: number
  created_at: string
  updated_at: string
}

export function useAdmin() {
  const { session, isAuthenticated } = useAuth()
  const [status, setStatus] = useState<AdminStatus>({
    isAdmin: false,
    email: null,
    adminId: null,
    loading: true,
    error: null,
  })
  const [permissions, setPermissions] = useState<PhonePermission[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!isAuthenticated || !session?.access_token) {
        setStatus({
          isAdmin: false,
          email: null,
          adminId: null,
          loading: false,
          error: null,
        })
        return
      }

      try {
        const response = await fetch('/api/admin/check', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        const data = await response.json()
        setStatus({
          isAdmin: data.isAdmin,
          email: data.email || null,
          adminId: data.adminId || null,
          loading: false,
          error: null,
        })
      } catch (err) {
        setStatus({
          isAdmin: false,
          email: null,
          adminId: null,
          loading: false,
          error: 'Failed to check admin status',
        })
      }
    }

    checkAdmin()
  }, [isAuthenticated, session?.access_token])

  // Fetch all phone permissions (admin only)
  const fetchPermissions = useCallback(async () => {
    if (!status.isAdmin || !session?.access_token) return

    setPermissionsLoading(true)
    try {
      const response = await fetch('/api/admin/permissions', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPermissions(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch permissions:', err)
    } finally {
      setPermissionsLoading(false)
    }
  }, [status.isAdmin, session?.access_token])

  // Grant or update permissions
  const grantPermission = async (params: {
    user_id: string
    user_email?: string
    sms_enabled?: boolean
    call_enabled?: boolean
    daily_sms_limit?: number
    daily_call_limit?: number
  }) => {
    if (!session?.access_token) return { success: false, error: 'Not authenticated' }

    try {
      const response = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        const data = await response.json()
        return { success: false, error: data.error || 'Failed to grant permission' }
      }

      await fetchPermissions()
      return { success: true }
    } catch (err) {
      return { success: false, error: 'Network error' }
    }
  }

  // Update existing permission
  const updatePermission = async (params: {
    id: string
    sms_enabled?: boolean
    call_enabled?: boolean
    daily_sms_limit?: number
    daily_call_limit?: number
  }) => {
    if (!session?.access_token) return { success: false, error: 'Not authenticated' }

    try {
      const response = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        const data = await response.json()
        return { success: false, error: data.error || 'Failed to update permission' }
      }

      await fetchPermissions()
      return { success: true }
    } catch (err) {
      return { success: false, error: 'Network error' }
    }
  }

  // Revoke permission
  const revokePermission = async (id: string) => {
    if (!session?.access_token) return { success: false, error: 'Not authenticated' }

    try {
      const response = await fetch(`/api/admin/permissions?id=${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json()
        return { success: false, error: data.error || 'Failed to revoke permission' }
      }

      await fetchPermissions()
      return { success: true }
    } catch (err) {
      return { success: false, error: 'Network error' }
    }
  }

  // Seed initial admin (one-time setup)
  const seedAdmin = async () => {
    try {
      const response = await fetch('/api/admin/seed', {
        method: 'POST',
      })
      return response.json()
    } catch (err) {
      return { error: 'Failed to seed admin' }
    }
  }

  return {
    ...status,
    permissions,
    permissionsLoading,
    fetchPermissions,
    grantPermission,
    updatePermission,
    revokePermission,
    seedAdmin,
  }
}
