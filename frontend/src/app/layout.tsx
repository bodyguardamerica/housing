import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GenCon Lottery Losers',
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
          <Header />
          <main>{children}</main>
          <footer className="bg-gray-800 text-gray-400 py-8 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <p className="text-sm">
                GenCon Lottery Losers is a community tool. Not affiliated with Gen Con
                LLC or Passkey.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
