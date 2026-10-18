"use client";

// Raporlar: sistemde alınabilen bütün raporlar tek sayfada. Tablo raporları Excel/PDF iner; kişiye özel
// belgeler kişi seçilerek yazdırılır; ekranında daha fazla seçenek olanlar ilgili ekrana götürür.
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, type Personel, type Sekme, type YoneticiBilgisi } from "../../lib/tipler";
import { ayAdi, kisaTarih, yerelTarih } from "../../lib/tarih";
import { disariAktar, type Bicim, type Satir } from "../../lib/disaAktar";
import { modulAcik, type Modul } from "../../lib/moduller";
import { tutanakYazdir, type Zimmet } from "./ik/ZimmetSekmesi";
import { ayrintilar, ozet as islemOzeti, TABLOLAR, type Kayit } from "./IslemGecmisi";
import { sinirDurumu, yillikMesaiGetir, YILLIK_SINIR_DK } from "../../lib/yillikMesai";
import { Ikon, Modal, useBildirim, type IkonAdi } from "../ui";

export interface RaporVerisi {
  baslik: string;
  dosyaAdi: string;
  veriler: Satir[];
  sureSutunlari?: string[];
}

type Tur =
  | { tip: "tablo"; uret: () => RaporVerisi | Promise<RaporVerisi> }
  | { tip: "ozel"; calistir: () => void | Promise<void> }
  | { tip: "kisi"; yazdir: (p: Personel) => void | Promise<void> }
  | { tip: "git"; sekme: Sekme; alt?: string };

interface Rapor {
  kod: string;
  grup: string;
  ad: string;
  aciklama: string;
  /** Seçili aya ya da tarih aralığına göre süzülür */
  donemli?: boolean;
  /** Yalnızca aylık alınabilir (bordro dosyaları) */
  sadeceAylik?: boolean;
  modul?: Modul;
  sadeceGenel?: boolean;
  tur: Tur;
}

const GRUP_IKON: Record<string, IkonAdi> = {
  "Puantaj ve devam": "puantaj",
  "İzin ve fazla mesai": "takvim",
  Personel: "personel",
  "İK işlemleri": "ik",
  "Kişiye özel belgeler": "rapor",
};

