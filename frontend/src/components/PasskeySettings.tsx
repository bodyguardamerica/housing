'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface PasskeySettingsProps {
  passkeyUrl: string
  onUrlChange: (url: string) => void
  isSyncing?: boolean
}

// Validate Passkey URL format
function validatePasskeyUrl(url: string): { valid: boolean; error?: string } {
  if (!url.trim()) {
    return { valid: false, error: 'URL is required' }
  }

  // Must start with https://book.passkey.com/
  if (!url.startsWith('https://book.passkey.com/')) {
    return { valid: false, error: 'URL must start with https://book.passkey.com/' }
  }

  // Check for entry?token= pattern (the format from the user's example)
  const entryTokenPattern = /^https:\/\/book\.passkey\.com\/entry\?token=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  // Also allow reg/ pattern (older format)
  const regPattern = /^https:\/\/book\.passkey\.com\/reg\//

  if (entryTokenPattern.test(url) || regPattern.test(url)) {
    return { valid: true }
  }

  return { valid: false, error: 'Invalid Passkey URL format. Should be https://book.passkey.com/entry?token=...' }
}

export function PasskeySettings({ passkeyUrl, onUrlChange, isSyncing }: PasskeySettingsProps) {
  const { isAuthenticated } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [tempUrl, setTempUrl] = useState(passkeyUrl)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSave = () => {
    const validation = validatePasskeyUrl(tempUrl.trim())
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid URL')
      return
    }
    setValidationError(null)
    onUrlChange(tempUrl.trim())
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempUrl(passkeyUrl)
    setValidationError(null)
    setIsEditing(false)
  }

  if (!isEditing && passkeyUrl) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center space-x-2">
          {isSyncing ? (
            <div className="animate-spin w-5 h-5 border-2 border-green-300 border-t-green-600 rounded-full" />
          ) : (
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="text-sm text-green-800">
            Passkey URL configured{isAuthenticated ? ' (synced to account)' : ''}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <a
            href={passkeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Housing Portal
          </a>
          <button
            onClick={() => {
              setTempUrl(passkeyUrl)
              setIsEditing(true)
            }}
            className="text-sm text-green-700 hover:text-green-900 underline"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-start space-x-3">
        <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900 mb-2">
            {passkeyUrl ? 'Update your Passkey URL' : 'Enter your Passkey URL for quick access to the housing portal'}
          </p>
          <p className="text-xs text-blue-700 mb-3">
            Your URL can be found by opening the housing portal and copying the URL from your browser.
            {isAuthenticated && ' This will sync to your account.'}
          </p>
          <div className="flex items-center space-x-2">
            <input
              type="url"
              value={tempUrl}
              onChange={(e) => {
                setTempUrl(e.target.value)
                setValidationError(null) // Clear error on change
              }}
              placeholder="https://book.passkey.com/entry?token=..."
              className={`flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 text-gray-900 bg-white placeholder-gray-400 ${
                validationError
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-blue-300 focus:ring-blue-500'
              }`}
            />
            <button
              onClick={handleSave}
              disabled={!tempUrl.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            {passkeyUrl && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Cancel
              </button>
            )}
          </div>
          {validationError && (
            <p className="mt-2 text-sm text-red-600">{validationError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
