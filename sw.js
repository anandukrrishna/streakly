/**
 * Service Worker for Streakly (PWA)
 * Provides offline-first caching for all app assets, scripts, icons, and libraries.
 */

const CACHE_NAME = 'streakly-cache-v1';

const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon.svg',
  './icons/screenshot-desktop.png',
  './icons/screenshot-mobile.png',
  './vendor/chart.umd.min.js',
  './vendor/firebase-app.js',
  './vendor/firebase-auth.js',
  './vendor/firebase-firestore.js',
  './js/date-utils.js',
  './js/firebase.js',
  './js/storage.js',
  './js/tracker.js',
  './js/metrics.js',
  './js/analysis.js',
  './js/cycles.js',
  './js/notifications.js',
  './js/app.js'
];

// Install Event: Pre-cache all essential files for offline readiness
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Streakly SW] Pre-caching offline assets');
      return cache.addAll(ASSETS_TO_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Streakly SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-first with stale-while-revalidate for local assets
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Allow Firebase API & Google Auth network calls to pass through directly
  if (
    requestUrl.origin.includes('googleapis.com') ||
    requestUrl.origin.includes('google.com') ||
    requestUrl.origin.includes('identitytoolkit') ||
    requestUrl.origin.includes('firestore')
  ) {
    return;
  }

  // Handle local app assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background if online (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // Silent offline fallback
        });

        return cachedResponse;
      }

      // If not in cache, fetch from network and cache
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // If navigating to an HTML page while offline, return index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});

