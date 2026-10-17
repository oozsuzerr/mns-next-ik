// Personelin masraf fişini (fotoğraf/PDF) gizli depoya yükler.
// Personelin Supabase oturumu yoktur; mobil oturum anahtarı sunucuda doğrulanır ve dosya
// yalnızca o personelin klasörüne (<firma_id>/<personel_id>/...) yazılır. Dönen yol
// odeme_talep_olustur'a verilir; veritabanı yolun bu personele ait olduğunu ayrıca denetler.
//
// POST multipart/form-data: token, dosya
import { servisIstemcisi } from "../../../../lib/sunucuBildirim";

const KOVA = "masraf-fisleri";
const MAKS_BAYT = 5 * 1024 * 1024;
const TURLER: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

export async function POST(istek: Request) {
  let form: FormData;
  try {
    form = await istek.formData();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  const token = form.get("token");
  const dosya = form.get("dosya");
  if (typeof token !== "string" || !token || !(dosya instanceof File)) return yanit(400, { hata: "GOVDE_GECERSIZ" });
  const uzanti = TURLER[dosya.type];
  if (!uzanti) return yanit(400, { hata: "TUR_GECERSIZ" });
  if (dosya.size === 0 || dosya.size > MAKS_BAYT) return yanit(400, { hata: "BOYUT_GECERSIZ" });

  let servis;
  try {
    servis = servisIstemcisi();
  } catch {
    return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });
  }

  const { data: pid, error } = await servis.rpc("oturum_personel", { p_token: token });
  if (error || !pid) return yanit(401, { hata: "OTURUM_GECERSIZ" });
  const { data: p } = await servis.from("personeller").select("firma_id").eq("id", pid).maybeSingle();
  if (!p?.firma_id) return yanit(401, { hata: "OTURUM_GECERSIZ" });

  // Kötüye kullanıma karşı: bir personel saatte en çok 20 fiş yükleyebilir
  const { data: son } = await servis.storage.from(KOVA).list(`${p.firma_id}/${pid}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const saatOnce = Date.now() - 60 * 60 * 1000;
  if ((son ?? []).filter((d) => d.created_at && Date.parse(d.created_at) > saatOnce).length >= 20) {
    return yanit(429, { hata: "COK_FAZLA_YUKLEME" });
  }

  const yol = `${p.firma_id}/${pid}/${crypto.randomUUID()}.${uzanti}`;
  const { error: yHata } = await servis.storage.from(KOVA).upload(yol, dosya, { contentType: dosya.type, upsert: false });
  if (yHata) return yanit(500, { hata: "YUKLENEMEDI" });
  return yanit(200, { yol });
}
