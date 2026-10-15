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
}

export const VARSAYILAN_AYARLAR: Ayarlar = {
  gecikme_tolerans_dk: 5,
  mesai_tolerans_dk: 15,
  mola_esigi_dk: 240,
  cikis_tolerans_dk: 360,
  erken_giris_payi_dk: 240,
  izin_gunu_dk: 450,
};

/** Veritabanından gelen (eksik olabilecek) satırı tam ayar nesnesine çevirir */
export function ayarlariTamamla(satir: Partial<Ayarlar> | null | undefined): Ayarlar {
  const sonuc = { ...VARSAYILAN_AYARLAR };
  if (!satir) return sonuc;
  for (const anahtar of Object.keys(VARSAYILAN_AYARLAR) as (keyof Ayarlar)[]) {
    const deger = Number(satir[anahtar]);
    if (Number.isFinite(deger)) sonuc[anahtar] = deger;
  }
  return sonuc;
}

export const DK_MS = 60 * 1000;
