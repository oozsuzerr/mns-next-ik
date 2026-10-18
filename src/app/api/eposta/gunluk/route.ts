// Günlük e-posta özeti (Vercel Cron, her sabah): her firmanın genel yöneticilerine bekleyen onaylar ve uyarılar.
// Bekleyen bir şey yoksa e-posta gönderilmez. RESEND_API_KEY / EPOSTA_GONDEREN tanımlı değilse hiçbir şey gönderilmez.
// Vercel, CRON_SECRET tanımlıysa isteğe "Authorization: Bearer <CRON_SECRET>" ekler.
import { servisIstemcisi } from "../../../../lib/sunucuBildirim";
import { temizle } from "../../../../lib/supabase";
import { epostaAyarli, epostaGonder, htmlKacis } from "../../../../lib/eposta";
import { gunEkle } from "../../../../lib/vardiyaPlani";
import { kisaTarih, yerelTarih } from "../../../../lib/tarih";
import { YILLIK_SINIR_DK } from "../../../../lib/yillikMesai";

type Sayac = Map<string, number>;
const say = (rows: { firma_id?: string | null }[] | null | undefined): Sayac => {
  const m: Sayac = new Map();
  for (const r of rows ?? []) if (r.firma_id) m.set(r.firma_id, (m.get(r.firma_id) ?? 0) + 1);
  return m;
};

/** Sunucu tek seferde en çok 1000 satır döndürür: sayfa sayfa okunur */
async function sayfali<T>(uret: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: T[]; error: unknown }> {
  const tum: T[] = [];
  for (let a = 0; a < 500000; a += 1000) {
    const { data, error } = await uret(a, a + 999);
    if (error) return { data: tum, error };
    tum.push(...((data ?? []) as T[]));
    if (!Array.isArray(data) || data.length < 1000) break;
  }
  return { data: tum, error: null };
}

