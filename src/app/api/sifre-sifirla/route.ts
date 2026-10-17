// Bir panel kullanıcısına yeni şifre verir (e-posta gerektirmez).
// İzin: sistem yöneticisi her panel kullanıcısına; genel yönetici yalnızca KENDİ FİRMASINDAKİ kullanıcılara.
// Kimse bu yolla kendi şifresini değiştiremez (onun için oturumdaki "Şifremi değiştir" var).
//
// İstek: POST, "Authorization: Bearer <oturum anahtarı>"
// Gövde: { eposta, sifre }
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { kullaniciIstemcisi } from "../../../lib/sunucuBildirim";
import { supabaseUrl, temizle } from "../../../lib/supabase";

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

/** E-postadan hesap (Supabase admin API'sinde e-postayla doğrudan arama yok; sayfa sayfa taranır) */
async function hesapBul(servis: SupabaseClient, eposta: string): Promise<User | null> {
  for (let sayfa = 1; sayfa <= 50; sayfa++) {
    const { data, error } = await servis.auth.admin.listUsers({ page: sayfa, perPage: 200 });
    if (error) throw error;
    const bulunan = data.users.find((u) => u.email?.toLowerCase() === eposta);
    if (bulunan) return bulunan;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function POST(istek: Request) {
  const token = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return yanit(401, { hata: "OTURUM_YOK" });
  const kullanici = kullaniciIstemcisi(token);

  // İsteği yapan kim? (yetkisize ayrıntı verilmez)
  const [{ data: ben }, { data: sistem }, { data: bilgi }] = await Promise.all([
    kullanici.auth.getUser(token),
    kullanici.rpc("sistem_yoneticisi"),
    kullanici.rpc("yonetici_bilgisi"),
  ]);
  const istekYapan = ben.user;
  const sistemYoneticisi = sistem === true;
  const genelFirmasi = bilgi && (bilgi as { rol?: string }).rol === "GENEL" ? ((bilgi as { firma?: { id: string } }).firma?.id ?? null) : null;
  if (!istekYapan || (!sistemYoneticisi && !genelFirmasi)) return yanit(403, { hata: "YETKISIZ" });

  let govde: { eposta?: unknown; sifre?: unknown };
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  const eposta = typeof govde.eposta === "string" ? govde.eposta.trim().toLowerCase() : "";
  const sifre = typeof govde.sifre === "string" ? govde.sifre : "";
  if (!eposta) return yanit(400, { hata: "KULLANICI_YOK" });
  if (sifre.length < 8 || sifre.length > 72) return yanit(400, { hata: "SIFRE_GECERSIZ" });

  const servisAnahtari = temizle(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!servisAnahtari) return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });
  const servis = createClient(supabaseUrl, servisAnahtari, { auth: { persistSession: false, autoRefreshToken: false } });

  const hedef = await hesapBul(servis, eposta);
  if (!hedef) return yanit(404, { hata: "KULLANICI_YOK" });
  if (hedef.id === istekYapan.id) return yanit(400, { hata: "KENDINIZ" });

  // Hedef bir panel kullanıcısı olmalı; genel yönetici için aynı firmadan olmalı
  const { data: hedefYonetici } = await servis.from("yoneticiler").select("firma_id").eq("user_id", hedef.id).maybeSingle();
  if (!hedefYonetici) return yanit(404, { hata: "KULLANICI_YOK" });
  if (!sistemYoneticisi && hedefYonetici.firma_id !== genelFirmasi) return yanit(403, { hata: "YETKISIZ" });

  const { error } = await servis.auth.admin.updateUserById(hedef.id, { password: sifre });
  if (error) return yanit(400, { hata: error.message });
  return yanit(200, { ok: true });
}
