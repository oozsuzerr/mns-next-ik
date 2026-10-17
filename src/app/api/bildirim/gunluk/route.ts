// Günlük görev (Vercel Cron, her sabah): son 24 saatte "çıkış eksik" duruma düşen
// girişler için personele ve sorumlu yöneticilere bildirim gönderir.
// Vercel, CRON_SECRET tanımlıysa isteğe "Authorization: Bearer <CRON_SECRET>" ekler.
import { bildirimGonder, servisIstemcisi, sorumlular } from "../../../../lib/sunucuBildirim";
import { temizle } from "../../../../lib/supabase";
import { ayarlariTamamla, DK_MS } from "../../../../lib/ayarlar";
import { cikisiEksikGirisler, mesaiSonSiniri } from "../../../../lib/mesai";
import { gunEkle, gunPlani, planHaritasi, vardiyaCozucu, type PlanSatiri, type PlanVardiya } from "../../../../lib/vardiyaPlani";
import { GUN_ADLARI, haftaGunu, kisaTarih, yerelSaat, yerelTarih } from "../../../../lib/tarih";

const GUN_MS = 24 * 60 * 60 * 1000;

export async function GET(istek: Request) {
  const sir = temizle(process.env.CRON_SECRET);
  const gelen = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!sir || gelen !== sir) return Response.json({ hata: "YETKISIZ" }, { status: 401 });

  try {
    const servis = servisIstemcisi();
    const simdi = Date.now();
    const bugun = yerelTarih();

    const [per, vard, plan, har, ayar] = await Promise.all([
      servis.from("personeller").select("id, ad, soyad, varsayilan_sube_id, varsayilan_vardiya_id, firma_id").eq("aktif", true),
      servis.from("vardiyalar").select("id, ad, baslangic_saat, bitis_saat, mola_dakika, firma_id").order("created_at"),
      servis
        .from("vardiya_plani")
        .select("id, personel_id, tarih, tur, vardiya_id, sube_id")
        .gte("tarih", gunEkle(bugun, -4))
        .lte("tarih", gunEkle(bugun, 1)),
      servis
        .from("hareketler")
        .select("personel_id, islem_turu, created_at")
        .gte("created_at", new Date(simdi - 3 * GUN_MS).toISOString())
        .order("created_at"),
      servis.from("sirket_ayarlari").select("*"),
    ]);
    for (const s of [per, vard, plan, har]) if (s.error) throw s.error;

    // Her firma kendi kurallarıyla ve kendi vardiyalarıyla hesaplanır (service_role tüm firmaları görür)
    const firmaAyarlari = new Map<string, ReturnType<typeof ayarlariTamamla>>(
      (ayar.data ?? []).map((a) => [a.firma_id as string, ayarlariTamamla(a)])
    );

    const vardiyalar = (vard.data ?? []) as (PlanVardiya & { firma_id: string })[];
    const vardiyaBul = (id: string) => vardiyalar.find((v) => v.id === id);
    const harita = planHaritasi((plan.data ?? []) as PlanSatiri[]);
    const kisiHareketleri = new Map<string, { islem_turu: string; created_at: string }[]>();
    for (const h of har.data ?? []) {
      const l = kisiHareketleri.get(h.personel_id) ?? [];
      l.push(h);
      kisiHareketleri.set(h.personel_id, l);
    }

    // Personel başına: son 24 saatte süresi dolan, çıkışı olmayan girişler
    // Anahtar: "firma|şube"
    const subeyeGore = new Map<string, { firmaId: string; subeId: string | null; sayi: number }>();
    let personeleGiden = 0;
    for (const p of per.data ?? []) {
      const ayarlar = firmaAyarlari.get(p.firma_id) ?? ayarlariTamamla(null);
      const toleransMs = ayarlar.cikis_tolerans_dk * DK_MS;
      const varsayilan =
        (p.varsayilan_vardiya_id && vardiyaBul(p.varsayilan_vardiya_id)) || vardiyalar.find((v) => v.firma_id === p.firma_id) || null;
      const cozucu = vardiyaCozucu(
        (t) => gunPlani(harita.get(`${p.id}|${t}`), t, varsayilan, vardiyaBul, ayarlar.calismayan_gunler),
        ayarlar.erken_giris_payi_dk * DK_MS
      );
      const bitisBul = (an: Date) => cozucu(an)?.son ?? null;
      const yeni = cikisiEksikGirisler(kisiHareketleri.get(p.id) ?? [], bitisBul, simdi, toleransMs).filter(
        (h) => mesaiSonSiniri(new Date(h.created_at), bitisBul, toleransMs) >= simdi - GUN_MS
      );
      if (yeni.length === 0) continue;

      const anahtar = `${p.firma_id}|${p.varsayilan_sube_id}`;
      const kayit = subeyeGore.get(anahtar) ?? { firmaId: p.firma_id, subeId: p.varsayilan_sube_id, sayi: 0 };
      kayit.sayi++;
      subeyeGore.set(anahtar, kayit);
      const h = yeni[yeni.length - 1];
      const tarih = yerelTarih(h.created_at);
      personeleGiden += await bildirimGonder(
        servis,
        { personeller: [p.id] },
        {
          baslik: "Çıkış kaydınız eksik",
          metin: `${kisaTarih(tarih)} ${GUN_ADLARI[haftaGunu(tarih)]} ${yerelSaat(h.created_at)} girişinizin çıkışı yok. Lütfen yöneticinize bildirin.`,
          adres: "/mobil",
          etiket: "cikis-eksik",
        }
      );
    }

    // Yöneticilere şube bazında özet (genel yönetici tüm şubelerin toplamını alır)
    const yoneticiye = new Map<string, number>();
    for (const { firmaId, subeId, sayi } of subeyeGore.values()) {
      for (const uid of await sorumlular(servis, { firmaId, subeId }, "manuel")) yoneticiye.set(uid, (yoneticiye.get(uid) ?? 0) + sayi);
    }
    let yoneticiyeGiden = 0;
    for (const [uid, sayi] of yoneticiye) {
      yoneticiyeGiden += await bildirimGonder(
        servis,
        { kullanicilar: [uid] },
        {
          baslik: "Çıkış kaydı eksik",
          metin: `${sayi} personelin dünkü çıkış kaydı eksik. Panelde "Eksik çıkış" listesinden ekleyebilirsiniz.`,
          adres: "/",
          etiket: "cikis-eksik-ozet",
        }
      );
    }

    return Response.json({ personel: personeleGiden, yonetici: yoneticiyeGiden, eksik: [...subeyeGore.values()].reduce((a, b) => a + b.sayi, 0) });
  } catch (err) {
    return Response.json({ hata: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
