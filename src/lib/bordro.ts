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

export type MesaiKaynagi = "fazla_mesai" | "fazla_calisma" | "hafta_tatili" | "resmi_tatil" | "plan_disi";

export interface MesaiKalemi {
  id: string;
  ad: string;
  /** Saatlerin nereden alınacağı */
  kaynak: MesaiKaynagi;
  /** Saatlik brüt ücretin katı (1,5 = %50 zamlı) */
  carpan: number;
  aktif: boolean;
}

/** Firmanın hesap kuralları (bordro_ayarlari.yasal.kurallar içinde saklanır) */
export interface HesapKurallari {
  /** İş günlerinde plandan eksik çalışılan saat, saat ücretiyle ücretten düşülsün (geç gelme, erken çıkma) */
  eksikSaatKesintisi: boolean;
  /** Günde bu kadar dakikaya kadar eksik çalışma kesintiye girmez (tolerans) */
  eksikToleransDk: number;
  /** Saatlik ücretlilere hafta tatili ve resmî tatil günleri için günlük ücret (7,5 saat) ödensin */
  saatliktenTatilUcreti: boolean;
}

export interface BordroAyarlari {
  yasal: YasalParametreler;
  mesaiKalemleri: MesaiKalemi[];
  kurallar: HesapKurallari;
}

/**
 * Mesai saatleri yalnızca müdürün onayladığı fazla mesai taleplerinden gelir; talebin tarihine göre iş günü,
 * hafta tatili ya da resmî tatil kaynağına ayrılır. "eski" kaynaklar (puantajdaki onaysız çalışma) artık ücrete girmez.
 */
export const MESAI_KAYNAKLARI: Record<MesaiKaynagi, { ad: string; aciklama: string; eski?: boolean }> = {
  fazla_mesai: { ad: "Onaylı fazla mesai (iş günü)", aciklama: "Müdürün onayladığı, iş gününe düşen fazla mesai talepleri" },
  hafta_tatili: { ad: "Onaylı mesai (hafta tatili)", aciklama: "Müdürün onayladığı, hafta tatili ya da çalışılmayan güne düşen mesai talepleri" },
  resmi_tatil: { ad: "Onaylı mesai (resmî tatil)", aciklama: "Müdürün onayladığı, resmî/bayram tatiline düşen mesai talepleri" },
  fazla_calisma: { ad: "Puantajdaki fazla çalışma (kullanılmıyor)", aciklama: "Onaysız olduğu için ücrete girmez", eski: true },
  plan_disi: { ad: "Plan dışı çalışma (kullanılmıyor)", aciklama: "Onaysız olduğu için ücrete girmez", eski: true },
};

/**
 * Varsayılanlar 2026 yılının resmî değerleridir: brüt asgari ücret 33.030 TL (net 28.075,50), SGK tavanı asgari
 * ücretin 9 katı, ücret gelir vergisi tarifesi 190 bin / 400 bin / 1,5 milyon / 5,3 milyon. İşveren SGK payı
 * teşviksiz %21,75; 2 puan teşvikte 19,75, imalatta 5 puan teşvikte 16,75 girilir. Yeni yılda Bordro ayarlarından güncellenmelidir.
 */
export const VARSAYILAN_YASAL: YasalParametreler = {
  yil: 2026,
  asgariBrut: 33030,
  sgkTavanKatsayi: 9,
  sgkIsci: 14,
  issizlikIsci: 1,
  sgkIsveren: 21.75,
  issizlikIsveren: 2,
  damgaBinde: 7.59,
  vergiDilimleri: [
    { ust: 190000, oran: 15 },
    { ust: 400000, oran: 20 },
    { ust: 1500000, oran: 27 },
    { ust: 5300000, oran: 35 },
    { ust: null, oran: 40 },
  ],
  saatBoleni: 225,
};

/** İş Kanunu'na göre yasal asgari çarpanlar (firma artırabilir) */
export const VARSAYILAN_MESAI_KALEMLERI: MesaiKalemi[] = [
  { id: "fazla", ad: "Fazla mesai (%50 zamlı)", kaynak: "fazla_mesai", carpan: 1.5, aktif: true },
  { id: "hafta", ad: "Hafta tatili çalışması (%50 zamlı)", kaynak: "hafta_tatili", carpan: 1.5, aktif: true },
  { id: "resmi", ad: "Resmî tatil çalışması (ek 1 günlük ücret)", kaynak: "resmi_tatil", carpan: 1, aktif: true },
];

export const VARSAYILAN_KURALLAR: HesapKurallari = { eksikSaatKesintisi: false, eksikToleransDk: 0, saatliktenTatilUcreti: true };

