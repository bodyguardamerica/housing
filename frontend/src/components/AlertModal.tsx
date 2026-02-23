'use client'

import { useState, useEffect } from 'react'
import type { LocalAlert } from '@/lib/types'

interface AlertModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (alert: Omit<LocalAlert, 'id' | 'createdAt'>) => void
  editingAlert?: LocalAlert | null
}

export function AlertModal({ isOpen, onClose, onSave, editingAlert }: AlertModalProps) {
  const [name, setName] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxDistance, setMaxDistance] = useState('')
  const [requireSkywalk, setRequireSkywalk] = useState(false)
  const [minNightsAvailable, setMinNightsAvailable] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Reset form when modal opens or editingAlert changes
  useEffect(() => {
    if (isOpen) {
      setName(editingAlert?.name || '')
      setHotelName(editingAlert?.hotelName || '')
      setMaxPrice(editingAlert?.maxPrice?.toString() || '')
      setMaxDistance(editingAlert?.maxDistance?.toString() || '')
      setRequireSkywalk(editingAlert?.requireSkywalk || false)
      setMinNightsAvailable(editingAlert?.minNightsAvailable?.toString() || '')
      setSoundEnabled(editingAlert?.soundEnabled ?? true)
    }
  }, [isOpen, editingAlert])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return

    onSave({
      name: name.trim(),
      hotelName: hotelName.trim() || undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      maxDistance: maxDistance ? parseFloat(maxDistance) : undefined,
      requireSkywalk,
      minNightsAvailable: minNightsAvailable ? parseInt(minNightsAvailable) : undefined,
      enabled: editingAlert?.enabled ?? true,
      soundEnabled,
      fullScreenEnabled: editingAlert?.fullScreenEnabled ?? true,
    })

    // Reset form
    setName('')
    setHotelName('')
    setMaxPrice('')
    setMaxDistance('')
    setRequireSkywalk(false)
    setMinNightsAvailable('')
    setSoundEnabled(true)
    onClose()
  }

  const hasAnyCriteria = hotelName || maxPrice || maxDistance || requireSkywalk || minNightsAvailable

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div
          className="fixed inset-0 bg-black opacity-50"
          onClick={onClose}
        ></div>

        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {editingAlert ? 'Edit Alert' : 'Create Local Alert'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-md text-sm">
            <strong>Local Alert:</strong> This alert is stored in your browser. When a matching
            room is found, you&apos;ll hear a sound and see it highlighted at the top of the page.
            Keep this tab open to receive alerts.
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                required
              />
            </div>

            <hr className="my-4" />
            <p className="text-sm text-gray-500 -mt-2 mb-2">
              Set at least one filter criteria:
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hotel Name Contains
              </label>
              <input
                type="text"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                placeholder="e.g., Marriott, Hilton"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Total Price ($)
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                  placeholder="Any"
                  min="0"
                  step="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Distance (blocks)
                </label>
                <input
                  type="number"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                  placeholder="Any"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Nights Available
              </label>
              <input
                type="number"
                value={minNightsAvailable}
                onChange={(e) => setMinNightsAvailable(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gencon-blue text-gray-900 placeholder-gray-400"
                placeholder="Any (includes partial availability)"
                min="1"
                max="5"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to match rooms with any availability (including partial nights)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="require-skywalk"
                checked={requireSkywalk}
                onChange={(e) => setRequireSkywalk(e.target.checked)}
                className="w-4 h-4 text-gencon-blue border-gray-300 rounded"
              />
              <label
                htmlFor="require-skywalk"
                className="text-sm text-gray-700"
              >
                Require skywalk access
              </label>
            </div>

            <hr className="my-4" />

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sound-enabled"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
                className="w-4 h-4 text-gencon-blue border-gray-300 rounded"
              />
              <label
                htmlFor="sound-enabled"
                className="text-sm text-gray-700"
              >
                Play sound when match is found
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || !hasAnyCriteria}
                className="px-4 py-2 text-sm font-medium text-white bg-gencon-blue rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingAlert ? 'Save Changes' : 'Create Alert'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
