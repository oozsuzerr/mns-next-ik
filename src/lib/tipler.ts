// Yönetici panelinin ortak tipleri ve yardımcı fonksiyonları

export interface Sube {
  id: string;
  ad: string;
  enlem: number;
  boylam: number;
  limit_metre: number;
}

export interface Vardiya {
  id: string;
  ad: string;
  baslangic_saat: string;
  bitis_saat: string;
  mola_dakika: number;
}

export interface Personel {
  id: string;
  sicil_no: string;
  tc_kimlik: string;
  ad: string;
  soyad: string;
  departman: string | null;
  varsayilan_sube_id: string | null;
  varsayilan_vardiya_id: string | null;
  rol: string;
  cihaz_id: string | null;
  aktif: boolean;
  created_at: string;
  pin_tanimli?: boolean;
  /** Kıdem ve yıllık izin hesabı için */
  ise_giris_tarihi?: string | null;
  dogum_tarihi?: string | null;
  devreden_izin_gun?: number | null;
  devir_tarihi?: string | null;
  subeler?: { ad: string } | null;
  vardiyalar?: Vardiya | null;
}

export interface Hareket {
  id: string;
  personel_id: string;
  sube_id: string;
  islem_turu: string;
  mesafe_metre: number;
  manuel?: boolean;
  yonetici_notu?: string | null;
  created_at: string;
  personeller?: { ad: string; soyad: string; sicil_no: string; tc_kimlik: string } | null;
  subeler?: { ad: string } | null;
}

export interface BugunHareket {
  id: string;
  personel_id: string;
  sube_id: string | null;
  islem_turu: string;
  created_at: string;
}

export interface Izin {
  id: string;
  personel_id: string;
  izin_turu: string;
  sgk_kodu?: string | null;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  /** Saatlik izinde "10:00:00" */
  baslangic_saat?: string | null;
  bitis_saat?: string | null;
  /** İzinden düşülen gün (iş günü; saatlikte kesirli) */
  gun_sayisi?: number | null;
  /** Amirin karar açıklaması (ör. red gerekçesi) */
  karar_notu?: string | null;
  aciklama: string | null;
  durum?: string;
  personeller?: { ad: string; soyad: string; sicil_no: string } | null;
}

/** Personelin bildirdiği fazla mesai (müdür onayına gider) */
export interface MesaiTalebi {
  id: string;
  personel_id: string;
  tarih: string;
  baslangic_saat: string;
  bitis_saat: string;
  sure_dk: number;
  neden: string;
  durum: "BEKLEMEDE" | "ONAYLANDI" | "REDDEDILDI";
  karar_zamani?: string | null;
  /** Amirin karar açıklaması (ör. red gerekçesi) */
  karar_notu?: string | null;
  created_at: string;
  personeller?: { ad: string; soyad: string; sicil_no: string; varsayilan_sube_id: string | null } | null;
}

/** Kilitli personelin "bu telefonu tanımlat" talebi (cihaz yetkili yöneticinin onayına gider) */
export interface CihazTalebi {
  id: string;
  personel_id: string;
  cihaz_bilgisi: string | null;
  durum: "BEKLEMEDE" | "ONAYLANDI" | "REDDEDILDI" | "IPTAL";
  created_at: string;
  personeller?: { ad: string; soyad: string; sicil_no: string; varsayilan_sube_id: string | null } | null;
}

export interface ResmiTatil {
  id: string;
  tarih: string;
  ad: string;
}

/** Panel kullanıcısının rolü: GENEL her şeyi yönetir, SUBE yalnızca atandığı şubeleri */
export interface YoneticiBilgisi {
  rol: "GENEL" | "SUBE";
  ad: string | null;
  subeler: string[];
  /** Şube müdürünün açık yetkileri (genel yöneticide boş; o her şeye yetkilidir) */
  yetkiler: Yetki[];
  /** Kullanıcının bağlı olduğu firma (çok firmalı yapıdan önceki veritabanında yok) */
  firma: { id: string; ad: string; kod: string } | null;
  /** Firmaları yöneten sistem yöneticisi mi (/sistem sayfası) */
  sistem: boolean;
}

