// Eğitim modülünün ortak tanımları

export const EGITIM_KATEGORILERI = ["İSG", "Mesleki", "Hijyen", "Yangın / ilk yardım", "Oryantasyon", "Diğer"] as const;
export type EgitimKategorisi = (typeof EGITIM_KATEGORILERI)[number];

export interface EgitimTuru {
  id: string;
  ad: string;
  kategori: EgitimKategorisi;
  sure_saat: number | null;
  gecerlilik_ay: number | null;
  zorunlu: boolean;
  aciklama: string | null;
}

export interface EgitimKaydi {
  id: string;
  personel_id: string;
  tur_id: string;
  oturum_id: string;
  tarih: string;
  sure_saat: number | null;
  egitmen: string | null;
  kurum: string | null;
  gecerlilik_bitis: string | null;
  notlar: string | null;
}

/**
 * Önerilen türler. Temel İSG eğitimi süresi ve yenileme aralığı işyerinin tehlike sınıfına göre değişir
 * (Çalışanların İSG Eğitimleri Yönetmeliği): az tehlikeli 8 saat / 3 yıl, tehlikeli 12 saat / 2 yıl,
 * çok tehlikeli 16 saat / her yıl.
 */
export const ONERILEN_TURLER: Omit<EgitimTuru, "id">[] = [
  {
    ad: "Temel İSG eğitimi",
    kategori: "İSG",
    sure_saat: 8,
    gecerlilik_ay: 36,
    zorunlu: true,
    aciklama: "Az tehlikeli: 8 saat / 3 yıl. Tehlikeli: 12 saat / 2 yıl. Çok tehlikeli: 16 saat / 1 yıl. Tehlike sınıfınıza göre düzenleyin.",
  },
  { ad: "Yangın ve acil durum eğitimi", kategori: "Yangın / ilk yardım", sure_saat: 2, gecerlilik_ay: 12, zorunlu: false, aciklama: "Tahliye tatbikatı ile birlikte." },
  { ad: "İlk yardım sertifikası", kategori: "Yangın / ilk yardım", sure_saat: 16, gecerlilik_ay: 36, zorunlu: false, aciklama: "Sağlık Bakanlığı onaylı merkezden; 3 yılda bir güncellenir." },
  { ad: "Hijyen eğitimi", kategori: "Hijyen", sure_saat: 8, gecerlilik_ay: null, zorunlu: false, aciklama: "Gıda ile çalışanlar için." },
  { ad: "İşe başlama oryantasyonu", kategori: "Oryantasyon", sure_saat: 2, gecerlilik_ay: null, zorunlu: false, aciklama: "Şirket kuralları, vardiya, mobil giriş." },
];

export type EgitimDurumu = "gecerli" | "yaklasiyor" | "doldu" | "yok";

/** Bitiş tarihine göre durum; bitişi olmayan eğitim süresiz geçerlidir */
export function egitimDurumu(kayit: Pick<EgitimKaydi, "gecerlilik_bitis"> | undefined, bugun: string, yaklasma: string): EgitimDurumu {
  if (!kayit) return "yok";
  if (!kayit.gecerlilik_bitis) return "gecerli";
  if (kayit.gecerlilik_bitis < bugun) return "doldu";
  if (kayit.gecerlilik_bitis <= yaklasma) return "yaklasiyor";
  return "gecerli";
}

/** "2026-10-17" + 36 ay -> "2029-10-17" (ay sonu taşarsa ayın son gününe çekilir) */
export function ayEkle(tarih: string, ay: number): string {
  const [y, m, d] = tarih.split("-").map(Number);
  const hedef = new Date(Date.UTC(y, m - 1 + ay, 1));
  const ayinSonu = new Date(Date.UTC(hedef.getUTCFullYear(), hedef.getUTCMonth() + 1, 0)).getUTCDate();
  hedef.setUTCDate(Math.min(d, ayinSonu));
  return hedef.toISOString().slice(0, 10);
}
