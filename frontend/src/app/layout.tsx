import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GenCon Hotels',
  description: 'Real-time hotel availability for Gen Con',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-gencon-blue text-white shadow-lg">
            <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h1 className="text-2xl font-bold">GenCon Hotels</h1>
                  <span className="text-sm text-blue-200">
                    Real-time availability
                  </span>
                </div>
                <nav className="flex items-center space-x-6">
                  <a
                    href="/"
                    className="text-white hover:text-gencon-gold transition-colors"
                  >
                    Dashboard
                  </a>
                  <a
                    href="/history"
                    className="text-white hover:text-gencon-gold transition-colors"
                  >
                    History
                  </a>
                  <a
                    href="/about"
                    className="text-white hover:text-gencon-gold transition-colors"
                  >
                    About
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main>{children}</main>
          <footer className="bg-gray-800 text-gray-400 py-8 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <p className="text-sm">
                GenCon Hotels is a community tool. Not affiliated with Gen Con
                LLC or Passkey.
              </p>
              <p className="text-xs mt-2">
                Data updates every 60 seconds during active periods.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
