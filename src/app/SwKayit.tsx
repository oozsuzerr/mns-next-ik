"use client";

import { useEffect } from "react";

export default function SwKayit() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sessizce geç: uygulama service worker olmadan da çalışır
      });
    }
  }, []);

  return null;
}
