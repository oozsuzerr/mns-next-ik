// Avans ve masraf: panel ve mobilin ortak tanımları

export const MASRAF_KATEGORILERI = ["Yol / ulaşım", "Yemek", "Konaklama", "Yakıt", "Malzeme", "Diğer"] as const;
export const FIS_KOVASI = "masraf-fisleri";

export type OdemeDurumu = "BEKLEMEDE" | "ONAYLANDI" | "REDDEDILDI" | "ODENDI";

export interface OdemeTalebi {
  id: string;
  personel_id: string;
  tur: "Avans" | "Masraf";
  tutar: number;
  tarih: string;
  kategori: string | null;
  aciklama: string | null;
  belge_yolu: string | null;
  durum: OdemeDurumu;
  karar_notu: string | null;
  odeme_tarihi: string | null;
  kaynak: "panel" | "mobil";
  created_at: string;
}

export const DURUM_ADI: Record<OdemeDurumu, string> = {
  BEKLEMEDE: "Bekliyor",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
  ODENDI: "Ödendi",
};

export const tl = (n: number) => `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

/** "1.250,50" ya da "1250.5" -> 1250.5 */
export function tutarOku(metin: string): number | null {
  const t = metin.trim().replace(/\s|TL/gi, "");
  if (!t) return null;
  const sayi = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(sayi) ? sayi : null;
}
