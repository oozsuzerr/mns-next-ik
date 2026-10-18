// Tahmini bordro ve mesai ücreti hesabı.
//
// Resmî bordro değildir: aylık kümülatif vergi matrahı, yılın önceki aylarında da aynı ücretin ödendiği
// varsayımıyla tahmin edilir; teşvik, BES, icra, özel sigorta gibi kalemler yoktur. Yasal oranlar ve
// mesai çarpanları firmanın Bordro ayarlarından gelir (varsayılanlar aşağıda; her yıl güncellenmelidir).

export interface YasalParametreler {
  /** Değerlerin ait olduğu yıl (yalnızca bilgi) */
  yil: number;
  /** Aylık brüt asgari ücret */
  asgariBrut: number;
  /** SGK prime esas kazanç tavanı = asgari ücret × bu katsayı */
  sgkTavanKatsayi: number;
  /** Oranlar yüzde olarak (14 = %14) */
  sgkIsci: number;
  issizlikIsci: number;
  sgkIsveren: number;
  issizlikIsveren: number;
  /** Damga vergisi oranı, binde (7,59 = binde 7,59) */
  damgaBinde: number;
  /** Ücret gelir vergisi dilimleri: üst sınır (TL, son dilim null) ve oran (%) */
  vergiDilimleri: { ust: number | null; oran: number }[];
  /** Aylık ücretin saatliğe çevrilmesi: aylık / bölen (İş Kanunu uygulaması: 30 gün × 7,5 saat = 225) */
  saatBoleni: number;
}

export type MesaiKaynagi = "fazla_mesai" | "hafta_tatili" | "resmi_tatil" | "plan_disi";

export interface MesaiKalemi {
  id: string;
  ad: string;
  /** Saatlerin nereden alınacağı */
  kaynak: MesaiKaynagi;
  /** Saatlik brüt ücretin katı (1,5 = %50 zamlı) */
  carpan: number;
  aktif: boolean;
}

export interface BordroAyarlari {
  yasal: YasalParametreler;
  mesaiKalemleri: MesaiKalemi[];
}

export const MESAI_KAYNAKLARI: Record<MesaiKaynagi, { ad: string; aciklama: string }> = {
  fazla_mesai: { ad: "Onaylı fazla mesai", aciklama: "Personelin bildirip yöneticinin onayladığı fazla mesai saatleri" },
  hafta_tatili: { ad: "Hafta tatili çalışması", aciklama: "Puantajda hafta tatili gününe düşen çalışma saatleri" },
  resmi_tatil: { ad: "Resmî tatil çalışması", aciklama: "Puantajda resmî/bayram tatiline düşen çalışma saatleri" },
  plan_disi: { ad: "Plan dışı çalışma", aciklama: "Puantajda vardiya dışında kalan çalışma (onaylı mesaiyle çakışabilir)" },
};

/**
 * Varsayılanlar 2025 yılının resmî değerleridir. Yeni yılda (asgari ücret, vergi dilimleri, SGK oranları)
 * Bordro ayarlarından güncellenmelidir.
 */
export const VARSAYILAN_YASAL: YasalParametreler = {
  yil: 2025,
  asgariBrut: 26005.5,
  sgkTavanKatsayi: 7.5,
  sgkIsci: 14,
  issizlikIsci: 1,
  sgkIsveren: 20.75,
  issizlikIsveren: 2,
  damgaBinde: 7.59,
  vergiDilimleri: [
    { ust: 158000, oran: 15 },
    { ust: 330000, oran: 20 },
    { ust: 1200000, oran: 27 },
    { ust: 4300000, oran: 35 },
    { ust: null, oran: 40 },
  ],
  saatBoleni: 225,
};

/** İş Kanunu'na göre yasal asgari çarpanlar (firma artırabilir) */
export const VARSAYILAN_MESAI_KALEMLERI: MesaiKalemi[] = [
  { id: "fazla", ad: "Fazla mesai (%50 zamlı)", kaynak: "fazla_mesai", carpan: 1.5, aktif: true },
  { id: "hafta", ad: "Hafta tatili çalışması (%50 zamlı)", kaynak: "hafta_tatili", carpan: 1.5, aktif: true },
  { id: "resmi", ad: "Resmî tatil çalışması (ek 1 günlük ücret)", kaynak: "resmi_tatil", carpan: 1, aktif: true },
  { id: "plandisi", ad: "Plan dışı çalışma", kaynak: "plan_disi", carpan: 1.5, aktif: false },
];

