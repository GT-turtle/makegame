const CACHE_NAME = "packforge-prototype-v38";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./assets/estate-hub-v1.png",
  "./assets/world-map-v1.png",
  "./assets/frontier-region-map-v1.png",
  "./assets/frontier-site-map-v1.png",
  "./assets/regional-roster-v1.png",
  "./assets/combat-portrait-atlas-v1.png",
  "./assets/frontier-region-north-v1.jpg",
  "./assets/frontier-region-south-v1.jpg",
  "./assets/frontier-region-east-v1.jpg",
  "./assets/frontier-region-west-v1.jpg",
  "./assets/frontier-region-central-v1.jpg",
  "./assets/battle-bg-north-v1.jpg",
  "./assets/battle-bg-south-v1.jpg",
  "./assets/battle-bg-east-v1.jpg",
  "./assets/battle-bg-west-v1.jpg",
  "./assets/battle-bg-central-v1.jpg",
  "./assets/monster-atlas-v1.png",
  "./assets/player-class-atlas-v1.png",
  "./assets/companion-atlas-v1.png",
  "./assets/character-barbarian-webtoon-v1.png",
  "./assets/character-tracker-webtoon-v1.png",
  "./assets/character-maehwa-webtoon-v1.png",
  "./assets/character-crusader-webtoon-v1.png",
  "./assets/character-necromancer-webtoon-v1.png",
  "./assets/character-shapeshifter-human-webtoon-v1.png",
  "./assets/character-shapeshifter-wolf-webtoon-v2.png",
  "./assets/character-archmage-webtoon-v2.png",
  "./src/app.js",
  "./src/classes.js",
  "./src/adventure.js",
  "./src/frontier.js",
  "./src/defense.js",
  "./src/game.js",
  "./src/core.js",
  "./src/data.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
