// Vardiyaya göre "kişi hâlâ mesaide mi, yoksa çıkış basmayı mı unuttu?" kararı.
// Panel (bugün şeridi, puantaj, eksik çıkış listesi) ve mobil uygulama aynı kuralı kullanır.
import { planAni, yerelTarih } from "./tarih";

export interface MesaiVardiya {
  baslangic_saat: string;
  bitis_saat: string;
}

export interface MesaiHareket {
  islem_turu: string;
  created_at: string;
}

// ---------------------------------------------------------------------
// Kurallar (gerekirse buradan değiştirin)
// ---------------------------------------------------------------------
/** Bir giriş ile çıkış arasında olabilecek en uzun süre; vardiyası olmayan personelde mesai sınırı */
export const MAKS_VARDIYA_MS = 18 * 60 * 60 * 1000;
/** Vardiya bitişinden sonra bu süre boyunca kişi hâlâ mesaide sayılır (fazla mesai payı) */
export const CIKIS_TOLERANS_MS = 6 * 60 * 60 * 1000;

function gunEkle(tarih: string, gun: number): string {
  const [y, m, d] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + gun)).toISOString().slice(0, 10);
}

/**
 * Girişin ait olduğu vardiyanın planlanan bitişi.
 * Girişe en yakın vardiya başlangıcı esas alınır: 00:00 vardiyası için 23:45'te
 * giriş yapan kişi ertesi günün vardiyasına sayılır. Bitiş saati başlangıçtan
 * önceyse (gece vardiyası) bitiş ertesi güne düşer.
 */
export function planlananBitis(giris: Date, vardiya: MesaiVardiya): Date {
  const gun = yerelTarih(giris);
  let secilen = { tarih: gun, bas: planAni(gun, vardiya.baslangic_saat), fark: Infinity };
  for (const n of [-1, 0, 1]) {
    const tarih = gunEkle(gun, n);
    const bas = planAni(tarih, vardiya.baslangic_saat);
    const fark = Math.abs(bas.getTime() - giris.getTime());
    if (fark < secilen.fark) secilen = { tarih, bas, fark };
  }
  let bitis = planAni(secilen.tarih, vardiya.bitis_saat);
  if (bitis.getTime() <= secilen.bas.getTime()) bitis = planAni(gunEkle(secilen.tarih, 1), vardiya.bitis_saat);
  return bitis;
}

/** Çıkış basılmadıysa kişinin en geç ne zamana kadar mesaide sayılacağı (ms) */
export function mesaiSonSiniri(giris: Date, vardiya: MesaiVardiya | null | undefined): number {
  const enGec = giris.getTime() + MAKS_VARDIYA_MS;
  if (!vardiya) return enGec;
  return Math.min(planlananBitis(giris, vardiya).getTime() + CIKIS_TOLERANS_MS, enGec);
}

/** Son hareket giriş ise ve süresi dolmadıysa o girişin zamanı, değilse null */
export function suankiGiris(
  hareketler: MesaiHareket[],
  vardiya: MesaiVardiya | null | undefined,
  simdi: number
): Date | null {
  let son: MesaiHareket | null = null;
  for (const h of hareketler) {
    if (!son || new Date(h.created_at).getTime() > new Date(son.created_at).getTime()) son = h;
  }
  if (!son || son.islem_turu !== "İşe Giriş") return null;
  const giris = new Date(son.created_at);
  return simdi < mesaiSonSiniri(giris, vardiya) ? giris : null;
}

/**
 * Çıkışı yapılmamış girişler (eskiden yeniye).
 * Eşleştirme puantajla aynıdır: bir girişten sonra 18 saat içinde gelen ilk çıkış onu kapatır.
 * Hâlâ süresi dolmamış son giriş (kişi mesaide) listeye girmez.
 */
export function cikisiEksikGirisler<T extends MesaiHareket>(
  hareketler: T[],
  vardiya: MesaiVardiya | null | undefined,
  simdi: number
): T[] {
  const sirali = [...hareketler].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const sonuc: T[] = [];
  let acik: T | null = null;

  for (const h of sirali) {
    if (h.islem_turu === "İşe Giriş") {
      if (acik) sonuc.push(acik);
      acik = h;
    } else if (h.islem_turu === "İşe Çıkış" && acik) {
      const fark = new Date(h.created_at).getTime() - new Date(acik.created_at).getTime();
      if (fark > MAKS_VARDIYA_MS) sonuc.push(acik);
      acik = null;
    }
  }

  if (acik && simdi >= mesaiSonSiniri(new Date(acik.created_at), vardiya)) sonuc.push(acik);
  return sonuc;
}
