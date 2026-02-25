'use client'

import { useState, useEffect } from 'react'
import type { LocalAlert } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

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
  const { isAuthenticated } = useAuth()

  // Notification types
  const [visualEnabled, setVisualEnabled] = useState(true)
  const [fullScreenEnabled, setFullScreenEnabled] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordWebhook, setDiscordWebhook] = useState('')
  const [discordMention, setDiscordMention] = useState('')

  // Filter criteria
  const [name, setName] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDistance, setMaxDistance] = useState('')
  const [requireSkywalk, setRequireSkywalk] = useState(false)
  const [requireDowntown, setRequireDowntown] = useState(false)

  // State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens or editingAlert changes
  useEffect(() => {
    if (isOpen) {
      setName(editingAlert?.name || '')
      setHotelName(editingAlert?.hotelName || '')
      setMaxPrice(editingAlert?.maxPrice?.toString() || '')
      setMaxDistance(editingAlert?.maxDistance?.toString() || '')
      setRequireSkywalk(editingAlert?.requireSkywalk || false)
      setRequireDowntown(editingAlert?.requireDowntown || false)
      setSoundEnabled(editingAlert?.soundEnabled ?? true)
      setFullScreenEnabled(editingAlert?.fullScreenEnabled ?? true)
      setVisualEnabled(true)
      // Preserve Discord settings if alert already has a linked watcher
      setDiscordEnabled(!!editingAlert?.discordWatcherId)
      setDiscordWebhook('') // Webhook is stored server-side, don't expose
      setDiscordMention('') // Mention is stored server-side
      setError(null)
    }
  }, [isOpen, editingAlert])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please enter an alert name')
      return
    }

    const hasNotificationType = visualEnabled || fullScreenEnabled || soundEnabled || discordEnabled
    if (!hasNotificationType) {
      setError('Please select at least one notification type')
      return
    }

    const hasAnyCriteria = hotelName || maxPrice || maxDistance || requireSkywalk || requireDowntown
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
        const response = await fetch('/api/watchers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            discord_webhook_url: discordWebhook,
            discord_mention: discordMention.trim() || undefined,
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
        requireDowntown,
        enabled: true,
        soundEnabled,
        fullScreenEnabled,
        discordWatcherId,
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
    setRequireDowntown(false)
    setSoundEnabled(true)
    setFullScreenEnabled(true)
    setVisualEnabled(true)
    setDiscordEnabled(false)
    setDiscordWebhook('')
    setDiscordMention('')
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
                              <p>1. Open your Discord server</p>
                              <p>2. Go to <strong>Server Settings</strong> → <strong>Integrations</strong></p>
                              <p>3. Click <strong>Webhooks</strong> → <strong>New Webhook</strong></p>
                              <p>4. Choose a channel and click <strong>Copy Webhook URL</strong></p>
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
                          placeholder="@mention (optional) e.g., <@123456789>"
                        />
                        <details className="mt-1">
                          <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                            How to get a user or role ID
                          </summary>
                          <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-gray-700 space-y-1">
                            <p>1. In Discord, go to <strong>User Settings</strong> → <strong>Advanced</strong></p>
                            <p>2. Enable <strong>Developer Mode</strong></p>
                            <p>3. Right-click a user or role → <strong>Copy ID</strong></p>
                            <p className="pt-1 border-t border-blue-200">
                              <strong>Format:</strong> User: <code className="bg-blue-100 px-1 rounded">&lt;@ID&gt;</code> | Role: <code className="bg-blue-100 px-1 rounded">&lt;@&amp;ID&gt;</code>
                            </p>
                          </div>
                        </details>
                      </div>
                    </div>
                  )}
                </div>
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
                    onChange={(e) => setRequireSkywalk(e.target.checked)}
                    className="w-4 h-4 text-gencon-blue border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Require skywalk access</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireDowntown}
                    onChange={(e) => setRequireDowntown(e.target.checked)}
                    className="w-4 h-4 text-gencon-blue border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Downtown hotels only</span>
                </label>
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
