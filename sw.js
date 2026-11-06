
/*
 * MY MUSIC LYRICS
 * FILE 09: sw.js
 *
 * Progressive Web App Service Worker.
 */

const CACHE_NAME = "my-music-lyrics-v13";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./lyrics.js",
  "./audio.js",
  "./storage.js",
  "./transcription.js",
  "./manifest.json"
];


// Install and cache application files.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});


// Remove outdated caches.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});


// Handle requests.
self.addEventListener("fetch", event => {
  const request = event.request;

  // Only handle normal GET requests.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Do not cache external websites or audio blobs.
  if (url.origin !== self.location.origin) return;

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // Do not interfere with browser audio streams.
  if (request.destination === "audio") return;

  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then(response => {
            if (
              !response ||
              response.status !== 200 ||
              response.type !== "basic"
            ) {
              return response;
            }

            const responseCopy = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, responseCopy));

            return response;
          })
          .catch(() => {
            if (request.mode === "navigate") {
              return caches.match("./index.html");
            }

            return new Response(
              "This resource is unavailable offline.",
              {
                status: 503,
                headers: {
                  "Content-Type": "text/plain"
                }
              }
            );
          });
      })
  );
});
