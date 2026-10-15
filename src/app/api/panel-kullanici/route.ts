// Panel kullanıcısı (genel yönetici / şube müdürü) hesabı açar.
// Supabase'de herkese açık kayıt kapalı olduğu için hesap, yalnızca sunucuda duran
// service_role anahtarıyla açılır. Anahtar tarayıcıya hiç gönderilmez.
//
// İstek: POST, "Authorization: Bearer <yöneticinin oturum anahtarı>"
// Gövde: { eposta, sifre, ad, rol: "GENEL" | "SUBE", subeler: string[], yetkiler: string[] }
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl, temizle } from "../../../lib/supabase";

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(istek: Request) {
  // 1) İsteği yapan kişi giriş yapmış bir genel yönetici mi? (sunucu ayarından önce: yetkisize bilgi verilmez)
  const token = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return yanit(401, { hata: "OTURUM_YOK" });

  // Yöneticinin kendi yetkisiyle çalışan istemci: veritabanı kuralları ona göre işler
  const yonetici: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: genel, error: yetkiHata } = await yonetici.rpc("is_admin");
  if (yetkiHata || genel !== true) return yanit(403, { hata: "YETKISIZ" });

  const servisAnahtari = temizle(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!servisAnahtari) return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });

  // 2) Girdileri doğrula
  let govde: { eposta?: unknown; sifre?: unknown; ad?: unknown; rol?: unknown; subeler?: unknown; yetkiler?: unknown };
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  const eposta = typeof govde.eposta === "string" ? govde.eposta.trim().toLowerCase() : "";
  const sifre = typeof govde.sifre === "string" ? govde.sifre : "";
  const ad = typeof govde.ad === "string" ? govde.ad.trim().slice(0, 100) : "";
  const rol = govde.rol === "GENEL" || govde.rol === "SUBE" ? govde.rol : null;
  const subeler = Array.isArray(govde.subeler) ? govde.subeler.filter((s): s is string => typeof s === "string") : [];
  // Geçerlilik veritabanında da denetlenir (yonetici_kaydet)
  const yetkiler = Array.isArray(govde.yetkiler) ? govde.yetkiler.filter((s): s is string => typeof s === "string") : [];

  if (!EPOSTA.test(eposta)) return yanit(400, { hata: "EPOSTA_GECERSIZ" });
  if (sifre.length < 8 || sifre.length > 72) return yanit(400, { hata: "SIFRE_GECERSIZ" });
  if (!rol) return yanit(400, { hata: "ROL_GECERSIZ" });
  if (rol === "SUBE" && subeler.length === 0) return yanit(400, { hata: "SUBE_SECILMELI" });

  // 3) Hesabı aç (doğrulanmış olarak; müdür hemen giriş yapabilir)
  const servis = createClient(supabaseUrl, servisAnahtari, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let yeniId: string | null = null;
  const { data: olusan, error: olusturmaHata } = await servis.auth.admin.createUser({
    email: eposta,
    password: sifre,
    email_confirm: true,
    user_metadata: ad ? { ad } : undefined,
  });
  if (olusturmaHata) {
    // Hesap zaten varsa yalnızca panel yetkisi verilir; şifresine dokunulmaz
    const zatenVar = olusturmaHata.code === "email_exists" || /already (been )?registered|already exists/i.test(olusturmaHata.message);
    if (!zatenVar) return yanit(500, { hata: "HESAP_ACILAMADI", detay: olusturmaHata.message });
  } else {
    yeniId = olusan.user?.id ?? null;
  }

  // 4) Rol ve şubeleri yöneticinin kendi yetkisiyle kaydet (veritabanı da genel yönetici kontrolü yapar)
  const { error: kayitHata } = await yonetici.rpc("yonetici_kaydet", {
    p_eposta: eposta,
    p_ad: ad,
    p_rol: rol,
    p_subeler: rol === "SUBE" ? subeler : [],
    p_yetkiler: rol === "SUBE" ? yetkiler : [],
  });
  if (kayitHata) {
    // Yetkilendirme başarısızsa az önce açılan hesabı geri al; yarım kalmış hesap bırakma
    if (yeniId) await servis.auth.admin.deleteUser(yeniId);
    return yanit(400, { hata: kayitHata.message });
  }

  return yanit(200, { ok: true, yeniHesap: yeniId !== null });
}
