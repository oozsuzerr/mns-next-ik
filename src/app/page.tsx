"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { aylikPuantajHesapla, type PuantajSatiri } from "../lib/puantaj";
import { disariAktar, type Bicim, type Satir } from "../lib/disaAktar";
import {
  PERSONEL_KOLONLARI,
  hataYaz,
  tumunuGetir,
  type BugunHareket,
  type Hareket,
  type Izin,
  type Personel,
  type ResmiTatil,
  type Sekme,
  type Sube,
  type Vardiya,
  type IzinBakiyesi,
  type MesaiTalebi,
  type CihazTalebi,
  type Yetki,
  type YoneticiBilgisi,
} from "../lib/tipler";
import { ayarlariTamamla, DK_MS, VARSAYILAN_AYARLAR, type Ayarlar } from "../lib/ayarlar";
import { ayAdi, ayAraligi, kisaTarih, yerelSaat, yerelTarih } from "../lib/tarih";
import { cikisiEksikGirisler, suankiGiris } from "../lib/mesai";
import { gunEkle, gunPlani, planHaritasi, vardiyaCozucu, type PlanSatiri } from "../lib/vardiyaPlani";
import { AcilirMenu, Bos, Ikon, Marka, useBildirim, type IkonAdi } from "../components/ui";
import BugunSerit, { type BugunOzet } from "../components/panel/BugunSerit";
import PuantajSekmesi from "../components/panel/PuantajSekmesi";
import PuantajKarti from "../components/panel/PuantajKarti";
import TaleplerSekmesi from "../components/panel/TaleplerSekmesi";
import LoglarSekmesi from "../components/panel/LoglarSekmesi";
import PersonelSekmesi from "../components/panel/PersonelSekmesi";
import VardiyaSekmesi from "../components/panel/VardiyaSekmesi";
import VardiyaPlani from "../components/panel/VardiyaPlani";
import PanelKullanicilari from "../components/panel/PanelKullanicilari";
import IslemGecmisi from "../components/panel/IslemGecmisi";
import AyarlarSekmesi from "../components/panel/AyarlarSekmesi";
import MesaiSekmesi from "../components/panel/MesaiSekmesi";
import CihazTalepleriSekmesi from "../components/panel/CihazTalepleriSekmesi";
import BildirimDugmesi from "../components/BildirimDugmesi";
import { olayBildir } from "../lib/bildirim";
import {
  CikisEksikListesi,
  RedFormu,
  GelmeyenlerListesi,
  IzinBilgileriFormu,
  IzinFormu,
  ManuelFormu,
  type CikisEksikSatiri,
  type ManuelBaslangic,
  PersonelFormu,
  PinFormu,
  VardiyaFormu,
} from "../components/panel/Formlar";

const SEKMELER: { id: Sekme; etiket: string; kisa: string; ikon: IkonAdi }[] = [
  { id: "bakis", etiket: "Genel bakış", kisa: "Bakış", ikon: "bakis" },
  { id: "puantaj", etiket: "Puantaj", kisa: "Puantaj", ikon: "puantaj" },
  { id: "talepler", etiket: "İzin talepleri", kisa: "Talepler", ikon: "talepler" },
  { id: "genel", etiket: "Hareketler", kisa: "Hareket", ikon: "hareket" },
  { id: "personel", etiket: "Personel", kisa: "Personel", ikon: "personel" },
  { id: "vardiya", etiket: "Vardiyalar", kisa: "Vardiya", ikon: "vardiya" },
];

// =====================================================================
// 1) GİRİŞ KAPISI (Supabase Auth)
// =====================================================================
export default function Home() {
  const [oturum, setOturum] = useState<Session | null>(null);
  const [hazir, setHazir] = useState(false);
  // Yetki sonucu, sorgulandığı kullanıcıyla birlikte tutulur; kullanıcı değişince otomatik geçersiz olur
  const [yetki, setYetki] = useState<{ id: string; bilgi: YoneticiBilgisi | false } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setOturum(data.session);
      setHazir(true);
    });
    const { data: abone } = supabase.auth.onAuthStateChange((_olay, s) => {
      setOturum(s);
    });
    return () => abone.subscription.unsubscribe();
  }, []);

  const kullaniciId = oturum?.user.id;
  const yonetici = kullaniciId && yetki?.id === kullaniciId ? yetki.bilgi : null;

  useEffect(() => {
    if (!kullaniciId) return;
    yetkiGetir().then((bilgi) => setYetki({ id: kullaniciId, bilgi }));
  }, [kullaniciId]);

  async function cikisYap() {
    await supabase.auth.signOut();
  }

  if (!hazir) return <div className="min-h-screen" />;
  if (!oturum) return <YoneticiGiris />;

  if (yonetici === null) {
    return (
      <div className="m2 flex min-h-screen items-center justify-center text-sm">Yetki kontrol ediliyor...</div>
    );
  }

  if (!yonetici) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="panel w-full max-w-sm space-y-4 p-7 text-center">
          <div className="bos-ikon mx-auto flex h-12 w-12 items-center justify-center rounded-full">
            <Ikon ad="kilit" boyut={22} />
          </div>
          <h2 className="baslik-font m1 text-xl">Yönetici yetkisi yok</h2>
          <p className="m2 text-sm">
            {oturum.user.email} hesabı yönetici olarak tanımlı değil. Sistem yöneticisinden yetki isteyin.
          </p>
          <button onClick={cikisYap} className="btn btn-ana w-full">
            Çıkış yap
          </button>
        </div>
      </div>
    );
  }

  return <Panel eposta={oturum.user.email || ""} yetki={yonetici} onCikis={cikisYap} />;
}

/**
 * Giriş yapan kullanıcının panel rolü; panel kullanıcısı değilse false.
 * Rol SQL'i henüz çalıştırılmadıysa (yonetici_bilgisi yok) eski is_admin kontrolüne düşer.
 */
async function yetkiGetir(): Promise<YoneticiBilgisi | false> {
  const { data, error } = await supabase.rpc("yonetici_bilgisi");
  if (!error) {
    if (!data) return false;
    const b = data as Partial<YoneticiBilgisi> & Pick<YoneticiBilgisi, "rol">;
    return {
      rol: b.rol,
      ad: b.ad ?? null,
      subeler: b.subeler ?? [],
      yetkiler: b.yetkiler ?? (b.rol === "SUBE" ? ["plan", "izin", "manuel", "cihaz"] : []),
    };
  }
  const eski = await supabase.rpc("is_admin");
  return !eski.error && eski.data === true ? { rol: "GENEL", ad: null, subeler: [], yetkiler: [] } : false;
}

function YoneticiGiris() {
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [goster, setGoster] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function girisYap(e: FormEvent) {
    e.preventDefault();
    setYukleniyor(true);
    setHata(null);
    const { error } = await supabase.auth.signInWithPassword({ email: eposta.trim(), password: sifre });
    if (error) setHata("E-posta veya şifre hatalı.");
    setYukleniyor(false);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="yan-serit hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Marka boyut={40} />
          <span className="baslik-font text-xl">MNS Next IK</span>
        </div>
        <div>
          <h1 className="baslik-font text-5xl leading-[1.05]">
            Kim geldi, kim gelmedi,
            <br />
            tek bakışta.
          </h1>
          <p className="mt-5 max-w-md text-base" style={{ color: "rgba(255,255,255,0.7)" }}>
            GPS ile giriş-çıkış, otomatik puantaj ve izin onayı tek yerde.
          </p>
        </div>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Personel misiniz?{" "}
          <a href="/mobil" className="underline">
            Mobil giriş sayfasına gidin
          </a>
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={girisYap} className="w-full max-w-sm space-y-5">
          <div className="flex items-center gap-3 lg:hidden">
            <Marka boyut={40} />
            <span className="baslik-font m1 text-xl">MNS Next IK</span>
          </div>
          <div>
            <h2 className="baslik-font m1 text-3xl">Yönetici girişi</h2>
            <p className="m2 mt-1 text-sm">E-posta adresiniz ve şifrenizle devam edin.</p>
          </div>

          <div>
            <label className="etiket" htmlFor="eposta">
              E-posta
            </label>
            <input
              id="eposta"
              type="email"
              required
              autoComplete="username"
              className="girdi"
              value={eposta}
              onChange={(e) => setEposta(e.target.value)}
            />
          </div>
          <div>
            <label className="etiket" htmlFor="sifre">
              Şifre
            </label>
            <div className="relative">
              <input
                id="sifre"
                type={goster ? "text" : "password"}
                required
                autoComplete="current-password"
                className="girdi"
                style={{ paddingRight: 44 }}
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setGoster(!goster)}
                className="btn btn-hayalet btn-ikon btn-kucuk absolute right-1.5 top-1/2 -translate-y-1/2"
                aria-label={goster ? "Şifreyi gizle" : "Şifreyi göster"}
              >
                <Ikon ad={goster ? "gozkapali" : "goz"} boyut={16} />
              </button>
            </div>
          </div>

          {hata && (
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--hata)" }} role="alert">
              <Ikon ad="uyari" boyut={16} />
              {hata}
            </p>
          )}

          <button type="submit" disabled={yukleniyor} className="btn btn-ana btn-buyuk w-full">
            {yukleniyor ? "Giriş yapılıyor..." : "Giriş yap"}
          </button>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// 2) GENEL BAKIŞ
