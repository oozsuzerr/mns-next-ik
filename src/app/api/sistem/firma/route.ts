// Sistem yöneticisi yeni firma ve o firmanın ilk genel yöneticisini açar.
// Hesap ve firma yalnızca sunucuda duran service_role anahtarıyla açılır; anahtar tarayıcıya gönderilmez.
//
// İstek: POST, "Authorization: Bearer <sistem yöneticisinin oturum anahtarı>"
// Gövde: { firmaAd, kod, yoneticiAd, eposta, sifre, moduller: string[], personelLimit: number | null }
import { createClient } from "@supabase/supabase-js";
import { kullaniciIstemcisi } from "../../../../lib/sunucuBildirim";
import { supabaseUrl, temizle } from "../../../../lib/supabase";
import { TUM_MODULLER } from "../../../../lib/moduller";
import { firmaVeYoneticiAc } from "../../../../lib/firmaAc";

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

  // 3) Firma, paket ve ilk genel yönetici
  const sonuc = await firmaVeYoneticiAc(servis, { firmaAd, kod, yoneticiAd, eposta, sifre, moduller, personelLimit });
  if (!sonuc.ok) return yanit(sonuc.durum, { hata: sonuc.hata, ...(sonuc.detay ? { detay: sonuc.detay } : {}) });

  return yanit(200, { ok: true, firma: { id: sonuc.firmaId, ad: firmaAd, kod } });
}
