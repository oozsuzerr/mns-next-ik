// Türkiye geneli (ortak, firma_id boş) resmi tatil listesini yalnızca sistem yöneticisi yönetir.
// Veritabanı kuralları panelden ortak listeye yazmayı kapatır; bu yol service_role ile yazar.
//
// İstek: POST, "Authorization: Bearer <sistem yöneticisinin oturum anahtarı>"
// Gövde: { islem: "ekle", tatiller: [{ tarih, ad, yarim_gun }] }  ya da  { islem: "sil", id }
import { createClient } from "@supabase/supabase-js";
import { kullaniciIstemcisi } from "../../../../lib/sunucuBildirim";
import { supabaseUrl, temizle } from "../../../../lib/supabase";

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

const TARIH = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(istek: Request) {
  const token = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return yanit(401, { hata: "OTURUM_YOK" });
  const { data: sistem, error: yetkiHata } = await kullaniciIstemcisi(token).rpc("sistem_yoneticisi");
  if (yetkiHata || sistem !== true) return yanit(403, { hata: "YETKISIZ" });

  const servisAnahtari = temizle(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!servisAnahtari) return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });
  const servis = createClient(supabaseUrl, servisAnahtari, { auth: { persistSession: false, autoRefreshToken: false } });

  let govde: { islem?: unknown; tatiller?: unknown; id?: unknown };
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }

  if (govde.islem === "sil") {
    const id = typeof govde.id === "string" ? govde.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return yanit(400, { hata: "GOVDE_GECERSIZ" });
    // Yalnızca ortak kayıt silinir; firmaya özel tatil firmanındır
    const { error } = await servis.from("resmi_tatiller").delete().eq("id", id).is("firma_id", null);
    if (error) return yanit(500, { hata: error.message });
    return yanit(200, { ok: true });
  }

  if (govde.islem === "ekle") {
    const gelen = (Array.isArray(govde.tatiller) ? govde.tatiller : [])
      .map((t) => t as { tarih?: unknown; ad?: unknown; yarim_gun?: unknown })
      .filter((t) => typeof t.tarih === "string" && TARIH.test(t.tarih) && typeof t.ad === "string" && t.ad.trim().length >= 2)
      .slice(0, 100)
      .map((t) => ({ tarih: t.tarih as string, ad: (t.ad as string).trim().slice(0, 120), yarim_gun: t.yarim_gun === true }));
    if (gelen.length === 0) return yanit(400, { hata: "TATIL_YOK" });

    // Aynı tarihte ortak kayıt varsa atlanır (tarih başına tek ortak kayıt)
    const { data: mevcut, error: okumaHata } = await servis
      .from("resmi_tatiller")
      .select("tarih")
      .is("firma_id", null)
      .in("tarih", gelen.map((t) => t.tarih));
    if (okumaHata) return yanit(500, { hata: okumaHata.message });
    const var_ = new Set((mevcut ?? []).map((t) => t.tarih as string));
    const eklenecek = gelen.filter((t, i) => !var_.has(t.tarih) && gelen.findIndex((x) => x.tarih === t.tarih) === i);
    if (eklenecek.length > 0) {
      const { error } = await servis.from("resmi_tatiller").insert(eklenecek);
      if (error) return yanit(500, { hata: error.message });
    }
    return yanit(200, { ok: true, eklenen: eklenecek.length, atlanan: gelen.length - eklenecek.length });
  }

  return yanit(400, { hata: "ISLEM_GECERSIZ" });
}
