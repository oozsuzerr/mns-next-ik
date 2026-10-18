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
  /** Seçili aya göre mi */
  donemli?: boolean;
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
  /** Ana sayfanın ürettiği çekirdek raporlar (puantaj, hareketler, personel...) */
  cekirdek: (kod: string) => RaporVerisi;
  onBordroAktarim?: () => void;
  onIzinKarti: (p: Personel) => void;
  onGit: (sekme: Sekme, alt?: string) => void;
}) {
  const { bildir } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const [ara, setAra] = useState("");
  const [calisan, setCalisan] = useState<string | null>(null);
  const [kisiSecimi, setKisiSecimi] = useState<Rapor | null>(null);
  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);
  const ad = (id: string) => {
    const p = kisiler.get(id);
    return p ? `${p.ad} ${p.soyad}` : "-";
  };
  const sicil = (id: string) => kisiler.get(id)?.sicil_no ?? "-";
  const ayAraligi = () => {
    const [y, m] = seciliAy.split("-").map(Number);
    return { bas: `${seciliAy}-01`, son: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) };
  };
  const ek = `MNS_Next_IK_${yerelTarih()}`;

  /** Tablo sorgusu: hata varsa (modül kurulmamış vb.) anlaşılır mesajla durur */
  async function sorgu<T>(istek: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await istek;
    if (error) throw new Error(hataYaz(error));
    return (data ?? []) as T[];
  }

  const raporlar: Rapor[] = [
    // ------------------------------------------------------------ Puantaj ve devam
    { kod: "puantaj", grup: "Puantaj ve devam", ad: "Aylık puantaj ve bordro cetveli", aciklama: "Kişi başı çalışılan, izinli, raporlu, devamsız günler; çalışma ve mesai süreleri.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("puantaj") } },
    { kod: "ayrintili", grup: "Puantaj ve devam", ad: "Ayrıntılı devam çizelgesi", aciklama: "Her personelin gün gün giriş, çıkış, net çalışma ve durumu.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("ayrintili") } },
    { kod: "hareketler", grup: "Puantaj ve devam", ad: "Giriş-çıkış hareketleri", aciklama: "Bütün mobil ve manuel giriş/çıkış kayıtları, konum mesafesiyle.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("hareketler") } },
    { kod: "gecikme", grup: "Puantaj ve devam", ad: "Geç kalma ve devamsızlık", aciklama: "Toplam gecikme süresi, devamsız ve eksik hareketli günler.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("gecikme") } },
    { kod: "gunluk", grup: "Puantaj ve devam", ad: "Günlük devam durumu (bugün)", aciklama: "Bugün içeride, çıkmış, izinli ve gelmeyen personel.", tur: { tip: "tablo", uret: () => cekirdek("gunluk") } },
    ...(onBordroAktarim
      ? [{ kod: "bordroAktarim", grup: "Puantaj ve devam", ad: "Bordro aktarım dosyası", aciklama: "Muhasebe/bordro programına aktarım: SGK günleri, ücret, mesai saatleri, avans/masraf.", donemli: true, tur: { tip: "ozel" as const, calistir: onBordroAktarim } }]
      : []),
    { kod: "tahminiBordro", grup: "Puantaj ve devam", ad: "Tahmini bordro", aciklama: "Brüt, kesintiler, net ve işveren maliyeti (ekranında Excel).", modul: "bordro", sadeceGenel: true, tur: { tip: "git", sekme: "ik", alt: "bordro" } },

    // ------------------------------------------------------------ İzin ve fazla mesai
    { kod: "talepler", grup: "İzin ve fazla mesai", ad: "İzin ve rapor talepleri", aciklama: "Bütün izin, rapor ve saatlik izin kayıtları, onay durumlarıyla.", tur: { tip: "tablo", uret: () => cekirdek("talepler") } },
    { kod: "izinBakiye", grup: "İzin ve fazla mesai", ad: "Yıllık izin bakiyeleri", aciklama: "Kıdem, devreden, hak edilen, kullanılan ve kalan yıllık izin.", tur: { tip: "tablo", uret: () => cekirdek("izinBakiye") } },
    { kod: "mesai", grup: "İzin ve fazla mesai", ad: "Fazla mesai talepleri", aciklama: "Ayın fazla mesai bildirimleri, süreleri ve kararları.", donemli: true, tur: { tip: "tablo", uret: () => cekirdek("mesai") } },

    // ------------------------------------------------------------ Personel
    { kod: "personel", grup: "Personel", ad: "Personel listesi", aciklama: "Bütün personel: sicil, T.C., şube, vardiya, giriş/çıkış tarihi, durum.", tur: { tip: "tablo", uret: () => cekirdek("personel") } },
    { kod: "vardiya", grup: "Personel", ad: "Vardiya listesi", aciklama: "Vardiyalar, saatleri ve molaları.", tur: { tip: "tablo", uret: () => cekirdek("vardiya") } },
    ...(genel ? [{ kod: "subeler", grup: "Personel", ad: "Şube listesi", aciklama: "Şubeler, konumları ve personel sayıları.", tur: { tip: "tablo" as const, uret: () => cekirdek("subeler") } }] : []),

    // ------------------------------------------------------------ İK işlemleri
    {
      kod: "gorevler",
      grup: "İK işlemleri",
      ad: "Görevler",
      aciklama: "Ayda verilen görevler, durumları, son tarihleri ve personel notları.",
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
            baslik: `Görevler (${seciliAy})`,
            dosyaAdi: `${ek}_Gorevler_${seciliAy}`,
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
            veriler: l.filter((z) => kisiler.has(z.personel_id)).map((z, i) => ({
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
      ad: "Avans ve masraf",
      aciklama: "Ayın avans ve masraf kayıtları, onay ve ödeme durumları.",
      donemli: true,
      modul: "odeme",
      tur: {
        tip: "tablo",
        uret: async () => {
          const { bas, son } = ayAraligi();
          const l = await sorgu<{ personel_id: string; tur: string; tutar: number; tarih: string; kategori: string | null; aciklama: string | null; durum: string; odeme_tarihi: string | null; kaynak: string }>(
            supabase.from("odeme_talepleri").select("*").gte("tarih", bas).lt("tarih", son).order("tarih")
          );
          return {
            baslik: `Avans ve Masraf (${seciliAy})`,
            dosyaAdi: `${ek}_Avans_Masraf_${seciliAy}`,
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
      kod: "egitim",
      grup: "İK işlemleri",
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
            veriler: kayitlar.filter((k) => kisiler.has(k.personel_id)).map((k, i) => ({
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
              .filter((x) => kisiler.has(x.personel_id))
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
            veriler: d.map((x, i) => {
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
            veriler: a.map((x, i) => ({
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
    try {
      const v = await r.tur.uret();
      if (!v.veriler.length) {
        bildir(`${r.ad}: ${r.donemli ? `${ayAdi(seciliAy)} için kayıt yok` : "henüz kayıt yok"}.`, "bilgi");
        return;
      }
      const h = disariAktar(bicim, v.baslik, v.dosyaAdi, v.veriler, v.sureSutunlari);
      if (h) bildir(h, "hata");
      else bildir(`${r.ad} hazırlandı (${v.veriler.length} satır).`, "basari");
    } catch (err) {
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
        <label className="m2 ml-auto flex items-center gap-2 text-sm">
          Dönem
          <input type="month" className="girdi girdi-sik sayi" style={{ width: 170 }} value={seciliAy} onChange={(e) => e.target.value && onAyDegis(e.target.value)} aria-label="Dönem" />
        </label>
      </div>
      <p className="m3 text-xs">
        Dönemli raporlar {ayAdi(seciliAy)} için hazırlanır. Üstteki şube seçimi puantaj, hareket, personel ve izin raporlarına uygulanır. Raporlar T.C.
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
                      {r.donemli && <span className="m3 ml-2 text-xs font-normal">{ayAdi(seciliAy)}</span>}
                    </p>
                    <p className="m2 mt-1 text-sm">{r.aciklama}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.tur.tip === "tablo" && (
                      <>
                        <button type="button" className="btn btn-ana btn-kucuk" disabled={!!calisan} onClick={() => tabloIndir(r, "xlsx")}>
                          <Ikon ad="indir" boyut={14} />
                          {calisan === r.kod + "xlsx" ? "Hazırlanıyor..." : "Excel"}
                        </button>
                        <button type="button" className="btn btn-ikincil btn-kucuk" disabled={!!calisan} onClick={() => tabloIndir(r, "pdf")}>
                          <Ikon ad="rapor" boyut={14} />
                          {calisan === r.kod + "pdf" ? "Hazırlanıyor..." : "PDF"}
                        </button>
                      </>
                    )}
                    {r.tur.tip === "ozel" && (
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
                    {r.tur.tip === "git" && (
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
