// Service Worker for GenCon Hotels Push Notifications

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()

    const options = {
      body: data.message || 'Room availability update',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/',
      },
      actions: [
        {
          action: 'open',
          title: 'View Rooms',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ],
    }

    event.waitUntil(
      self.registration.showNotification('GenCon Hotels', options)
    )
  } catch (error) {
    console.error('Error showing notification:', error)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen)
          return client.focus()
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})
