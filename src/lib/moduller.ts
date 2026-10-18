// Firmaya göre açılıp kapanan İK modülleri (veritabanındaki firmalar.moduller ile aynı anahtarlar).
// Puantaj, izin, fazla mesai, vardiya, şube ve personel gibi temel bölümler her firmada açıktır.

export const MODULLER = [
  { anahtar: "duyuru", ad: "Duyurular", aciklama: "Personele duyuru, okundu takibi" },
  { anahtar: "zimmet", ad: "Zimmet", aciklama: "Eşya teslim/iade, tutanak" },
  { anahtar: "odeme", ad: "Avans ve masraf", aciklama: "Mobilden avans ve fişli masraf" },
  { anahtar: "kontrol", ad: "Giriş / çıkış listeleri", aciklama: "İşe başlama ve ayrılış kontrol listeleri" },
  { anahtar: "egitim", ad: "Eğitim", aciklama: "Eğitim kayıtları, zorunlu eğitim takibi" },
  { anahtar: "performans", ad: "Performans", aciklama: "Dönemsel performans değerlendirme" },
  { anahtar: "isealim", ad: "İşe alım", aciklama: "İlan, aday ve görüşme takibi" },
] as const;

export type Modul = (typeof MODULLER)[number]["anahtar"];

export const TUM_MODULLER: Modul[] = MODULLER.map((m) => m.anahtar);

/** Modül listesi bilinmiyorsa (paket kurulmadan önceki veritabanı) hepsi açık sayılır */
export function modulAcik(moduller: readonly string[] | null | undefined, modul: Modul): boolean {
  return moduller == null || moduller.includes(modul);
}
