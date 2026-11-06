/**
 * Service Worker for My Music Lyrics PWA
 * Provides offline caching for app shell
 */

const CACHE_NAME = 'my-music-lyrics-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './audio.js',
  './lyrics.js',
  './storage.js',
  './transcription.js',
  './manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('Cache install failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - Cache First strategy for app shell, Network First for APIs
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests (transcription) - Network only
  if (url.origin !== location.origin && !url.href.includes('whisper')) {
    return;
  }

  // For audio files, use Cache First with background update
  if (request.destination === 'audio' || url.pathname.match(/\.(mp3|wav|m4a|ogg)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          // Return cached, but update in background
          event.waitUntil(
            fetch(request).then((networkResponse) => {
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => {})
          );
          return cachedResponse;
        }
        
        // Not in cache, fetch and cache
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          return new Response('Audio not available offline', { status: 503 });
        }
      })
    );
    return;
  }

  // For app shell - Cache First
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        });
      })
      .catch(() => {
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// Handle background sync for pending operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-playlists') {
    event.waitUntil(syncPlaylists());
  }
});

async function syncPlaylists() {
  // Placeholder for future sync functionality
  console.log('Syncing playlists...');
}

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png'
    });
  }
});