// =====================================================================
/** Telefonda genel bakışın üstünde: en sık yapılan işlere tek dokunuşla ulaşım */
function HizliIslemler({
  cikisEksik,
  bekleyen,
  gelmeyen,
  onCikisEksik,
  onTalepler,
  onGelmeyenler,
  onManuel,
  onPlan,
}: {
  cikisEksik: number;
  bekleyen: number;
  gelmeyen: number;
  onCikisEksik: () => void;
  onTalepler: () => void;
  onGelmeyenler: () => void;
  onManuel?: () => void;
  onPlan: () => void;
}) {
  const kutular: { etiket: string; sayi?: number; ikon: IkonAdi; acil?: boolean; eylem: () => void }[] = [
    { etiket: "Eksik çıkış", sayi: cikisEksik, ikon: "uyari", acil: cikisEksik > 0, eylem: onCikisEksik },
    { etiket: "Onay bekleyen", sayi: bekleyen, ikon: "talepler", acil: bekleyen > 0, eylem: onTalepler },
    { etiket: "Henüz gelmeyen", sayi: gelmeyen, ikon: "personel", eylem: onGelmeyenler },
    onManuel
      ? { etiket: "Manuel giriş/çıkış", ikon: "kalem", eylem: onManuel }
      : { etiket: "Vardiya planı", ikon: "vardiya", eylem: onPlan },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 lg:hidden" aria-label="Hızlı işlemler">
      {kutular.map((k) => (
        <button key={k.etiket} type="button" className="hizli-kutu" data-acil={!!k.acil} onClick={k.eylem}>
          <span className="flex items-center justify-between">
            <Ikon ad={k.ikon} boyut={20} />
            {k.sayi !== undefined && <span className="baslik-font sayi text-2xl">{k.sayi}</span>}
          </span>
          <span className="text-sm font-semibold">{k.etiket}</span>
        </button>
      ))}
    </section>
  );
}

