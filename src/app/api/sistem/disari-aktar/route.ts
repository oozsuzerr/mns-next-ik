// Sistem yöneticisi: bir firmanın verisini tablo tablo, sayfa sayfa okur (yedek / firmaya imaj vermek için).
// Yalnızca sistem yöneticisi çağırabilir; firmaların panelinde bu özellik yoktur.
//
// İstek: POST, "Authorization: Bearer <sistem yöneticisinin oturum anahtarı>"
// Gövde: { firmaId, tablo, bas }  →  { satirlar, devam }
import { createClient } from "@supabase/supabase-js";
import { kullaniciIstemcisi } from "../../../../lib/sunucuBildirim";
import { supabaseUrl, temizle } from "../../../../lib/supabase";
import { DISA_AKTAR_TABLOLARI, GIZLI_SUTUNLAR, SAYFA_BOYU } from "../../../../lib/firmaDisaAktar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

export async function POST(istek: Request) {
  const token = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return yanit(401, { hata: "OTURUM_YOK" });
  const { data: sistem, error: yetkiHata } = await kullaniciIstemcisi(token).rpc("sistem_yoneticisi");
  if (yetkiHata || sistem !== true) return yanit(403, { hata: "YETKISIZ" });

  const servisAnahtari = temizle(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!servisAnahtari) return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });

  let govde: { firmaId?: unknown; tablo?: unknown; bas?: unknown };
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  const firmaId = typeof govde.firmaId === "string" && UUID.test(govde.firmaId) ? govde.firmaId : null;
  const tablo = typeof govde.tablo === "string" && (DISA_AKTAR_TABLOLARI as readonly string[]).includes(govde.tablo) ? govde.tablo : null;
  const bas = Number.isInteger(govde.bas) && (govde.bas as number) >= 0 ? (govde.bas as number) : 0;
  if (!firmaId) return yanit(400, { hata: "FIRMA_GECERSIZ" });
  if (!tablo) return yanit(400, { hata: "TABLO_GECERSIZ" });

  const servis = createClient(supabaseUrl, servisAnahtari, { auth: { persistSession: false, autoRefreshToken: false } });
  // Sıralı okuma (sayfalar kaymasın): id sütunu yoksa sırasız okunur
  let sonuc = await servis.from(tablo).select("*").eq("firma_id", firmaId).order("id").range(bas, bas + SAYFA_BOYU - 1);
  if (sonuc.error && /column .*id.* does not exist|id/i.test(sonuc.error.message)) {
    sonuc = await servis.from(tablo).select("*").eq("firma_id", firmaId).range(bas, bas + SAYFA_BOYU - 1);
  }
  if (sonuc.error) return yanit(200, { satirlar: [], devam: false, hata: sonuc.error.message });
  const gizli = GIZLI_SUTUNLAR[tablo] ?? [];
  const satirlar = ((sonuc.data ?? []) as Record<string, unknown>[]).map((r) => {
    if (!gizli.length) return r;
    const kopya = { ...r };
    for (const s of gizli) delete kopya[s];
    return kopya;
  });
  return yanit(200, { satirlar, devam: satirlar.length === SAYFA_BOYU });
}
