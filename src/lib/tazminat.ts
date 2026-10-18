// Kıdem ve ihbar tazminatı ile kullanılmayan yıllık izin ücreti (tahmini).
// Kıdem: 1475 s. Kanun m.14 (her tam yıl için 30 günlük giydirilmiş brüt, tavanla sınırlı; yalnızca damga vergisi).
// İhbar: 4857 s. İş Kanunu m.17 (2/4/6/8 hafta; gelir ve damga vergisi). İzin ücreti: m.59 (son ücretle; SGK ve vergiler).
import { kumulatifVergi, type YasalParametreler } from "./bordro";

export interface CikisNedeni {
  kod: string;
  ad: string;
  kidem: boolean;
  ihbar: boolean;
}

export const CIKIS_NEDENLERI: CikisNedeni[] = [
  { kod: "isveren", ad: "İşveren feshi (geçerli/haklı neden olmadan)", kidem: true, ihbar: true },
  { kod: "isveren_gecerli", ad: "İşveren feshi (geçerli neden, m.18)", kidem: true, ihbar: true },
  { kod: "isveren_25_2", ad: "İşveren haklı fesih (m.25/II ahlak ve iyi niyet)", kidem: false, ihbar: false },
  { kod: "isveren_25_diger", ad: "İşveren haklı fesih (m.25/I, III, IV sağlık, zorlayıcı neden, gözaltı)", kidem: true, ihbar: false },
  { kod: "isci_hakli", ad: "İşçinin haklı feshi (m.24)", kidem: true, ihbar: false },
  { kod: "istifa", ad: "İstifa", kidem: false, ihbar: false },
  { kod: "emeklilik", ad: "Emeklilik veya emeklilik için yaş dışındaki şartları doldurma", kidem: true, ihbar: false },
  { kod: "askerlik", ad: "Askerlik", kidem: true, ihbar: false },
  { kod: "evlilik", ad: "Kadın işçinin evlilikten itibaren 1 yıl içinde ayrılması", kidem: true, ihbar: false },
  { kod: "olum", ad: "Ölüm (mirasçılara)", kidem: true, ihbar: false },
  { kod: "ikale", ad: "Karşılıklı anlaşma (ikale; protokole göre)", kidem: true, ihbar: false },
];

export interface TazminatGirdisi {
  iseGiris: string;
  cikis: string;
  /** Aylık çıplak brüt ücret */
  brutUcret: number;
  /** Düzenli aylık ek ödemeler (yol, yemek, prim ortalaması): giydirilmiş ücrete eklenir */
  ekOdemeler: number;
  kidemVar: boolean;
  ihbarVar: boolean;
  /** Kullanılmayan yıllık izin (gün) */
  izinGun: number;
  /** Çıkış yılında daha önce oluşan gelir vergisi matrahı (kümülatif) */
  kumulatifMatrah: number;
  kidemTavani: number;
  yasal: YasalParametreler;
}

export interface TazminatSonucu {
  hizmet: { yil: number; ay: number; gun: number; toplamGun: number };
  giydirilmis: number;
  gunluk: number;
  kidem: { hak: boolean; esas: number; tavanli: boolean; brut: number; damga: number; net: number; neden: string };
  ihbar: { hak: boolean; gun: number; brut: number; gelirVergisi: number; damga: number; net: number };
  izin: { gun: number; brut: number; sgk: number; gelirVergisi: number; damga: number; net: number };
  toplamBrut: number;
  toplamNet: number;
}

const yuvarla = (n: number) => Math.round(n * 100) / 100;

/** İki tarih arası hizmet süresi (başlangıç ve bitiş dahil) */
export function hizmetSuresi(bas: string, bit: string): TazminatSonucu["hizmet"] {
  const b = new Date(`${bas}T12:00:00Z`);
  const s = new Date(`${bit}T12:00:00Z`);
  s.setUTCDate(s.getUTCDate() + 1);
  const toplamGun = Math.max(0, Math.round((s.getTime() - b.getTime()) / 86400000));
  let yil = s.getUTCFullYear() - b.getUTCFullYear();
  let ay = s.getUTCMonth() - b.getUTCMonth();
  let gun = s.getUTCDate() - b.getUTCDate();
  if (gun < 0) {
    ay--;
    gun += new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 0)).getUTCDate();
  }
  if (ay < 0) {
    yil--;
    ay += 12;
  }
  return { yil: Math.max(0, yil), ay: Math.max(0, ay), gun: Math.max(0, gun), toplamGun };
}

