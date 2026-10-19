// Ücretsiz deneme 1. adım: başvuruyu kaydeder ve e-postaya 6 haneli doğrulama kodu gönderir.
// Hesap bu adımda açılmaz; kod doğrulanınca /api/deneme/dogrula açar.
// Kötüye kullanıma karşı: aynı IP'den saatte 5, aynı e-postaya saatte 3 başvuru; bot tuzağı alanı.
import { randomInt } from "node:crypto";
import { servisIstemcisi } from "../../../../lib/sunucuBildirim";
import { epostaAyarli, epostaGonder, htmlKacis } from "../../../../lib/eposta";
import { basvuruDogrula, KOD_GECERLILIK_DK } from "../../../../lib/deneme";
import { istemciIp, kodHash } from "../../../../lib/denemeSunucu";

const yanit = (durum: number, govde: Record<string, unknown>) => Response.json(govde, { status: durum });

export async function POST(istek: Request) {
  let govde: Record<string, unknown>;
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }
  // Bot tuzağı doluysa sessizce başarılı görün
  if (typeof govde.web === "string" && govde.web.trim()) return yanit(200, { ok: true, id: crypto.randomUUID() });

  const d = basvuruDogrula(govde);
  if ("hata" in d) return yanit(400, { hata: d.hata });
  const b = d.basvuru;

  const gelistirme = process.env.NODE_ENV === "development";
  if (!epostaAyarli() && !gelistirme) return yanit(503, { hata: "EPOSTA_AYARSIZ" });

  const servis = servisIstemcisi();
  const ip = istemciIp(istek);
  const saatOnce = new Date(Date.now() - 3600_000).toISOString();
  const [ipSay, epostaSay] = await Promise.all([
    servis.from("deneme_talepleri").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", saatOnce),
    servis.from("deneme_talepleri").select("id", { count: "exact", head: true }).eq("eposta", b.eposta).gte("created_at", saatOnce),
  ]);
  if (ipSay.error || epostaSay.error) return yanit(500, { hata: "KAYIT_OKUNAMADI" });
  if ((ipSay.count ?? 0) >= 5 || (epostaSay.count ?? 0) >= 3) return yanit(429, { hata: "COK_FAZLA_DENEME" });

  const id = crypto.randomUUID();
  const kod = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await servis.from("deneme_talepleri").insert({
    id,
    eposta: b.eposta,
    firma_ad: b.firmaAd,
    personel_sayisi: b.personelSayisi,
    ad: b.ad,
    soyad: b.soyad,
    telefon: b.telefon,
    kod_hash: kodHash(id, kod),
    kod_son: new Date(Date.now() + KOD_GECERLILIK_DK * 60_000).toISOString(),
    ip,
    kvkk_onay: new Date().toISOString(),
    ticari_ileti: b.ticariIleti,
  });
  if (error) return yanit(500, { hata: "KAYIT_ACILAMADI" });

  if (!epostaAyarli()) {
    // Yalnızca yerel geliştirmede: e-posta ayarı yoksa kod sunucu günlüğüne yazılır
    console.log(`[deneme] ${b.eposta} doğrulama kodu: ${kod}`);
    return yanit(200, { ok: true, id });
  }

  const html = `<div style="font-family:Arial,sans-serif;max-width:480px">
<h2 style="color:#11253a">MNS Next İK doğrulama kodunuz</h2>
<p>Merhaba ${htmlKacis(b.ad)},</p>
<p>${htmlKacis(b.firmaAd)} için ücretsiz deneme hesabınızı açmak üzere doğrulama kodunuz:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0c8a79">${kod}</p>
<p>Kod ${KOD_GECERLILIK_DK} dakika geçerlidir. Bu başvuruyu siz yapmadıysanız bu e-postayı dikkate almayın.</p>
</div>`;
  const gitti = await epostaGonder(b.eposta, `Doğrulama kodunuz: ${kod}`, html);
  if (!gitti) {
    await servis.from("deneme_talepleri").update({ durum: "IPTAL" }).eq("id", id);
    return yanit(502, { hata: "EPOSTA_GONDERILEMEDI" });
  }
  return yanit(200, { ok: true, id });
}
