// Vardiya planı: hangi gün hangi vardiyanın geçerli olduğu ve plan uyarıları.
// Kural: bir gün için plan satırı varsa plan geçerlidir; yoksa personelin
// varsayılan vardiyası kullanılır ve Pazar hafta tatili sayılır.
import { haftaGunu, planAni } from "./tarih";

export interface PlanSatiri {
  id: string;
  personel_id: string;
  tarih: string;
  tur: "VARDIYA" | "TATIL";
  vardiya_id: string | null;
  sube_id: string | null;
}

export interface PlanVardiya {
  id: string;
  ad: string;
  baslangic_saat: string;
  bitis_saat: string;
  mola_dakika: number;
}

export interface GunPlani {
  kaynak: "plan" | "varsayilan";
  tatil: boolean;
  vardiyalar: PlanVardiya[];
}

// ---------------------------------------------------------------------
// Kurallar (İş Kanunu)
// ---------------------------------------------------------------------
/** İki iş günü arasında en az dinlenme süresi */
export const MIN_DINLENME_DK = 11 * 60;
/** Haftalık en fazla normal çalışma süresi */
export const HAFTALIK_SINIR_DK = 45 * 60;

const GUN_MS = 24 * 60 * 60 * 1000;

export function gunEkle(tarih: string, gun: number): string {
  const [y, m, d] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + gun)).toISOString().slice(0, 10);
}

/** [bas, son] arası tüm günler (ikisi dahil) */
export function gunAraligi(bas: string, son: string): string[] {
  const sonuc: string[] = [];
  for (let t = bas; t <= son; t = gunEkle(t, 1)) sonuc.push(t);
  return sonuc;
}

/** Tarihin bulunduğu haftanın pazartesisi */
export function haftaBasi(tarih: string): string {
  return gunEkle(tarih, -((haftaGunu(tarih) + 6) % 7));
}

/** "personel_id|tarih" anahtarıyla plan satırları */
export function planHaritasi(planlar: PlanSatiri[]): Map<string, PlanSatiri[]> {
  const harita = new Map<string, PlanSatiri[]>();
  for (const p of planlar) {
    const anahtar = `${p.personel_id}|${p.tarih}`;
    const liste = harita.get(anahtar);
    if (liste) liste.push(p);
    else harita.set(anahtar, [p]);
  }
  return harita;
}

/** Bir personelin bir gündeki geçerli planı */
export function gunPlani(
  satirlar: PlanSatiri[] | undefined,
  tarih: string,
  varsayilan: PlanVardiya | null,
  vardiyaBul: (id: string) => PlanVardiya | undefined
): GunPlani {
  if (satirlar && satirlar.length > 0) {
    const vardiyalar = satirlar
      .filter((s) => s.tur === "VARDIYA" && s.vardiya_id)
      .map((s) => vardiyaBul(s.vardiya_id as string))
      .filter((v): v is PlanVardiya => !!v)
      .sort((a, b) => a.baslangic_saat.localeCompare(b.baslangic_saat));
    return { kaynak: "plan", tatil: satirlar.some((s) => s.tur === "TATIL"), vardiyalar };
  }
  const pazar = haftaGunu(tarih) === 0;
  return { kaynak: "varsayilan", tatil: pazar, vardiyalar: pazar || !varsayilan ? [] : [varsayilan] };
}

/** Vardiyanın o günkü gerçek başlangıç ve bitişi (gece vardiyasında bitiş ertesi gün) */
export function vardiyaAni(tarih: string, v: PlanVardiya): { bas: number; son: number } {
  const bas = planAni(tarih, v.baslangic_saat).getTime();
  let son = planAni(tarih, v.bitis_saat).getTime();
  if (son <= bas) son += GUN_MS;
  return { bas, son };
}

/** Moladan sonra net çalışma süresi (dk) */
export function netSureDk(v: PlanVardiya): number {
  const { bas, son } = vardiyaAni("2026-01-05", v);
  return Math.max(0, Math.round((son - bas) / 60000) - (v.mola_dakika || 0));
}

// ---------------------------------------------------------------------
// Uyarılar (yalnızca plana girilmiş günler denetlenir)
// ---------------------------------------------------------------------
export interface PlanUyarisi {
  personel_id: string;
  tarih: string;
  tur: "cakisma" | "dinlenme" | "haftalik";
  mesaj: string;
}

function saatYaz(dk: number): string {
  const s = Math.floor(dk / 60);
  const d = dk % 60;
  return d ? `${s} sa ${d} dk` : `${s} sa`;
}

export function planUyarilari(
  planlar: PlanSatiri[],
  vardiyaBul: (id: string) => PlanVardiya | undefined
): PlanUyarisi[] {
  const uyarilar: PlanUyarisi[] = [];
  const kisiye = new Map<string, { tarih: string; v: PlanVardiya; bas: number; son: number }[]>();

  for (const p of planlar) {
    if (p.tur !== "VARDIYA" || !p.vardiya_id) continue;
    const v = vardiyaBul(p.vardiya_id);
    if (!v) continue;
    const an = vardiyaAni(p.tarih, v);
    const liste = kisiye.get(p.personel_id);
    const kayit = { tarih: p.tarih, v, ...an };
    if (liste) liste.push(kayit);
    else kisiye.set(p.personel_id, [kayit]);
  }

  for (const [personel_id, liste] of kisiye) {
    liste.sort((a, b) => a.bas - b.bas);

    for (let i = 1; i < liste.length; i++) {
      const once = liste[i - 1];
      const sonra = liste[i];
      if (sonra.bas < once.son) {
        uyarilar.push({
          personel_id,
          tarih: sonra.tarih,
          tur: "cakisma",
          mesaj: `${once.v.ad} ile ${sonra.v.ad} vardiyaları çakışıyor`,
        });
      } else if (sonra.tarih !== once.tarih) {
        // Aynı gündeki bölünmüş çalışma (sabah + akşam) arası dinlenme sayılmaz
        const ara = Math.round((sonra.bas - once.son) / 60000);
        if (ara < MIN_DINLENME_DK) {
          uyarilar.push({
            personel_id,
            tarih: sonra.tarih,
            tur: "dinlenme",
            mesaj: `Önceki vardiyadan sonra yalnızca ${saatYaz(ara)} dinlenme var (en az 11 sa)`,
          });
        }
      }
    }

    const haftalar = new Map<string, number>();
    for (const k of liste) {
      const hafta = haftaBasi(k.tarih);
      haftalar.set(hafta, (haftalar.get(hafta) ?? 0) + netSureDk(k.v));
    }
    for (const [hafta, dk] of haftalar) {
      if (dk > HAFTALIK_SINIR_DK) {
        uyarilar.push({
          personel_id,
          tarih: hafta,
          tur: "haftalik",
          mesaj: `${hafta} haftasında planlanan çalışma ${saatYaz(dk)} (45 sa üstü fazla mesaidir)`,
        });
      }
    }
  }
  return uyarilar;
}