export const VARSAYILAN_BORDRO_AYARLARI: BordroAyarlari = { yasal: VARSAYILAN_YASAL, mesaiKalemleri: VARSAYILAN_MESAI_KALEMLERI };

export type UcretTuru = "Aylık brüt" | "Aylık net" | "Günlük brüt" | "Saatlik brüt";

const yuvarla = (n: number) => Math.round(n * 100) / 100;

/** Kümülatif matraha göre toplam gelir vergisi */
export function kumulatifVergi(matrah: number, dilimler: YasalParametreler["vergiDilimleri"]): number {
  let vergi = 0;
  let alt = 0;
  for (const d of dilimler) {
    const ust = d.ust ?? Infinity;
    if (matrah <= alt) break;
    vergi += (Math.min(matrah, ust) - alt) * (d.oran / 100);
    alt = ust;
  }
  return vergi;
}

/** Ayın (1-12) gelir vergisi: kümülatif matraha göre bu aya düşen fark */
function ayinVergisi(aylikMatrah: number, ay: number, dilimler: YasalParametreler["vergiDilimleri"]): number {
  const onceki = aylikMatrah * (ay - 1);
  return kumulatifVergi(onceki + aylikMatrah, dilimler) - kumulatifVergi(onceki, dilimler);
}

export interface BrutNetSonuc {
  brut: number;
  sgkMatrahi: number;
  sgkIsci: number;
  issizlikIsci: number;
  gelirVergisi: number;
  damgaVergisi: number;
  net: number;
  sgkIsveren: number;
  issizlikIsveren: number;
  isverenMaliyeti: number;
}

/**
 * Bir ayın toplam brütünden neti hesaplar.
 * gun: SGK prim günü (asgari ücret istisnası ve SGK sınırları güne göre oranlanır). ay: 1-12 (kümülatif vergi için).
 */
export function brutten(brut: number, gun: number, ay: number, y: YasalParametreler): BrutNetSonuc {
  const oran = Math.max(0, Math.min(30, gun)) / 30;
  const taban = y.asgariBrut * oran;
  const tavan = y.asgariBrut * y.sgkTavanKatsayi * oran;
  const sgkMatrahi = brut <= 0 ? 0 : Math.min(Math.max(brut, taban), tavan);
  const sgkIsci = sgkMatrahi * (y.sgkIsci / 100);
  const issizlikIsci = sgkMatrahi * (y.issizlikIsci / 100);

  // Gelir vergisi: ücretin vergisi eksi asgari ücretin vergisi (asgari ücret istisnası)
  const gvMatrahi = Math.max(0, brut - sgkIsci - issizlikIsci);
  const asgariMatrah = y.asgariBrut * (1 - (y.sgkIsci + y.issizlikIsci) / 100);
  const istisna = ayinVergisi(asgariMatrah, ay, y.vergiDilimleri) * oran;
  const gelirVergisi = Math.max(0, ayinVergisi(gvMatrahi, ay, y.vergiDilimleri) - istisna);

  // Damga vergisi: asgari ücret kadarı istisna
  const damgaVergisi = Math.max(0, (brut - y.asgariBrut * oran) * (y.damgaBinde / 1000));

  const net = brut - sgkIsci - issizlikIsci - gelirVergisi - damgaVergisi;
  const sgkIsveren = sgkMatrahi * (y.sgkIsveren / 100);
  const issizlikIsveren = sgkMatrahi * (y.issizlikIsveren / 100);
  return {
    brut: yuvarla(brut),
    sgkMatrahi: yuvarla(sgkMatrahi),
    sgkIsci: yuvarla(sgkIsci),
    issizlikIsci: yuvarla(issizlikIsci),
    gelirVergisi: yuvarla(gelirVergisi),
    damgaVergisi: yuvarla(damgaVergisi),
    net: yuvarla(net),
    sgkIsveren: yuvarla(sgkIsveren),
    issizlikIsveren: yuvarla(issizlikIsveren),
    isverenMaliyeti: yuvarla(brut + sgkIsveren + issizlikIsveren),
  };
}

/** Tam ay için netten brüte (ikili arama; 1 kuruş hassasiyet) */
export function nettenBrute(net: number, ay: number, y: YasalParametreler): number {
  let alt = net;
  let ust = net * 2 + 1000;
  for (let i = 0; i < 80 && ust - alt > 0.005; i++) {
    const orta = (alt + ust) / 2;
    if (brutten(orta, 30, ay, y).net < net) alt = orta;
    else ust = orta;
  }
  return yuvarla(ust);
}

