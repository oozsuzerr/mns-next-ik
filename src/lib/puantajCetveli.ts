// Aylık puantaj cetveli: personeller satırda, günler sütunda. Her hücrede üstte planlanan süre,
// altta gerçekleşen fark (iş günü) ya da tatil çalışması; süreler ondalık saat (7,5 = 7 saat 30 dk).
import type { Satir } from "./disaAktar";
import type { GunDetay, PuantajSatiri } from "./puantaj";

export type HucreTon = "fazla" | "eksik" | "devamsiz" | "ht" | "rt" | "izin" | "rapor" | "hareket" | "devam" | "bos";

export interface CetvelHucre {
  tarih: string;
  /** Sütun başlığı: "01 Cmt" */
  baslik: string;
  /** Planlanan saat (yoksa null) */
  plan: number | null;
  /** Alt satırdaki sayı (fark ya da tatil çalışması); metin hücrelerinde null */
  deger: number | null;
  /** Ekranda ve Excel'de yazılan */
  metin: string;
  ton: HucreTon;
  /** Fareyle üzerine gelince */
  aciklama: string;
}

export interface CetvelToplam {
  /** Toplam net çalışma (saat) */
  toplam: number;
  /** İş günlerinde plan kadar çalışılan (saat) */
  normal: number;
  /** İş günlerinde plandan fazla (saat) */
  fazla: number;
  /** İş günlerinde plandan eksik (saat, negatif) */
  eksik: number;
  /** Hafta tatili ve çalışılmayan gün çalışması (saat) */
  ht: number;
  /** Resmî tatil çalışması (saat) */
  rt: number;
  izin: number;
  rapor: number;
  calisilanGun: number;
  devamsiz: number;
  primGun: number;
}

export interface CetvelSatiri {
  id: string;
  adSoyad: string;
  sicil: string;
  sube: string;
  hucreler: CetvelHucre[];
  toplam: CetvelToplam;
}

/** Dakikayı ondalık saate çevirir (2 basamak) */
export const ondalik = (dk: number) => Math.round((dk / 60) * 100) / 100;

/** 7.5 → "7.5", -0.45 → "-0.45" (ekranda nokta; görseldeki gibi) */
export const saatYaz = (n: number) => String(Math.round(n * 100) / 100);

export const TON_ACIKLAMA: Record<Exclude<HucreTon, "bos" | "devam">, string> = {
  fazla: "Plandan fazla çalışma",
  eksik: "Plandan eksik çalışma",
  devamsiz: "Devamsız (planlı süre kadar eksik)",
  ht: "Hafta tatili / çalışılmayan gün çalışması",
  rt: "Resmî tatil çalışması",
  izin: "İzinli",
  rapor: "Raporlu",
  hareket: "Eksik giriş/çıkış kaydı",
};

function hucre(g: GunDetay): Omit<CetvelHucre, "tarih" | "baslik"> {
  const plan = g.planDk > 0 ? ondalik(g.planDk) : null;
  const t = (deger: number | null, metin: string, ton: HucreTon) => ({ plan, deger, metin, ton, aciklama: `${g.durum}${g.not ? ` · ${g.not}` : ""}` });

  if (g.tip === "calisma" || (g.tip === "eksik" && g.calismaDk > 0)) {
    if (g.calismaDk === 0) return t(null, "…", "devam");
    const net = ondalik(g.calismaDk);
    if (g.gunTuru === "resmiTatil") return t(net, saatYaz(net), "rt");
    if (g.gunTuru !== "is") return t(net, saatYaz(net), "ht");
    const fark = ondalik(g.calismaDk - g.planDk);
    return t(fark, saatYaz(fark), fark >= 0 ? "fazla" : "eksik");
  }
  if (g.tip === "eksik") return t(null, "Eksik", "hareket");
  if (g.tip === "devamsiz") return t(plan != null ? -plan : null, plan != null ? saatYaz(-plan) : "Devamsız", "devamsiz");
  if (g.tip === "rapor") return t(null, "Rapor", "rapor");
  if (g.tip === "izin") return t(null, "İzin", "izin");
  return t(null, "--:--", "bos");
}

export function cetvelSatiri(p: PuantajSatiri): CetvelSatiri {
  const toplam: CetvelToplam = {
    toplam: 0,
    normal: 0,
    fazla: 0,
    eksik: 0,
    ht: 0,
    rt: 0,
    izin: 0,
    rapor: 0,
    calisilanGun: p.calisilanGunler,
    devamsiz: p.devamsizGunler,
    primGun: p.sgkPrimGun,
  };
  let normalDk = 0;
  let fazlaDk = 0;
  let eksikDk = 0;
  let htDk = 0;
  let rtDk = 0;
  // Aylar arası aralıkta gün numarası tekrarlanmasın diye başlığa ay eklenir: "28.09 Pzt"
  const cokAy = new Set(p.gunlukDetaylar.map((g) => g.tarih.slice(0, 7))).size > 1;
  const hucreler = p.gunlukDetaylar.map((g) => {
    const h = hucre(g);
    if (h.ton === "fazla" || h.ton === "eksik") {
      normalDk += Math.min(g.calismaDk, g.planDk);
      fazlaDk += Math.max(0, g.calismaDk - g.planDk);
      eksikDk += Math.min(0, g.calismaDk - g.planDk);
    } else if (h.ton === "ht") htDk += g.calismaDk;
    else if (h.ton === "rt") rtDk += g.calismaDk;
    else if (h.ton === "izin") toplam.izin++;
    else if (h.ton === "rapor") toplam.rapor++;
    return { tarih: g.tarih, baslik: cokAy ? `${g.tarih.slice(8, 10)}.${g.tarih.slice(5, 7)} ${g.gunAdi}` : `${g.tarih.slice(8, 10)} ${g.gunAdi}`, ...h };
  });
  toplam.toplam = ondalik(p.toplamCalismaDk);
  toplam.normal = ondalik(normalDk);
  toplam.fazla = ondalik(fazlaDk);
  toplam.eksik = ondalik(eksikDk);
  toplam.ht = ondalik(htDk);
  toplam.rt = ondalik(rtDk);
  return { id: p.id, adSoyad: p.adSoyad, sicil: p.sicil_no, sube: p.subeAdi, hucreler, toplam };
}

