// Personel mobil ana ekranındaki bilgi kartlarının hesapları (saatlik izin ve avans özetleri).
import { haftaGunu } from "./tarih";
import { gunEkle } from "./vardiyaPlani";

/** "09:00:00" - "11:30:00" arası dakika; geçersiz ya da ters aralık 0 sayılır */
function aralikDk(bas: string | null, bit: string | null): number {
  if (!bas || !bit) return 0;
  const [bs, bd] = bas.split(":").map(Number);
  const [es, ed] = bit.split(":").map(Number);
  return Math.max(0, es * 60 + ed - (bs * 60 + bd));
}

/** Ayın ilk günü ("2026-10-22" -> "2026-10-01") */
function ayBasi(tarih: string): string {
  return `${tarih.slice(0, 7)}-01`;
}

export interface SaatlikIzinOzeti {
  gecenAy: number;
  buAy: number;
  buHafta: number;
}

/** Onaylanmış saatlik izinlerin dakika toplamları (hafta pazartesi başlar) */
export function saatlikIzinOzeti(
  talepler: readonly { izin_turu: string; baslangic_tarihi: string; baslangic_saat: string | null; bitis_saat: string | null; durum: string | null }[],
  bugun: string
): SaatlikIzinOzeti {
  const buAyBasi = ayBasi(bugun);
  const gecenAyBasi = ayBasi(gunEkle(buAyBasi, -1));
  const haftaBasi = gunEkle(bugun, -((haftaGunu(bugun) + 6) % 7));
  const ozet: SaatlikIzinOzeti = { gecenAy: 0, buAy: 0, buHafta: 0 };
  for (const t of talepler) {
    if (t.izin_turu !== "Saatlik İzin" || t.durum !== "ONAYLANDI") continue;
    const dk = aralikDk(t.baslangic_saat, t.bitis_saat);
    const tarih = t.baslangic_tarihi;
    if (tarih >= buAyBasi) ozet.buAy += dk;
    else if (tarih >= gecenAyBasi) ozet.gecenAy += dk;
    if (tarih >= haftaBasi) ozet.buHafta += dk;
  }
  return ozet;
}

export interface AvansOzeti {
  gecenAy: number;
  buAy: number;
  bekleyen: number;
}

/** Reddedilmemiş avansların ay toplamları ve onay bekleyen avans sayısı */
export function avansOzeti(
  odemeler: readonly { tur: string; tutar: number; tarih: string; durum: string }[],
  bugun: string
): AvansOzeti {
  const buAyBasi = ayBasi(bugun);
  const gecenAyBasi = ayBasi(gunEkle(buAyBasi, -1));
  const ozet: AvansOzeti = { gecenAy: 0, buAy: 0, bekleyen: 0 };
  for (const o of odemeler) {
    if (o.tur !== "Avans" || o.durum === "REDDEDILDI") continue;
    if (o.durum === "BEKLEMEDE") ozet.bekleyen++;
    const tutar = Number(o.tutar) || 0;
    if (o.tarih >= buAyBasi) ozet.buAy += tutar;
    else if (o.tarih >= gecenAyBasi) ozet.gecenAy += tutar;
  }
  return ozet;
}