/** Personelin ücretinden aylık (30 günlük) brüt ve saatlik brüt */
export function temelUcret(ucret: number, tur: UcretTuru, ay: number, y: YasalParametreler): { aylikBrut: number; saatlik: number } {
  switch (tur) {
    case "Aylık net": {
      const aylikBrut = nettenBrute(ucret, ay, y);
      return { aylikBrut, saatlik: aylikBrut / y.saatBoleni };
    }
    case "Günlük brüt":
      return { aylikBrut: ucret * 30, saatlik: ucret / 7.5 };
    case "Saatlik brüt":
      return { aylikBrut: ucret * y.saatBoleni, saatlik: ucret };
    default:
      return { aylikBrut: ucret, saatlik: ucret / y.saatBoleni };
  }
}

export interface MesaiSaatleri {
  fazla_mesai: number;
  hafta_tatili: number;
  resmi_tatil: number;
  plan_disi: number;
}

/** Saatlik brüte ve aktif mesai kalemlerine göre mesai ücretleri (aynı kaynağa birden çok kalem varsa toplanır) */
export function mesaiUcretleri(saatlik: number, saatler: MesaiSaatleri, kalemler: MesaiKalemi[]) {
  const satirlar = kalemler
    .filter((k) => k.aktif && saatler[k.kaynak] > 0)
    .map((k) => ({ ad: k.ad, kaynak: k.kaynak, saat: saatler[k.kaynak], carpan: k.carpan, tutar: yuvarla(saatler[k.kaynak] * saatlik * k.carpan) }));
  return { satirlar, toplam: yuvarla(satirlar.reduce((t, s) => t + s.tutar, 0)) };
}

export interface BordroGirdisi {
  ucret: number;
  ucretTuru: UcretTuru;
  /** SGK prim günü (puantaj) */
  primGun: number;
  /** Saatlik ücretlide çalışılan saat */
  calismaSaati: number;
  mesaiSaatleri: MesaiSaatleri;
  avans: number;
  masraf: number;
  /** 1-12 */
  ay: number;
}

export interface TahminiBordro extends BrutNetSonuc {
  ucretBrut: number;
  saatlik: number;
  mesai: ReturnType<typeof mesaiUcretleri>;
  avans: number;
  masraf: number;
  odenecek: number;
}

export function tahminiBordro(g: BordroGirdisi, ayar: BordroAyarlari): TahminiBordro {
  const y = ayar.yasal;
  const { aylikBrut, saatlik } = temelUcret(g.ucret, g.ucretTuru, g.ay, y);
  const gun = Math.max(0, Math.min(30, g.primGun));
  const ucretBrut = g.ucretTuru === "Saatlik brüt" ? g.ucret * g.calismaSaati : (aylikBrut * gun) / 30;
  const mesai = mesaiUcretleri(saatlik, g.mesaiSaatleri, ayar.mesaiKalemleri);
  const sonuc = brutten(ucretBrut + mesai.toplam, gun, g.ay, y);
  return {
    ...sonuc,
    ucretBrut: yuvarla(ucretBrut),
    saatlik: yuvarla(saatlik),
    mesai,
    avans: yuvarla(g.avans),
    masraf: yuvarla(g.masraf),
    odenecek: yuvarla(sonuc.net - g.avans + g.masraf),
  };
}

/** Kayıtlı ayarları varsayılanlarla tamamlar (eksik alan, bozuk değer) */
export function bordroAyarlariniTamamla(kayit: { yasal?: Partial<YasalParametreler> | null; mesai_kalemleri?: MesaiKalemi[] | null } | null): BordroAyarlari {
  const yasal = { ...VARSAYILAN_YASAL, ...(kayit?.yasal ?? {}) };
  if (!Array.isArray(yasal.vergiDilimleri) || !yasal.vergiDilimleri.length) yasal.vergiDilimleri = VARSAYILAN_YASAL.vergiDilimleri;
  const mesaiKalemleri = Array.isArray(kayit?.mesai_kalemleri) ? kayit!.mesai_kalemleri! : VARSAYILAN_MESAI_KALEMLERI;
  return { yasal, mesaiKalemleri };
}

export const tlYaz = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
