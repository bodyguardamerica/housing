'use client'

import type { LocalAlert, AlertMatch } from '@/lib/types'
import { AuthButton } from './AuthButton'

interface AlertListProps {
  alerts: LocalAlert[]
  matches: AlertMatch[]
  onEdit: (alert: LocalAlert) => void
  onDelete: (id: string) => void
  onToggle: (id: string) => void
  onToggleSound: (id: string) => void
  soundMuted: boolean
  onToggleMute: () => void
  onTestSound: () => void
  onSyncAlerts?: () => Promise<void>
}

export function AlertList({
  alerts,
  matches,
  onEdit,
  onDelete,
  onToggle,
  onToggleSound,
  soundMuted,
  onToggleMute,
  onTestSound,
  onSyncAlerts,
}: AlertListProps) {
  // Count matches per alert
  const matchCountByAlert = matches.reduce((acc, match) => {
    acc[match.alertId] = (acc[match.alertId] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-900">Your Local Alerts</h3>
        <div className="flex items-center space-x-3">
          <AuthButton onSyncAlerts={onSyncAlerts} />
          {alerts.length > 0 && (
          <div className="flex items-center space-x-2 border-l pl-3">
            <button
              onClick={onTestSound}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
              title="Test notification sound"
            >
              Test Sound
            </button>
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-md ${
                soundMuted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
              } hover:bg-gray-200`}
              title={soundMuted ? 'Unmute all sounds' : 'Mute all sounds'}
            >
              {soundMuted ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              )}
            </button>
          </div>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <p>No local alerts set up yet.</p>
          <p className="text-sm mt-1">Create an alert to get notified when matching rooms appear.</p>
        </div>
      ) : (
      <div className="grid gap-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`border rounded-lg p-4 ${
              alert.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className={`font-medium ${alert.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                    {alert.name}
                  </h4>
                  {!alert.enabled && (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                      Disabled
                    </span>
                  )}
                  {alert.enabled && (matchCountByAlert[alert.id] || 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                      {matchCountByAlert[alert.id]} match{matchCountByAlert[alert.id] > 1 ? 'es' : ''}
                    </span>
                  )}
                  {alert.enabled && !(matchCountByAlert[alert.id] || 0) && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                      0 matches
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-500 space-x-3">
                  {alert.hotelName && <span>Hotel: {alert.hotelName}</span>}
                  {alert.maxPrice && <span>Max ${alert.maxPrice}</span>}
                  {alert.maxDistance && <span>Within {alert.maxDistance} blocks</span>}
                  {alert.requireSkywalk && <span>Skywalk only</span>}
                  {alert.minNightsAvailable && <span>Min {alert.minNightsAvailable} nights</span>}
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {/* Sound toggle */}
                <button
                  onClick={() => onToggleSound(alert.id)}
                  className={`p-1.5 rounded ${
                    alert.soundEnabled ? 'text-green-600' : 'text-gray-400'
                  } hover:bg-gray-100`}
                  title={alert.soundEnabled ? 'Sound enabled' : 'Sound disabled'}
                >
                  {alert.soundEnabled ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                      />
                    </svg>
                  )}
                </button>

                {/* Enable/Disable toggle */}
                <button
                  onClick={() => onToggle(alert.id)}
                  className={`p-1.5 rounded ${
                    alert.enabled ? 'text-green-600' : 'text-gray-400'
                  } hover:bg-gray-100`}
                  title={alert.enabled ? 'Click to disable' : 'Click to enable'}
                >
                  {alert.enabled ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  )}
                </button>

                {/* Edit button */}
                <button
                  onClick={() => onEdit(alert)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  title="Edit alert"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>

                {/* Delete button */}
                <button
                  onClick={() => {
                    if (confirm('Delete this alert?')) {
                      onDelete(alert.id)
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete alert"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        {alerts.length > 0
          ? 'Local alerts are stored in your browser. Keep this tab open to receive notifications.'
          : 'Sign in with Google to sync alerts across devices.'}
      </p>
    </div>
  )
}
