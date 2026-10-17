// Performans değerlendirmenin ortak tanımları

export interface PerformansKriteri {
  id: string;
  ad: string;
  aciklama: string | null;
  agirlik: number;
  sira: number;
}

export interface PerformansDonemi {
  id: string;
  ad: string;
  baslangic: string;
  bitis: string;
  acik: boolean;
}

/** Değerlendirmede saklanan puan: kriterin o anki adı ve ağırlığıyla (kriter sonradan değişse de bozulmaz) */
export interface KriterPuani {
  kriter_id: string;
  ad: string;
  agirlik: number;
  puan: number;
}

export interface PerformansDegerlendirmesi {
  id: string;
  donem_id: string;
  personel_id: string;
  puanlar: KriterPuani[];
  ortalama: number | null;
  guclu_yonler: string | null;
  gelisim_alanlari: string | null;
  hedefler: string | null;
  genel_yorum: string | null;
  durum: "Taslak" | "Tamamlandı";
  degerlendiren_ad: string | null;
  tamamlanma: string | null;
  personel_gordu: string | null;
}

export const PUAN_ADLARI: Record<number, string> = {
  1: "Yetersiz",
  2: "Geliştirilmeli",
  3: "Beklentiyi karşılıyor",
  4: "Beklentinin üstünde",
  5: "Mükemmel",
};

export const ONERILEN_KRITERLER: { ad: string; aciklama: string }[] = [
  { ad: "İş kalitesi", aciklama: "İşi doğru, eksiksiz ve özenli yapma" },
  { ad: "Verimlilik", aciklama: "İşi zamanında ve beklenen miktarda bitirme" },
  { ad: "Devam ve dakiklik", aciklama: "İşe zamanında gelme, devamsızlık yapmama" },
  { ad: "Takım çalışması", aciklama: "İş arkadaşlarıyla uyum ve yardımlaşma" },
  { ad: "İletişim", aciklama: "Açık, saygılı ve zamanında bilgi paylaşımı" },
  { ad: "Sorumluluk ve inisiyatif", aciklama: "İşi sahiplenme, sorun çözmede öncü olma" },
  { ad: "Müşteri odaklılık", aciklama: "Müşteri memnuniyetini gözetme" },
  { ad: "Kurallara ve İSG'ye uyum", aciklama: "Şirket kuralları ve iş güvenliği talimatlarına uyma" },
];

/** Ağırlıklı ortalama (1-5); puanı girilmemiş kriter hesaba katılmaz */
export function agirlikliOrtalama(puanlar: KriterPuani[]): number | null {
  const gecerli = puanlar.filter((p) => p.puan >= 1 && p.puan <= 5);
  const toplamAgirlik = gecerli.reduce((t, p) => t + p.agirlik, 0);
  if (!toplamAgirlik) return null;
  return Math.round((gecerli.reduce((t, p) => t + p.puan * p.agirlik, 0) / toplamAgirlik) * 100) / 100;
}

/** 1-5 ortalamanın sözel karşılığı */
export function puanAdi(ortalama: number | null): string {
  if (ortalama == null) return "-";
  return PUAN_ADLARI[Math.min(5, Math.max(1, Math.round(ortalama)))];
}

export const puanYaz = (n: number | null) => (n == null ? "-" : n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