export async function GET(istek: Request) {
  const sir = temizle(process.env.CRON_SECRET);
  const gelen = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!sir || gelen !== sir) return Response.json({ hata: "YETKISIZ" }, { status: 401 });
  // ?deneme=1: göndermeden, hazırlanan özetleri döndürür (kontrol için)
  const deneme = new URL(istek.url).searchParams.get("deneme") === "1";
  if (!deneme && !epostaAyarli()) return Response.json({ gonderilen: 0, neden: "EPOSTA_AYARLI_DEGIL" });

  const servis = servisIstemcisi();
  const bugun = yerelTarih();
  const yil = bugun.slice(0, 4);
  const panel = temizle(process.env.PANEL_URL) || "https://mns-next-ik.vercel.app";

  const sec = async (tablo: string, sutun: string, durum: string) => {
    const { data } = await servis.from(tablo).select(`firma_id, ${sutun}`).eq(sutun, durum);
    return say(data as { firma_id: string }[] | null);
  };
  const [izin, mesai, odeme, cihaz, belgeD, mesaiYilD, firmalarD, personelD, kvkkD, yoneticiD] = await Promise.all([
    sec("izinler", "durum", "BEKLEMEDE"),
    sec("mesai_talepleri", "durum", "BEKLEMEDE").catch(() => new Map() as Sayac),
    sec("odeme_talepleri", "durum", "BEKLEMEDE").catch(() => new Map() as Sayac),
    sec("cihaz_talepleri", "durum", "BEKLEMEDE").catch(() => new Map() as Sayac),
    servis.from("personel_belgeleri").select("firma_id").not("gecerlilik_bitis", "is", null).lte("gecerlilik_bitis", gunEkle(bugun, 30)),
    (async () => {
      // Sunucu tek seferde en çok 1000 satır döndürür: sayfa sayfa okunur
      const tum: { personel_id: string; sure_dk: number }[] = [];
      for (let b = 0; b < 200000; b += 1000) {
        const { data } = await servis.from("mesai_talepleri").select("personel_id, sure_dk").eq("durum", "ONAYLANDI").gte("tarih", `${yil}-01-01`).lte("tarih", `${yil}-12-31`).order("id").range(b, b + 999);
        tum.push(...((data ?? []) as typeof tum));
        if (!data || data.length < 1000) break;
      }
      return { data: tum };
    })(),
    servis.from("firmalar").select("id, ad, kvkk_surum"),
    sayfali<{ id: string; firma_id: string }>((a, b) => servis.from("personeller").select("id, firma_id").eq("aktif", true).order("id").range(a, b)),
    sayfali<{ personel_id: string; surum: number }>((a, b) => servis.from("kvkk_onaylari").select("personel_id, surum").order("id").range(a, b)),
    servis.from("yoneticiler").select("user_id, firma_id, rol").eq("rol", "GENEL"),
  ]);
  const belge = say(belgeD.data as { firma_id: string }[] | null);
  const kisiFirma = new Map(((personelD.data ?? []) as { id: string; firma_id: string }[]).map((p) => [p.id, p.firma_id]));

  // 270 saati aşan personel sayısı
  const yillik = new Map<string, number>();
  for (const r of (mesaiYilD.data ?? []) as { personel_id: string; sure_dk: number }[]) yillik.set(r.personel_id, (yillik.get(r.personel_id) ?? 0) + r.sure_dk);
  const sinir: Sayac = new Map();
  for (const [pid, dk] of yillik) {
    const f = kisiFirma.get(pid);
    if (f && dk > YILLIK_SINIR_DK) sinir.set(f, (sinir.get(f) ?? 0) + 1);
  }

  // KVKK onayı güncel olmayan aktif personel
  const firmalar = (firmalarD.data ?? []) as { id: string; ad: string; kvkk_surum?: number }[];
  const surum = new Map(firmalar.map((f) => [f.id, f.kvkk_surum ?? 1]));
  const onayli = new Set(((kvkkD.data ?? []) as { personel_id: string; surum: number }[]).filter((k) => surum.get(kisiFirma.get(k.personel_id) ?? "") === k.surum).map((k) => k.personel_id));
  const kvkk: Sayac = new Map();
  if (!kvkkD.error) for (const [pid, f] of kisiFirma) if (!onayli.has(pid)) kvkk.set(f, (kvkk.get(f) ?? 0) + 1);

  let gonderilen = 0;
  const ozetler: { firma: string; satirlar: [string, number][]; alici: number }[] = [];
  for (const f of firmalar) {
    const satirlar: [string, number][] = [
      ["Onay bekleyen izin talebi", izin.get(f.id) ?? 0],
      ["Onay bekleyen fazla mesai", mesai.get(f.id) ?? 0],
      ["Onay bekleyen avans / masraf", odeme.get(f.id) ?? 0],
      ["Onay bekleyen yeni telefon talebi", cihaz.get(f.id) ?? 0],
      ["Süresi 30 gün içinde dolan ya da dolmuş belge", belge.get(f.id) ?? 0],
      [`${yil} yılında 270 saat fazla mesai sınırını aşan personel`, sinir.get(f.id) ?? 0],
      ["KVKK aydınlatma metnini onaylamamış personel", kvkk.get(f.id) ?? 0],
    ].filter(([, n]) => (n as number) > 0) as [string, number][];
    if (!satirlar.length) continue;
    const alicilar = ((yoneticiD.data ?? []) as { user_id: string; firma_id: string }[]).filter((y) => y.firma_id === f.id);
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#11253a;max-width:520px">
<p style="font-size:13px;color:#64748b;margin:0">${htmlKacis(f.ad)} · ${htmlKacis(kisaTarih(bugun))}</p>
<h2 style="font-size:18px;margin:6px 0 12px">Bugün ilgilenmeniz gerekenler</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${satirlar
      .map(([a, n]) => `<tr><td style="padding:8px;border-bottom:1px solid #e1e6ea">${htmlKacis(a)}</td><td style="padding:8px;border-bottom:1px solid #e1e6ea;text-align:right;font-weight:700">${n}</td></tr>`)
      .join("")}</table>
<p style="margin:16px 0"><a href="${htmlKacis(panel)}" style="background:#11253a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Panele git</a></p>
<p style="font-size:12px;color:#94a3b8">Bu e-posta MNS Next IK tarafından firmanızın genel yöneticilerine her sabah gönderilir.</p></div>`;
    if (deneme) {
      ozetler.push({ firma: f.ad, satirlar, alici: alicilar.length });
      continue;
    }
    for (const y of alicilar) {
      const { data } = await servis.auth.admin.getUserById(y.user_id);
      const eposta = data?.user?.email;
      if (eposta && (await epostaGonder(eposta, `${f.ad}: ${satirlar.reduce((t, [, n]) => t + n, 0)} konu bekliyor`, html))) gonderilen++;
    }
  }
  return Response.json(deneme ? { deneme: true, ozetler } : { gonderilen });
}