export default function RaporlarSekmesi({
  yonetici,
  personeller,
  seciliAy,
  onAyDegis,
  cekirdek,
  onBordroAktarim,
  onIzinKarti,
  onGit,
}: {
  yonetici: YoneticiBilgisi;
  personeller: Personel[];
  seciliAy: string;
  onAyDegis: (ay: string) => void;
  /** Ana sayfanın ürettiği çekirdek raporlar (puantaj, hareketler, personel...); aralık verilirse o tarihler için */
  cekirdek: (kod: string, aralik?: { bas: string; bit: string }) => Promise<RaporVerisi>;
  onBordroAktarim?: () => void;
  onIzinKarti: (p: Personel) => void;
  onGit: (sekme: Sekme, alt?: string) => void;
}) {
  const { bildir } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const [ara, setAra] = useState("");
  const [calisan, setCalisan] = useState<string | null>(null);
  const [kisiSecimi, setKisiSecimi] = useState<Rapor | null>(null);
  // Dönem: seçili ay ya da serbest tarih aralığı
  const [mod, setMod] = useState<"ay" | "aralik">("ay");
  const [aralik, setAralik] = useState(() => ({ bas: `${yerelTarih().slice(0, 7)}-01`, bit: yerelTarih() }));
  const aralikGecerli = aralik.bas && aralik.bit && aralik.bas <= aralik.bit;
  const secilenAralik = mod === "aralik" && aralikGecerli ? aralik : undefined;
  const donemEtiketi = secilenAralik ? `${kisaTarih(aralik.bas)} – ${kisaTarih(aralik.bit)}` : ayAdi(seciliAy);
  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);
  const ad = (id: string) => {
    const p = kisiler.get(id);
    return p ? `${p.ad} ${p.soyad}` : "-";
  };
  const sicil = (id: string) => kisiler.get(id)?.sicil_no ?? "-";
  // Departman / ünvan filtresi: "Sicil No" sütunu olan raporlara uygulanır
  const [departman, setDepartman] = useState("");
  const [unvan, setUnvan] = useState("");
  const departmanlar = useMemo(() => [...new Set(personeller.map((p) => p.departman || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [personeller]);
  const unvanlar = useMemo(() => [...new Set(personeller.map((p) => p.unvan || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [personeller]);
  function filtrele(veriler: Satir[]): Satir[] {
    if (!departman && !unvan) return veriler;
    const izinli = new Set(personeller.filter((p) => (!departman || (p.departman || "") === departman) && (!unvan || (p.unvan || "") === unvan)).map((p) => p.sicil_no));
    if (!veriler.some((v) => "Sicil No" in v)) return veriler;
    let onceki = false;
    const sonuc = veriler.filter((v) => {
      const s = String(v["Sicil No"] ?? "");
      // Kişinin devam satırı (ör. cetvelde "Gerçekleşen") sicilsizdir: önceki satırla birlikte kalır
      onceki = s ? izinli.has(s) : onceki;
      return onceki;
    });
    let n = 0;
    return sonuc.map((v) => ("Sıra" in v && typeof v.Sıra === "number" ? { ...v, Sıra: ++n } : v));
  }
  /** Dönemin ilk günü ve bitişten sonraki gün (dahil değil) */
  const ayAraligi = () => {
    if (secilenAralik) {
      const d = new Date(`${secilenAralik.bit}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return { bas: secilenAralik.bas, son: d.toISOString().slice(0, 10) };
    }
    const [y, m] = seciliAy.split("-").map(Number);
    return { bas: `${seciliAy}-01`, son: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) };
  };
  /** Tarih aralığı seçiliyse tarihli kaydı aralıkla süzer (ay modunda tarihsiz raporlar bütün kayıtları verir) */
  const aralikta = (tarih: string | null | undefined) => {
    if (!secilenAralik) return true;
    if (!tarih) return false;
    const t = tarih.slice(0, 10);
    return t >= secilenAralik.bas && t <= secilenAralik.bit;
  };
  const donemEki = secilenAralik ? `${secilenAralik.bas}_${secilenAralik.bit}` : seciliAy;
  const ek = `MNS_Next_IK_${yerelTarih()}`;

  /** Tablo sorgusu: hata varsa (modül kurulmamış vb.) anlaşılır mesajla durur */
  async function sorgu<T>(istek: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await istek;
    if (error) throw new Error(hataYaz(error));
    return (data ?? []) as T[];
  }

  const raporlar: Rapor[] = [
    // ------------------------------------------------------------ Puantaj ve devam
    { kod: "puantaj", grup: "Puantaj ve devam", ad: "Puantaj ve bordro cetveli", aciklama: "Kişi başı çalışılan, izinli, raporlu, devamsız günler; çalışma ve mesai süreleri.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("puantaj", secilenAralik) } },
    { kod: "cetvel", grup: "Puantaj ve devam", ad: "Aylık puantaj cetveli", aciklama: "Personeller satırda, günler sütunda: planlanan ve gerçekleşen saat (ondalık), NM, FM, EÇ, HT, RT ve gün toplamları.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("cetvel", secilenAralik) } },
    { kod: "ayrintili", grup: "Puantaj ve devam", ad: "Ayrıntılı devam çizelgesi", aciklama: "Her personelin gün gün giriş, çıkış, net çalışma ve durumu.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("ayrintili", secilenAralik) } },
    { kod: "hareketler", grup: "Puantaj ve devam", ad: "Giriş-çıkış hareketleri", aciklama: "Bütün mobil ve manuel giriş/çıkış kayıtları, konum mesafesiyle.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("hareketler", secilenAralik) } },
    { kod: "gecikme", grup: "Puantaj ve devam", ad: "Performans: geç giriş, erken çıkış, devamsızlık", aciklama: "Geç giriş ve erken çıkış gün sayıları ve süreleri, devamsız ve eksik hareketli günler.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("gecikme", secilenAralik) } },
    { kod: "gunluk", grup: "Puantaj ve devam", ad: "Günlük devam durumu (bugün)", aciklama: "Bugün içeride, çıkmış, izinli ve gelmeyen personel.", tur: { tip: "tablo", uret: () => cekirdek("gunluk") } },
    ...(onBordroAktarim
      ? [{ kod: "bordroAktarim", grup: "Puantaj ve devam", ad: "Bordro aktarım dosyası", aciklama: "Muhasebe/bordro programına aktarım: SGK günleri, ücret, mesai saatleri, avans/masraf.", donemli: true, sadeceAylik: true, tur: { tip: "ozel" as const, calistir: onBordroAktarim } }]
      : []),
    { kod: "tahminiBordro", grup: "Puantaj ve devam", ad: "Tahmini bordro", aciklama: "Brüt, kesintiler, net ve işveren maliyeti (ekranında Excel).", sadeceAylik: true, modul: "bordro", sadeceGenel: true, tur: { tip: "git", sekme: "ik", alt: "bordro" } },

    // ------------------------------------------------------------ İzin ve fazla mesai
    { kod: "izinOzet", grup: "İzin ve fazla mesai", ad: "Personel izin raporu", aciklama: "Onaylı izinler kişi ve izin türü bazında: izin sayısı, dönemdeki iş günü ve takvim günü.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("izinOzet", secilenAralik) } },
    { kod: "saatlikIzin", grup: "İzin ve fazla mesai", ad: "Saatlik izin raporu", aciklama: "Onaylı saatlik izinler, saat aralıkları ve kişi başı toplam süre.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("saatlikIzin", secilenAralik) } },
    { kod: "talepler", grup: "İzin ve fazla mesai", ad: "Onaylı izin ve raporlar (kayıt kayıt)", aciklama: "Onaylanmış bütün izin, rapor ve saatlik izin kayıtları tek tek.", donemli: mod === "aralik", tur: { tip: "tablo", uret: () => cekirdek("talepler", secilenAralik) } },
    { kod: "izinBakiye", grup: "İzin ve fazla mesai", ad: "Yıllık izin bakiyeleri", aciklama: "Kıdem, devreden, hak edilen, kullanılan ve kalan yıllık izin.", tur: { tip: "tablo", uret: () => cekirdek("izinBakiye") } },
    { kod: "izinDonem", grup: "İzin ve fazla mesai", ad: "Yıllık izin dönemleri", aciklama: "Her hizmet yılı için devreden, hak edilen, kullanılan, kalan ve dönemin durumu.", tur: { tip: "tablo", uret: () => cekirdek("izinDonem") } },
    {
      kod: "yillikMesai",
      grup: "İzin ve fazla mesai",
      ad: "Yıllık fazla mesai (270 saat sınırı)",
      aciklama: "Seçili ayın yılında kişi başı onaylı fazla mesai, kalan süre ve sınır durumu (İş Kanunu m.41).",
      tur: {
        tip: "tablo",
        uret: async () => {
          const yil = Number((secilenAralik?.bit ?? seciliAy).slice(0, 4));
          const h = await yillikMesaiGetir(yil);
          const saat = (dk: number) => Math.round((dk / 60) * 100) / 100;
          return {
            baslik: `Yıllık Fazla Mesai ${yil} (270 saat)`,
            dosyaAdi: `${ek}_Yillik_Fazla_Mesai_${yil}`,
            veriler: personeller
              .map((p) => ({ p, dk: h.get(p.id) ?? 0 }))
              .filter((x) => x.dk > 0)
              .sort((a, b) => b.dk - a.dk)
              .map(({ p, dk }, i) => ({
                Sıra: i + 1,
                "Sicil No": p.sicil_no,
                "Ad Soyad": `${p.ad} ${p.soyad}`,
                Departman: p.departman ?? "",
                Şube: p.subeler?.ad ?? "",
                "Onaylı (saat)": saat(dk),
                "Kalan (saat)": saat(Math.max(0, YILLIK_SINIR_DK - dk)),
                Durum: sinirDurumu(dk) === "asti" ? "Sınır aşıldı" : sinirDurumu(dk) === "yaklasti" ? "Sınıra yaklaştı" : "Normal",
              })),
          };
        },
      },
    },
    { kod: "mesai", grup: "İzin ve fazla mesai", ad: "Onaylı fazla mesailer", aciklama: "Dönemde müdürün onayladığı fazla mesailer ve süreleri.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("mesai", secilenAralik) } },

    // ------------------------------------------------------------ Personel
    { kod: "personel", grup: "Personel", ad: "Personel listesi", aciklama: "Bütün personel: sicil, T.C., şube, vardiya, giriş/çıkış tarihi, durum.", tur: { tip: "tablo", uret: () => cekirdek("personel") } },
    { kod: "vardiya", grup: "Personel", ad: "Vardiya tanımları", aciklama: "Vardiyalar, saatleri ve molaları.", tur: { tip: "tablo", uret: () => cekirdek("vardiya") } },
    { kod: "vardiyaPlan", grup: "Personel", ad: "Vardiya listesi (kim, hangi gün)", aciklama: "Dönemde her personelin gün gün vardiyası, saatleri ve gün türü (plan ya da varsayılan).", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("vardiyaPlan", secilenAralik) } },
    {
      kod: "kvkk",
      grup: "Personel",
      ad: "KVKK onay durumu",
      aciklama: "Aktif personelin aydınlatma metnini hangi sürümde, ne zaman onayladığı; onaylamayanlar.",
      tur: {
        tip: "tablo",
        uret: async () => {
          const [{ data: b }, l] = await Promise.all([
            supabase.rpc("kvkk_bilgisi"),
            sorgu<{ personel_id: string; surum: number; onay_zamani: string }>(supabase.from("kvkk_onaylari").select("personel_id, surum, onay_zamani")),
          ]);
          const surum = (b as { surum?: number } | null)?.surum ?? 1;
          const son = new Map<string, { surum: number; zaman: string }>();
          for (const o of l) if ((son.get(o.personel_id)?.surum ?? 0) < o.surum) son.set(o.personel_id, { surum: o.surum, zaman: o.onay_zamani });
          return {
            baslik: `KVKK Onay Durumu (güncel sürüm ${surum})`,
            dosyaAdi: `${ek}_KVKK_Onaylari`,
            veriler: personeller
              .filter((p) => p.aktif)
              .map((p, i) => {
                const o = son.get(p.id);
                return {
                  Sıra: i + 1,
                  "Sicil No": p.sicil_no,
                  "Ad Soyad": `${p.ad} ${p.soyad}`,
                  Şube: p.subeler?.ad ?? "",
                  "Onaylanan Sürüm": o?.surum ?? "",
                  "Onay Tarihi": o ? `${yerelTarih(o.zaman)}` : "",
                  Durum: o?.surum === surum ? "Güncel" : o ? "Eski sürüm (yeniden onay bekleniyor)" : "Onaylamadı",
                };
              }),
          };
        },
      },
    },
    {
      kod: "personelDetay",
      grup: "Personel",
      ad: "Detaylı personel bilgileri",
      aciklama: genel ? "Personel ve Özlük bilgileri tek tabloda: iletişim, ünvan, eğitim, çalışma şekli, acil durum kişisi, IBAN." : "Personel bilgileri tek tabloda (Özlük bilgileri yalnızca genel yöneticiye).",
      tur: {
        tip: "tablo",
        uret: async () => {
          const oz = genel
            ? await sorgu<{ personel_id: string; telefon: string | null; eposta: string | null; adres: string | null; calisma_sekli: string | null; egitim: string | null; acil_kisi: string | null; acil_yakinlik: string | null; acil_telefon: string | null; iban: string | null }>(
                supabase.from("personel_ozluk").select("personel_id, telefon, eposta, adres, calisma_sekli, egitim, acil_kisi, acil_yakinlik, acil_telefon, iban")
              ).catch(() => [])
            : [];
          const ozm = new Map(oz.map((o) => [o.personel_id, o]));
          return {
            baslik: "Detaylı Personel Bilgileri",
            dosyaAdi: `${ek}_Personel_Detay`,
            veriler: personeller.map((p, i) => {
              const o = ozm.get(p.id);
              const temel: Satir = {
                Sıra: i + 1,
                "Sicil No": p.sicil_no,
                "Ad Soyad": `${p.ad} ${p.soyad}`,
                "T.C. Kimlik": p.tc_kimlik,
                Departman: p.departman ?? "",
                Ünvan: p.unvan ?? "",
                Şube: p.subeler?.ad ?? "",
                Vardiya: p.vardiyalar?.ad ?? "",
                "İşe Giriş": p.ise_giris_tarihi ?? "",
                "İşten Çıkış": p.cikis_tarihi ?? "",
                "Doğum Tarihi": p.dogum_tarihi ?? "",
                Durum: p.aktif ? "Aktif" : "Pasif",
                Mobil: p.cihaz_id ? "Telefon eşleşti" : p.pin_tanimli ? "PIN var, telefon yok" : "PIN yok",
              };
              return genel
                ? {
                    ...temel,
                    Telefon: o?.telefon ?? "",
                    "E-posta": o?.eposta ?? "",
                    Adres: o?.adres ?? "",
                    "Çalışma Şekli": o?.calisma_sekli ?? "",
                    Eğitim: o?.egitim ?? "",
                    "Acil Durum Kişisi": o?.acil_kisi ?? "",
                    Yakınlık: o?.acil_yakinlik ?? "",
                    "Acil Telefon": o?.acil_telefon ?? "",
                    IBAN: o?.iban ?? "",
                  }
                : temel;
            }),
          };
        },
      },
    },
    ...(genel
      ? [
          {
            kod: "ucretListesi",
            grup: "Personel",
            ad: "Ücret listesi",
            aciklama: "Personelin güncel ücreti, ücret türü ve hangi tarihten beri geçerli olduğu.",
            tur: {
              tip: "tablo" as const,
              uret: async () => {
                const [oz, gec] = await Promise.all([
                  sorgu<{ personel_id: string; ucret: number | null; ucret_turu: string | null }>(supabase.from("personel_ozluk").select("personel_id, ucret, ucret_turu")),
                  sorgu<{ personel_id: string; gecerlilik: string }>(supabase.from("personel_ucret_gecmisi").select("personel_id, gecerlilik").order("gecerlilik")).catch(() => []),
                ]);
                const son = new Map<string, string>();
                for (const g of gec) son.set(g.personel_id, g.gecerlilik);
                const ozm = new Map(oz.map((o) => [o.personel_id, o]));
                return {
                  baslik: `Ücret Listesi (${yerelTarih()})`,
                  dosyaAdi: `${ek}_Ucret_Listesi`,
                  veriler: personeller.map((p, i) => {
                    const o = ozm.get(p.id);
                    return {
                      Sıra: i + 1,
                      "Sicil No": p.sicil_no,
                      "Ad Soyad": `${p.ad} ${p.soyad}`,
                      Departman: p.departman ?? "",
                      Ünvan: p.unvan ?? "",
                      Şube: p.subeler?.ad ?? "",
                      "Ücret Türü": o?.ucret_turu ?? "",
                      "Ücret (TL)": o?.ucret != null ? Number(o.ucret) : "",
                      "Geçerli Olduğu Tarih": son.get(p.id) ?? "",
                      Durum: p.aktif ? "Aktif" : "Pasif",
                    };
                  }),
                };
              },
            },
          },
          {
            kod: "ucretGecmisi",
            grup: "Personel",
            ad: "Ücret geçmişi",
            aciklama: "Ücret ve ücret türü değişiklikleri, geçerlilik tarihleriyle (Özlük'te her değişiklikte kaydedilir).",
            donemli: mod === "aralik",
            tur: {
              tip: "tablo" as const,
              uret: async () => {
                const l = await sorgu<{ personel_id: string; ucret: number | null; ucret_turu: string | null; gecerlilik: string }>(
                  supabase.from("personel_ucret_gecmisi").select("personel_id, ucret, ucret_turu, gecerlilik").order("gecerlilik")
                ).catch(() => {
                  throw new Error("Ücret geçmişi kurulmamış: supabase/2026-10-18_ucret_gecmisi.sql çalıştırılmalı.");
                });
                return {
                  baslik: "Ücret Geçmişi",
                  dosyaAdi: `${ek}_Ucret_Gecmisi`,
                  veriler: l
                    .filter((g) => kisiler.has(g.personel_id) && aralikta(g.gecerlilik))
                    .sort((a, b) => ad(a.personel_id).localeCompare(ad(b.personel_id), "tr") || a.gecerlilik.localeCompare(b.gecerlilik))
                    .map((g, i) => ({
                      Sıra: i + 1,
                      "Sicil No": sicil(g.personel_id),
                      "Ad Soyad": ad(g.personel_id),
                      "Geçerlilik Başlangıcı": g.gecerlilik,
                      "Ücret Türü": g.ucret_turu ?? "",
                      "Ücret (TL)": g.ucret != null ? Number(g.ucret) : "",
                    })),
                };
              },
            },
          },
          {
            kod: "islemGecmisi",
            grup: "Personel",
            ad: "İşlem geçmişi (kayıt logu)",
            aciklama: "Panelde kim, ne zaman, neyi değiştirdi: manuel hareket, izin onayı, personel, cihaz kilidi vb.",
            donemli: true,
            tur: {
              tip: "tablo" as const,
              uret: async () => {
                const { bas, son } = ayAraligi();
                const l = await sorgu<Kayit>(
                  supabase.from("islem_gecmisi").select("*").gte("zaman", `${bas}T00:00:00+03:00`).lt("zaman", `${son}T00:00:00+03:00`).order("zaman").limit(5000)
                );
                return {
                  baslik: `İşlem Geçmişi (${donemEtiketi})`,
                  dosyaAdi: `${ek}_Islem_Gecmisi_${donemEki}`,
                  veriler: l.map((x, i) => ({
                    Sıra: i + 1,
                    Zaman: `${yerelTarih(x.zaman)} ${new Date(x.zaman).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}`,
                    Kullanıcı: x.kullanici_eposta ?? "Sistem / mobil",
                    Kayıt: TABLOLAR[x.tablo] ?? x.tablo,
                    İşlem: islemOzeti(x),
                    Personel: x.personel_id ? ad(x.personel_id) : "",
                    "Sicil No": x.personel_id ? sicil(x.personel_id) : "",
                    Ayrıntı: ayrintilar(x).join(" · "),
                  })),
                };
              },
            },
          },
          {
            kod: "cihaz",
            grup: "Personel",
            ad: "Telefon ve cihaz kayıtları",
            aciklama: "Personelin telefon eşleşmesi ve dönemdeki yeni telefon talepleri, kararlarıyla.",
            donemli: true,
            tur: {
              tip: "tablo" as const,
              uret: async () => {
                const { bas, son } = ayAraligi();
                const l = await sorgu<{ personel_id: string; cihaz_bilgisi: string | null; durum: string; created_at: string }>(
                  supabase.from("cihaz_talepleri").select("personel_id, cihaz_bilgisi, durum, created_at").gte("created_at", `${bas}T00:00:00+03:00`).lt("created_at", `${son}T00:00:00+03:00`).order("created_at")
                ).catch(() => []);
                const talepler: Satir[] = l
                  .filter((t) => kisiler.has(t.personel_id))
                  .map((t) => ({
                    Kayıt: "Yeni telefon talebi",
                    Tarih: yerelTarih(t.created_at),
                    "Sicil No": sicil(t.personel_id),
                    "Ad Soyad": ad(t.personel_id),
                    Cihaz: t.cihaz_bilgisi ?? "",
                    Durum: t.durum === "ONAYLANDI" ? "Onaylandı" : t.durum === "REDDEDILDI" ? "Reddedildi" : t.durum === "IPTAL" ? "İptal" : "Bekliyor",
                  }));
                const durumlar: Satir[] = personeller
                  .filter((p) => p.aktif)
                  .map((p) => ({
                    Kayıt: "Güncel durum",
                    Tarih: yerelTarih(),
                    "Sicil No": p.sicil_no,
                    "Ad Soyad": `${p.ad} ${p.soyad}`,
                    Cihaz: p.cihaz_id ? "Telefon eşleşmiş" : "",
                    Durum: p.cihaz_id ? "Eşleşti" : p.pin_tanimli ? "PIN var, telefon yok" : "PIN yok",
                  }));
                return { baslik: `Telefon ve Cihaz Kayıtları (${donemEtiketi})`, dosyaAdi: `${ek}_Cihaz_${donemEki}`, veriler: [...talepler, ...durumlar].map((x, i) => ({ Sıra: i + 1, ...x })) };
              },
            },
          },
        ]
      : []),
    ...(genel ? [{ kod: "subeler", grup: "Personel", ad: "Şube listesi", aciklama: "Şubeler, konumları ve personel sayıları.", tur: { tip: "tablo" as const, uret: () => cekirdek("subeler") } }] : []),

    // ------------------------------------------------------------ İK işlemleri
    {
      kod: "gorevler",
      grup: "İK işlemleri",
      ad: "Görevler",
      aciklama: "Dönemde verilen görevler, durumları, son tarihleri ve personel notları.",
      donemli: true,
      modul: "gorev",
      tur: {
        tip: "tablo",
        uret: async () => {
          const { bas, son } = ayAraligi();
          const l = await sorgu<{ personel_id: string; baslik: string; oncelik: string; son_tarih: string | null; durum: string; atayan_ad: string | null; personel_notu: string | null; created_at: string; tamamlanma: string | null }>(
            supabase.from("gorevler").select("*").gte("created_at", `${bas}T00:00:00+03:00`).lt("created_at", `${son}T00:00:00+03:00`).order("created_at")
          );
          return {
            baslik: `Görevler (${donemEtiketi})`,
            dosyaAdi: `${ek}_Gorevler_${donemEki}`,
            veriler: l.filter((g) => kisiler.has(g.personel_id)).map((g, i) => ({
              Sıra: i + 1,
              "Ad Soyad": ad(g.personel_id),
              Görev: g.baslik,
              Öncelik: g.oncelik,
              Verildi: yerelTarih(g.created_at),
              Veren: g.atayan_ad ?? "",
              "Son Tarih": g.son_tarih ?? "",
              Durum: g.durum,
              Tamamlandı: g.tamamlanma ? yerelTarih(g.tamamlanma) : "",
              "Personel Notu": g.personel_notu ?? "",
            })),
          };
        },
      },
    },
    {
      kod: "zimmet",
      grup: "İK işlemleri",
      donemli: mod === "aralik",
      ad: "Zimmet listesi",
      aciklama: "Personeldeki ve iade edilen bütün eşyalar.",
      modul: "zimmet",
      tur: {
        tip: "tablo",
        uret: async () => {
          const l = await sorgu<Zimmet>(supabase.from("zimmetler").select("*").order("teslim_tarihi"));
          return {
            baslik: "Zimmet Listesi",
            dosyaAdi: `${ek}_Zimmet`,
            veriler: l.filter((z) => kisiler.has(z.personel_id) && aralikta(z.teslim_tarihi)).map((z, i) => ({
              Sıra: i + 1,
              "Sicil No": sicil(z.personel_id),
              "Ad Soyad": ad(z.personel_id),
              Tür: z.kategori,
              Eşya: z.ad,
              "Seri / Plaka": z.seri_no ?? "",
              Adet: z.adet,
              "Değer (TL)": z.deger ?? "",
              Teslim: z.teslim_tarihi,
              İade: z.iade_tarihi ?? "Personelde",
              "İade Durumu": z.iade_durumu ?? "",
            })),
          };
        },
      },
    },
    {
      kod: "odeme",
      grup: "İK işlemleri",
      ad: "Avans ve masraf (kayıt kayıt)",
      aciklama: "Dönemde onaylanan ve ödenen avans ve masraf kayıtları.",
      donemli: true,
      modul: "odeme",
      tur: {
        tip: "tablo",
        uret: async () => {
          const { bas, son } = ayAraligi();
          const l = await sorgu<{ personel_id: string; tur: string; tutar: number; tarih: string; kategori: string | null; aciklama: string | null; durum: string; odeme_tarihi: string | null; kaynak: string }>(
            supabase.from("odeme_talepleri").select("*").gte("tarih", bas).lt("tarih", son).in("durum", ["ONAYLANDI", "ODENDI"]).order("tarih")
          );
          return {
            baslik: `Onaylı Avans ve Masraf (${donemEtiketi})`,
            dosyaAdi: `${ek}_Avans_Masraf_${donemEki}`,
            veriler: l.filter((o) => kisiler.has(o.personel_id)).map((o, i) => ({
              Sıra: i + 1,
              "Sicil No": sicil(o.personel_id),
              "Ad Soyad": ad(o.personel_id),
              Tür: o.tur,
              Tarih: o.tarih,
              "Tutar (TL)": Number(o.tutar),
              "Masraf Türü": o.kategori ?? "",
              Açıklama: o.aciklama ?? "",
              Durum: o.durum,
              "Ödeme Tarihi": o.odeme_tarihi ?? "",
              Kaynak: o.kaynak === "mobil" ? "Telefon" : "Panel",
            })),
          };
        },
      },
    },
    {
      kod: "avansOzet",
      grup: "İK işlemleri",
      ad: "Personel avans raporu",
      aciklama: "Onaylı ve ödenmiş avanslar kişi bazında: avans sayısı, toplam tutar, ödenen ve ödenecek.",
      donemli: true,
      modul: "odeme",
      tur: {
        tip: "tablo",
        uret: async () => {
          const { bas, son } = ayAraligi();
          const l = await sorgu<{ personel_id: string; tur: string; tutar: number; durum: string }>(
            supabase.from("odeme_talepleri").select("personel_id, tur, tutar, durum").eq("tur", "Avans").in("durum", ["ONAYLANDI", "ODENDI"]).gte("tarih", bas).lt("tarih", son)
          );
          const g = new Map<string, { adet: number; toplam: number; odenen: number }>();
          for (const o of l.filter((x) => kisiler.has(x.personel_id))) {
            const k = g.get(o.personel_id) ?? { adet: 0, toplam: 0, odenen: 0 };
            k.adet++;
            k.toplam += Number(o.tutar);
            if (o.durum === "ODENDI") k.odenen += Number(o.tutar);
            g.set(o.personel_id, k);
          }
          return {
            baslik: `Personel Avans Raporu (${donemEtiketi})`,
            dosyaAdi: `${ek}_Avans_Raporu_${donemEki}`,
            veriler: [...g.entries()]
              .sort((a, b) => b[1].toplam - a[1].toplam)
              .map(([id, k], i) => {
                const p = kisiler.get(id);
                return {
                  Sıra: i + 1,
                  "Sicil No": sicil(id),
                  "Ad Soyad": ad(id),
                  Departman: p?.departman ?? "",
                  Ünvan: p?.unvan ?? "",
                  "Avans Sayısı": k.adet,
                  "Toplam Avans (TL)": Math.round(k.toplam * 100) / 100,
                  "Ödenen (TL)": Math.round(k.odenen * 100) / 100,
                  "Ödenecek (TL)": Math.round((k.toplam - k.odenen) * 100) / 100,
                };
              }),
          };
        },
      },
    },
    {
      kod: "egitim",
      grup: "İK işlemleri",
      donemli: mod === "aralik",
      ad: "Eğitim kayıtları",
      aciklama: "Kim hangi eğitimi ne zaman aldı, geçerlilik bitişleri.",
      modul: "egitim",
      tur: {
        tip: "tablo",
        uret: async () => {
          const [kayitlar, turler] = await Promise.all([
            sorgu<{ personel_id: string; tur_id: string; tarih: string; sure_saat: number | null; egitmen: string | null; kurum: string | null; gecerlilik_bitis: string | null }>(supabase.from("egitim_kayitlari").select("*").order("tarih")),
            sorgu<{ id: string; ad: string; zorunlu: boolean }>(supabase.from("egitim_turleri").select("id, ad, zorunlu")),
          ]);
          const tur = new Map(turler.map((t) => [t.id, t]));
          const bugun = yerelTarih();
          return {
            baslik: "Eğitim Kayıtları",
            dosyaAdi: `${ek}_Egitim`,
            veriler: kayitlar.filter((k) => kisiler.has(k.personel_id) && aralikta(k.tarih)).map((k, i) => ({
              Sıra: i + 1,
              "Sicil No": sicil(k.personel_id),
              "Ad Soyad": ad(k.personel_id),
              Eğitim: tur.get(k.tur_id)?.ad ?? "",
              Zorunlu: tur.get(k.tur_id)?.zorunlu ? "Evet" : "",
              Tarih: k.tarih,
              "Süre (saat)": k.sure_saat ?? "",
              "Eğitimi Veren": k.egitmen ?? "",
              Kurum: k.kurum ?? "",
              "Geçerlilik Bitişi": k.gecerlilik_bitis ?? "Süresiz",
              Durum: k.gecerlilik_bitis && k.gecerlilik_bitis < bugun ? "Süresi doldu" : "Geçerli",
            })),
          };
        },
      },
    },
    {
      kod: "performans",
      grup: "İK işlemleri",
      donemli: mod === "aralik",
      ad: "Performans sonuçları",
      aciklama: "Bütün dönemlerin değerlendirme puanları ve durumları.",
      modul: "performans",
      tur: {
        tip: "tablo",
        uret: async () => {
          const [d, donemler] = await Promise.all([
            sorgu<{ donem_id: string; personel_id: string; ortalama: number | null; durum: string; degerlendiren_ad: string | null; tamamlanma: string | null; personel_gordu: string | null }>(supabase.from("performans_degerlendirmeleri").select("*")),
            sorgu<{ id: string; ad: string; bitis: string }>(supabase.from("performans_donemleri").select("id, ad, bitis")),
          ]);
          const donem = new Map(donemler.map((x) => [x.id, x]));
          return {
            baslik: "Performans Sonuçları",
            dosyaAdi: `${ek}_Performans`,
            veriler: d
              .filter((x) => kisiler.has(x.personel_id) && aralikta(donem.get(x.donem_id)?.bitis))
              .sort((a, b) => (donem.get(b.donem_id)?.bitis ?? "").localeCompare(donem.get(a.donem_id)?.bitis ?? ""))
              .map((x, i) => ({
                Sıra: i + 1,
                Dönem: donem.get(x.donem_id)?.ad ?? "",
                "Sicil No": sicil(x.personel_id),
                "Ad Soyad": ad(x.personel_id),
                "Ortalama (1-5)": x.ortalama ?? "",
                Durum: x.durum,
                Değerlendiren: x.degerlendiren_ad ?? "",
                Tamamlandı: x.tamamlanma ? yerelTarih(x.tamamlanma) : "",
                "Personel Gördü": x.personel_gordu ? yerelTarih(x.personel_gordu) : "",
              })),
          };
        },
      },
    },
    {
      kod: "duyuru",
      grup: "İK işlemleri",
      donemli: mod === "aralik",
      ad: "Duyuru okuma durumu",
      aciklama: "Her duyuru ve onu okuyan personel sayısı.",
      modul: "duyuru",
      tur: {
        tip: "tablo",
        uret: async () => {
          const [d, o] = await Promise.all([
            sorgu<{ id: string; baslik: string; created_at: string; onemli: boolean; sube_id: string | null }>(supabase.from("duyurular").select("id, baslik, created_at, onemli, sube_id").order("created_at", { ascending: false })),
            sorgu<{ duyuru_id: string }>(supabase.from("duyuru_okumalar").select("duyuru_id")),
          ]);
          const sayac = new Map<string, number>();
          for (const x of o) sayac.set(x.duyuru_id, (sayac.get(x.duyuru_id) ?? 0) + 1);
          const aktif = personeller.filter((p) => p.aktif);
          return {
            baslik: "Duyuru Okuma Durumu",
            dosyaAdi: `${ek}_Duyurular`,
            veriler: d.filter((x) => aralikta(yerelTarih(x.created_at))).map((x, i) => {
              const hedef = aktif.filter((p) => !x.sube_id || p.varsayilan_sube_id === x.sube_id).length;
              return { Sıra: i + 1, Tarih: yerelTarih(x.created_at), Duyuru: x.baslik, Önemli: x.onemli ? "Evet" : "", Okuyan: sayac.get(x.id) ?? 0, Hedef: hedef };
            }),
          };
        },
      },
    },
    {
      kod: "adaylar",
      grup: "İK işlemleri",
      donemli: mod === "aralik",
      ad: "Aday listesi",
      aciklama: "İlanlara göre adaylar, aşamaları ve puanları.",
      modul: "isealim",
      tur: {
        tip: "tablo",
        uret: async () => {
          const [a, ilanlar] = await Promise.all([
            sorgu<{ ilan_id: string; ad: string; soyad: string; telefon: string | null; eposta: string | null; kaynak: string | null; asama: string; puan: number | null; basvuru: string }>(supabase.from("adaylar").select("*").order("basvuru")),
            sorgu<{ id: string; baslik: string; durum: string }>(supabase.from("ise_alim_ilanlari").select("id, baslik, durum")),
          ]);
          const ilan = new Map(ilanlar.map((x) => [x.id, x]));
          return {
            baslik: "Aday Listesi",
            dosyaAdi: `${ek}_Adaylar`,
            veriler: a.filter((x) => aralikta(x.basvuru)).map((x, i) => ({
              Sıra: i + 1,
              İlan: ilan.get(x.ilan_id)?.baslik ?? "",
              "İlan Durumu": ilan.get(x.ilan_id)?.durum ?? "",
              "Ad Soyad": `${x.ad} ${x.soyad}`,
              Telefon: x.telefon ?? "",
              "E-posta": x.eposta ?? "",
              Kaynak: x.kaynak ?? "",
              Başvuru: x.basvuru,
              Aşama: x.asama,
              Puan: x.puan ?? "",
            })),
          };
        },
      },
    },

    // ------------------------------------------------------------ Kişiye özel belgeler
    { kod: "izinKarti", grup: "Kişiye özel belgeler", ad: "Yıllık izin kartı", aciklama: "Yasal izin kayıt belgesi: hak edilen ve kullanılan izinler, imza alanı.", tur: { tip: "kisi", yazdir: onIzinKarti } },
    {
      kod: "zimmetTutanagi",
      grup: "Kişiye özel belgeler",
      ad: "Zimmet teslim tutanağı",
      aciklama: "Personelin bütün zimmetli eşyaları, imza alanlarıyla.",
      modul: "zimmet",
      tur: {
        tip: "kisi",
        yazdir: async (p) => {
          const l = await sorgu<Zimmet>(supabase.from("zimmetler").select("*").eq("personel_id", p.id));
          const h = tutanakYazdir(yonetici.firma?.ad ?? "", p, l);
          if (h) bildir(h, "hata");
        },
      },
    },
    { kod: "katilim", grup: "Kişiye özel belgeler", ad: "Eğitim katılım formu", aciklama: "Bir eğitim oturumunun imzalı katılım listesi (Eğitim → Kayıtlar).", modul: "egitim", tur: { tip: "git", sekme: "ik", alt: "egitim" } },
    { kod: "perfFormu", grup: "Kişiye özel belgeler", ad: "Performans değerlendirme formu", aciklama: "Kişinin dönem değerlendirmesi, imza alanlarıyla (Performans ekranı).", modul: "performans", tur: { tip: "git", sekme: "ik", alt: "performans" } },
    { kod: "izinFormu", grup: "Kişiye özel belgeler", ad: "İzin formu", aciklama: "Tek bir izin talebinin imzalı formu (İzin talepleri → Form).", tur: { tip: "git", sekme: "talepler" } },
  ];

  const gorunen = raporlar.filter(
    (r) =>
      (!r.modul || modulAcik(yonetici.moduller, r.modul)) &&
      (!r.sadeceGenel || genel) &&
      (!ara.trim() || `${r.ad} ${r.aciklama} ${r.grup}`.toLocaleLowerCase("tr").includes(ara.trim().toLocaleLowerCase("tr")))
  );
  const gruplar = [...new Set(gorunen.map((r) => r.grup))];

  async function tabloIndir(r: Rapor, bicim: Bicim) {
    if (r.tur.tip !== "tablo") return;
    setCalisan(r.kod + bicim);
    const pencere = bicim === "pdf" ? window.open("", "_blank") : null;
    try {
      const ham = await r.tur.uret();
      const v = { ...ham, veriler: filtrele(ham.veriler) };
      if (!v.veriler.length) {
        pencere?.close();
        bildir(`${r.ad}: ${r.donemli ? `${donemEtiketi} için kayıt yok` : "henüz kayıt yok"}.`, "bilgi");
        return;
      }
      const h = disariAktar(bicim, v.baslik, v.dosyaAdi, v.veriler, v.sureSutunlari, pencere);
      if (h) bildir(h, "hata");
      else bildir(`${r.ad} hazırlandı (${v.veriler.length} satır).`, "basari");
    } catch (err) {
      pencere?.close();
      bildir(hataYaz(err), "hata");
    } finally {
      setCalisan(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="arama-kutu min-w-[220px] flex-1 sm:max-w-sm">
          <Ikon ad="ara" boyut={16} />
          <input className="girdi girdi-sik" placeholder="Rapor ara (ör. izin, mesai, zimmet)" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Rapor ara" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: 220 }} role="radiogroup" aria-label="Dönem türü">
            <button type="button" role="radio" aria-checked={mod === "ay"} data-aktif={mod === "ay"} onClick={() => setMod("ay")}>
              Ay
            </button>
            <button type="button" role="radio" aria-checked={mod === "aralik"} data-aktif={mod === "aralik"} onClick={() => setMod("aralik")}>
              Tarih aralığı
            </button>
          </div>
          {mod === "ay" ? (
            <input type="month" className="girdi girdi-sik sayi" style={{ width: 170 }} value={seciliAy} onChange={(e) => e.target.value && onAyDegis(e.target.value)} aria-label="Ay" />
          ) : (
            <>
              <input type="date" className="girdi girdi-sik sayi" style={{ width: 150 }} value={aralik.bas} max={aralik.bit || undefined} onChange={(e) => setAralik({ ...aralik, bas: e.target.value })} aria-label="Başlangıç tarihi" />
              <span className="m3">–</span>
              <input type="date" className="girdi girdi-sik sayi" style={{ width: 150 }} value={aralik.bit} min={aralik.bas || undefined} onChange={(e) => setAralik({ ...aralik, bit: e.target.value })} aria-label="Bitiş tarihi" />
            </>
          )}
        </div>
      </div>
      {(departmanlar.length > 0 || unvanlar.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="m2 text-xs font-semibold">Personel filtresi</span>
          <select className="girdi girdi-sik" style={{ width: "auto", minWidth: 170 }} value={departman} onChange={(e) => setDepartman(e.target.value)} aria-label="Departman">
            <option value="">Tüm departmanlar</option>
            {departmanlar.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className="girdi girdi-sik" style={{ width: "auto", minWidth: 170 }} value={unvan} onChange={(e) => setUnvan(e.target.value)} aria-label="Ünvan">
            <option value="">Tüm ünvanlar</option>
            {unvanlar.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {(departman || unvan) && (
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => (setDepartman(""), setUnvan(""))}>
              Temizle
            </button>
          )}
        </div>
      )}
      {mod === "aralik" && !aralikGecerli && <p className="text-sm" style={{ color: "var(--hata)" }}>Başlangıç tarihi bitişten sonra olamaz.</p>}
      <p className="m3 text-xs">
        Dönemli raporlar {donemEtiketi} için hazırlanır{mod === "aralik" ? "; bordro dosyaları yalnızca aylık alınır (Ay seçin)" : ""}. Üstteki şube seçimi puantaj, hareket, personel ve izin raporlarına; departman ve ünvan filtresi sicil numarası olan raporlara uygulanır. Onay gerektiren kayıtlardan (izin, fazla mesai, avans, masraf) yalnızca onaylananlar raporlanır. Raporlar T.C.
        kimlik gibi kişisel veri içerebilir; paylaşırken dikkat edin.
      </p>

      {gruplar.length === 0 && <p className="m2 text-sm">Aramayla eşleşen rapor yok.</p>}

      {gruplar.map((g) => (
        <section key={g}>
          <h3 className="baslik-font m1 mb-2 flex items-center gap-2 text-lg">
            <Ikon ad={GRUP_IKON[g] ?? "rapor"} boyut={18} />
            {g}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {gorunen
              .filter((r) => r.grup === g)
              .map((r) => (
                <div key={r.kod} className="panel flex flex-col gap-3 p-4">
                  <div className="flex-1">
                    <p className="m1 font-semibold">
                      {r.ad}
                      {r.donemli && <span className="m3 ml-2 text-xs font-normal">{r.sadeceAylik ? ayAdi(seciliAy) : donemEtiketi}</span>}
                    </p>
                    <p className="m2 mt-1 text-sm">{r.aciklama}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mod === "aralik" && r.sadeceAylik ? (
                      <span className="m3 text-xs">Yalnızca aylık: üstten &quot;Ay&quot; seçin.</span>
                    ) : null}
                    {r.tur.tip === "tablo" && !(mod === "aralik" && r.sadeceAylik) && (
                      <>
                        <button type="button" className="btn btn-ana btn-kucuk" disabled={!!calisan || (mod === "aralik" && !aralikGecerli)} onClick={() => tabloIndir(r, "xlsx")}>
                          <Ikon ad="indir" boyut={14} />
                          {calisan === r.kod + "xlsx" ? "Hazırlanıyor..." : "Excel"}
                        </button>
                        <button type="button" className="btn btn-ikincil btn-kucuk" disabled={!!calisan || (mod === "aralik" && !aralikGecerli)} onClick={() => tabloIndir(r, "pdf")}>
                          <Ikon ad="rapor" boyut={14} />
                          {calisan === r.kod + "pdf" ? "Hazırlanıyor..." : "PDF"}
                        </button>
                      </>
                    )}
                    {r.tur.tip === "ozel" && !(mod === "aralik" && r.sadeceAylik) && (
                      <button
                        type="button"
                        className="btn btn-ana btn-kucuk"
                        onClick={() => {
                          if (r.tur.tip === "ozel") r.tur.calistir();
                        }}
                      >
                        <Ikon ad="indir" boyut={14} />
                        Excel
                      </button>
                    )}
                    {r.tur.tip === "kisi" && (
                      <button type="button" className="btn btn-ana btn-kucuk" onClick={() => setKisiSecimi(r)}>
                        <Ikon ad="personel" boyut={14} />
                        Personel seç ve yazdır
                      </button>
                    )}
                    {r.tur.tip === "git" && !(mod === "aralik" && r.sadeceAylik) && (
                      <button
                        type="button"
                        className="btn btn-ikincil btn-kucuk"
                        onClick={() => {
                          if (r.tur.tip === "git") onGit(r.tur.sekme, r.tur.alt);
                        }}
                      >
                        Ekrana git
                        <Ikon ad="sag" boyut={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}

      {kisiSecimi && kisiSecimi.tur.tip === "kisi" && (
        <KisiSec
          baslik={kisiSecimi.ad}
          personeller={personeller}
          onKapat={() => setKisiSecimi(null)}
          onSec={async (p) => {
            const r = kisiSecimi;
            setKisiSecimi(null);
            if (r.tur.tip === "kisi") await r.tur.yazdir(p);
          }}
        />
      )}
    </div>
  );
}

function KisiSec({ baslik, personeller, onKapat, onSec }: { baslik: string; personeller: Personel[]; onKapat: () => void; onSec: (p: Personel) => void }) {
  const [ara, setAra] = useState("");
  const q = ara.trim().toLocaleLowerCase("tr");
  const liste = [...personeller]
    .filter((p) => !q || `${p.ad} ${p.soyad} ${p.sicil_no}`.toLocaleLowerCase("tr").includes(q))
    .sort((a, b) => Number(b.aktif) - Number(a.aktif) || `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));
  return (
    <Modal onKapat={onKapat} baslik={baslik}>
      <div className="space-y-3">
        <input className="girdi" placeholder="Personel ara" autoFocus value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Personel ara" />
        <ul className="panel liste max-h-80 overflow-y-auto">
          {liste.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left" onClick={() => onSec(p)}>
                <span className="m1 text-sm font-medium">
                  {p.ad} {p.soyad}
                  <span className="m3 ml-2 text-xs">{p.sicil_no}</span>
                </span>
                {!p.aktif && <span className="m3 text-xs">{p.cikis_tarihi ? `Ayrıldı ${kisaTarih(p.cikis_tarihi)}` : "Pasif"}</span>}
              </button>
            </li>
          ))}
          {liste.length === 0 && <li className="m3 px-4 py-3 text-sm">Personel bulunamadı.</li>}
        </ul>
      </div>
    </Modal>
  );
}
