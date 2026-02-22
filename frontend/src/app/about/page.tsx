export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        About GenCon Hotels
      </h1>

      <div className="prose prose-lg">
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            What is this?
          </h2>
          <p className="text-gray-600 mb-4">
            GenCon Hotels is a community tool that monitors the Gen Con housing
            portal and displays real-time hotel room availability for Gen Con
            attendees. The housing portal is notoriously difficult to use during
            high-demand periods, and rooms appear and disappear within seconds.
          </p>
          <p className="text-gray-600">
            This tool scrapes the portal every 60 seconds, stores results, and
            presents them in a user-friendly interface with filtering, sorting,
            maps, historical data, and push notifications.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Is this an official Gen Con tool?
              </h3>
              <p className="text-gray-600 mt-1">
                No. This is an independent community project not affiliated with
                Gen Con LLC, Passkey, or any official organization.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Will this guarantee me a room?
              </h3>
              <p className="text-gray-600 mt-1">
                No. This tool only shows availability - you still need to book
                through the official Gen Con housing portal. Rooms can be booked
                by others between when we detect availability and when you
                complete your booking.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">
                How often does it update?
              </h3>
              <p className="text-gray-600 mt-1">
                The scraper runs every 60 seconds during active periods. The
                status bar shows how fresh the current data is.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">
                What does &quot;Skywalk&quot; mean?
              </h3>
              <p className="text-gray-600 mt-1">
                Some hotels in downtown Indianapolis are connected to the
                Indiana Convention Center via enclosed skywalks. This means you
                can walk from your hotel to the convention without going
                outside, which is especially nice during hot weather or rain.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">
                How do notifications work?
              </h3>
              <p className="text-gray-600 mt-1">
                You can set up a &quot;watcher&quot; that monitors for specific criteria
                (hotel, price, distance, etc.). When matching rooms become
                available, you&apos;ll receive a notification via Discord webhook or
                email. There&apos;s a cooldown between notifications to avoid spam.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Where does the data come from?
              </h3>
              <p className="text-gray-600 mt-1">
                All data is scraped from the official Gen Con housing portal
                powered by Passkey. We don&apos;t have any special access - we just
                automate what you would do manually by refreshing the page.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Book Your Room
          </h2>
          <p className="text-gray-600 mb-4">
            Ready to book? Visit the official Gen Con housing portal:
          </p>
          <a
            href="https://book.passkey.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 bg-gencon-blue text-white font-medium rounded-md hover:bg-blue-700"
          >
            Go to Housing Portal
            <svg
              className="ml-2 w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Open Source
          </h2>
          <p className="text-gray-600 mb-4">
            This project is open source. Contributions and feedback are welcome!
          </p>
          <p className="text-gray-600">
            Built with Next.js, Supabase, and Python. Hosted on Vercel and
            Railway.
          </p>
        </section>

        <section className="bg-gray-50 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Disclaimer
          </h2>
          <p className="text-sm text-gray-600">
            This is an unofficial community tool. Use at your own risk. We make
            no guarantees about data accuracy or availability. Gen Con, Passkey,
            and all hotel names are trademarks of their respective owners. This
            project is not endorsed by or affiliated with any of these entities.
          </p>
        </section>
      </div>
    </div>
  )
}
