// Ücretsiz deneme 2. adım: e-postadaki kod doğrulanınca firma ve genel yönetici hesabı açılır.
// Deneme firması: tüm modüller açık, en fazla DENEME_PERSONEL aktif personel, DENEME_GUN gün.
import { randomBytes } from "node:crypto";
import { servisIstemcisi } from "../../../../lib/sunucuBildirim";
import { temizle } from "../../../../lib/supabase";
import { epostaAyarli, epostaGonder, htmlKacis } from "../../../../lib/eposta";
import { TUM_MODULLER } from "../../../../lib/moduller";
import { firmaVeYoneticiAc } from "../../../../lib/firmaAc";
import { DENEME_PERSONEL, KOD_HAK, denemeBitisi, firmaKoduUret } from "../../../../lib/deneme";
import { kodEsit } from "../../../../lib/denemeSunucu";

const yanit = (durum: number, govde: Record<string, unknown>) => Response.json(govde, { status: durum });

type Talep = {
  id: string;
  eposta: string;
  firma_ad: string;
  ad: string;
  soyad: string;
  telefon: string;
  personel_sayisi: string | null;
  ticari_ileti: boolean;
  kod_hash: string;
  kod_son: string;
  hatali_deneme: number;
  durum: string;
};

export async function POST(istek: Request) {
  let govde: { id?: unknown; kod?: unknown; sifre?: unknown };
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  const id = typeof govde.id === "string" && /^[0-9a-f-]{36}$/i.test(govde.id) ? govde.id : "";
  const kod = typeof govde.kod === "string" ? govde.kod.replace(/\D/g, "") : "";
  const sifre = typeof govde.sifre === "string" ? govde.sifre : "";
  if (!id) return yanit(400, { hata: "BASVURU_YOK" });
  if (kod.length !== 6) return yanit(400, { hata: "KOD_HATALI" });
  if (sifre.length < 8 || sifre.length > 72) return yanit(400, { hata: "SIFRE_GECERSIZ" });

  const servis = servisIstemcisi();
  const { data, error } = await servis.from("deneme_talepleri").select("*").eq("id", id).maybeSingle();
  if (error) return yanit(500, { hata: "KAYIT_OKUNAMADI" });
  const t = data as Talep | null;
  if (!t || t.durum !== "BEKLIYOR") return yanit(404, { hata: "BASVURU_YOK" });
  if (new Date(t.kod_son).getTime() < Date.now() || t.hatali_deneme >= KOD_HAK) return yanit(410, { hata: "KOD_SURESI_DOLDU" });

  if (!kodEsit(t.id, kod, t.kod_hash)) {
    const hatali = t.hatali_deneme + 1;
    await servis.from("deneme_talepleri").update({ hatali_deneme: hatali }).eq("id", t.id);
    return yanit(400, { hata: hatali >= KOD_HAK ? "KOD_SURESI_DOLDU" : "KOD_HATALI", kalan: Math.max(0, KOD_HAK - hatali) });
  }

  // Aynı kod iki kez kullanılmasın: önce başvuruyu kilitle (yalnızca bekleyen kayıt güncellenir)
  const { data: kilit } = await servis.from("deneme_talepleri").update({ durum: "ACILDI" }).eq("id", t.id).eq("durum", "BEKLIYOR").select("id");
  if (!kilit?.length) return yanit(404, { hata: "BASVURU_YOK" });
  const geriAc = () => servis.from("deneme_talepleri").update({ durum: "BEKLIYOR" }).eq("id", t.id);

  // Firma kodu benzersiz olana kadar yeni rastgele ek denenir
  let sonuc: Awaited<ReturnType<typeof firmaVeYoneticiAc>> | null = null;
  let firmaKod = "";
  const denemeBitis = denemeBitisi();
  for (let i = 0; i < 4; i++) {
    firmaKod = firmaKoduUret(t.firma_ad, randomBytes(4).toString("hex"));
    sonuc = await firmaVeYoneticiAc(servis, {
      firmaAd: t.firma_ad,
      kod: firmaKod,
      yoneticiAd: `${t.ad} ${t.soyad}`,
      eposta: t.eposta,
      sifre,
      moduller: [...TUM_MODULLER],
      personelLimit: DENEME_PERSONEL,
      denemeBitis,
    });
    if (sonuc.ok || sonuc.hata !== "KOD_KULLANILIYOR") break;
  }
  if (!sonuc || !sonuc.ok) {
    await geriAc();
    const hata = sonuc && !sonuc.ok ? sonuc.hata : "FIRMA_ACILAMADI";
    return yanit(sonuc && !sonuc.ok ? sonuc.durum : 500, { hata });
  }

  // Kod artık işe yaramasın; başvuru açılan firmaya bağlansın
  await servis.from("deneme_talepleri").update({ firma_id: sonuc.firmaId, kod_hash: "" }).eq("id", t.id);

  // Sistem yöneticisine haber (DEMO_ALICI tanımlıysa)
  const alici = temizle(process.env.DEMO_ALICI);
  if (alici && epostaAyarli()) {
    const satirlar: [string, string][] = [
      ["Firma", t.firma_ad],
      ["Firma kodu", firmaKod],
      ["Yetkili", `${t.ad} ${t.soyad}`],
      ["Telefon", t.telefon],
      ["E-posta", t.eposta],
      ["Personel sayısı", t.personel_sayisi ?? "-"],
      ["Ticari ileti onayı", t.ticari_ileti ? "Evet" : "Hayır"],
      ["Deneme bitişi", denemeBitis],
    ];
    await epostaGonder(
      alici,
      `Yeni deneme hesabı: ${t.firma_ad}`,
      `<h2>Yeni deneme hesabı açıldı</h2><table cellpadding="6">${satirlar
        .map(([k, v]) => `<tr><td><b>${k}</b></td><td>${htmlKacis(v)}</td></tr>`)
        .join("")}</table>`,
    ).catch(() => false);
  }

  return yanit(200, { ok: true, eposta: t.eposta, firmaKod, denemeBitis });
}