/** Şube müdürüne tek tek verilebilen yetkiler (veritabanındaki anahtarlarla aynı) */
export const YETKILER = [
  { anahtar: "plan", ad: "Vardiya planı", aciklama: "Plan hazırlama ve değiştirme", varsayilan: true },
  { anahtar: "izin", ad: "İzin yönetimi", aciklama: "Talepleri onaylama/reddetme, izin ve rapor girme", varsayilan: true },
  { anahtar: "mesai", ad: "Fazla mesai onayı", aciklama: "Personelin fazla mesai taleplerini onaylama/reddetme", varsayilan: true },
  { anahtar: "manuel", ad: "Manuel giriş/çıkış", aciklama: "Eksik çıkış ekleme, hareket düzeltme", varsayilan: true },
  { anahtar: "cihaz", ad: "Cihaz kilidi", aciklama: "Kayıtlı telefonu sıfırlama", varsayilan: true },
  { anahtar: "pin", ad: "PIN işlemleri", aciklama: "Personele PIN verme ve sıfırlama", varsayilan: false },
  { anahtar: "personel", ad: "Personel düzenleme", aciklama: "Kendi şubesine personel ekleme, pasife alma", varsayilan: false },
  { anahtar: "rapor", ad: "Rapor indirme", aciklama: "Excel/PDF dışa aktarma (T.C. kimlik içerir)", varsayilan: false },
] as const;

export type Yetki = (typeof YETKILER)[number]["anahtar"];

export type Sekme = "bakis" | "puantaj" | "talepler" | "mesai" | "genel" | "personel" | "vardiya";

export const PERSONEL_KOLONLARI =
  "id, sicil_no, tc_kimlik, ad, soyad, departman, varsayilan_sube_id, varsayilan_vardiya_id, rol, cihaz_id, aktif, created_at, pin_tanimli, ise_giris_tarihi, dogum_tarihi, devreden_izin_gun, devir_tarihi, subeler:varsayilan_sube_id (ad), vardiyalar:varsayilan_vardiya_id (*)";

/** Yıllık izin hesabı (veritabanındaki _yillik_izin_hesapla ile aynı alanlar) */
export interface IzinBakiyesi {
  tanimli: boolean;
  kidem_yil?: number;
  devreden?: number;
  hak_edilen?: number;
  kullanilan?: number;
  bekleyen?: number;
  kalan?: number;
  sonraki_hak_tarihi?: string | null;
  sonraki_hak_gun?: number | null;
}

/** 12.5 -> "12,5" */
export function gunYaz(gun: number | null | undefined): string {
  const n = Number(gun ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "").replace(".", ",");
}

// Supabase en fazla 1000 satır döndürür; hepsini sayfa sayfa çeker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tumunuGetir<T>(kur: (bas: number, son: number) => PromiseLike<any>): Promise<T[]> {
  const sonuc: T[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await kur(bas, bas + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    sonuc.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return sonuc;
}

export function tcGecerliMi(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split("").map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === d10 && d[10] === d11;
}

export function hataYaz(err: unknown): string {
  const metin =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : typeof err === "string"
      ? err
      : "Bilinmeyen bir hata oluştu";
  // Veritabanının yetki ve kilit hatalarını okunur hale getir
  const kilit = metin.match(/AY_KILITLI: (\d{4}-\d{2})/);
  if (kilit) return `${kilit[1]} ayı kapatılmış; bu aya ait kayıt değiştirilemez. Genel yönetici ayı açabilir.`;
  if (metin.includes("KORUNAN_ALAN")) return "PIN ve cihaz bilgisi yalnızca kendi düğmeleriyle değiştirilebilir.";
  if (metin.includes("CIHAZ_BASKASINDA")) return "Bu telefon başka bir personele kayıtlı; önce o personelin cihaz kilidini açın.";
  if (metin.includes("TALEP_SONUCLANMIS")) return "Bu talep zaten sonuçlanmış.";
  if (metin.includes("YETKISIZ") || /row-level security|permission denied/i.test(metin))
    return "Bu işlem için yetkiniz yok. Genel yöneticiden yetki isteyin.";
  return metin;
}

/** 11429744574 -> 114******74 (kişisel veriyi ekranda gizler) */
export function tcMaske(tc: string): string {
  return tc.length === 11 ? `${tc.slice(0, 3)}******${tc.slice(9)}` : tc;
}
