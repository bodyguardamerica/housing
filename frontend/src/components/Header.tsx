'use client'

import { useState } from 'react'
import { AuthButton } from './AuthButton'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="bg-gencon-blue text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Left side: Menu + Title */}
          <div className="flex items-center space-x-4">
            {/* Mobile menu button */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-md hover:bg-blue-700 transition-colors"
                aria-label="Menu"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20">
                    <a
                      href="/"
                      className="block px-4 py-3 text-gray-800 hover:bg-gray-100 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Dashboard
                    </a>
                    <a
                      href="/history"
                      className="block px-4 py-3 text-gray-800 hover:bg-gray-100 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      History
                    </a>
                  </div>
                </>
              )}
            </div>

            <a href="/" className="text-2xl font-bold hover:text-gencon-gold transition-colors">
              GenCon Lottery Losers
            </a>
          </div>

          {/* Right side: Auth */}
          <div className="flex items-center">
            <AuthButton variant="header" />
          </div>
        </div>
      </div>
    </header>
  )
}
