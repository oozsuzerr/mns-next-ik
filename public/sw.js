// Bu uygulama bir PDKS olduğu için çevrimdışı önbellek KULLANILMAZ:
// her zaman canlı veri ve güncel sürüm gerekir. Service worker, uygulamanın
// "ana ekrana eklenebilir" olması ve telefona anlık bildirim gösterebilmesi içindir.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (olay) => olay.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// Sunucudan gelen bildirimi göster: { baslik, metin, adres, etiket }
self.addEventListener("push", (olay) => {
  let veri = {};
  try {
    veri = olay.data ? olay.data.json() : {};
  } catch {
    veri = { metin: olay.data ? olay.data.text() : "" };
  }
  olay.waitUntil(
    self.registration.showNotification(veri.baslik || "MNS Next IK", {
      body: veri.metin || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: veri.etiket || undefined,
      data: { adres: veri.adres || "/" },
    })
  );
});

// Bildirime dokununca ilgili sayfayı aç (açık bir pencere varsa onu öne getir)
self.addEventListener("notificationclick", (olay) => {
  olay.notification.close();
  const adres = new URL((olay.notification.data && olay.notification.data.adres) || "/", self.location.origin).href;
  olay.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pencereler) => {
      for (const p of pencereler) {
        if (p.url === adres && "focus" in p) return p.focus();
      }
      return self.clients.openWindow(adres);
    })
  );
});
