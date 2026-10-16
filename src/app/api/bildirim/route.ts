// Bir olay olduğunda ilgili kişilere telefon bildirimi gönderir.
// İstemci yalnızca "şu oldu" der; kime ne gideceğine ve olayın gerçekten olup olmadığına
// sunucu veritabanına bakarak karar verir. Böylece kimse başkası adına sahte bildirim gönderemez.
//
// POST gövdesi:
//   { olay: "talep", token }                         personel mobilden izin talebi gönderdi
//   { olay: "talep_sonuc", izin_id }                 yönetici talebi onayladı/reddetti (Bearer)
//   { olay: "plan", personel_idler, tarihler }        yönetici vardiya planını değiştirdi (Bearer)
//   { olay: "mesai", token }                         personel mobilden fazla mesai bildirdi
//   { olay: "mesai_sonuc", mesai_id }                yönetici fazla mesaiyi onayladı/reddetti (Bearer)
//   { olay: "cihaz", talep_id, cihaz }               kilitli personel yeni telefon talebi gönderdi (oturumsuz)
import { bildirimGonder, kullaniciIstemcisi, servisIstemcisi, sorumlular } from "../../../lib/sunucuBildirim";
import { GUN_ADLARI, haftaGunu, kisaTarih, sureYaz, yerelTarih } from "../../../lib/tarih";
import { gunEkle } from "../../../lib/vardiyaPlani";

function yanit(durum: number, govde: Record<string, unknown>) {
  return Response.json(govde, { status: durum });
}

function aralikMetni(iz: { izin_turu: string; baslangic_tarihi: string; bitis_tarihi: string; baslangic_saat?: string | null; bitis_saat?: string | null }) {
  if (iz.izin_turu === "Saatlik İzin") return `${kisaTarih(iz.baslangic_tarihi)} ${iz.baslangic_saat?.slice(0, 5)}-${iz.bitis_saat?.slice(0, 5)}`;
  return iz.baslangic_tarihi === iz.bitis_tarihi
    ? kisaTarih(iz.baslangic_tarihi)
    : `${kisaTarih(iz.baslangic_tarihi)} - ${kisaTarih(iz.bitis_tarihi)}`;
}

