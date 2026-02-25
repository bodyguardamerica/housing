'use client'

import { useState } from 'react'
import type { RoomFilters } from '@/lib/types'

interface FilterBarProps {
  filters: RoomFilters
  onFiltersChange: (filters: RoomFilters) => void
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const updateFilter = <K extends keyof RoomFilters>(
    key: K,
    value: RoomFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const clearFilters = () => {
    onFiltersChange({})
  }

  const hasFilters =
    filters.maxDistance !== undefined ||
    filters.maxPrice !== undefined ||
    filters.skywalkOnly ||
    filters.downtownOnly ||
    filters.hotelName ||
    filters.roomType ||
    filters.showSoldOut

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900"
        >
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          <span className="font-medium">Filters</span>
          {hasFilters && (
            <span className="bg-gencon-blue text-white text-xs px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </button>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear all
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Distance Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Distance (blocks)
            </label>
            <input
              type="number"
              min="0"
              max="20"
              value={filters.maxDistance ?? ''}
              onChange={(e) =>
                updateFilter(
                  'maxDistance',
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gencon-blue"
              placeholder="Any distance"
            />
          </div>

          {/* Price Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Price/Night ($)
            </label>
            <input
              type="number"
              min="0"
              value={filters.maxPrice ?? ''}
              onChange={(e) =>
                updateFilter(
                  'maxPrice',
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gencon-blue"
              placeholder="Any price"
            />
          </div>

          {/* Hotel Name Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hotel Name
            </label>
            <input
              type="text"
              value={filters.hotelName ?? ''}
              onChange={(e) =>
                updateFilter('hotelName', e.target.value || undefined)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gencon-blue"
              placeholder="Search hotels..."
            />
          </div>

          {/* Room Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room Type
            </label>
            <input
              type="text"
              value={filters.roomType ?? ''}
              onChange={(e) =>
                updateFilter('roomType', e.target.value || undefined)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gencon-blue"
              placeholder="e.g., King, Suite..."
            />
          </div>

          {/* Skywalk Toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="skywalk-only"
              checked={filters.skywalkOnly ?? false}
              onChange={(e) => updateFilter('skywalkOnly', e.target.checked)}
              className="w-4 h-4 text-gencon-blue border-gray-300 rounded focus:ring-gencon-blue"
            />
            <label
              htmlFor="skywalk-only"
              className="text-sm font-medium text-gray-700"
            >
              Skywalk connected only
            </label>
          </div>

          {/* Downtown Toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="downtown-only"
              checked={filters.downtownOnly ?? false}
              onChange={(e) => updateFilter('downtownOnly', e.target.checked)}
              className="w-4 h-4 text-gencon-blue border-gray-300 rounded focus:ring-gencon-blue"
            />
            <label
              htmlFor="downtown-only"
              className="text-sm font-medium text-gray-700"
            >
              Downtown only
            </label>
          </div>

          {/* Show Sold Out Toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="show-sold-out"
              checked={filters.showSoldOut ?? false}
              onChange={(e) => updateFilter('showSoldOut', e.target.checked)}
              className="w-4 h-4 text-gencon-blue border-gray-300 rounded focus:ring-gencon-blue"
            />
            <label
              htmlFor="show-sold-out"
              className="text-sm font-medium text-gray-700"
            >
              Show sold out rooms
            </label>
          </div>

          {/* Sort Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              value={filters.sortBy ?? 'distance'}
              onChange={(e) =>
                updateFilter(
                  'sortBy',
                  e.target.value as RoomFilters['sortBy']
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gencon-blue"
            >
              <option value="distance">Distance</option>
              <option value="price">Price</option>
              <option value="hotel_name">Hotel Name</option>
              <option value="available">Availability</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort Direction
            </label>
            <select
              value={filters.sortDir ?? 'asc'}
              onChange={(e) =>
                updateFilter('sortDir', e.target.value as 'asc' | 'desc')
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-gencon-blue"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
