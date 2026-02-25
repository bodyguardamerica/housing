'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '@/hooks/useAdmin'
import { useAuth } from '@/hooks/useAuth'

interface AuthUser {
  id: string
  email: string
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const { isAuthenticated, session, loading: authLoading } = useAuth()
  const {
    isAdmin,
    loading: adminLoading,
    permissions,
    permissionsLoading,
    fetchPermissions,
    grantPermission,
    updatePermission,
    revokePermission,
  } = useAdmin()

  const [showGrantModal, setShowGrantModal] = useState(false)
  const [grantEmail, setGrantEmail] = useState('')
  const [grantUserId, setGrantUserId] = useState('')
  const [grantSms, setGrantSms] = useState(true)
  const [grantCall, setGrantCall] = useState(true)
  const [grantSmsLimit, setGrantSmsLimit] = useState(10)
  const [grantCallLimit, setGrantCallLimit] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // User search state
  const [users, setUsers] = useState<AuthUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [showUserDropdown, setShowUserDropdown] = useState(false)

  // Redirect unauthenticated users only (admins and non-admins can stay to see seed button)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, authLoading, router])

  // Fetch permissions when admin
  useEffect(() => {
    if (isAdmin) {
      fetchPermissions()
    }
  }, [isAdmin, fetchPermissions])

  // Fetch users when modal opens
  const fetchUsers = useCallback(async () => {
    if (!session?.access_token) return

    setUsersLoading(true)
    try {
      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setUsersLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    if (showGrantModal && isAdmin) {
      fetchUsers()
    }
  }, [showGrantModal, isAdmin, fetchUsers])

  // Filter users based on search
  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(userSearch.toLowerCase())
  )

  // Select a user from the dropdown
  const selectUser = (user: AuthUser) => {
    setGrantUserId(user.id)
    setGrantEmail(user.email || '')
    setUserSearch(user.email || '')
    setShowUserDropdown(false)
  }

  // Handle grant permission
  const handleGrant = async () => {
    if (!grantUserId) {
      setError('Please select a user')
      return
    }

    setError(null)
    const result = await grantPermission({
      user_id: grantUserId,
      user_email: grantEmail,
      sms_enabled: grantSms,
      call_enabled: grantCall,
      daily_sms_limit: grantSmsLimit,
      daily_call_limit: grantCallLimit,
    })

    if (result.success) {
      setShowGrantModal(false)
      setGrantEmail('')
      setGrantUserId('')
      setUserSearch('')
      setSuccess('Permission granted!')
      setTimeout(() => setSuccess(null), 3000)
    } else {
      setError(result.error || 'Failed to grant permission')
    }
  }

  // Reset modal state when closing
  const closeGrantModal = () => {
    setShowGrantModal(false)
    setGrantEmail('')
    setGrantUserId('')
    setUserSearch('')
    setShowUserDropdown(false)
    setError(null)
  }

  // Handle toggle permission
  const handleToggle = async (id: string, field: 'sms_enabled' | 'call_enabled', currentValue: boolean) => {
    await updatePermission({
      id,
      [field]: !currentValue,
    })
  }

  // Handle revoke
  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this permission?')) return
    const result = await revokePermission(id)
    if (!result.success) {
      setError(result.error || 'Failed to revoke')
    }
  }

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Please sign in</div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4">
        <div className="text-gray-600">Access denied</div>
        <p className="text-sm text-gray-500">You are not an admin.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Manage phone notification permissions</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            &larr; Back to Home
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-gray-900">{permissions.length}</div>
            <div className="text-gray-600">Total Permissions</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-blue-600">
              {permissions.filter(p => p.sms_enabled).length}
            </div>
            <div className="text-gray-600">SMS Enabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-purple-600">
              {permissions.filter(p => p.call_enabled).length}
            </div>
            <div className="text-gray-600">Calls Enabled</div>
          </div>
        </div>

        {/* Permissions Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Phone Permissions</h2>
            <button
              onClick={() => setShowGrantModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Grant Permission
            </button>
          </div>

          {permissionsLoading ? (
            <div className="p-6 text-center text-gray-600">Loading...</div>
          ) : permissions.length === 0 ? (
            <div className="p-6 text-center text-gray-600">
              No permissions granted yet. Click &quot;Grant Permission&quot; to add users.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">SMS</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Calls</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Usage Today</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {permissions.map((perm) => (
                    <tr key={perm.id}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {perm.user_email || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500">{perm.user_id}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggle(perm.id, 'sms_enabled', perm.sms_enabled)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            perm.sms_enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {perm.sms_enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        {perm.sms_enabled && (
                          <div className="text-xs text-gray-500 mt-1">
                            Limit: {perm.daily_sms_limit}/day
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggle(perm.id, 'call_enabled', perm.call_enabled)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            perm.call_enabled
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {perm.call_enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        {perm.call_enabled && (
                          <div className="text-xs text-gray-500 mt-1">
                            Limit: {perm.daily_call_limit}/day
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-600">
                        <div>SMS: {perm.sms_sent_today}/{perm.daily_sms_limit}</div>
                        <div>Calls: {perm.calls_made_today}/{perm.daily_call_limit}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleRevoke(perm.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Grant Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-50" onClick={closeGrantModal}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Grant Phone Permission</h3>

              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select User <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      setShowUserDropdown(true)
                      // Clear selection if user types
                      if (grantEmail !== e.target.value) {
                        setGrantUserId('')
                        setGrantEmail('')
                      }
                    }}
                    onFocus={() => setShowUserDropdown(true)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                    placeholder="Search by email..."
                  />
                  {showUserDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {usersLoading ? (
                        <div className="px-3 py-2 text-gray-500 text-sm">Loading users...</div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="px-3 py-2 text-gray-500 text-sm">No users found</div>
                      ) : (
                        filteredUsers.map(user => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => selectUser(user)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-100 text-sm text-gray-900"
                          >
                            {user.email}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {grantUserId && (
                    <p className="text-xs text-green-600 mt-1">
                      Selected: {grantEmail}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={grantSms}
                      onChange={(e) => setGrantSms(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Enable SMS</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={grantCall}
                      onChange={(e) => setGrantCall(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">Enable Calls</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Daily SMS Limit
                    </label>
                    <input
                      type="number"
                      value={grantSmsLimit}
                      onChange={(e) => setGrantSmsLimit(parseInt(e.target.value) || 10)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                      min="1"
                      max="100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Daily Call Limit
                    </label>
                    <input
                      type="number"
                      value={grantCallLimit}
                      onChange={(e) => setGrantCallLimit(parseInt(e.target.value) || 3)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                      min="1"
                      max="20"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeGrantModal}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrant}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Grant Permission
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