/** İhbar süresi (gün): 6 aydan az 14, 6 ay–1,5 yıl 28, 1,5–3 yıl 42, 3 yıldan fazla 56 */
export function ihbarGunu(h: TazminatSonucu["hizmet"]): number {
  const ay = h.yil * 12 + h.ay + h.gun / 30;
  return ay < 6 ? 14 : ay < 18 ? 28 : ay < 36 ? 42 : 56;
}

export function tazminatHesapla(g: TazminatGirdisi): TazminatSonucu {
  const hizmet = hizmetSuresi(g.iseGiris, g.cikis);
  const giydirilmis = Math.max(0, g.brutUcret) + Math.max(0, g.ekOdemeler);
  const gunluk = giydirilmis / 30;
  const damgaOrani = g.yasal.damgaBinde / 1000;

  // Kıdem: en az 1 tam yıl; yıl başına (tavanlı) aylık giydirilmiş; kesirli süre orantılı
  const yilSayisi = hizmet.yil + hizmet.ay / 12 + hizmet.gun / 365;
  const kidemHak = g.kidemVar && hizmet.yil >= 1;
  const esas = Math.min(giydirilmis, g.kidemTavani > 0 ? g.kidemTavani : giydirilmis);
  const kidemBrut = kidemHak ? esas * yilSayisi : 0;
  const kidemDamga = kidemBrut * damgaOrani;
  const kidemNeden = !g.kidemVar ? "Çıkış nedeni kıdem hakkı doğurmuyor" : hizmet.yil < 1 ? "Hizmet 1 yılı doldurmadı" : "";

  // İhbar: giydirilmiş günlük × ihbar günü; gelir vergisi (kümülatif) ve damga
  const ihbarGun = g.ihbarVar ? ihbarGunu(hizmet) : 0;
  const ihbarBrut = gunluk * ihbarGun;
  const km = Math.max(0, g.kumulatifMatrah);
  const ihbarGv = kumulatifVergi(km + ihbarBrut, g.yasal.vergiDilimleri) - kumulatifVergi(km, g.yasal.vergiDilimleri);
  const ihbarDamga = ihbarBrut * damgaOrani;

  // Kullanılmayan yıllık izin: çıplak günlük ücretle; SGK işçi + işsizlik, gelir ve damga vergisi
  const izinBrut = Math.max(0, g.izinGun) * (Math.max(0, g.brutUcret) / 30);
  const izinSgk = izinBrut * ((g.yasal.sgkIsci + g.yasal.issizlikIsci) / 100);
  const km2 = km + ihbarBrut;
  const izinGv = kumulatifVergi(km2 + izinBrut - izinSgk, g.yasal.vergiDilimleri) - kumulatifVergi(km2, g.yasal.vergiDilimleri);
  const izinDamga = izinBrut * damgaOrani;

  const kidem = { hak: kidemHak, esas: yuvarla(esas), tavanli: giydirilmis > esas, brut: yuvarla(kidemBrut), damga: yuvarla(kidemDamga), net: yuvarla(kidemBrut - kidemDamga), neden: kidemNeden };
  const ihbar = { hak: g.ihbarVar, gun: ihbarGun, brut: yuvarla(ihbarBrut), gelirVergisi: yuvarla(ihbarGv), damga: yuvarla(ihbarDamga), net: yuvarla(ihbarBrut - ihbarGv - ihbarDamga) };
  const izin = { gun: g.izinGun, brut: yuvarla(izinBrut), sgk: yuvarla(izinSgk), gelirVergisi: yuvarla(izinGv), damga: yuvarla(izinDamga), net: yuvarla(izinBrut - izinSgk - izinGv - izinDamga) };
  return {
    hizmet,
    giydirilmis: yuvarla(giydirilmis),
    gunluk: yuvarla(gunluk),
    kidem,
    ihbar,
    izin,
    toplamBrut: yuvarla(kidem.brut + ihbar.brut + izin.brut),
    toplamNet: yuvarla(kidem.net + ihbar.net + izin.net),
  };
}
