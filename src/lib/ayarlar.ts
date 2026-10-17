// Şirket genelindeki puantaj kuralları. Genel yönetici panelden değiştirir
// (sirket_ayarlari tablosu); okunamazsa aşağıdaki varsayılanlar kullanılır.

export interface Ayarlar {
  /** Vardiya başlangıcından bu kadar dakika sonrasına kadar gecikme sayılmaz */
  gecikme_tolerans_dk: number;
  /** Vardiya bitişinden bu kadar dakika sonrası plan dışı mesai sayılır */
  mesai_tolerans_dk: number;
  /** Bu süreyi aşan çalışmada vardiya molası düşülür */
  mola_esigi_dk: number;
  /** Çıkış basılmazsa vardiya bitişinden bu kadar sonra "çıkış eksik" sayılır */
  cikis_tolerans_dk: number;
  /** Vardiya başlangıcından bu kadar önce yapılan giriş o vardiyaya sayılır */
  erken_giris_payi_dk: number;
  /** Saatlik izinlerin güne çevrilmesinde kullanılan günlük çalışma süresi */
  izin_gunu_dk: number;
  /** Vardiya planı yoksa tatil sayılan haftanın günleri (ISO: 1 = Pazartesi ... 7 = Pazar) */
  calismayan_gunler: number[];
  /** Yıllık izinde düşülmeyen çalışılmayan günler: yalnızca Pazar ya da hepsi (sözleşmeye göre) */
  izinde_dusulmeyen: "pazar" | "hepsi";
}

/** Dakika cinsinden sayısal kurallar */
export type SayisalAyar = Exclude<keyof Ayarlar, "calismayan_gunler" | "izinde_dusulmeyen">;

export const VARSAYILAN_AYARLAR: Ayarlar = {
  gecikme_tolerans_dk: 5,
  mesai_tolerans_dk: 15,
  mola_esigi_dk: 240,
  cikis_tolerans_dk: 360,
  erken_giris_payi_dk: 240,
  izin_gunu_dk: 450,
  calismayan_gunler: [7],
  izinde_dusulmeyen: "pazar",
};

/** Veritabanından gelen (eksik olabilecek) satırı tam ayar nesnesine çevirir */
export function ayarlariTamamla(satir: Partial<Ayarlar> | null | undefined): Ayarlar {
  const sonuc = { ...VARSAYILAN_AYARLAR };
  if (!satir) return sonuc;
  for (const anahtar of Object.keys(VARSAYILAN_AYARLAR) as (keyof Ayarlar)[]) {
    if (anahtar === "calismayan_gunler" || anahtar === "izinde_dusulmeyen") continue;
    const deger = Number(satir[anahtar]);
    if (Number.isFinite(deger)) sonuc[anahtar] = deger;
  }
  if (Array.isArray(satir.calismayan_gunler)) {
    sonuc.calismayan_gunler = [...new Set(satir.calismayan_gunler.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 7))].sort();
  }
  if (satir.izinde_dusulmeyen === "hepsi") sonuc.izinde_dusulmeyen = "hepsi";
  return sonuc;
}

export const DK_MS = 60 * 1000;
