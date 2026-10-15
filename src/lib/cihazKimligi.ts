// Mobil girişte kullanılan cihaz kimliği (tarayıcı tarafı).
// Tarayıcı telefonun donanım kimliğini vermediği için ilk açılışta rastgele bir kimlik üretilir.
// Kimlik üç ayrı yerde saklanır (localStorage, çerez, IndexedDB); biri silinse bile diğerinden
// geri yüklenir ve personel gereksiz yere "başka telefon" sayılıp kilitlenmez.

const ANAHTAR = "mns_device_id";
const VT_ADI = "mns";
const VT_DEPO = "ayarlar";
const ON_YIL_SN = 10 * 365 * 24 * 60 * 60;

function gecerli(id: string | null | undefined): id is string {
  return !!id && id.length >= 8 && id.length <= 100;
}

function yerelOku(): string | null {
  try {
    return localStorage.getItem(ANAHTAR);
  } catch {
    return null;
  }
}

function yerelYaz(id: string) {
  try {
    localStorage.setItem(ANAHTAR, id);
  } catch {}
}

function cerezOku(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${ANAHTAR}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function cerezYaz(id: string) {
  const guvenli = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANAHTAR}=${encodeURIComponent(id)}; Max-Age=${ON_YIL_SN}; Path=/; SameSite=Lax${guvenli}`;
}

function vtAc(): Promise<IDBDatabase | null> {
  return new Promise((coz) => {
    try {
      const istek = indexedDB.open(VT_ADI, 1);
      istek.onupgradeneeded = () => istek.result.createObjectStore(VT_DEPO);
      istek.onsuccess = () => coz(istek.result);
      istek.onerror = () => coz(null);
    } catch {
      coz(null);
    }
  });
}

async function vtOku(): Promise<string | null> {
  const vt = await vtAc();
  if (!vt) return null;
  return new Promise((coz) => {
    try {
      const istek = vt.transaction(VT_DEPO, "readonly").objectStore(VT_DEPO).get(ANAHTAR);
      istek.onsuccess = () => coz(typeof istek.result === "string" ? istek.result : null);
      istek.onerror = () => coz(null);
    } catch {
      coz(null);
    }
  });
}

async function vtYaz(id: string): Promise<void> {
  const vt = await vtAc();
  if (!vt) return;
  await new Promise<void>((coz) => {
    try {
      const islem = vt.transaction(VT_DEPO, "readwrite");
      islem.objectStore(VT_DEPO).put(id, ANAHTAR);
      islem.oncomplete = () => coz();
      islem.onerror = () => coz();
    } catch {
      coz();
    }
  });
}

/** Kayıtlı kimliği döner; yoksa üretir. Her çağrıda eksik kalan depolara da yazar. */
export async function cihazKimligi(): Promise<string> {
  let id = [yerelOku(), cerezOku()].find(gecerli) ?? (await vtOku());
  if (!gecerli(id)) {
    const rastgele =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
    id = "D-" + rastgele;
  }
  yerelYaz(id);
  cerezYaz(id);
  await vtYaz(id);
  // Tarayıcıdan verinin kendiliğinden silinmemesini iste (Android Chrome'da işe yarar)
  navigator.storage?.persist?.().catch(() => {});
  return id;
}

export function iosMu(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function anaEkrandaMi(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Yöneticiye gösterilecek kısa telefon bilgisi, ör. "iPhone, ana ekran uygulaması" */
export function cihazBilgisi(): string {
  const ua = navigator.userAgent;
  const tur = /iPad/.test(ua) ? "iPad" : iosMu() ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Diğer";
  if (anaEkrandaMi()) return `${tur}, ana ekran uygulaması`;
  const tarayici = /SamsungBrowser/.test(ua)
    ? "Samsung Internet"
    : /CriOS|Chrome/.test(ua)
    ? "Chrome"
    : /FxiOS|Firefox/.test(ua)
    ? "Firefox"
    : /Safari/.test(ua)
    ? "Safari"
    : "tarayıcı";
  return `${tur}, ${tarayici}`;
}
