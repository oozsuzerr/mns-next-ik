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
  aciklama: string | null;
  durum?: string;
  personeller?: { ad: string; soyad: string; sicil_no: string } | null;
}

export interface ResmiTatil {
  id: string;
  tarih: string;
  ad: string;
}

export type Sekme = "bakis" | "puantaj" | "talepler" | "genel" | "personel" | "vardiya";

export const PERSONEL_KOLONLARI =
  "id, sicil_no, tc_kimlik, ad, soyad, departman, varsayilan_sube_id, varsayilan_vardiya_id, rol, cihaz_id, aktif, created_at, pin_tanimli, subeler:varsayilan_sube_id (ad), vardiyalar:varsayilan_vardiya_id (*)";

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
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Bilinmeyen bir hata oluştu";
}

/** 11429744574 -> 114******74 (kişisel veriyi ekranda gizler) */
export function tcMaske(tc: string): string {
  return tc.length === 11 ? `${tc.slice(0, 3)}******${tc.slice(9)}` : tc;
}
