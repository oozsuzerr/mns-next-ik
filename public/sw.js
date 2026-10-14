// Bu uygulama bir PDKS olduğu için çevrimdışı önbellek KULLANILMAZ:
// her zaman canlı veri ve güncel sürüm gerekir. Service worker yalnızca
// uygulamanın "ana ekrana eklenebilir" olması için bulunur.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (olay) => olay.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
