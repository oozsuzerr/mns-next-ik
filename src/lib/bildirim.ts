// Telefona anlık bildirim: tarayıcı tarafı (abone olma / bırakma, olay bildirme).
// Gönderim sunucuda yapılır (src/app/api/bildirim).

const ACIK_ANAHTAR = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

export type BildirimDurumu = "desteklenmiyor" | "ana-ekran-gerekli" | "engelli" | "kapali" | "acik";

function base64UrlBayt(deger: string): Uint8Array<ArrayBuffer> {
  const dolgu = "=".repeat((4 - (deger.length % 4)) % 4);
  const ham = atob((deger + dolgu).replace(/-/g, "+").replace(/_/g, "/"));
  const sonuc = new Uint8Array(new ArrayBuffer(ham.length));
  for (let i = 0; i < ham.length; i++) sonuc[i] = ham.charCodeAt(i);
  return sonuc;
}

function iosMu(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function anaEkrandaMi(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

async function kayit(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
}

/** Bu cihazda bildirimin durumu */
export async function bildirimDurumu(): Promise<BildirimDurumu> {
  if (typeof window === "undefined" || !ACIK_ANAHTAR) return "desteklenmiyor";
  // iPhone'da bildirim yalnızca ana ekrana eklenmiş uygulamada çalışır (iOS 16.4+)
  if (iosMu() && !anaEkrandaMi()) return "ana-ekran-gerekli";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "desteklenmiyor";
  if (Notification.permission === "denied") return "engelli";
  const k = await kayit();
  const abonelik = await k?.pushManager.getSubscription();
  return abonelik && Notification.permission === "granted" ? "acik" : "kapali";
}

/** İzin ister ve abonelik oluşturur; sunucuya kaydetmek çağıranın işidir */
export async function abonelikOlustur(): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.");
  const k = await kayit();
  if (!k) throw new Error("Bu tarayıcı bildirimleri desteklemiyor.");
  await navigator.serviceWorker.ready;
  const abonelik =
    (await k.pushManager.getSubscription()) ??
    (await k.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlBayt(ACIK_ANAHTAR) }));
  const json = abonelik.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Bildirim aboneliği oluşturulamadı.");
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Cihazın aboneliğini bırakır; bırakılan adresi döner */
export async function abonelikBirak(): Promise<string | null> {
  const k = await kayit();
  const abonelik = await k?.pushManager.getSubscription();
  if (!abonelik) return null;
  const endpoint = abonelik.endpoint;
  await abonelik.unsubscribe();
  return endpoint;
}

/**
 * Bir olayı sunucuya bildirir; sunucu kimlerin haberdar edileceğine kendisi karar verir.
 * Sonucu beklenmez: bildirim gidemese de asıl işlem etkilenmez.
 */
export function olayBildir(govde: Record<string, unknown>, panelOturumAnahtari?: string | null): void {
  if (typeof window === "undefined") return;
  fetch("/api/bildirim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(panelOturumAnahtari ? { Authorization: `Bearer ${panelOturumAnahtari}` } : {}),
    },
    body: JSON.stringify(govde),
    keepalive: true,
  }).catch(() => {});
}
