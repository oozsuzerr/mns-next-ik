// Sistem yöneticisi yeni firma ve o firmanın ilk genel yöneticisini açar.
// Hesap ve firma yalnızca sunucuda duran service_role anahtarıyla açılır; anahtar tarayıcıya gönderilmez.
//
// İstek: POST, "Authorization: Bearer <sistem yöneticisinin oturum anahtarı>"
// Gövde: { firmaAd, kod, yoneticiAd, eposta, sifre, moduller: string[], personelLimit: number | null }
import { createClient } from "@supabase/supabase-js";
import { kullaniciIstemcisi } from "../../../../lib/sunucuBildirim";
import { supabaseUrl, temizle } from "../../../../lib/supabase";
import { TUM_MODULLER } from "../../../../lib/moduller";

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOD = /^[a-z0-9-]{3,20}$/;

export async function POST(istek: Request) {
  // 1) İsteği yapan sistem yöneticisi mi? (sunucu ayarından önce: yetkisize bilgi verilmez)
  const token = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return yanit(401, { hata: "OTURUM_YOK" });
  const { data: sistem, error: yetkiHata } = await kullaniciIstemcisi(token).rpc("sistem_yoneticisi");
  if (yetkiHata || sistem !== true) return yanit(403, { hata: "YETKISIZ" });

  const servisAnahtari = temizle(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!servisAnahtari) return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });

  // 2) Girdileri doğrula
  let govde: { firmaAd?: unknown; kod?: unknown; yoneticiAd?: unknown; eposta?: unknown; sifre?: unknown; moduller?: unknown; personelLimit?: unknown };
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  const firmaAd = typeof govde.firmaAd === "string" ? govde.firmaAd.trim().slice(0, 100) : "";
  const kod = typeof govde.kod === "string" ? govde.kod.trim().toLowerCase() : "";
  const yoneticiAd = typeof govde.yoneticiAd === "string" ? govde.yoneticiAd.trim().slice(0, 100) : "";
  const eposta = typeof govde.eposta === "string" ? govde.eposta.trim().toLowerCase() : "";
  const sifre = typeof govde.sifre === "string" ? govde.sifre : "";

  if (firmaAd.length < 2) return yanit(400, { hata: "FIRMA_ADI_GECERSIZ" });
  if (!KOD.test(kod)) return yanit(400, { hata: "KOD_GECERSIZ" });
  if (!EPOSTA.test(eposta)) return yanit(400, { hata: "EPOSTA_GECERSIZ" });
  if (sifre.length < 8 || sifre.length > 72) return yanit(400, { hata: "SIFRE_GECERSIZ" });
  // Paket: seçilen İK modülleri ve aktif personel sınırı (boş = sınırsız)
  const moduller = Array.isArray(govde.moduller)
    ? [...new Set(govde.moduller.filter((m): m is string => typeof m === "string" && (TUM_MODULLER as string[]).includes(m)))]
    : [];
  const personelLimit = govde.personelLimit == null || govde.personelLimit === "" ? null : Number(govde.personelLimit);
  if (personelLimit !== null && (!Number.isInteger(personelLimit) || personelLimit < 1 || personelLimit > 100000)) {
    return yanit(400, { hata: "LIMIT_GECERSIZ" });
  }

  const servis = createClient(supabaseUrl, servisAnahtari, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ayniKod } = await servis.from("firmalar").select("id").eq("kod", kod).maybeSingle();
  if (ayniKod) return yanit(409, { hata: "KOD_KULLANILIYOR" });

  // 3) Firma (şirket ayarları satırıyla birlikte)
  const { data: firmaId, error: firmaHata } = await servis.rpc("sistem_firma_olustur", { p_ad: firmaAd, p_kod: kod });
  if (firmaHata || typeof firmaId !== "string") {
    return yanit(500, { hata: "FIRMA_ACILAMADI", detay: firmaHata?.message });
  }

  // Bir adım başarısız olursa yarım kalan firma silinir
  async function firmayiGeriAl() {
    await servis.from("sirket_ayarlari").delete().eq("firma_id", firmaId);
    await servis.from("firmalar").delete().eq("id", firmaId);
  }

  const { error: paketHata } = await servis.from("firmalar").update({ moduller, personel_limit: personelLimit }).eq("id", firmaId);
  if (paketHata) {
    await firmayiGeriAl();
    return yanit(500, { hata: "PAKET_KAYDEDILEMEDI", detay: paketHata.message });
  }

  // 4) İlk genel yönetici: her zaman yeni hesap (bir kullanıcı yalnızca tek firmaya bağlıdır)
  const { data: olusan, error: olusturmaHata } = await servis.auth.admin.createUser({
    email: eposta,
    password: sifre,
    email_confirm: true,
    user_metadata: yoneticiAd ? { ad: yoneticiAd } : undefined,
  });
  if (olusturmaHata || !olusan.user) {
    await firmayiGeriAl();
    const zatenVar =
      olusturmaHata?.code === "email_exists" || /already (been )?registered|already exists/i.test(olusturmaHata?.message ?? "");
    return yanit(zatenVar ? 409 : 500, { hata: zatenVar ? "EPOSTA_KULLANILIYOR" : "HESAP_ACILAMADI" });
  }

  const { error: yoneticiHata } = await servis
    .from("yoneticiler")
    .insert({ user_id: olusan.user.id, firma_id: firmaId, rol: "GENEL", ad: yoneticiAd || null });
  if (yoneticiHata) {
    await servis.auth.admin.deleteUser(olusan.user.id);
    await firmayiGeriAl();
    return yanit(500, { hata: "YONETICI_ATANAMADI", detay: yoneticiHata.message });
  }

  return yanit(200, { ok: true, firma: { id: firmaId, ad: firmaAd, kod } });
}