function DikkatListesi({
  cikisEksik,
  bekleyen,
  pinsiz,
  eksik,
  devamsiz,
  donem,
  onGit,
  onCikisEksik,
}: {
  cikisEksik: number;
  bekleyen: number;
  pinsiz: number;
  eksik: number;
  devamsiz: number;
  donem: string;
  onGit: (s: Sekme) => void;
  onCikisEksik: () => void;
}) {
  const maddeler: { ikon: IkonAdi; metin: string; etiket: string; acil?: boolean; eylem: () => void }[] = [];
  if (cikisEksik > 0)
    maddeler.push({
      ikon: "uyari",
      metin: `${cikisEksik} girişin çıkış kaydı yok: personel çıkış basmayı unutmuş`,
      etiket: "Listeyi aç",
      acil: true,
      eylem: onCikisEksik,
    });
  if (bekleyen > 0)
    maddeler.push({ ikon: "talepler", metin: `${bekleyen} talep onayınızı bekliyor`, etiket: "İncele", eylem: () => onGit("talepler") });
  if (pinsiz > 0)
    maddeler.push({
      ikon: "anahtar",
      metin: `${pinsiz} personelin mobil PIN'i yok, giriş yapamaz`,
      eylem: () => onGit("personel"),
      etiket: "PIN belirle",
    });
  if (eksik > 0)
    maddeler.push({
      ikon: "uyari",
      metin: `${donem} döneminde ${eksik} gün eksik giriş veya çıkış kaydı var`,
      eylem: () => onGit("puantaj"),
      etiket: "Puantaja bak",
    });
  if (devamsiz > 0)
    maddeler.push({
      ikon: "takvim",
      metin: `${donem} döneminde toplam ${devamsiz} devamsız gün var`,
      eylem: () => onGit("puantaj"),
      etiket: "Puantaja bak",
    });

  return (
    <section className="panel overflow-hidden">
      <div className="px-5 pb-2 pt-5">
        <h3 className="baslik-font m1 text-lg">Dikkat gerektirenler</h3>
      </div>
      {maddeler.length === 0 ? (
        <Bos ikon="tik" baslik="Her şey yolunda" metin="Onay bekleyen talep, eksik kayıt ya da PIN'siz personel yok." />
      ) : (
        <ul className="liste">
          {maddeler.map((m) => (
            <li key={m.metin} className="flex items-center gap-3 px-5 py-3.5">
              <span
                className="bos-ikon flex h-9 w-9 flex-none items-center justify-center rounded-full"
                style={m.acil ? { background: "var(--hata-acik)", color: "var(--hata)" } : undefined}
              >
                <Ikon ad={m.ikon} boyut={17} />
              </span>
              <p className="m1 flex-1 text-sm font-medium" style={m.acil ? { color: "var(--hata)" } : undefined}>
                {m.metin}
              </p>
              <button type="button" className={`btn btn-kucuk ${m.acil ? "btn-tehlike" : "btn-ikincil"}`} onClick={m.eylem}>
                {m.etiket}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// =====================================================================
// 3) PANEL
// =====================================================================
type FormDurumu =
  | { tur: "personel" }
  | { tur: "pin"; hedef: Personel }
  | { tur: "vardiya"; duzenlenen: Vardiya | null }
  | { tur: "izin" }
  | { tur: "manuel"; baslangic?: ManuelBaslangic }
  | { tur: "gelmeyen" }
  | { tur: "cikisEksik" }
  | { tur: "izinBilgi"; hedef: Personel }
  | { tur: "red"; talep: "izin" | "mesai"; id: string; ozet: string }
  | null;

/** Çıkışı eksik girişler bu kadar gün geriye kadar aranır */
const CIKIS_EKSIK_GUN = 31;

/** Puantaj raporunda dakika tutulup saat:dakika yazılan sütunlar */
const PUANTAJ_SURE = [
  "Toplam Net Çalışma (sa:dk)",
  "Plan Dışı Mesai (sa:dk)",
  "Resmi Tatil Mesaisi (sa:dk)",
  "Hafta Tatili Mesaisi (sa:dk)",
  "Gecikme (sa:dk)",
] as const;
const MESAI_SURE = "Süre (sa:dk)";

// Panelin seçili aya ait tüm verilerini çeker; hata olursa fırlatır
async function paneliGetir(seciliAy: string) {
  const { bas, son } = ayAraligi(seciliAy);
  const gun = 24 * 60 * 60 * 1000;
  // Gece vardiyası eşleştirmesi için ayın bir gün öncesi ve sonrası da alınır
  const aralikBas = new Date(bas.getTime() - gun).toISOString();
  const aralikSon = new Date(son.getTime() + gun).toISOString();
  // Bugünkü durum ve çıkışı eksik girişler için son CIKIS_EKSIK_GUN günün hareketleri
  const bugunBas = new Date(new Date(`${yerelTarih()}T00:00:00+03:00`).getTime() - CIKIS_EKSIK_GUN * gun).toISOString();
  // Vardiya planı: puantaj ayı ve son CIKIS_EKSIK_GUN gün (iki yanda birer gün payla)
  const bugun = yerelTarih();
  const planBas = [yerelTarih(aralikBas), gunEkle(bugun, -CIKIS_EKSIK_GUN - 1)].sort()[0];
  const planSon = [yerelTarih(aralikSon), gunEkle(bugun, 1)].sort()[1];

  const ayIlk = `${seciliAy}-01`;
  const aySon = gunEkle(`${gunEkle(`${seciliAy}-28`, 7).slice(0, 7)}-01`, -1);
  const [subeD, varD, perler, harler, bugunD, izler, tatD, planlar, kilitD, ayarD, bakiyeD, mesaiD, cihazD] = await Promise.all([
    supabase.from("subeler").select("*").order("created_at", { ascending: true }),
    supabase.from("vardiyalar").select("*").order("created_at", { ascending: true }),
    tumunuGetir<Personel>((a, b) =>
      supabase
        .from("personeller")
        .select(PERSONEL_KOLONLARI)
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b)
    ),
    tumunuGetir<Hareket>((a, b) =>
      supabase
        .from("hareketler")
        .select(`*, personeller (ad, soyad, sicil_no, tc_kimlik), subeler (ad)`)
        .gte("created_at", aralikBas)
        .lt("created_at", aralikSon)
        .order("created_at", { ascending: true })
        .order("id")
        .range(a, b)
    ),
    tumunuGetir<BugunHareket>((a, b) =>
      supabase
        .from("hareketler")
        .select("id, personel_id, sube_id, islem_turu, created_at")
        .gte("created_at", bugunBas)
        .order("created_at", { ascending: true })
        .order("id")
        .range(a, b)
    ),
    tumunuGetir<Izin>((a, b) =>
      supabase
        .from("izinler")
        .select(`*, personeller (ad, soyad, sicil_no)`)
        .order("baslangic_tarihi", { ascending: false })
        .order("id")
        .range(a, b)
    ),
    supabase.from("resmi_tatiller").select("*").order("tarih", { ascending: true }),
    // Plan okunamazsa (ör. tablo yok) panel çalışmaya devam eder; varsayılan vardiyalar kullanılır
    tumunuGetir<PlanSatiri>((a, b) =>
      supabase
        .from("vardiya_plani")
        .select("id, personel_id, tarih, tur, vardiya_id, sube_id")
        .gte("tarih", planBas)
        .lte("tarih", planSon)
        .order("tarih")
        .order("id")
        .range(a, b)
    ).catch(() => [] as PlanSatiri[]),
    // Kapanmış aylar (tablo yoksa boş)
    Promise.resolve(supabase.from("ay_kilitleri").select("ay")).catch(() => ({ data: null })),
    // Tolerans ayarları ve yıllık izin bakiyeleri (okunamazsa varsayılan / boş)
    Promise.resolve(supabase.from("sirket_ayarlari").select("*").maybeSingle()).catch(() => ({ data: null })),
    Promise.resolve(supabase.rpc("izin_bakiyeleri")).catch(() => ({ data: null })),
    // Fazla mesai: tüm bekleyenler ve seçili ayın kayıtları (tablo yoksa boş)
    tumunuGetir<MesaiTalebi>((a, b) =>
      supabase
        .from("mesai_talepleri")
        .select("*, personeller (ad, soyad, sicil_no, varsayilan_sube_id)")
        .or(`durum.eq.BEKLEMEDE,and(tarih.gte.${ayIlk},tarih.lte.${aySon})`)
        .order("tarih", { ascending: false })
        .order("id")
        .range(a, b)
    ).catch(() => [] as MesaiTalebi[]),
    // Bekleyen yeni telefon talepleri (yalnızca "cihaz" yetkilisine görünür; tablo yoksa boş)
    Promise.resolve(
      supabase
        .from("cihaz_talepleri")
        .select("id, personel_id, cihaz_bilgisi, durum, created_at, personeller (ad, soyad, sicil_no, varsayilan_sube_id)")
        .eq("durum", "BEKLEMEDE")
        .order("created_at", { ascending: false })
    ).catch(() => ({ data: null })),
  ]);

  if (subeD.error) throw subeD.error;
  if (varD.error) throw varD.error;
  if (tatD.error) throw tatD.error;

  return {
    subeler: (subeD.data ?? []) as Sube[],
    vardiyalar: (varD.data ?? []) as Vardiya[],
    personeller: perler,
    hareketler: harler,
    bugunHareketleri: bugunD,
    izinler: izler,
    resmiTatiller: (tatD.data ?? []) as ResmiTatil[],
    planlar,
    kilitliAylar: ((kilitD.data ?? []) as { ay: string }[]).map((k) => k.ay),
    ayarlar: ayarlariTamamla(ayarD.data as Partial<Ayarlar> | null),
    bakiyeler: (bakiyeD.data ?? {}) as Record<string, IzinBakiyesi>,
    mesaiTalepleri: mesaiD,
    cihazTalepleri: (cihazD.data ?? []) as unknown as CihazTalebi[],
  };
}

function Panel({ eposta, yetki, onCikis }: { eposta: string; yetki: YoneticiBilgisi; onCikis: () => void }) {
  const { bildir, onayla } = useBildirim();
  // Şube müdürü yalnızca kendi şubelerini görür (veritabanı kuralları da bunu zorunlu kılar)
  const genel = yetki.rol === "GENEL";
  /** Genel yönetici her şeye, şube müdürü yalnızca kendisine verilen yetkilere sahiptir */
  const yetkili = (y: Yetki) => genel || yetki.yetkiler.includes(y);

  // Panel telefona "ana ekrana ekle" ile eklenirken personel uygulaması (/mobil) yerine
  // panel açılsın diye bu sayfada ayrı uygulama tanımı kullanılır
  useEffect(() => {
    const baglanti = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const baslik = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const eskiAdres = baglanti?.getAttribute("href");
    const eskiBaslik = baslik?.getAttribute("content");
    baglanti?.setAttribute("href", "/panel.webmanifest");
    baslik?.setAttribute("content", "MNS Yönetim");
    return () => {
      if (baglanti && eskiAdres) baglanti.setAttribute("href", eskiAdres);
      if (baslik && eskiBaslik) baslik.setAttribute("content", eskiBaslik);
    };
  }, []);
  const bugunTarih = yerelTarih();

  const [aktifSekme, setAktifSekme] = useState<Sekme>("bakis");
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [bugunHareketleri, setBugunHareketleri] = useState<BugunHareket[]>([]);
  const [vardiyalar, setVardiyalar] = useState<Vardiya[]>([]);
  const [izinler, setIzinler] = useState<Izin[]>([]);
  const [resmiTatiller, setResmiTatiller] = useState<ResmiTatil[]>([]);
  const [planlar, setPlanlar] = useState<PlanSatiri[]>([]);
  const [kilitliAylar, setKilitliAylar] = useState<string[]>([]);
  const [ayarlar, setAyarlar] = useState<Ayarlar>(VARSAYILAN_AYARLAR);
  const [bakiyeler, setBakiyeler] = useState<Record<string, IzinBakiyesi>>({});
  const [mesaiTalepleri, setMesaiTalepleri] = useState<MesaiTalebi[]>([]);
  const [cihazTalepleri, setCihazTalepleri] = useState<CihazTalebi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);
  // "İçeride" hesabındaki 18 saat sınırı için son veri çekme anı
  const [veriZamani, setVeriZamani] = useState(() => Date.now());

  const [seciliAy, setSeciliAy] = useState(bugunTarih.slice(0, 7));
  const [seciliSubeFiltre, setSeciliSubeFiltre] = useState("TUMU");
  const [form, setForm] = useState<FormDurumu>(null);
  const [seciliPersonelId, setSeciliPersonelId] = useState<string | null>(null);
  const [vardiyaGorunum, setVardiyaGorunum] = useState<"plan" | "tanimlar" | "kurallar">("plan");
  const [talepGorunum, setTalepGorunum] = useState<"izin" | "mesai" | "cihaz">("izin");
  const [personelGorunum, setPersonelGorunum] = useState<"personel" | "kullanicilar" | "gecmis">("personel");

  // -------------------------------------------------------------------
  // Veri çekme
  // -------------------------------------------------------------------
  // Yükleme göstergesini açmaz; gösterge gerekiyorsa çağıran taraf açar (bkz. yukleyerekGetir)
  const verileriGetir = useCallback(
    () =>
      paneliGetir(seciliAy)
        .then((v) => {
          setSubeler(v.subeler);
          setVardiyalar(v.vardiyalar);
          setPersoneller(v.personeller);
          setHareketler(v.hareketler);
          setBugunHareketleri(v.bugunHareketleri);
          setIzinler(v.izinler);
          setResmiTatiller(v.resmiTatiller);
          setPlanlar(v.planlar);
          setKilitliAylar(v.kilitliAylar);
          setAyarlar(v.ayarlar);
          setBakiyeler(v.bakiyeler);
          setMesaiTalepleri(v.mesaiTalepleri);
          setCihazTalepleri(v.cihazTalepleri);
          setVeriZamani(Date.now());
          setHataMesaji(null);
        })
        .catch((err) => setHataMesaji(hataYaz(err)))
        .finally(() => setYukleniyor(false)),
    // Setter fonksiyonları sabittir; React Compiler bunları açıkça listede görmek istiyor
    [
      seciliAy,
      setSubeler,
      setVardiyalar,
      setPersoneller,
      setHareketler,
      setBugunHareketleri,
      setIzinler,
      setResmiTatiller,
      setPlanlar,
      setKilitliAylar,
      setAyarlar,
      setBakiyeler,
      setMesaiTalepleri,
      setCihazTalepleri,
      setVeriZamani,
      setHataMesaji,
      setYukleniyor,
    ]
  );

  // Ay değişince verileriGetir yeniden oluşur ve bu effect yeniden çalışır.
  // Yükleme göstergesi ilk açılışta başlangıç değeriyle, ay değişiminde ayDegistir ile açılır.
  useEffect(() => {
    verileriGetir();
    const zamanlayici = setInterval(() => verileriGetir(), 60000);
    return () => clearInterval(zamanlayici);
  }, [verileriGetir]);

  const yenile = verileriGetir;

  function yukleyerekGetir() {
    setYukleniyor(true);
    verileriGetir();
  }

  function ayDegistir(ay: string) {
    if (ay === seciliAy) return;
    setYukleniyor(true);
    setSeciliAy(ay);
  }

  // -------------------------------------------------------------------
  // Türetilmiş veriler
  // -------------------------------------------------------------------
  const [yil, ayNo] = seciliAy.split("-").map(Number);

  const puantajListesi: PuantajSatiri[] = useMemo(
    () =>
      aylikPuantajHesapla({
        yil,
        ay: ayNo,
        personeller,
        hareketler,
        izinler,
        resmiTatiller,
        vardiyalar,
        planlar,
        ayarlar,
        bugun: bugunTarih,
        simdi: new Date(),
      }),
    [yil, ayNo, personeller, hareketler, izinler, resmiTatiller, vardiyalar, planlar, ayarlar, bugunTarih]
  );

  const filtrelenmisPuantaj = puantajListesi.filter(
    (p) => seciliSubeFiltre === "TUMU" || p.subeId === seciliSubeFiltre
  );

  const bekleyenMesai = mesaiTalepleri.filter((t) => t.durum === "BEKLEMEDE").length;
  const bekleyenCihaz = cihazTalepleri.length;
  const bekleyenSayisi = izinler.filter((iz) => iz.durum === "BEKLEMEDE").length + bekleyenMesai + bekleyenCihaz;

  // Son CIKIS_EKSIK_GUN günün hareketleri, kişiye göre (eskiden yeniye)
  const kisiHareketleri = useMemo(() => {
    const harita = new Map<string, BugunHareket[]>();
    for (const h of bugunHareketleri) {
      const liste = harita.get(h.personel_id);
      if (liste) liste.push(h);
      else harita.set(h.personel_id, [h]);
    }
    return harita;
  }, [bugunHareketleri]);

  // Kişinin bir gündeki geçerli planı ve girişlerini planlı vardiyayla eşleştiren çözücü
  const kisiPlani = useMemo(() => {
    const harita = planHaritasi(planlar);
    const vardiyaHaritasi = new Map(vardiyalar.map((v) => [v.id, v]));
    const vardiyaBul = (id: string) => vardiyaHaritasi.get(id);
    return (p: Personel) => {
      const varsayilan = p.vardiyalar ?? vardiyalar[0] ?? null;
      const gunPlaniBul = (tarih: string) => gunPlani(harita.get(`${p.id}|${tarih}`), tarih, varsayilan, vardiyaBul);
      const cozucu = vardiyaCozucu(gunPlaniBul, ayarlar.erken_giris_payi_dk * DK_MS);
      return { gunPlaniBul, cozucu, bitisBul: (an: Date) => cozucu(an)?.son ?? null };
    };
  }, [planlar, vardiyalar, ayarlar]);

  const bugunOzet: BugunOzet = useMemo(() => {
    const simdi = veriZamani;
    const resmiTatil = resmiTatiller.some((t) => t.tarih === bugunTarih);

    const izinliIdleri = new Set(
      izinler
        .filter(
          (iz) =>
            (!iz.durum || iz.durum === "ONAYLANDI") &&
            bugunTarih >= iz.baslangic_tarihi &&
            bugunTarih <= iz.bitis_tarihi
        )
        .map((iz) => iz.personel_id)
    );

    const aktifler = personeller.filter(
      (p) => p.aktif && (seciliSubeFiltre === "TUMU" || p.varsayilan_sube_id === seciliSubeFiltre)
    );

    const planlari = new Map(aktifler.map((p) => [p.id, kisiPlani(p)]));
    // Resmi tatil ya da herkes planda tatildeyse gün tatil sayılır
    const bugunTatil =
      resmiTatil || (aktifler.length > 0 && aktifler.every((p) => kisiPlani(p).gunPlaniBul(bugunTarih).tatil));

    const sonuc: BugunOzet = { toplam: aktifler.length, iceride: [], cikti: [], izinli: [], gelmedi: [], gec: [], tatil: bugunTatil };

    for (const p of aktifler) {
      const hs = kisiHareketleri.get(p.id) ?? [];
      const bugunkuler = hs.filter((h) => yerelTarih(h.created_at) === bugunTarih);
      const plan = planlari.get(p.id) ?? kisiPlani(p);
      const kisiTatil = resmiTatil || plan.gunPlaniBul(bugunTarih).tatil;

      if (suankiGiris(hs, plan.bitisBul, simdi, ayarlar.cikis_tolerans_dk * DK_MS)) {
        sonuc.iceride.push(p);
      } else if (bugunkuler.length > 0) {
        sonuc.cikti.push(p);
      } else if (izinliIdleri.has(p.id)) {
        sonuc.izinli.push(p);
        continue;
      } else {
        if (!kisiTatil) sonuc.gelmedi.push(p);
        continue;
      }

      // Bugünkü ilk giriş, eşleştiği planlı vardiyanın başlangıcından 5 dk sonraysa geç kalmıştır
      const ilkGiris = bugunkuler.find((h) => h.islem_turu === "İşe Giriş");
      if (ilkGiris) {
        const an = new Date(ilkGiris.created_at);
        const ornek = plan.cozucu(an);
        if (ornek && (an.getTime() - ornek.bas) / 60000 > ayarlar.gecikme_tolerans_dk) sonuc.gec.push(p);
      }
    }
    return sonuc;
  }, [personeller, kisiHareketleri, izinler, resmiTatiller, kisiPlani, seciliSubeFiltre, bugunTarih, veriZamani, ayarlar]);

  // Çıkış basmayı unutanlar: vardiyası (ve fazla mesai payı) bittiği halde çıkışı olmayan girişler
  const cikisEksikler: CikisEksikSatiri[] = useMemo(() => {
    const sonuc: CikisEksikSatiri[] = [];
    for (const p of personeller) {
      if (!p.aktif || (seciliSubeFiltre !== "TUMU" && p.varsayilan_sube_id !== seciliSubeFiltre)) continue;
      const plan = kisiPlani(p);
      for (const h of cikisiEksikGirisler(
        kisiHareketleri.get(p.id) ?? [],
        plan.bitisBul,
        veriZamani,
        ayarlar.cikis_tolerans_dk * DK_MS
      )) {
        const ornek = plan.cozucu(new Date(h.created_at));
        sonuc.push({
          personel: p,
          giris: h.created_at,
          subeId: h.sube_id ?? p.varsayilan_sube_id,
          planliBitis: ornek ? new Date(ornek.son).toISOString() : null,
          vardiyaAdi: ornek?.vardiya.ad ?? null,
        });
      }
    }
    // En eski kayıt en üstte
    return sonuc.sort((a, b) => a.giris.localeCompare(b.giris));
  }, [personeller, kisiHareketleri, kisiPlani, seciliSubeFiltre, veriZamani, ayarlar]);

  const pinsizSayisi = personeller.filter((p) => p.aktif && !p.pin_tanimli).length;
  const eksikToplam = filtrelenmisPuantaj.reduce((t, p) => t + p.eksikGunler, 0);
  const devamsizToplam = filtrelenmisPuantaj.reduce((t, p) => t + p.devamsizGunler, 0);

  const ayHareketleri = useMemo(
    () =>
      hareketler
        .filter(
          (h) =>
            yerelTarih(h.created_at).startsWith(seciliAy) &&
            (seciliSubeFiltre === "TUMU" || h.sube_id === seciliSubeFiltre)
        )
        .reverse(),
    [hareketler, seciliAy, seciliSubeFiltre]
  );

  const filtrelenmisPersoneller = personeller.filter(
    (p) => seciliSubeFiltre === "TUMU" || p.varsayilan_sube_id === seciliSubeFiltre
  );

  const seciliSatir = seciliPersonelId ? puantajListesi.find((p) => p.id === seciliPersonelId) ?? null : null;

  // -------------------------------------------------------------------
  // Dışa aktarma
  // -------------------------------------------------------------------
  function aktifSekmeVerisi(): { baslik: string; dosyaAdi: string; veriler: Satir[]; sureSutunlari?: string[] } {
    const ek = `MNS_Next_IK_${bugunTarih}`;

    if (aktifSekme === "genel") {
      return {
        baslik: `PDKS Hareketleri (${seciliAy})`,
        dosyaAdi: `${ek}_Hareketler_${seciliAy}`,
        veriler: ayHareketleri.map((h, i) => ({
          Sıra: i + 1,
          Tarih: yerelTarih(h.created_at),
          Saat: yerelSaat(h.created_at),
          "Sicil No": h.personeller?.sicil_no || "-",
          "Ad Soyad": `${h.personeller?.ad || ""} ${h.personeller?.soyad || ""}`.trim(),
          Şube: h.subeler?.ad || "-",
          İşlem: h.islem_turu,
          Tür: h.manuel ? "Manuel Düzeltme" : "GPS Mobil",
          "Mesafe (m)": h.mesafe_metre ?? 0,
          "Yönetici Notu": h.yonetici_notu || "-",
        })),
      };
    }

    if (aktifSekme === "talepler" && talepGorunum === "mesai") {
      return {
        baslik: `Fazla Mesai (${seciliAy})`,
        dosyaAdi: `${ek}_FazlaMesai_${seciliAy}`,
        veriler: mesaiTalepleri
          .filter((t) => t.tarih.startsWith(seciliAy))
          .filter((t) => seciliSubeFiltre === "TUMU" || t.personeller?.varsayilan_sube_id === seciliSubeFiltre)
          .sort((a, b) => a.tarih.localeCompare(b.tarih))
          .map((t, i) => ({
            Sıra: i + 1,
            "Sicil No": t.personeller?.sicil_no || "-",
            "Ad Soyad": `${t.personeller?.ad || ""} ${t.personeller?.soyad || ""}`.trim(),
            Tarih: t.tarih,
            Başlangıç: t.baslangic_saat.slice(0, 5),
            Bitiş: t.bitis_saat.slice(0, 5),
            [MESAI_SURE]: t.sure_dk,
            Neden: t.neden,
            Durum: t.durum,
            "Amir Açıklaması": t.karar_notu || "-",
            "Karar Zamanı": t.karar_zamani ? `${yerelTarih(t.karar_zamani)} ${yerelSaat(t.karar_zamani)}` : "-",
          })),
        sureSutunlari: [MESAI_SURE],
      };
    }
    if (aktifSekme === "talepler") {
      return {
        baslik: "İzin ve Rapor Talepleri",
        dosyaAdi: `${ek}_Izinler`,
        veriler: izinler.map((iz, i) => ({
          Sıra: i + 1,
          "Sicil No": iz.personeller?.sicil_no || "-",
          "Ad Soyad": `${iz.personeller?.ad || ""} ${iz.personeller?.soyad || ""}`.trim(),
          Tür: iz.izin_turu,
          "SGK Kodu": iz.sgk_kodu || "-",
          Başlangıç: iz.baslangic_tarihi,
          Bitiş: iz.bitis_tarihi,
          Durum: iz.durum || "ONAYLANDI",
          Açıklama: iz.aciklama || "-",
        })),
      };
    }

    if (aktifSekme === "vardiya") {
      return {
        baslik: "Vardiya Listesi",
        dosyaAdi: `${ek}_Vardiyalar`,
        veriler: vardiyalar.map((v, i) => ({
          Sıra: i + 1,
          Ad: v.ad,
          Başlangıç: v.baslangic_saat.slice(0, 5),
          Bitiş: v.bitis_saat.slice(0, 5),
          "Mola (dk)": v.mola_dakika,
        })),
      };
    }

    if (aktifSekme === "personel") {
      return {
        baslik: "Personel Listesi",
        dosyaAdi: `${ek}_Personeller`,
        veriler: filtrelenmisPersoneller.map((p, i) => ({
          Sıra: i + 1,
          "Sicil No": p.sicil_no,
          "Ad Soyad": `${p.ad} ${p.soyad}`.trim(),
          "T.C. Kimlik": p.tc_kimlik,
          Departman: p.departman || "Genel",
          Şube: p.subeler?.ad || "Atanmamış",
          Durum: p.aktif ? "Aktif" : "Pasif",
          Cihaz: p.cihaz_id ? "Eşleşti" : "Boşta",
        })),
      };
    }

    // bakış ve puantaj sekmeleri puantaj raporu verir
    return {
      baslik: `Aylık Puantaj ve Bordro Cetveli (${seciliAy})`,
      dosyaAdi: `${ek}_Puantaj_${seciliAy}`,
      veriler: filtrelenmisPuantaj.map((p, i) => ({
        Sıra: i + 1,
        Dönem: seciliAy,
        "Sicil No": p.sicil_no,
        "Ad Soyad": p.adSoyad,
        Departman: p.departman,
        Şube: p.subeAdi,
        Vardiya: p.vardiyaAdi,
        "Çalışılan Gün": p.calisilanGunler,
        "Eksik Hareketli Gün": p.eksikGunler,
        "Raporlu Gün (SGK 01)": p.raporluGunler,
        "İzinli Gün": p.izinliGunler,
        "Devamsız Gün": p.devamsizGunler,
        "Resmi Tatil Çalışma Günü": p.resmiTatilCalismalari,
        "Hafta Tatili Çalışma Günü": p.haftaTatiliCalismalari,
        [PUANTAJ_SURE[0]]: p.toplamCalismaDk,
        [PUANTAJ_SURE[1]]: p.planDisiMesaiDk,
        [PUANTAJ_SURE[2]]: p.resmiTatilMesaiDk,
        [PUANTAJ_SURE[3]]: p.haftaTatiliMesaiDk,
        [PUANTAJ_SURE[4]]: p.gecikmeDk,
      })),
      sureSutunlari: [...PUANTAJ_SURE],
    };
  }

  function raporIndir(format: Bicim) {
    const { baslik, dosyaAdi, veriler, sureSutunlari } = aktifSekmeVerisi();
    const sorun = disariAktar(format, baslik, dosyaAdi, veriler, sureSutunlari);
    if (sorun) bildir(sorun, "hata");
    else bildir("Rapor hazırlandı.", "basari");
  }

  // -------------------------------------------------------------------
  // İşlemler
  // -------------------------------------------------------------------
  async function ayKilitDegistir() {
    const kilitli = kilitliAylar.includes(seciliAy);
    const tamam = await onayla({
      baslik: kilitli ? `${ayAdi(seciliAy)} tekrar açılsın mı?` : `${ayAdi(seciliAy)} kapatılsın mı?`,
      metin: kilitli
        ? "Açılan ayda giriş/çıkış, izin ve vardiya planı yeniden değiştirilebilir. İşlem geçmişine kaydedilir."
        : "Kapatılan aya ait giriş/çıkış, izin ve vardiya planı panelden değiştirilemez (genel yönetici dahil). Maaş hesaplandıktan sonra kapatın. Personelin mobilden giriş/çıkışı etkilenmez.",
      onayEtiketi: kilitli ? "Ayı aç" : "Ayı kapat",
      tehlikeli: kilitli,
    });
    if (!tamam) return;
    const { error } = kilitli
      ? await supabase.from("ay_kilitleri").delete().eq("ay", seciliAy)
      : await supabase.from("ay_kilitleri").insert({ ay: seciliAy });
    if (error) bildir(hataYaz(error), "hata");
    else {
      bildir(kilitli ? "Ay açıldı." : "Ay kapatıldı.", "basari");
      yenile();
    }
  }

  async function izinDurumGuncelle(id: string, yeniDurum: "ONAYLANDI" | "REDDEDILDI", not: string | null = null) {
    try {
      const { error } = await supabase.from("izinler").update({ durum: yeniDurum, karar_notu: not }).eq("id", id);
      if (error) throw error;
      bildir(yeniDurum === "ONAYLANDI" ? "Talep onaylandı." : "Talep reddedildi.", "basari");
      // Personelin telefonuna sonucu bildir
      const { data } = await supabase.auth.getSession();
      olayBildir({ olay: "talep_sonuc", izin_id: id }, data.session?.access_token);
      await yenile();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  async function mesaiDurumGuncelle(id: string, yeniDurum: "ONAYLANDI" | "REDDEDILDI", not: string | null = null) {
    try {
      const { error } = await supabase.from("mesai_talepleri").update({ durum: yeniDurum, karar_notu: not }).eq("id", id);
      if (error) throw error;
      bildir(yeniDurum === "ONAYLANDI" ? "Fazla mesai onaylandı." : "Fazla mesai reddedildi.", "basari");
      // Personelin telefonuna sonucu bildir
      const { data } = await supabase.auth.getSession();
      olayBildir({ olay: "mesai_sonuc", mesai_id: id }, data.session?.access_token);
      await yenile();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  async function izinSil(id: string) {
    const tamam = await onayla({
      baslik: "Kayıt silinsin mi?",
      metin: "Bu izin veya rapor kaydı kalıcı olarak silinecek ve puantaj yeniden hesaplanacak.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    try {
      const { error } = await supabase.from("izinler").delete().eq("id", id);
      if (error) throw error;
      bildir("Kayıt silindi.", "basari");
      await yenile();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  async function personelAktifDegistir(p: Personel) {
    const tamam = await onayla({
      baslik: p.aktif ? `${p.ad} ${p.soyad} pasife alınsın mı?` : `${p.ad} ${p.soyad} tekrar aktif edilsin mi?`,
      metin: p.aktif
        ? "Mobil girişi kapanır. Geçmiş kayıtlar ve puantaj korunur."
        : "Mobil girişi yeniden açılır.",
      onayEtiketi: p.aktif ? "Pasife al" : "Aktif et",
      tehlikeli: p.aktif,
    });
    if (!tamam) return;
    try {
      const { error } = await supabase.from("personeller").update({ aktif: !p.aktif }).eq("id", p.id);
      if (error) throw error;
      bildir(p.aktif ? "Personel pasife alındı." : "Personel aktif edildi.", "basari");
      await yenile();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  async function cihazSifirla(p: Personel) {
    const tamam = await onayla({
      baslik: "Cihaz kilidi açılsın mı?",
      metin: `${p.ad} ${p.soyad} yeni bir telefondan giriş yapabilecek. Mevcut oturumu da kapanır.`,
      onayEtiketi: "Kilidi aç",
    });
    if (!tamam) return;
    try {
      const { error } = await supabase.rpc("cihaz_sifirla", { p_personel_id: p.id });
      if (error) throw error;
      bildir("Cihaz kilidi açıldı.", "basari");
      await yenile();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  async function cihazTalebiKarar(t: CihazTalebi, onay: boolean) {
    const kisi = `${t.personeller?.ad ?? ""} ${t.personeller?.soyad ?? ""}`.trim();
    const tamam = await onayla(
      onay
        ? {
            baslik: "Yeni telefon tanımlansın mı?",
            metin: `${kisi} bundan sonra yalnızca bu telefondan (${t.cihaz_bilgisi ?? "bilinmeyen telefon"}) giriş yapabilecek. Eski telefondaki oturumu kapanır.`,
            onayEtiketi: "Onayla",
          }
        : {
            baslik: "Talep reddedilsin mi?",
            metin: `${kisi} yeni telefondan giriş yapamayacak; kayıtlı telefonu değişmez.`,
            onayEtiketi: "Reddet",
            tehlikeli: true,
          }
    );
    if (!tamam) return;
    try {
      const { error } = await supabase.rpc("cihaz_talebi_karar", { p_talep_id: t.id, p_onay: onay });
      if (error) throw error;
      bildir(onay ? "Yeni telefon tanımlandı." : "Talep reddedildi.", "basari");
      await yenile();
    } catch (err) {
      bildir(hataYaz(err), "hata");
      await yenile();
    }
  }

  async function vardiyaSil(v: Vardiya) {
    const tamam = await onayla({
      baslik: `"${v.ad}" vardiyası silinsin mi?`,
      metin: "Bu vardiyaya atanmış personel varsa silme işlemi başarısız olabilir.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    try {
      const { error } = await supabase.from("vardiyalar").delete().eq("id", v.id);
      if (error) throw error;
      bildir("Vardiya silindi.", "basari");
      await yenile();
    } catch (err) {
      bildir(`Silinemedi: ${hataYaz(err)}`, "hata");
    }
  }

  const aktifBaslik = SEKMELER.find((s) => s.id === aktifSekme)?.etiket ?? "";

  // -------------------------------------------------------------------
  // Görünüm
  // -------------------------------------------------------------------
  return (
    <div className="min-h-screen lg:pl-64">
      {/* Yan menü (masaüstü) */}
      <aside className="yan-serit fixed inset-y-0 left-0 z-40 hidden w-64 flex-col p-4 lg:flex">
        <div className="flex items-center gap-3 px-2 pb-6 pt-2">
          <Marka boyut={36} />
          <div>
            <p className="baslik-font text-lg leading-tight">MNS Next IK</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              Personel devam kontrol
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Ana menü">
          {SEKMELER.map((s) => (
            <button
              key={s.id}
              type="button"
              className="nav-oge"
              data-aktif={aktifSekme === s.id}
              onClick={() => setAktifSekme(s.id)}
            >
              <Ikon ad={s.ikon} />
              {s.etiket}
              {s.id === "talepler" && bekleyenSayisi > 0 && <span className="nav-sayac">{bekleyenSayisi}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-1 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <a href="/mobil" target="_blank" rel="noopener noreferrer" className="nav-oge">
            <Ikon ad="telefon" />
            Mobil ekranı aç
          </a>
          <button type="button" className="nav-oge" onClick={onCikis}>
            <Ikon ad="cikis" />
            Çıkış yap
          </button>
          <p className="truncate px-3 pt-2 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            {eposta}
          </p>
          <p className="truncate px-3 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            {genel ? "Genel yönetici" : `Şube müdürü: ${subeler.map((s) => s.ad).join(", ") || "şube atanmamış"}`}
          </p>
        </div>
      </aside>

      {/* Üst çubuk */}
      <header className="ust-serit sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="lg:hidden">
              <Marka boyut={32} />
            </span>
            <h1 className="baslik-font m1 text-2xl leading-tight">{aktifBaslik}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="girdi girdi-sik"
              style={{ width: "auto", maxWidth: 170 }}
              value={seciliSubeFiltre}
              onChange={(e) => setSeciliSubeFiltre(e.target.value)}
              aria-label="Şube filtresi"
            >
              <option value="TUMU">Tüm şubeler</option>
              {subeler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </select>

            {yetkili("rapor") && (
            <AcilirMenu
              etiket="Rapor indir"
              tetikleyici={
                <>
                  <Ikon ad="indir" boyut={16} />
                  <span className="hidden sm:inline">Rapor indir</span>
                </>
              }
            >
              {(kapat) => (
                <>
                  {(
                    [
                      ["xlsx", "Excel belgesi (.xlsx)"],
                      ["csv", "CSV tablosu (.csv)"],
                      ["pdf", "PDF / yazdır"],
                      ["json", "Ham veri (.json)"],
                    ] as [Bicim, string][]
                  ).map(([f, ad]) => (
                    <button
                      key={f}
                      type="button"
                      role="menuitem"
                      className="menu-oge"
                      onClick={() => {
                        kapat();
                        raporIndir(f);
                      }}
                    >
                      <Ikon ad="indir" boyut={16} />
                      {ad}
                    </button>
                  ))}
                </>
              )}
            </AcilirMenu>
            )}

            {(yetkili("personel") || yetkili("manuel") || yetkili("izin")) && (
            <AcilirMenu
              etiket="Ekle"
              sinif="btn btn-ana"
              tetikleyici={
                <>
                  <Ikon ad="arti" boyut={16} />
                  Ekle
                </>
              }
            >
              {(kapat) => (
                <>
                  {yetkili("personel") && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-oge"
                      onClick={() => {
                        kapat();
                        setForm({ tur: "personel" });
                      }}
                    >
                      <Ikon ad="personel" boyut={16} />
                      Yeni personel
                    </button>
                  )}
                  {yetkili("manuel") && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-oge"
                      onClick={() => {
                        kapat();
                        setForm({ tur: "manuel" });
                      }}
                    >
                      <Ikon ad="kalem" boyut={16} />
                      Manuel giriş / çıkış
                    </button>
                  )}
                  {yetkili("izin") && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-oge"
                      onClick={() => {
                        kapat();
                        setForm({ tur: "izin" });
                      }}
                    >
                      <Ikon ad="rapor" boyut={16} />
                      İzin veya rapor
                    </button>
                  )}
                </>
              )}
            </AcilirMenu>
            )}

            <button type="button" className="btn btn-hayalet btn-ikon lg:hidden" onClick={onCikis} aria-label="Çıkış yap">
              <Ikon ad="cikis" />
            </button>
          </div>
        </div>
      </header>

      {/* İçerik */}
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">
        {hataMesaji && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
            style={{ background: "var(--hata-acik)", color: "var(--hata)" }}
            role="alert"
          >
            <span>Veriler alınamadı: {hataMesaji}</span>
            <button type="button" className="btn btn-tehlike btn-kucuk" onClick={yukleyerekGetir}>
              Tekrar dene
            </button>
          </div>
        )}

        {aktifSekme === "bakis" && (
          <div className="space-y-6">
            <BildirimDugmesi
              aciklama="Yeni izin talepleri ve eksik çıkışlar için bu cihaza bildirim gelsin."
              kaydet={async (a) => {
                const { error } = await supabase.rpc("panel_push_abone_ol", {
                  p_endpoint: a.endpoint,
                  p_p256dh: a.p256dh,
                  p_auth: a.auth,
                });
                if (error) throw error;
              }}
              birak={async (endpoint) => {
                await supabase.rpc("panel_push_abonelik_birak", { p_endpoint: endpoint });
              }}
            />
            <HizliIslemler
              cikisEksik={cikisEksikler.length}
              bekleyen={bekleyenSayisi}
              gelmeyen={bugunOzet.gelmedi.length}
              onCikisEksik={() => setForm({ tur: "cikisEksik" })}
              onTalepler={() => setAktifSekme("talepler")}
              onGelmeyenler={() => setForm({ tur: "gelmeyen" })}
              onManuel={yetkili("manuel") ? () => setForm({ tur: "manuel" }) : undefined}
              onPlan={() => setAktifSekme("vardiya")}
            />
            <BugunSerit ozet={bugunOzet} yukleniyor={yukleniyor} onGelmeyenler={() => setForm({ tur: "gelmeyen" })} />
            <DikkatListesi
              cikisEksik={cikisEksikler.length}
              onCikisEksik={() => setForm({ tur: "cikisEksik" })}
              bekleyen={bekleyenSayisi}
              pinsiz={yetkili("pin") ? pinsizSayisi : 0}
              eksik={eksikToplam}
              devamsiz={devamsizToplam}
              donem={ayAdi(seciliAy)}
              onGit={setAktifSekme}
            />
          </div>
        )}

        {aktifSekme === "puantaj" && (
          <PuantajSekmesi
            liste={filtrelenmisPuantaj}
            seciliAy={seciliAy}
            onAyDegis={ayDegistir}
            onSec={setSeciliPersonelId}
            onYenile={yukleyerekGetir}
            yukleniyor={yukleniyor}
            kilitli={kilitliAylar.includes(seciliAy)}
            onKilit={genel ? ayKilitDegistir : undefined}
          />
        )}

        {aktifSekme === "talepler" && (
          <div className="space-y-4">
            <div
              className={yetkili("cihaz") ? "segment segment-3" : "segment"}
              style={{ maxWidth: yetkili("cihaz") ? 480 : 360 }}
              role="tablist"
              aria-label="Talep türü"
            >
              <button
                type="button"
                role="tab"
                aria-selected={talepGorunum === "izin"}
                data-aktif={talepGorunum === "izin"}
                onClick={() => setTalepGorunum("izin")}
              >
                İzin talepleri
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={talepGorunum === "mesai"}
                data-aktif={talepGorunum === "mesai"}
                onClick={() => setTalepGorunum("mesai")}
              >
                Fazla mesai{bekleyenMesai > 0 ? ` (${bekleyenMesai})` : ""}
              </button>
              {yetkili("cihaz") && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={talepGorunum === "cihaz"}
                  data-aktif={talepGorunum === "cihaz"}
                  onClick={() => setTalepGorunum("cihaz")}
                >
                  Telefon{bekleyenCihaz > 0 ? ` (${bekleyenCihaz})` : ""}
                </button>
              )}
            </div>
            {talepGorunum === "cihaz" && yetkili("cihaz") ? (
              <CihazTalepleriSekmesi talepler={cihazTalepleri} subeFiltre={seciliSubeFiltre} onKarar={cihazTalebiKarar} />
            ) : talepGorunum === "mesai" ? (
              <MesaiSekmesi
                talepler={mesaiTalepleri}
                personeller={personeller}
                hareketler={hareketler}
                seciliAy={seciliAy}
                subeFiltre={seciliSubeFiltre}
                onAyDegis={ayDegistir}
                onDurum={
                  yetkili("mesai")
                    ? (id, durum) => {
                        if (durum === "ONAYLANDI") return mesaiDurumGuncelle(id, durum);
                        const t = mesaiTalepleri.find((x) => x.id === id);
                        setForm({
                          tur: "red",
                          talep: "mesai",
                          id,
                          ozet: t
                            ? `${t.personeller?.ad ?? ""} ${t.personeller?.soyad ?? ""}, ${kisaTarih(t.tarih)} ${t.baslangic_saat.slice(0, 5)}-${t.bitis_saat.slice(0, 5)} fazla mesai`
                            : "Fazla mesai talebi",
                        });
                      }
                    : undefined
                }
              />
            ) : (
              <TaleplerSekmesi
                izinler={izinler}
                bakiyeler={bakiyeler}
                onDurum={
                  yetkili("izin")
                    ? (id, durum) => {
                        if (durum === "ONAYLANDI") return izinDurumGuncelle(id, durum);
                        const iz = izinler.find((x) => x.id === id);
                        setForm({
                          tur: "red",
                          talep: "izin",
                          id,
                          ozet: iz
                            ? `${iz.personeller?.ad ?? ""} ${iz.personeller?.soyad ?? ""}, ${iz.izin_turu}, ${kisaTarih(iz.baslangic_tarihi)}`
                            : "İzin talebi",
                        });
                      }
                    : undefined
                }
                onSil={yetkili("izin") ? izinSil : undefined}
                onYeni={yetkili("izin") ? () => setForm({ tur: "izin" }) : undefined}
              />
            )}
          </div>
        )}

        {aktifSekme === "genel" && (
          <LoglarSekmesi
            hareketler={ayHareketleri}
            seciliAy={seciliAy}
            onAyDegis={ayDegistir}
            onYenile={yukleyerekGetir}
            yukleniyor={yukleniyor}
          />
        )}

        {aktifSekme === "personel" && (
          <div className="space-y-4">
            {genel && (
              <div className="segment segment-3" style={{ maxWidth: 460 }} role="tablist" aria-label="Personel bölümü">
                <button
                  type="button"
                  role="tab"
                  aria-selected={personelGorunum === "personel"}
                  data-aktif={personelGorunum === "personel"}
                  onClick={() => setPersonelGorunum("personel")}
                >
                  Personel
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={personelGorunum === "kullanicilar"}
                  data-aktif={personelGorunum === "kullanicilar"}
                  onClick={() => setPersonelGorunum("kullanicilar")}
                >
                  Panel kullanıcıları
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={personelGorunum === "gecmis"}
                  data-aktif={personelGorunum === "gecmis"}
                  onClick={() => setPersonelGorunum("gecmis")}
                >
                  İşlem geçmişi
                </button>
              </div>
            )}
            {genel && personelGorunum === "kullanicilar" ? (
              <PanelKullanicilari subeler={subeler} />
            ) : genel && personelGorunum === "gecmis" ? (
              <IslemGecmisi personeller={personeller} />
            ) : (
              <PersonelSekmesi
                personeller={filtrelenmisPersoneller}
                bakiyeler={bakiyeler}
                onIzinBilgileri={(p) => setForm({ tur: "izinBilgi", hedef: p })}
                onYeni={yetkili("personel") ? () => setForm({ tur: "personel" }) : undefined}
                onPin={yetkili("pin") ? (p) => setForm({ tur: "pin", hedef: p }) : undefined}
                onCihaz={yetkili("cihaz") ? cihazSifirla : undefined}
                onAktif={yetkili("personel") ? personelAktifDegistir : undefined}
              />
            )}
          </div>
        )}

        {aktifSekme === "vardiya" && (
          <div className="space-y-4">
            <div className="segment segment-3" style={{ maxWidth: 420 }} role="tablist" aria-label="Vardiya bölümü">
              <button
                type="button"
                role="tab"
                aria-selected={vardiyaGorunum === "plan"}
                data-aktif={vardiyaGorunum === "plan"}
                onClick={() => setVardiyaGorunum("plan")}
              >
                Vardiya planı
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={vardiyaGorunum === "tanimlar"}
                data-aktif={vardiyaGorunum === "tanimlar"}
                onClick={() => setVardiyaGorunum("tanimlar")}
              >
                Vardiya tanımları
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={vardiyaGorunum === "kurallar"}
                data-aktif={vardiyaGorunum === "kurallar"}
                onClick={() => setVardiyaGorunum("kurallar")}
              >
                Kurallar
              </button>
            </div>
            {vardiyaGorunum === "kurallar" ? (
              <AyarlarSekmesi key={JSON.stringify(ayarlar)} ayarlar={ayarlar} duzenlenebilir={genel} onKayit={yenile} />
            ) : vardiyaGorunum === "plan" ? (
              <VardiyaPlani
                personeller={personeller}
                vardiyalar={vardiyalar}
                subeFiltre={seciliSubeFiltre}
                duzenlenebilir={yetkili("plan")}
                onDegisti={yenile}
              />
            ) : (
              <VardiyaSekmesi
                vardiyalar={vardiyalar}
                onYeni={genel ? () => setForm({ tur: "vardiya", duzenlenen: null }) : undefined}
                onDuzenle={genel ? (v) => setForm({ tur: "vardiya", duzenlenen: v }) : undefined}
                onSil={genel ? vardiyaSil : undefined}
              />
            )}
          </div>
        )}
      </main>

      {/* Alt sekme çubuğu (telefon) */}
      <nav className="alt-cubuk fixed inset-x-0 bottom-0 z-30 flex lg:hidden" aria-label="Ana menü">
        {SEKMELER.map((s) => (
          <button
            key={s.id}
            type="button"
            className="alt-sekme"
            data-aktif={aktifSekme === s.id}
            onClick={() => setAktifSekme(s.id)}
            aria-label={s.etiket}
          >
            <Ikon ad={s.ikon} boyut={21} />
            {s.kisa}
            {s.id === "talepler" && bekleyenSayisi > 0 && <span className="alt-sayac">{bekleyenSayisi}</span>}
          </button>
        ))}
      </nav>

      {/* Pencereler */}
      {seciliSatir && <PuantajKarti satir={seciliSatir} seciliAy={seciliAy} onKapat={() => setSeciliPersonelId(null)} />}

      {form?.tur === "personel" && (
        <PersonelFormu subeler={subeler} vardiyalar={vardiyalar} onKapat={() => setForm(null)} onKayit={yenile} />
      )}
      {form?.tur === "pin" && <PinFormu hedef={form.hedef} onKapat={() => setForm(null)} onKayit={yenile} />}
      {form?.tur === "vardiya" && (
        <VardiyaFormu duzenlenen={form.duzenlenen} onKapat={() => setForm(null)} onKayit={yenile} />
      )}
      {form?.tur === "izin" && <IzinFormu personeller={personeller} onKapat={() => setForm(null)} onKayit={yenile} />}
      {form?.tur === "izinBilgi" && (
        <IzinBilgileriFormu
          hedef={form.hedef}
          bakiye={bakiyeler[form.hedef.id]}
          duzenlenebilir={yetkili("personel")}
          onKapat={() => setForm(null)}
          onKayit={yenile}
        />
      )}
      {form?.tur === "manuel" && (
        <ManuelFormu
          personeller={personeller}
          subeler={subeler}
          baslangic={form.baslangic}
          onKapat={() => setForm(null)}
          onKayit={yenile}
        />
      )}
      {form?.tur === "gelmeyen" && <GelmeyenlerListesi liste={bugunOzet.gelmedi} onKapat={() => setForm(null)} />}
      {form?.tur === "red" && (
        <RedFormu
          baslik={form.talep === "mesai" ? "Fazla mesai reddedilsin mi?" : "İzin talebi reddedilsin mi?"}
          ozet={form.ozet}
          onKapat={() => setForm(null)}
          onReddet={(not) =>
            form.talep === "mesai"
              ? mesaiDurumGuncelle(form.id, "REDDEDILDI", not)
              : izinDurumGuncelle(form.id, "REDDEDILDI", not)
          }
        />
      )}
      {form?.tur === "cikisEksik" && (
        <CikisEksikListesi
          liste={cikisEksikler}
          onKapat={() => setForm(null)}
          onCikisEkle={yetkili("manuel") ? (baslangic) => setForm({ tur: "manuel", baslangic }) : undefined}
        />
      )}
    </div>
  );
}