export const VARSAYILAN_BORDRO_AYARLARI: BordroAyarlari = { yasal: VARSAYILAN_YASAL, mesaiKalemleri: VARSAYILAN_MESAI_KALEMLERI, kurallar: VARSAYILAN_KURALLAR };

export type UcretTuru = "Aylık brüt" | "Aylık net" | "Haftalık brüt" | "Günlük brüt" | "Saatlik brüt";

export const UCRET_TURLERI: UcretTuru[] = ["Aylık brüt", "Aylık net", "Haftalık brüt", "Günlük brüt", "Saatlik brüt"];

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
    case "Haftalık brüt": {
      const aylikBrut = (ucret / 7) * 30;
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
  fazla_calisma: number;
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
  /** İş günlerinde plandan eksik çalışılan saat (tolerans uygulanmış) */
  eksikSaat: number;
  /** Kadrodaki hafta tatili ve resmî tatil günü sayısı (saatlik ücretlinin tatil ücreti için) */
  tatilGun: number;
  /** Ek kazançlar: vergili olanlar brüte, vergisizler netten sonra eklenir */
  ekVergili: number;
  ekVergisiz: number;
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
  /** Saatlik ücretlinin tatil günleri ücreti */
  tatilUcreti: number;
  /** Eksik çalışma kesintisi (pozitif tutar) */
  eksikKesinti: number;
  ekVergili: number;
  ekVergisiz: number;
  avans: number;
  masraf: number;
  odenecek: number;
}

export function tahminiBordro(g: BordroGirdisi, ayar: BordroAyarlari): TahminiBordro {
  const y = ayar.yasal;
  const { aylikBrut, saatlik } = temelUcret(g.ucret, g.ucretTuru, g.ay, y);
  const gun = Math.max(0, Math.min(30, g.primGun));
  const saatlikUcretli = g.ucretTuru === "Saatlik brüt";
  const ucretBrut = saatlikUcretli ? g.ucret * g.calismaSaati : (aylikBrut * gun) / 30;
  const tatilUcreti = saatlikUcretli && ayar.kurallar.saatliktenTatilUcreti ? g.tatilGun * 7.5 * g.ucret : 0;
  // Saatlik ücretli zaten çalıştığı saat kadar alır; eksik kesintisi aylık/haftalık/günlük ücretliye uygulanır
  const eksikKesinti = !saatlikUcretli && ayar.kurallar.eksikSaatKesintisi ? Math.min(ucretBrut, g.eksikSaat * saatlik) : 0;
  const mesai = mesaiUcretleri(saatlik, g.mesaiSaatleri, ayar.mesaiKalemleri);
  const sonuc = brutten(ucretBrut + tatilUcreti - eksikKesinti + mesai.toplam + g.ekVergili, gun, g.ay, y);
  return {
    ...sonuc,
    ucretBrut: yuvarla(ucretBrut),
    saatlik: yuvarla(saatlik),
    mesai,
    tatilUcreti: yuvarla(tatilUcreti),
    eksikKesinti: yuvarla(eksikKesinti),
    ekVergili: yuvarla(g.ekVergili),
    ekVergisiz: yuvarla(g.ekVergisiz),
    avans: yuvarla(g.avans),
    masraf: yuvarla(g.masraf),
    odenecek: yuvarla(sonuc.net - g.avans + g.masraf + g.ekVergisiz),
  };
}

/** Kayıtlı ayarları varsayılanlarla tamamlar (eksik alan, bozuk değer) */
export function bordroAyarlariniTamamla(
  kayit: { yasal?: (Partial<YasalParametreler> & { kurallar?: Partial<HesapKurallari> }) | null; mesai_kalemleri?: MesaiKalemi[] | null } | null
): BordroAyarlari {
  const { kurallar, ...kayitliYasal } = kayit?.yasal ?? {};
  const yasal: YasalParametreler = { ...VARSAYILAN_YASAL, ...kayitliYasal };
  if (!Array.isArray(yasal.vergiDilimleri) || !yasal.vergiDilimleri.length) yasal.vergiDilimleri = VARSAYILAN_YASAL.vergiDilimleri;
  const mesaiKalemleri = Array.isArray(kayit?.mesai_kalemleri) ? kayit!.mesai_kalemleri! : VARSAYILAN_MESAI_KALEMLERI;
  return { yasal, mesaiKalemleri, kurallar: { ...VARSAYILAN_KURALLAR, ...(kurallar ?? {}) } };
}

export const tlYaz = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