export const TOPLAM_SUTUNLARI: { anahtar: keyof CetvelToplam; kisa: string; ad: string }[] = [
  { anahtar: "toplam", kisa: "TOP", ad: "Toplam çalışma (saat)" },
  { anahtar: "normal", kisa: "NM", ad: "Normal mesai: iş günlerinde plan kadar (saat)" },
  { anahtar: "fazla", kisa: "FM", ad: "Fazla mesai: iş günlerinde plandan fazla (saat)" },
  { anahtar: "eksik", kisa: "EÇ", ad: "Eksik çalışma: iş günlerinde plandan eksik (saat)" },
  { anahtar: "ht", kisa: "HT", ad: "Hafta tatili / çalışılmayan gün çalışması (saat)" },
  { anahtar: "rt", kisa: "RT", ad: "Resmî tatil çalışması (saat)" },
  { anahtar: "izin", kisa: "İZİN", ad: "İzinli gün" },
  { anahtar: "rapor", kisa: "RAP", ad: "Raporlu gün" },
  { anahtar: "calisilanGun", kisa: "TÇ", ad: "Çalışılan gün" },
  { anahtar: "devamsiz", kisa: "DEV", ad: "Devamsız gün" },
  { anahtar: "primGun", kisa: "GÜN", ad: "SGK prim günü" },
];

/** Excel/PDF için: kişi başına iki satır (Plan ve Gerçekleşen), gün sütunları ve toplamlar */
export function cetvelAktarimi(liste: PuantajSatiri[]): Satir[] {
  const satirlar: Satir[] = [];
  for (const p of liste) {
    const c = cetvelSatiri(p);
    const plan: Satir = { "Ad Soyad": c.adSoyad, "Sicil No": c.sicil, Şube: c.sube, Satır: "Plan" };
    const ger: Satir = { "Ad Soyad": "", "Sicil No": "", Şube: "", Satır: "Gerçekleşen" };
    for (const h of c.hucreler) {
      plan[h.baslik] = h.plan ?? "--:--";
      ger[h.baslik] = h.deger ?? h.metin;
    }
    for (const t of TOPLAM_SUTUNLARI) {
      plan[t.kisa] = c.toplam[t.anahtar];
      ger[t.kisa] = "";
    }
    satirlar.push(plan, ger);
  }
  return satirlar;
}

export interface GunOzeti {
  /** Ayın takvim günü (aralıkta gösterilen gün sayısı) */
  ayGun: number;
  sgkGun: number;
  /** Ücretlendirilen gün (SGK prim günü) */
  primGun: number;
  /** İş günlerinde çalışılan gün */
  normalGun: number;
  /** Kadrodaki resmî tatil ve hafta tatili (çalışılmayan gün dahil) günleri */
  rtGun: number;
  htGun: number;
  devamsiz: number;
  ucretliIzin: number;
  ucretsizIzin: number;
  rapor: number;
  /** Dakika: iş günlerinde plan kadar, fazla, eksik (pozitif); tatil çalışmaları */
  normalDk: number;
  fazlaDk: number;
  eksikDk: number;
  /** Günlük toleransı aşan eksik (kesinti için) */
  kesintiliEksikDk: number;
  htDk: number;
  rtDk: number;
}

/** Bordro için kişi başı gün ve süre özeti (eksikToleransDk: günde bu kadarlık eksik kesintiye girmez) */
export function gunOzeti(p: PuantajSatiri, eksikToleransDk = 0): GunOzeti {
  const o: GunOzeti = {
    ayGun: p.gunlukDetaylar.length,
    sgkGun: p.sgkTabanGun,
    primGun: p.sgkPrimGun,
    normalGun: 0,
    rtGun: 0,
    htGun: 0,
    devamsiz: p.devamsizGunler,
    ucretliIzin: p.yillikIzinGunler + p.ucretliIzinGunler,
    ucretsizIzin: p.ucretsizIzinGunler,
    rapor: p.raporluGunler,
    normalDk: 0,
    fazlaDk: 0,
    eksikDk: 0,
    kesintiliEksikDk: 0,
    htDk: 0,
    rtDk: 0,
  };
  const bas = p.iseGiris ?? "";
  for (const g of p.gunlukDetaylar) {
    const kadroda = g.tarih >= bas && (!p.cikisTarihi || g.tarih <= p.cikisTarihi);
    if (kadroda && g.gunTuru === "resmiTatil") o.rtGun++;
    else if (kadroda && g.gunTuru !== "is") o.htGun++;
    if (g.calismaDk <= 0) continue;
    if (g.gunTuru === "resmiTatil") o.rtDk += g.calismaDk;
    else if (g.gunTuru !== "is") o.htDk += g.calismaDk;
    else {
      o.normalGun++;
      if (g.planDk > 0) {
        const fark = g.calismaDk - g.planDk;
        o.normalDk += Math.min(g.calismaDk, g.planDk);
        if (fark > 0) o.fazlaDk += fark;
        else {
          o.eksikDk += -fark;
          if (-fark > eksikToleransDk) o.kesintiliEksikDk += -fark;
        }
      } else o.normalDk += g.calismaDk;
    }
  }
  return o;
}
