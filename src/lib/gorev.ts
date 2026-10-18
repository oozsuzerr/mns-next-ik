// Görevlendirme modülünün ortak tanımları (panel ve mobil)

export const ONCELIKLER = ["Düşük", "Normal", "Yüksek", "Acil"] as const;
export type Oncelik = (typeof ONCELIKLER)[number];
export type GorevDurumu = "Bekliyor" | "Devam ediyor" | "Tamamlandı" | "İptal";

export interface Gorev {
  id: string;
  personel_id: string;
  baslik: string;
  aciklama: string | null;
  oncelik: Oncelik;
  son_tarih: string | null;
  durum: GorevDurumu;
  atayan_ad: string | null;
  personel_notu: string | null;
  goruldu: string | null;
  tamamlanma: string | null;
  tamamlayan: "personel" | "yonetici" | null;
  created_at: string;
}

export const ACIK_DURUMLAR: GorevDurumu[] = ["Bekliyor", "Devam ediyor"];

/** Rozet sınıfı (tasarim.css: rozet-notr / izin / uyari / hata / giris) */
export const ONCELIK_TONU: Record<Oncelik, "notr" | "izin" | "uyari" | "hata"> = {
  Düşük: "notr",
  Normal: "izin",
  Yüksek: "uyari",
  Acil: "hata",
};

export const DURUM_TONU: Record<GorevDurumu, "notr" | "izin" | "giris" | "hata"> = {
  Bekliyor: "notr",
  "Devam ediyor": "izin",
  Tamamlandı: "giris",
  İptal: "hata",
};
