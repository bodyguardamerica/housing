'use client'

import { useState, useEffect, useRef } from 'react'
import type { LocalAlert } from '@/lib/types'
import { HOTEL_AREAS } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'
import { usePhonePermissions } from '@/hooks/usePhonePermissions'

// Discord watchers require authentication, so we always use localStorage
function getWatcherTokens(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem('watcher_tokens') || '{}')
  } catch {
    return {}
  }
}

function setWatcherTokens(tokens: Record<string, string>) {
  if (typeof window === 'undefined') return
  localStorage.setItem('watcher_tokens', JSON.stringify(tokens))
}

interface UnifiedAlertModalProps {
  isOpen: boolean
  onClose: () => void
  onSaveLocal: (alert: Omit<LocalAlert, 'id' | 'createdAt'>) => void
  editingAlert?: LocalAlert | null
}

export function UnifiedAlertModal({
  isOpen,
  onClose,
  onSaveLocal,
  editingAlert,
}: UnifiedAlertModalProps) {
  const { isAuthenticated, session } = useAuth()
  const { permissions: phonePermissions, sendTestSms, makeTestCall } = usePhonePermissions()

  // Notification types
  const [visualEnabled, setVisualEnabled] = useState(true)
  const [fullScreenEnabled, setFullScreenEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [discordMention, setDiscordMention] = useState('')

  // Phone notifications (requires permission)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [callEnabled, setCallEnabled] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsTestStatus, setSmsTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [callTestStatus, setCallTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  // Filter criteria
  const [name, setName] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDistance, setMaxDistance] = useState('')
  const [requireSkywalk, setRequireSkywalk] = useState(false)
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [areasDropdownOpen, setAreasDropdownOpen] = useState(false)
  const areasDropdownRef = useRef<HTMLDivElement>(null)

  // State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  // Reset form when modal opens or editingAlert changes
  useEffect(() => {
    if (isOpen) {
      setName(editingAlert?.name || '')
      setHotelName(editingAlert?.hotelName || '')
      setMaxPrice(editingAlert?.maxPrice?.toString() || '')
      setMaxDistance(editingAlert?.maxDistance?.toString() || '')
      setRequireSkywalk(editingAlert?.requireSkywalk || false)
      setSelectedAreas(editingAlert?.includedAreas || [])
      setSoundEnabled(editingAlert?.soundEnabled ?? true)
      setFullScreenEnabled(editingAlert?.fullScreenEnabled ?? true)
      setVisualEnabled(true)
      // Preserve Discord settings if alert already has a linked watcher
      setDiscordEnabled(!!editingAlert?.discordWatcherId)
      setDiscordWebhook('') // Webhook is stored server-side, don't expose
      setDiscordMention('') // Will be fetched below if editing
      // Phone notifications
      setSmsEnabled(editingAlert?.smsEnabled || false)
      setCallEnabled(editingAlert?.callEnabled || false)
      setPhoneNumber(editingAlert?.phoneNumber || '')
      setSmsMessage(editingAlert?.smsMessage || '')
      setSmsTestStatus('idle')
      setCallTestStatus('idle')
      setError(null)
      setTestStatus('idle')
    }
  }, [isOpen, editingAlert])

  // Fetch watcher details when editing an alert with a discordWatcherId
  useEffect(() => {
    if (isOpen && editingAlert?.discordWatcherId) {
      const fetchWatcherDetails = async () => {
        try {
          const response = await fetch(`/api/watchers?ids=${editingAlert.discordWatcherId}`)
          if (response.ok) {
            const data = await response.json()
            if (data.data && data.data.length > 0) {
              const watcher = data.data[0]
              if (watcher.discord_mention) {
                setDiscordMention(watcher.discord_mention)
              }
            }
          }
        } catch (err) {
          console.error('Failed to fetch watcher details:', err)
        }
      }
      fetchWatcherDetails()
    }
  }, [isOpen, editingAlert?.discordWatcherId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (areasDropdownRef.current && !areasDropdownRef.current.contains(event.target as Node)) {
        setAreasDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleArea = (area: string) => {
    setSelectedAreas(prev =>
      prev.includes(area)
        ? prev.filter(a => a !== area)
        : [...prev, area]
    )
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an alert name')
      return
    }

    const hasNotificationType = visualEnabled || fullScreenEnabled || soundEnabled || discordEnabled || smsEnabled || callEnabled
    if (!hasNotificationType) {
      setError('Please select at least one notification type')
      return
    }

    // Validate phone number if SMS or call enabled
    if ((smsEnabled || callEnabled) && !phoneNumber) {
      setError('Please enter a phone number for SMS/call notifications')
      return
    }

    const hasAnyCriteria = hotelName || maxPrice || maxDistance || requireSkywalk || selectedAreas.length > 0
    if (!hasAnyCriteria) {
      setError('Please set at least one filter criteria')
      return
    }

    // Only require webhook if Discord enabled AND no existing watcher
    if (discordEnabled && !discordWebhook && !editingAlert?.discordWatcherId) {
      setError('Please enter a Discord webhook URL')
      return
    }

    setLoading(true)

    try {
      // Preserve existing discordWatcherId if editing and Discord still enabled
      let discordWatcherId: string | undefined =
        (discordEnabled && editingAlert?.discordWatcherId) ? editingAlert.discordWatcherId : undefined

      // If user disabled Discord on an existing alert, delete the watcher
      if (!discordEnabled && editingAlert?.discordWatcherId) {
        try {
          const tokens = getWatcherTokens()
          const token = tokens[editingAlert.discordWatcherId]
          if (token) {
            await fetch(`/api/watchers?id=${editingAlert.discordWatcherId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            })
            delete tokens[editingAlert.discordWatcherId]
            setWatcherTokens(tokens)
          }
        } catch (err) {
          console.error('Failed to delete Discord watcher:', err)
        }
      }

      // Create NEW Discord watcher only if enabled AND new webhook provided
      if (discordEnabled && discordWebhook) {
        // Convert comma-separated mentions to space-separated for Discord
        const processedMention = discordMention
          .split(',')
          .map(m => m.trim())
          .filter(m => m.length > 0)
          .join(' ')
        const response = await fetch('/api/watchers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            discord_webhook_url: discordWebhook,
            discord_mention: processedMention || undefined,
            max_price: maxPrice ? parseFloat(maxPrice) : undefined,
            max_distance: maxDistance ? parseFloat(maxDistance) : undefined,
            require_skywalk: requireSkywalk,
            cooldown_minutes: 15,
            alert_name: name.trim(), // For test message
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to create Discord watcher')
        }

        const data = await response.json()
        discordWatcherId = data.id
        // Store manage token in localStorage (Discord requires authentication)
        const existingTokens = getWatcherTokens()
        existingTokens[data.id] = data.manage_token
        setWatcherTokens(existingTokens)
      }

      // Create local alert (always create so Discord can be linked)
      onSaveLocal({
        name: name.trim(),
        hotelName: hotelName.trim() || undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        maxDistance: maxDistance ? parseFloat(maxDistance) : undefined,
        requireSkywalk,
        includedAreas: selectedAreas.length > 0 ? selectedAreas : undefined,
        enabled: true,
        soundEnabled,
        fullScreenEnabled,
        discordWatcherId,
        // Phone notifications
        smsEnabled,
        callEnabled,
        phoneNumber: phoneNumber.trim() || undefined,
        smsMessage: smsMessage.trim() || undefined,
      })

      // Reset and close
      resetForm()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setName('')
    setHotelName('')
    setMaxPrice('')
    setMaxDistance('')
    setRequireSkywalk(false)
    setSelectedAreas([])
    setSoundEnabled(true)
    setFullScreenEnabled(true)
    setVisualEnabled(true)
    setDiscordEnabled(false)
    setDiscordWebhook('')
    setDiscordMention('')
    setTestStatus('idle')
    // Phone notifications
    setSmsEnabled(false)
    setCallEnabled(false)
    setPhoneNumber('')
    setSmsMessage('')
    setSmsTestStatus('idle')
    setCallTestStatus('idle')
  }

  const sendDiscordTest = async () => {
    if (!discordWebhook) {
      setError('Please enter a webhook URL first')
      return
    }

    setTestStatus('sending')
    try {
      // Convert comma-separated mentions to space-separated for Discord
      const mentions = discordMention
        .split(',')
        .map(m => m.trim())
        .filter(m => m.length > 0)
        .join(' ')
      const mentionPrefix = mentions ? `${mentions} ` : ''
      const message = {
        content: `${mentionPrefix}🔔 **Test Notification**`,
        embeds: [{
          title: 'Test Alert',
          description: 'This is a test notification from Lottery Losers.',
          color: 0x3b82f6, // blue
          footer: {
            text: 'Lottery Losers | GenCon Hotel Tracker',
          },
          timestamp: new Date().toISOString(),
        }]
      }

      const response = await fetch(discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })

      if (response.ok) {
        setTestStatus('success')
        setTimeout(() => setTestStatus('idle'), 3000)
      } else {
        setTestStatus('error')
        setError('Failed to send test - check your webhook URL')
      }
    } catch {
      setTestStatus('error')
      setError('Failed to send test - check your webhook URL')
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black opacity-50" onClick={onClose}></div>

        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {editingAlert ? 'Edit Alert' : 'Create Alert'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Alert Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alert Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                placeholder="e.g., Cheap downtown hotel"
              />
            </div>

            {/* Notification Types */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                How do you want to be notified?
              </label>
              <div className="space-y-3">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visualEnabled}
                    onChange={(e) => setVisualEnabled(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-gencon-blue border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Visual</span>
                    <p className="text-xs text-gray-500">Highlight matches at the top of the page</p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fullScreenEnabled}
                    onChange={(e) => setFullScreenEnabled(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-gencon-blue border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Full-Screen Popup</span>
                    <p className="text-xs text-gray-500">Show a large popup with Book Now button</p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-gencon-blue border-gray-300 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Sound</span>
                    <p className="text-xs text-gray-500">Play an alert sound (keep tab open)</p>
                  </div>
                </label>

                <div>
                  <label className={`flex items-start space-x-3 ${isAuthenticated ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={discordEnabled}
                      onChange={(e) => setDiscordEnabled(e.target.checked)}
                      disabled={!isAuthenticated}
                      className="w-4 h-4 mt-0.5 text-gencon-blue border-gray-300 rounded disabled:opacity-50"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Discord</span>
                      <p className="text-xs text-gray-500">
                        {isAuthenticated
                          ? 'Send notifications to a Discord channel'
                          : 'Sign in to enable Discord notifications'}
                      </p>
                    </div>
                  </label>
                  {discordEnabled && isAuthenticated && (
                    <div className="mt-2 ml-7 space-y-3">
                      {editingAlert?.discordWatcherId && !discordWebhook ? (
                        <p className="text-sm text-green-600">
                          ✓ Discord webhook configured
                        </p>
                      ) : (
                        <div>
                          <input
                            type="url"
                            value={discordWebhook}
                            onChange={(e) => setDiscordWebhook(e.target.value)}
                            className="w-[calc(100%-1.75rem)] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                            placeholder="https://discord.com/api/webhooks/..."
                          />
                          <details className="mt-1">
                            <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                              How to get a webhook URL
                            </summary>
                            <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-gray-700 space-y-1">
                              <p className="font-medium">First, enable Developer Mode:</p>
                              <p>User Settings → Advanced → Developer Mode</p>
                              <p className="font-medium pt-1">Then create webhook:</p>
                              <p>1. Right-click the channel → <strong>Edit Channel</strong></p>
                              <p>2. Go to <strong>Integrations</strong> → <strong>Webhooks</strong></p>
                              <p>3. Click <strong>New Webhook</strong> → <strong>Copy Webhook URL</strong></p>
                            </div>
                          </details>
                        </div>
                      )}
                      <div>
                        <input
                          type="text"
                          value={discordMention}
                          onChange={(e) => setDiscordMention(e.target.value)}
                          className="w-[calc(100%-1.75rem)] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                          placeholder="e.g., <@123>, <@456> (comma-separated)"
                        />
                        <details className="mt-1">
                          <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                            How to get a user or role ID
                          </summary>
                          <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-gray-700 space-y-1">
                            <p className="font-medium">Enable Developer Mode first:</p>
                            <p>User Settings → Advanced → Developer Mode</p>
                            <p className="font-medium pt-1">Then copy ID:</p>
                            <p>Right-click a user or role → <strong>Copy ID</strong></p>
                            <p className="pt-1 border-t border-blue-200">
                              <strong>Format:</strong> User: <code className="bg-blue-100 px-1 rounded">&lt;@ID&gt;</code> | Role: <code className="bg-blue-100 px-1 rounded">&lt;@&amp;ID&gt;</code>
                            </p>
                            <p className="pt-1">
                              <strong>Multiple:</strong> Separate with commas, e.g., <code className="bg-blue-100 px-1 rounded">&lt;@123&gt;, &lt;@456&gt;</code>
                            </p>
                          </div>
                        </details>
                      </div>
                      {/* Test Button */}
                      <button
                        type="button"
                        onClick={sendDiscordTest}
                        disabled={!discordWebhook || testStatus === 'sending'}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          testStatus === 'success'
                            ? 'bg-green-100 text-green-700'
                            : testStatus === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                        }`}
                      >
                        {testStatus === 'sending' ? 'Sending...' :
                         testStatus === 'success' ? '✓ Sent!' :
                         testStatus === 'error' ? 'Failed' :
                         'Send Test'}
                      </button>
                    </div>
                  )}
                </div>

                {/* SMS Notification - disabled (Twilio SMS not configured) */}
                {phonePermissions?.sms_enabled && (
                  <div className="opacity-50">
                    <label className="flex items-start space-x-3 cursor-not-allowed">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled
                        className="w-4 h-4 mt-0.5 text-gray-300 border-gray-300 rounded cursor-not-allowed"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-500">SMS Text Message</span>
                        <p className="text-xs text-gray-400">Coming soon - not yet configured</p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Phone Call Notification - only shown if user has permission */}
                {phonePermissions?.call_enabled && (
                  <div>
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={callEnabled}
                        onChange={(e) => setCallEnabled(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-gencon-blue border-gray-300 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">Phone Call</span>
                        <p className="text-xs text-gray-500">Receive automated voice call (loud, unmissable)</p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Phone number input - shown if SMS or Call enabled */}
                {(smsEnabled || callEnabled) && (
                  <div className="ml-7 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-[calc(100%-1.75rem)] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                        placeholder="+1 555-123-4567"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Include country code (e.g., +1 for US)
                      </p>
                    </div>

                    {/* SMS Message - only shown if SMS enabled */}
                    {smsEnabled && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          SMS Message (optional)
                        </label>
                        <textarea
                          value={smsMessage}
                          onChange={(e) => setSmsMessage(e.target.value)}
                          className="w-[calc(100%-1.75rem)] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                          placeholder="Custom message (leave empty for auto-generated)"
                          rows={3}
                          maxLength={160}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {smsMessage.length}/160 characters. Leave empty to use auto-generated message with hotel details.
                        </p>
                      </div>
                    )}

                    {/* Test buttons */}
                    <div className="flex space-x-2">
                      {smsEnabled && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!phoneNumber) {
                              setError('Enter a phone number first')
                              return
                            }
                            setSmsTestStatus('sending')
                            const result = await sendTestSms(phoneNumber, smsMessage || undefined)
                            if (result.success) {
                              setSmsTestStatus('success')
                              setTimeout(() => setSmsTestStatus('idle'), 3000)
                            } else {
                              setSmsTestStatus('error')
                              setError(result.error || 'SMS failed')
                            }
                          }}
                          disabled={!phoneNumber || smsTestStatus === 'sending'}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            smsTestStatus === 'success'
                              ? 'bg-green-100 text-green-700'
                              : smsTestStatus === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'
                          }`}
                        >
                          {smsTestStatus === 'sending' ? 'Sending...' :
                           smsTestStatus === 'success' ? '✓ SMS Sent!' :
                           smsTestStatus === 'error' ? 'Failed' :
                           'Test SMS'}
                        </button>
                      )}
                      {callEnabled && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!phoneNumber) {
                              setError('Enter a phone number first')
                              return
                            }
                            setCallTestStatus('sending')
                            const result = await makeTestCall(phoneNumber)
                            if (result.success) {
                              setCallTestStatus('success')
                              setTimeout(() => setCallTestStatus('idle'), 3000)
                            } else {
                              setCallTestStatus('error')
                              setError(result.error || 'Call failed')
                            }
                          }}
                          disabled={!phoneNumber || callTestStatus === 'sending'}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            callTestStatus === 'success'
                              ? 'bg-green-100 text-green-700'
                              : callTestStatus === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50'
                          }`}
                        >
                          {callTestStatus === 'sending' ? 'Calling...' :
                           callTestStatus === 'success' ? '✓ Call Made!' :
                           callTestStatus === 'error' ? 'Failed' :
                           'Test Call'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Filter Criteria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter Criteria
              </label>
              <p className="text-xs text-gray-500 mb-3">Set at least one filter:</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Hotel Name Contains
                  </label>
                  <input
                    type="text"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                    placeholder="e.g., Marriott, Hilton"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Max Price/Night ($)
                    </label>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                      placeholder="Any"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Max Distance (blocks)
                    </label>
                    <input
                      type="number"
                      value={maxDistance}
                      onChange={(e) => setMaxDistance(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400 text-sm"
                      placeholder="Any"
                      min="0"
                      step="0.1"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireSkywalk}
                    onChange={(e) => {
                      setRequireSkywalk(e.target.checked)
                      // Clear selected areas when skywalk is enabled (skywalk hotels are all downtown)
                      if (e.target.checked) {
                        setSelectedAreas([])
                      }
                    }}
                    className="w-4 h-4 text-gencon-blue border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Require skywalk access</span>
                </label>

                {/* Divider */}
                <div className="border-t border-gray-200 my-2"></div>

                {/* Include Areas Multi-Select */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Include Areas
                  </label>
                  <div ref={areasDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => !requireSkywalk && setAreasDropdownOpen(!areasDropdownOpen)}
                      disabled={requireSkywalk}
                      className={`w-full px-3 py-2 text-left border rounded-md text-sm flex items-center justify-between ${
                        requireSkywalk
                          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                          : 'border-gray-300 text-gray-900 hover:border-gray-400'
                      }`}
                    >
                      <span className={selectedAreas.length === 0 ? 'text-gray-400' : ''}>
                        {requireSkywalk
                          ? 'Skywalk hotels only'
                          : selectedAreas.length === 0
                          ? 'All areas'
                          : selectedAreas.length === 1
                          ? HOTEL_AREAS[selectedAreas[0] as keyof typeof HOTEL_AREAS]
                          : `${selectedAreas.length} areas selected`}
                      </span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {areasDropdownOpen && !requireSkywalk && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {Object.entries(HOTEL_AREAS).map(([key, label]) => (
                          <label
                            key={key}
                            className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAreas.includes(key)}
                              onChange={() => toggleArea(key)}
                              className="w-4 h-4 text-gencon-blue border-gray-300 rounded mr-2"
                            />
                            <span className="text-sm text-gray-700">{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {requireSkywalk && (
                    <p className="text-xs text-gray-500 mt-1">
                      Area filter disabled when skywalk is required
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-gencon-blue rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : editingAlert ? 'Save Changes' : 'Create Alert'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
