// İş Kanunu m.41: fazla çalışmanın toplamı yılda 270 saatten fazla olamaz.
// Yalnızca müdürün onayladığı fazla mesai talepleri sayılır.
import { supabase } from "./supabase";

export const YILLIK_SINIR_DK = 270 * 60;
/** Bu oranı geçenlere "sınıra yaklaşıyor" uyarısı */
export const YAKLASMA_ORANI = 0.85;

/** Yılın onaylı fazla mesaisi, kişi başı dakika (tablo yoksa ya da okunamazsa boş) */
export async function yillikMesaiGetir(yil: number): Promise<Map<string, number>> {
  const harita = new Map<string, number>();
  for (let bas = 0; bas < 50000; bas += 1000) {
    const { data, error } = await supabase
      .from("mesai_talepleri")
      .select("personel_id, sure_dk")
      .eq("durum", "ONAYLANDI")
      .gte("tarih", `${yil}-01-01`)
      .lte("tarih", `${yil}-12-31`)
      .order("id")
      .range(bas, bas + 999);
    if (error || !data) break;
    for (const r of data as { personel_id: string; sure_dk: number }[]) harita.set(r.personel_id, (harita.get(r.personel_id) ?? 0) + r.sure_dk);
    if (data.length < 1000) break;
  }
  return harita;
}

export function sinirDurumu(dk: number): "asti" | "yaklasti" | "normal" {
  return dk > YILLIK_SINIR_DK ? "asti" : dk >= YILLIK_SINIR_DK * YAKLASMA_ORANI ? "yaklasti" : "normal";
}
