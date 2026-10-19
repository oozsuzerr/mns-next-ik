// Yeni firma ve ilk genel yöneticisini açar. Sistem yöneticisinin firma ekranı ve ücretsiz deneme
// kaydı bunu kullanır. Yalnızca sunucuda, service_role istemcisiyle çağrılır.
// Bir adım başarısız olursa o ana kadar açılanlar geri alınır.
import type { SupabaseClient } from "@supabase/supabase-js";

export type FirmaAcGirdi = {
  firmaAd: string;
  kod: string;
  yoneticiAd: string;
  eposta: string;
  sifre: string;
  moduller: string[];
  personelLimit: number | null;
  /** Deneme firmasının son günü (YYYY-AA-GG); kalıcı firmada boş */
  denemeBitis?: string | null;
};

export type FirmaAcSonuc =
  | { ok: true; firmaId: string }
  | { ok: false; durum: number; hata: string; detay?: string };

export async function firmaVeYoneticiAc(servis: SupabaseClient, g: FirmaAcGirdi): Promise<FirmaAcSonuc> {
  const { data: ayniKod } = await servis.from("firmalar").select("id").eq("kod", g.kod).maybeSingle();
  if (ayniKod) return { ok: false, durum: 409, hata: "KOD_KULLANILIYOR" };

  // 1) Firma (şirket ayarları satırıyla birlikte)
  const { data: firmaId, error: firmaHata } = await servis.rpc("sistem_firma_olustur", { p_ad: g.firmaAd, p_kod: g.kod });
  if (firmaHata || typeof firmaId !== "string") {
    return { ok: false, durum: 500, hata: "FIRMA_ACILAMADI", detay: firmaHata?.message };
  }

  async function firmayiGeriAl() {
    await servis.from("sirket_ayarlari").delete().eq("firma_id", firmaId);
    await servis.from("firmalar").delete().eq("id", firmaId);
  }

  // 2) Paket: açık modüller, personel sınırı, deneme bitişi
  const paket: Record<string, unknown> = { moduller: g.moduller, personel_limit: g.personelLimit };
  if (g.denemeBitis) paket.deneme_bitis = g.denemeBitis;
  const { error: paketHata } = await servis.from("firmalar").update(paket).eq("id", firmaId);
  if (paketHata) {
    await firmayiGeriAl();
    return { ok: false, durum: 500, hata: "PAKET_KAYDEDILEMEDI", detay: paketHata.message };
  }

  // 3) İlk genel yönetici: her zaman yeni hesap (bir kullanıcı yalnızca tek firmaya bağlıdır)
  const { data: olusan, error: olusturmaHata } = await servis.auth.admin.createUser({
    email: g.eposta,
    password: g.sifre,
    email_confirm: true,
    user_metadata: g.yoneticiAd ? { ad: g.yoneticiAd } : undefined,
  });
  if (olusturmaHata || !olusan.user) {
    await firmayiGeriAl();
    const zatenVar =
      olusturmaHata?.code === "email_exists" || /already (been )?registered|already exists/i.test(olusturmaHata?.message ?? "");
    return { ok: false, durum: zatenVar ? 409 : 500, hata: zatenVar ? "EPOSTA_KULLANILIYOR" : "HESAP_ACILAMADI" };
  }

  const { error: yoneticiHata } = await servis
    .from("yoneticiler")
    .insert({ user_id: olusan.user.id, firma_id: firmaId, rol: "GENEL", ad: g.yoneticiAd || null });
  if (yoneticiHata) {
    await servis.auth.admin.deleteUser(olusan.user.id);
    await firmayiGeriAl();
    return { ok: false, durum: 500, hata: "YONETICI_ATANAMADI", detay: yoneticiHata.message };
  }

  return { ok: true, firmaId };
}