export async function POST(istek: Request) {
  let govde: Record<string, unknown>;
  try {
    govde = await istek.json();
  } catch {
    return yanit(400, { hata: "GOVDE_GECERSIZ" });
  }

  let servis;
  try {
    servis = servisIstemcisi();
  } catch {
    return yanit(500, { hata: "SUNUCU_ANAHTARI_YOK" });
  }

  try {
    // ------------------------------------------------------------ personel izin talebi
    if (govde.olay === "talep") {
      const token = typeof govde.token === "string" ? govde.token : "";
      const { data: pid, error } = await servis.rpc("oturum_personel", { p_token: token });
      if (error || !pid) return yanit(401, { hata: "OTURUM_GECERSIZ" });

      // Olay gerçekten oldu mu: son 3 dakikada oluşturulmuş bekleyen talep
      const { data: talep } = await servis
        .from("izinler")
        .select("izin_turu, baslangic_tarihi, bitis_tarihi, baslangic_saat, bitis_saat, personeller (ad, soyad, varsayilan_sube_id, firma_id)")
        .eq("personel_id", pid)
        .eq("durum", "BEKLEMEDE")
        .gte("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!talep) return yanit(200, { gonderilen: 0 });

      const p = talep.personeller as unknown as { ad: string; soyad: string; varsayilan_sube_id: string | null; firma_id: string } | null;
      const alicilar = await sorumlular(servis, { firmaId: p?.firma_id, subeId: p?.varsayilan_sube_id }, "izin");
      const gonderilen = await bildirimGonder(
        servis,
        { kullanicilar: alicilar },
        {
          baslik: "Yeni izin talebi",
          metin: `${p?.ad ?? ""} ${p?.soyad ?? ""}: ${talep.izin_turu}, ${aralikMetni(talep)}`,
          adres: "/",
          etiket: "talep",
        }
      );
      return yanit(200, { gonderilen });
    }

    // ------------------------------------------------------------ personel fazla mesai talebi
    if (govde.olay === "mesai") {
      const token = typeof govde.token === "string" ? govde.token : "";
      const { data: pid, error } = await servis.rpc("oturum_personel", { p_token: token });
      if (error || !pid) return yanit(401, { hata: "OTURUM_GECERSIZ" });
      const { data: t } = await servis
        .from("mesai_talepleri")
        .select("tarih, baslangic_saat, bitis_saat, sure_dk, personeller (ad, soyad, varsayilan_sube_id, firma_id)")
        .eq("personel_id", pid)
        .eq("durum", "BEKLEMEDE")
        .gte("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!t) return yanit(200, { gonderilen: 0 });
      const p = t.personeller as unknown as { ad: string; soyad: string; varsayilan_sube_id: string | null; firma_id: string } | null;
      const alicilar = await sorumlular(servis, { firmaId: p?.firma_id, subeId: p?.varsayilan_sube_id }, "mesai");
      const gonderilen = await bildirimGonder(
        servis,
        { kullanicilar: alicilar },
        {
          baslik: "Yeni fazla mesai talebi",
          metin: `${p?.ad ?? ""} ${p?.soyad ?? ""}: ${kisaTarih(t.tarih)} ${t.baslangic_saat.slice(0, 5)}-${t.bitis_saat.slice(0, 5)} (${sureYaz(t.sure_dk)})`,
          adres: "/",
          etiket: "mesai",
        }
      );
      return yanit(200, { gonderilen });
    }

    // ------------------------------------------------------------ yeni telefon talebi
    // Personelin oturumu yoktur (telefonu kilitli); talep no + cihaz kimliği yalnızca talebi gönderen telefonda bulunur
    if (govde.olay === "cihaz") {
      const talepId = typeof govde.talep_id === "string" ? govde.talep_id : "";
      const cihaz = typeof govde.cihaz === "string" ? govde.cihaz : "";
      if (!/^[0-9a-f-]{36}$/i.test(talepId) || !cihaz) return yanit(400, { hata: "GOVDE_GECERSIZ" });
      const { data: t } = await servis
        .from("cihaz_talepleri")
        .select("cihaz_bilgisi, personeller (ad, soyad, varsayilan_sube_id, firma_id)")
        .eq("id", talepId)
        .eq("cihaz_id", cihaz)
        .eq("durum", "BEKLEMEDE")
        .gte("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
        .maybeSingle();
      if (!t) return yanit(200, { gonderilen: 0 });
      const p = t.personeller as unknown as { ad: string; soyad: string; varsayilan_sube_id: string | null; firma_id: string } | null;
      const alicilar = await sorumlular(servis, { firmaId: p?.firma_id, subeId: p?.varsayilan_sube_id }, "cihaz");
      const gonderilen = await bildirimGonder(
        servis,
        { kullanicilar: alicilar },
        {
          baslik: "Yeni telefon onayı bekleniyor",
          metin: `${p?.ad ?? ""} ${p?.soyad ?? ""} yeni bir telefondan giriş yapmak istiyor${t.cihaz_bilgisi ? ` (${t.cihaz_bilgisi})` : ""}.`,
          adres: "/",
          etiket: "cihaz",
        }
      );
      return yanit(200, { gonderilen });
    }

    // Diğer olaylar panel kullanıcısının oturumuyla gelir
    const token = (istek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return yanit(401, { hata: "OTURUM_YOK" });
    const kullanici = kullaniciIstemcisi(token);

    // ------------------------------------------------------------ talep sonucu
    if (govde.olay === "talep_sonuc") {
      const { data: yetkili } = await kullanici.rpc("yetkisi_var", { p_yetki: "izin" });
      if (yetkili !== true) return yanit(403, { hata: "YETKISIZ" });
      // Kullanıcının kendi yetkisiyle okunur: göremediği talep için bildirim gönderemez
      const { data: iz } = await kullanici
        .from("izinler")
        .select("personel_id, izin_turu, durum, baslangic_tarihi, bitis_tarihi, baslangic_saat, bitis_saat, karar_notu")
        .eq("id", String(govde.izin_id ?? ""))
        .maybeSingle();
      if (!iz || (iz.durum !== "ONAYLANDI" && iz.durum !== "REDDEDILDI")) return yanit(200, { gonderilen: 0 });
      const onay = iz.durum === "ONAYLANDI";
      const gonderilen = await bildirimGonder(
        servis,
        { personeller: [iz.personel_id] },
        {
          baslik: onay ? "İzin talebiniz onaylandı" : "İzin talebiniz reddedildi",
          metin: `${iz.izin_turu}, ${aralikMetni(iz)}${iz.karar_notu ? `. Amir: ${iz.karar_notu}` : ""}`,
          adres: "/mobil",
          etiket: "talep-sonuc",
        }
      );
      return yanit(200, { gonderilen });
    }

    // ------------------------------------------------------------ fazla mesai sonucu
    if (govde.olay === "mesai_sonuc") {
      const { data: yetkili } = await kullanici.rpc("yetkisi_var", { p_yetki: "mesai" });
      if (yetkili !== true) return yanit(403, { hata: "YETKISIZ" });
      const { data: t } = await kullanici
        .from("mesai_talepleri")
        .select("personel_id, durum, tarih, baslangic_saat, bitis_saat, sure_dk, karar_notu")
        .eq("id", String(govde.mesai_id ?? ""))
        .maybeSingle();
      if (!t || (t.durum !== "ONAYLANDI" && t.durum !== "REDDEDILDI")) return yanit(200, { gonderilen: 0 });
      const onay = t.durum === "ONAYLANDI";
      const gonderilen = await bildirimGonder(
        servis,
        { personeller: [t.personel_id] },
        {
          baslik: onay ? "Fazla mesainiz onaylandı" : "Fazla mesainiz reddedildi",
          metin: `${kisaTarih(t.tarih)} ${t.baslangic_saat.slice(0, 5)}-${t.bitis_saat.slice(0, 5)} (${sureYaz(t.sure_dk)})${t.karar_notu ? `. Amir: ${t.karar_notu}` : ""}`,
          adres: "/mobil",
          etiket: "mesai-sonuc",
        }
      );
      return yanit(200, { gonderilen });
    }

    // ------------------------------------------------------------ vardiya planı değişti
    if (govde.olay === "plan") {
      const { data: yetkili } = await kullanici.rpc("yetkisi_var", { p_yetki: "plan" });
      if (yetkili !== true) return yanit(403, { hata: "YETKISIZ" });
      const idler = Array.isArray(govde.personel_idler) ? govde.personel_idler.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
      // Yalnızca önümüzdeki 7 gün haber verilir; uzak tarihlerdeki plan "Vardiyam"da görünür
      const bugun = yerelTarih();
      const sinir = gunEkle(bugun, 7);
      const tarihler = (Array.isArray(govde.tarihler) ? govde.tarihler : [])
        .filter((t): t is string => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t) && t >= bugun && t <= sinir)
        .sort();
      if (idler.length === 0 || tarihler.length === 0) return yanit(200, { gonderilen: 0 });
      // Kullanıcının görebildiği (kendi şubesindeki) personel
      const { data: gorulen } = await kullanici.from("personeller").select("id").in("id", idler);
      const hedefler = (gorulen ?? []).map((p) => p.id as string);
      const gunler = tarihler.slice(0, 3).map((t) => `${kisaTarih(t)} ${GUN_ADLARI[haftaGunu(t)]}`);
      const gonderilen = await bildirimGonder(
        servis,
        { personeller: hedefler },
        {
          baslik: "Vardiya planınız güncellendi",
          metin: `${gunler.join(", ")}${tarihler.length > 3 ? ` ve ${tarihler.length - 3} gün daha` : ""}. Ayrıntı için Vardiyam'a bakın.`,
          adres: "/mobil",
          etiket: "plan",
        }
      );
      return yanit(200, { gonderilen });
    }

    return yanit(400, { hata: "OLAY_GECERSIZ" });
  } catch (err) {
    const metin = err instanceof Error ? err.message : String(err);
    return yanit(500, { hata: metin === "BILDIRIM_ANAHTARI_YOK" ? metin : "GONDERILEMEDI" });
  }
}
