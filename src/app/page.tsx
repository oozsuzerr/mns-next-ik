"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { aralikPuantajHesapla, aylikPuantajHesapla, type PuantajSatiri } from "../lib/puantaj";
import { cetvelAktarimi, onayliMesai } from "../lib/puantajCetveli";
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
import { AcilirMenu, Ikon, Marka, Modal, useBildirim, type IkonAdi } from "../components/ui";
import BugunSerit, { type BugunOzet } from "../components/panel/BugunSerit";
import { AyOzeti, Karsilama, SonHareketler, Yapilacaklar, type YapilacakMadde } from "../components/panel/GenelBakis";
import PuantajSekmesi from "../components/panel/PuantajSekmesi";
import PuantajKarti from "../components/panel/PuantajKarti";
import TaleplerSekmesi from "../components/panel/TaleplerSekmesi";
import LoglarSekmesi from "../components/panel/LoglarSekmesi";
import PersonelSekmesi from "../components/panel/PersonelSekmesi";
import SubelerSekmesi from "../components/panel/SubelerSekmesi";
import IkSekmesi, { ikBolumleri } from "../components/panel/ik/IkSekmesi";
import RaporlarSekmesi from "../components/panel/RaporlarSekmesi";
import AralikRaporFormu from "../components/panel/AralikRaporFormu";
import KvkkAyari from "../components/panel/KvkkAyari";
import { fazlaMesaiBrut, useBordroVerisi } from "../components/panel/ik/bordroVerisi";
import { modulAcik } from "../lib/moduller";
import ResmiTatillerSekmesi from "../components/panel/ResmiTatillerSekmesi";
import OzlukKarti from "../components/panel/OzlukKarti";
import VardiyaSekmesi from "../components/panel/VardiyaSekmesi";
import VardiyaPlani from "../components/panel/VardiyaPlani";
import PanelKullanicilari from "../components/panel/PanelKullanicilari";
import IslemGecmisi from "../components/panel/IslemGecmisi";
import AyarlarSekmesi from "../components/panel/AyarlarSekmesi";
import MesaiSekmesi from "../components/panel/MesaiSekmesi";
import CihazTalepleriSekmesi from "../components/panel/CihazTalepleriSekmesi";
import BildirimDugmesi from "../components/BildirimDugmesi";
import { SifreDegistirFormu, SifremiUnuttumFormu } from "../components/SifreFormlari";
import { hakedisYillari, izinFormuYazdir, izinKartiYazdir, yillikKullanimlar } from "../lib/izinBelgeleri";
import { olayBildir } from "../lib/bildirim";
import {
  CikisEksikListesi,
  RedFormu,
  GelmeyenlerListesi,
  IzinBilgileriFormu,
  GorevBilgisiFormu,
  IzinFormu,
  ManuelFormu,
  type CikisEksikSatiri,
  type ManuelBaslangic,
  PersonelFormu,
  PinFormu,
  IstenCikisFormu,
  VardiyaFormu,
} from "../components/panel/Formlar";

const SEKMELER: { id: Sekme; etiket: string; kisa: string; ikon: IkonAdi }[] = [
  { id: "bakis", etiket: "Genel bakış", kisa: "Bakış", ikon: "bakis" },
  { id: "puantaj", etiket: "Puantaj", kisa: "Puantaj", ikon: "puantaj" },
  { id: "talepler", etiket: "İzin talepleri", kisa: "Talepler", ikon: "talepler" },
  { id: "mesai", etiket: "Fazla mesai", kisa: "Mesai", ikon: "mesai" },
  { id: "genel", etiket: "Hareketler", kisa: "Hareket", ikon: "hareket" },
  { id: "personel", etiket: "Personel", kisa: "Personel", ikon: "personel" },
  { id: "vardiya", etiket: "Vardiyalar", kisa: "Vardiya", ikon: "vardiya" },
  { id: "ik", etiket: "İK işlemleri", kisa: "İK", ikon: "ik" },
  // Rapor indirme yetkisi olanlar görür (bkz. gorunenSekmeler)
  { id: "raporlar", etiket: "Raporlar", kisa: "Rapor", ikon: "rapor" },
  // Yalnızca genel yönetici görür (bkz. gorunenSekmeler)
  { id: "subeler", etiket: "Şubeler", kisa: "Şube", ikon: "konum" },
];

/** Rapor verisinin kaynağı: seçili ay yerine bir tarih aralığı (şube filtresi uygulanmış) */
interface RaporKaynagi {
  donem: string;
  /** Aralığın vardiya planı (vardiya planı raporu için) */
  planlar: PlanSatiri[];
  hareketler: Hareket[];
  puantaj: PuantajSatiri[];
  mesai: MesaiTalebi[];
  izinler: Izin[];
}

/** Telefonda alt çubukta doğrudan duran sekmeler; diğerleri "Diğer" penceresinde */
const ALT_CUBUK: Sekme[] = ["bakis", "puantaj", "talepler", "mesai"];

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
    const { data: abone } = supabase.auth.onAuthStateChange((olay, s) => {
      // "Şifremi unuttum" bağlantısı izin verilen adres yerine ana sayfaya düşerse yeni şifre sayfasına geç
      if (olay === "PASSWORD_RECOVERY") {
        window.location.replace("/sifre-yenile");
        return;
      }
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
    // Paket (açık modüller, personel sınırı): fonksiyon yoksa hepsi açık, sınırsız
    const paket = await supabase.rpc("firma_paketi");
    const p = !paket.error && paket.data ? (paket.data as { moduller: string[] | null; personel_limit: number | null }) : null;
    return {
      rol: b.rol,
      ad: b.ad ?? null,
      subeler: b.subeler ?? [],
      yetkiler: b.yetkiler ?? (b.rol === "SUBE" ? ["plan", "izin", "manuel", "cihaz"] : []),
      firma: b.firma ?? null,
      sistem: b.sistem === true,
      moduller: p?.moduller ?? null,
      personelLimit: p?.personel_limit ?? null,
    };
  }
  const eski = await supabase.rpc("is_admin");
  return !eski.error && eski.data === true ? { rol: "GENEL", ad: null, subeler: [], yetkiler: [], firma: null, sistem: false, moduller: null, personelLimit: null } : false;
}

function YoneticiGiris() {
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [goster, setGoster] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [unuttumAcik, setUnuttumAcik] = useState(false);

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

          <div className="-mt-2 flex justify-end">
            <button type="button" className="m2 text-sm underline" onClick={() => setUnuttumAcik(true)}>
              Şifremi unuttum
            </button>
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
      {unuttumAcik && <SifremiUnuttumFormu ilkEposta={eposta} onKapat={() => setUnuttumAcik(false)} />}
    </div>
  );
}

// =====================================================================
// 2) PANEL
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
  | { tur: "gorevBilgi"; hedef: Personel }
  | { tur: "cikis"; hedef: Personel }
  | { tur: "ozluk"; hedef: Personel }
  | { tur: "red"; talep: "izin" | "mesai"; id: string; ozet: string }
  | null;

/** Çıkışı eksik girişler bu kadar gün geriye kadar aranır */
const CIKIS_EKSIK_GUN = 31;

/** Puantaj raporunda dakika tutulup saat:dakika yazılan sütunlar */
const PUANTAJ_SURE = [
  "Toplam Net Çalışma (sa:dk)",
  "Onaylı Fazla Mesai (sa:dk)",
  "Onaylı Resmi Tatil Mesaisi (sa:dk)",
  "Onaylı Hafta Tatili Mesaisi (sa:dk)",
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
  const [subeD, varD, perler, harler, bugunD, izler, tatD, planlar, kilitD, ayarD, bakiyeD, mesaiD, cihazD, belgeD] = await Promise.all([
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
    // Süresi 30 gün içinde dolan ya da dolmuş belgeler (yalnızca genel yöneticiye görünür; tablo yoksa boş)
    Promise.resolve(
      supabase
        .from("personel_belgeleri")
        .select("id")
        .not("gecerlilik_bitis", "is", null)
        .lte("gecerlilik_bitis", gunEkle(yerelTarih(), 30))
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
    dolanBelge: (belgeD.data ?? []).length,
  };
}

function Panel({ eposta, yetki, onCikis }: { eposta: string; yetki: YoneticiBilgisi; onCikis: () => void }) {
  const { bildir, onayla } = useBildirim();
  // Şube müdürü yalnızca kendi şubelerini görür (veritabanı kuralları da bunu zorunlu kılar)
  const genel = yetki.rol === "GENEL";
  /** Genel yönetici her şeye, şube müdürü yalnızca kendisine verilen yetkilere sahiptir */
  const yetkili = (y: Yetki) => genel || yetki.yetkiler.includes(y);
  // Fazla mesai sekmesinde tahmini brüt mesai ücreti: ücretler yalnızca genel yöneticiye açık
  const bordroVerisi = useBordroVerisi(genel && modulAcik(yetki.moduller, "bordro"));

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
  const [dolanBelge, setDolanBelge] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);
  // "İçeride" hesabındaki 18 saat sınırı için son veri çekme anı
  const [veriZamani, setVeriZamani] = useState(() => Date.now());

  const [seciliAy, setSeciliAy] = useState(bugunTarih.slice(0, 7));
  const [seciliSubeFiltre, setSeciliSubeFiltre] = useState("TUMU");
  const [form, setForm] = useState<FormDurumu>(null);
  const [seciliPersonelId, setSeciliPersonelId] = useState<string | null>(null);
  const [vardiyaGorunum, setVardiyaGorunum] = useState<"plan" | "tanimlar" | "kurallar" | "tatiller">("plan");
  const [talepGorunum, setTalepGorunum] = useState<"izin" | "cihaz">("izin");
  const [digerAcik, setDigerAcik] = useState(false);
  const [aralikFormu, setAralikFormu] = useState(false);
  const [sifreAcik, setSifreAcik] = useState(false);
  const [personelGorunum, setPersonelGorunum] = useState<"personel" | "kullanicilar" | "gecmis">("personel");
  // Yan menüden seçilen İK bölümü ve açık/kapalı menü grupları (kullanıcı açıp kapatmadıysa etkin öğenin grubu açıktır)
  const [ikBolum, setIkBolum] = useState<string | null>(null);
  const [grupAcik, setGrupAcik] = useState<Record<string, boolean>>({});

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
          setDolanBelge(v.dolanBelge);
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
      setDolanBelge,
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
  const bekleyenIzin = izinler.filter((iz) => iz.durum === "BEKLEMEDE").length;
  // Sol menüdeki sayaçlar: izin + telefon talepleri bir sekmede, fazla mesai ayrı sekmede
  const sekmeSayaci: Partial<Record<Sekme, number>> = { talepler: bekleyenIzin + bekleyenCihaz, mesai: bekleyenMesai };

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
      const gunPlaniBul = (tarih: string) => gunPlani(harita.get(`${p.id}|${tarih}`), tarih, varsayilan, vardiyaBul, ayarlar.calismayan_gunler);
      const cozucu = vardiyaCozucu(gunPlaniBul, ayarlar.erken_giris_payi_dk * DK_MS);
      return { gunPlaniBul, cozucu, bitisBul: (an: Date) => cozucu(an)?.son ?? null };
    };
  }, [planlar, vardiyalar, ayarlar]);

  const bugunOzet: BugunOzet = useMemo(() => {
    const simdi = veriZamani;
    const resmiTatil = resmiTatiller.some((t) => t.tarih === bugunTarih && !t.yarim_gun);

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
  const netToplamDk = filtrelenmisPuantaj.reduce((t, p) => t + p.toplamCalismaDk, 0);
  const onayliMesaiDk = mesaiTalepleri
    .filter((t) => t.durum === "ONAYLANDI" && t.tarih.startsWith(seciliAy))
    .filter((t) => seciliSubeFiltre === "TUMU" || t.personeller?.varsayilan_sube_id === seciliSubeFiltre)
    .reduce((top, t) => top + t.sure_dk, 0);

  // Genel bakıştaki canlı akış ve kişi saatleri için: bugünün hareketleri (şube filtresine göre, eskiden yeniye)
  const bugunkuHareketler = useMemo(() => {
    const kapsam = new Set(
      personeller
        .filter((p) => p.aktif && (seciliSubeFiltre === "TUMU" || p.varsayilan_sube_id === seciliSubeFiltre))
        .map((p) => p.id)
    );
    return bugunHareketleri
      .filter((h) => kapsam.has(h.personel_id) && yerelTarih(h.created_at) === bugunTarih)
      .sort((x, y) => x.created_at.localeCompare(y.created_at));
  }, [bugunHareketleri, personeller, seciliSubeFiltre, bugunTarih]);

  const yapilacaklar: YapilacakMadde[] = [
    {
      sayi: genel ? dolanBelge : 0,
      metin: "personel belgesinin süresi doldu ya da 30 gün içinde doluyor (rapor, sözleşme vb.)",
      etiket: "Personel",
      ton: "uyari",
      eylem: () => setAktifSekme("personel"),
    },
    {
      sayi: genel && !yukleniyor && subeler.length === 0 ? 1 : 0,
      metin: "kurulum adımı eksik: şube ve konumu tanımlanmadı, personel giriş/çıkış yapamaz",
      etiket: "Şube ekle",
      ton: "hata",
      eylem: () => setAktifSekme("subeler"),
    },
    {
      sayi: cikisEksikler.length,
      metin: "girişin çıkış kaydı yok (çıkış basılmamış)",
      etiket: "Düzelt",
      ton: "hata",
      eylem: () => setForm({ tur: "cikisEksik" }),
    },
    {
      sayi: bekleyenIzin,
      metin: "izin talebi onay bekliyor",
      etiket: "İncele",
      ton: "uyari",
      eylem: () => {
        setTalepGorunum("izin");
        setAktifSekme("talepler");
      },
    },
    {
      sayi: bekleyenMesai,
      metin: "fazla mesai talebi onay bekliyor",
      etiket: "İncele",
      ton: "uyari",
      eylem: () => setAktifSekme("mesai"),
    },
    {
      sayi: yetkili("cihaz") ? bekleyenCihaz : 0,
      metin: "yeni telefon talebi bekliyor",
      etiket: "İncele",
      ton: "uyari",
      eylem: () => {
        setTalepGorunum("cihaz");
        setAktifSekme("talepler");
      },
    },
    {
      sayi: bugunOzet.gec.length,
      metin: "kişi bugün işe geç geldi",
      etiket: "Hareketler",
      eylem: () => setAktifSekme("genel"),
    },
    {
      sayi: yetkili("pin") ? pinsizSayisi : 0,
      metin: "personelin mobil PIN'i yok, giriş yapamaz",
      etiket: "PIN belirle",
      eylem: () => setAktifSekme("personel"),
    },
    {
      sayi: eksikToplam,
      metin: `gün ${ayAdi(seciliAy)} içinde eksik giriş/çıkış kaydı`,
      etiket: "Puantaj",
      eylem: () => setAktifSekme("puantaj"),
    },
    {
      sayi: devamsizToplam,
      metin: `gün ${ayAdi(seciliAy)} içinde devamsızlık`,
      etiket: "Puantaj",
      eylem: () => setAktifSekme("puantaj"),
    },
  ];

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
  function sekmeVerisi(sekme: Sekme = aktifSekme, k?: RaporKaynagi): { baslik: string; dosyaAdi: string; veriler: Satir[]; sureSutunlari?: string[] } {
    const ek = `MNS_Next_IK_${bugunTarih}`;
    // Kaynak verilmezse seçili ay; verilirse tarih aralığının verisi (şube filtresi uygulanmış)
    const donem = k?.donem ?? seciliAy;
    const dHareket = k?.hareketler ?? ayHareketleri;
    const dPuantaj = k?.puantaj ?? filtrelenmisPuantaj;
    const dMesai = k?.mesai ?? mesaiTalepleri.filter((t) => t.tarih.startsWith(seciliAy));
    const dIzin = k?.izinler ?? izinler;

    if (sekme === "genel") {
      return {
        baslik: `PDKS Hareketleri (${donem})`,
        dosyaAdi: `${ek}_Hareketler_${donem}`,
        veriler: dHareket.map((h, i) => ({
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

    if (sekme === "mesai") {
      return {
        baslik: `Fazla Mesai (${donem})`,
        dosyaAdi: `${ek}_FazlaMesai_${donem}`,
        veriler: dMesai
          .filter((t) => t.durum === "ONAYLANDI")
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
    if (sekme === "talepler") {
      return {
        baslik: k ? `Onaylı İzin ve Raporlar (${donem})` : "Onaylı İzin ve Raporlar",
        dosyaAdi: k ? `${ek}_Izinler_${donem}` : `${ek}_Izinler`,
        veriler: dIzin.filter((iz) => !iz.durum || iz.durum === "ONAYLANDI").map((iz, i) => ({
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

    if (sekme === "vardiya") {
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

    if (sekme === "subeler") {
      return {
        baslik: "Şube Listesi",
        dosyaAdi: `${ek}_Subeler`,
        veriler: subeler.map((s, i) => ({
          Sıra: i + 1,
          Şube: s.ad,
          Enlem: Number(s.enlem),
          Boylam: Number(s.boylam),
          "Sınır (m)": s.limit_metre,
          "Aktif Personel": personeller.filter((p) => p.aktif && p.varsayilan_sube_id === s.id).length,
        })),
      };
    }

    if (sekme === "personel") {
      return {
        baslik: "Personel Listesi",
        dosyaAdi: `${ek}_Personeller`,
        veriler: filtrelenmisPersoneller.map((p, i) => ({
          Sıra: i + 1,
          "Sicil No": p.sicil_no,
          "Ad Soyad": `${p.ad} ${p.soyad}`.trim(),
          "T.C. Kimlik": p.tc_kimlik,
          Departman: p.departman || "Genel",
          Ünvan: p.unvan || "",
          Şube: p.subeler?.ad || "Atanmamış",
          Durum: p.aktif ? "Aktif" : "Pasif",
          Cihaz: p.cihaz_id ? "Eşleşti" : "Boşta",
        })),
      };
    }

    // bakış ve puantaj sekmeleri puantaj raporu verir
    return {
      baslik: k ? `Puantaj ve Devam Cetveli (${donem})` : `Aylık Puantaj ve Bordro Cetveli (${seciliAy})`,
      dosyaAdi: `${ek}_Puantaj_${donem}`,
      veriler: dPuantaj.map((p, i) => ({ p, i, o: onayliMesai(p, dMesai) })).map(({ p, i, o }) => ({
        Sıra: i + 1,
        Dönem: donem,
        "Sicil No": p.sicil_no,
        "Ad Soyad": p.adSoyad,
        Departman: p.departman,
        Şube: p.subeAdi,
        Vardiya: p.vardiyaAdi,
        "İşe Giriş": p.iseGiris ?? "-",
        "İşten Çıkış": p.cikisTarihi ?? "-",
        "Çalışılan Gün": p.calisilanGunler,
        "Eksik Hareketli Gün": p.eksikGunler,
        "Raporlu Gün (SGK 01)": p.raporluGunler,
        "İzinli Gün": p.izinliGunler,
        "Devamsız Gün": p.devamsizGunler,
        "Resmi Tatil Çalışma Günü": p.resmiTatilCalismalari,
        "Hafta Tatili Çalışma Günü": p.haftaTatiliCalismalari,
        [PUANTAJ_SURE[0]]: p.toplamCalismaDk,
        [PUANTAJ_SURE[1]]: o.fazlaDk,
        [PUANTAJ_SURE[2]]: o.rtDk,
        [PUANTAJ_SURE[3]]: o.htDk,
        [PUANTAJ_SURE[4]]: p.gecikmeDk,
      })),
      sureSutunlari: [...PUANTAJ_SURE],
    };
  }

  /**
   * Bordro programına elle ya da şablonla aktarılacak genel puantaj (genel yönetici).
   * Saatler ondalık (2,5 = 2 saat 30 dk); SGK günleri aylık ücretli varsayımıyla tahmindir.
   */
  /** İzin belgelerinde işe dönüş tarihi için firmanın takvimi */
  const isTakvimi = {
    calismayanGunler: ayarlar.calismayan_gunler,
    tatiller: new Set(resmiTatiller.filter((t) => !t.yarim_gun).map((t) => t.tarih)),
  };

  async function bordroIndir() {
    const kisiler = new Map(personeller.map((p) => [p.id, p]));
    // Özlük (unvan, ücret, IBAN): tablo yoksa ya da okunamazsa boş kalır
    const { data: ozlukD } = await supabase.from("personel_ozluk").select("personel_id, unvan, ucret, ucret_turu, iban");
    const ozluk = new Map(((ozlukD ?? []) as { personel_id: string; unvan: string | null; ucret: number | null; ucret_turu: string | null; iban: string | null }[]).map((o) => [o.personel_id, o]));
    // Avans ve masraf: o ayın tarihli, onaylanmış ya da ödenmiş kayıtları (tablo yoksa boş kalır)
    const { data: odemeD } = await supabase
      .from("odeme_talepleri")
      .select("personel_id, tur, tutar")
      .in("durum", ["ONAYLANDI", "ODENDI"])
      .gte("tarih", `${seciliAy}-01`)
      .lt("tarih", gunEkle(`${seciliAy}-01`, 32).slice(0, 8) + "01");
    const avans = new Map<string, number>();
    const masraf = new Map<string, number>();
    for (const o of (odemeD ?? []) as { personel_id: string; tur: string; tutar: number }[]) {
      const m = o.tur === "Avans" ? avans : masraf;
      m.set(o.personel_id, Math.round(((m.get(o.personel_id) ?? 0) + Number(o.tutar)) * 100) / 100);
    }
    const saat = (dk: number) => Math.round((dk / 60) * 100) / 100;
    const veriler = filtrelenmisPuantaj.map((p, i) => {
      const k = kisiler.get(p.id);
      const o = ozluk.get(p.id);
      // Yalnızca müdürün onayladığı fazla mesai talepleri (günün türüne göre)
      const m = onayliMesai(p, mesaiTalepleri);
      return {
        Sıra: i + 1,
        Dönem: seciliAy,
        "Sicil No": p.sicil_no,
        "T.C. Kimlik No": k?.tc_kimlik ?? "",
        Ad: k?.ad ?? p.adSoyad,
        Soyad: k?.soyad ?? "",
        Şube: p.subeAdi,
        Departman: p.departman,
        Unvan: k?.unvan || o?.unvan || "",
        "İşe Giriş": p.iseGiris ?? "",
        "İşten Çıkış": p.cikisTarihi ?? "",
        Ücret: o?.ucret ?? "",
        "Ücret Türü": o?.ucret_turu ?? "",
        IBAN: o?.iban ?? "",
        "Fiili Çalışılan Gün": p.calisilanGunler,
        "Yıllık İzin (iş günü)": p.yillikIzinGunler,
        "Diğer Ücretli İzin (iş günü)": p.ucretliIzinGunler,
        "Ücretsiz İzin (takvim günü)": p.ucretsizIzinGunler,
        "Rapor (takvim günü)": p.raporluGunler,
        "Devamsız Gün": p.devamsizGunler,
        "Eksik Hareketli Gün": p.eksikGunler,
        "SGK Taban Gün": p.sgkTabanGun,
        "SGK Eksik Gün": p.sgkEksikGun,
        "SGK Eksik Gün Kodu": p.sgkEksikKodu,
        "SGK Prim Günü": p.sgkPrimGun,
        "Net Çalışma (saat)": saat(p.toplamCalismaDk),
        "Onaylı Fazla Mesai (saat)": saat(m.fazlaDk),
        "Onaylı Hafta Tatili Mesaisi (saat)": saat(m.htDk),
        "Onaylı Resmi Tatil Mesaisi (saat)": saat(m.rtDk),
        "Gecikme (saat)": saat(p.gecikmeDk),
        "Avans (TL, kesilecek)": avans.get(p.id) ?? 0,
        "Masraf (TL, ödenecek)": masraf.get(p.id) ?? 0,
      };
    });
    const sorun = disariAktar("xlsx", `Bordro ${seciliAy}`, `${`MNS_Next_IK_${bugunTarih}`}_Bordro_Aktarim_${seciliAy}`, veriler);
    if (sorun) bildir(sorun, "hata");
    else bildir("Bordro aktarım dosyası hazırlandı. SGK günleri tahmindir; mali müşavirinizle kontrol edin.", "basari");
  }

  /** Raporlar sayfasındaki çekirdek raporlar (seçili ay ve şube filtresiyle) */
  function cekirdekRapor(kod: string, k?: RaporKaynagi): { baslik: string; dosyaAdi: string; veriler: Satir[]; sureSutunlari?: string[] } {
    const ek = `MNS_Next_IK_${bugunTarih}`;
    const donem = k?.donem ?? seciliAy;
    const dPuantaj = k?.puantaj ?? filtrelenmisPuantaj;
    const sekmeye: Record<string, Sekme> = {
      puantaj: "puantaj",
      hareketler: "genel",
      mesai: "mesai",
      talepler: "talepler",
      personel: "personel",
      vardiya: "vardiya",
      subeler: "subeler",
    };
    if (sekmeye[kod]) return sekmeVerisi(sekmeye[kod], k);
    if (kod === "gunluk") {
      const durumu = (id: string) =>
        bugunOzet.iceride.some((x) => x.id === id)
          ? "İçeride"
          : bugunOzet.cikti.some((x) => x.id === id)
          ? "Çıktı"
          : bugunOzet.izinli.some((x) => x.id === id)
          ? "İzinli"
          : bugunOzet.gelmedi.some((x) => x.id === id)
          ? "Gelmedi"
          : bugunOzet.tatil
          ? "Tatil"
          : "Henüz gelmedi / vardiyası yok";
      return {
        baslik: `Günlük Devam Durumu (${bugunTarih})`,
        dosyaAdi: `${ek}_Gunluk_Devam`,
        veriler: filtrelenmisPersoneller
          .filter((x) => x.aktif)
          .map((x, i) => ({
            Sıra: i + 1,
            "Sicil No": x.sicil_no,
            "Ad Soyad": `${x.ad} ${x.soyad}`,
            Şube: x.subeler?.ad || "-",
            Durum: durumu(x.id),
            "Geç Kaldı": bugunOzet.gec.some((g) => g.id === x.id) ? "Evet" : "",
          })),
      };
    }
    if (kod === "gecikme") {
      return {
        baslik: `Geç Kalma ve Devamsızlık (${donem})`,
        dosyaAdi: `${ek}_Gecikme_${donem}`,
        veriler: dPuantaj
          .filter((x) => x.gecikmeDk > 0 || x.erkenCikisDk > 0 || x.devamsizGunler > 0 || x.eksikGunler > 0)
          .sort((a, b) => b.gecikmeDk + b.erkenCikisDk - (a.gecikmeDk + a.erkenCikisDk))
          .map((x, i) => ({
            Sıra: i + 1,
            "Sicil No": x.sicil_no,
            "Ad Soyad": x.adSoyad,
            Departman: x.departman,
            Şube: x.subeAdi,
            "Geç Giriş (gün)": x.gecGirisGun,
            "Toplam Gecikme (sa:dk)": x.gecikmeDk,
            "Erken Çıkış (gün)": x.erkenCikisGun,
            "Toplam Erken Çıkış (sa:dk)": x.erkenCikisDk,
            "Devamsız Gün": x.devamsizGunler,
            "Eksik Hareketli Gün": x.eksikGunler,
          })),
        sureSutunlari: ["Toplam Gecikme (sa:dk)", "Toplam Erken Çıkış (sa:dk)"],
      };
    }
    if (kod === "izinBakiye") {
      return {
        baslik: `Yıllık İzin Bakiyeleri (${bugunTarih})`,
        dosyaAdi: `${ek}_Izin_Bakiyeleri`,
        veriler: filtrelenmisPersoneller
          .filter((x) => x.aktif)
          .map((x, i) => {
            const b = bakiyeler[x.id];
            return {
              Sıra: i + 1,
              "Sicil No": x.sicil_no,
              "Ad Soyad": `${x.ad} ${x.soyad}`,
              Şube: x.subeler?.ad || "-",
              "İşe Giriş": x.ise_giris_tarihi || "-",
              "Kıdem (yıl)": b?.kidem_yil ?? "",
              Devreden: b?.devreden ?? "",
              "Hak Edilen": b?.hak_edilen ?? "",
              Kullanılan: b?.kullanilan ?? "",
              "Onay Bekleyen": b?.bekleyen ?? "",
              Kalan: b?.kalan ?? "",
              "Sonraki Hak Tarihi": b?.sonraki_hak_tarihi ?? "",
            };
          }),
      };
    }
    // Dönemin ilk ve son günü (aralık ya da seçili ay)
    const [dBas, dBit] = k ? [k.donem.slice(0, 10), k.donem.slice(11, 21)] : [`${seciliAy}-01`, gunEkle(yerelTarih(ayAraligi(seciliAy).son), -1)];
    const kisi = new Map(personeller.map((x) => [x.id, x]));
    const gorunenKisi = new Set(filtrelenmisPersoneller.map((x) => x.id));
    const isGunuSay = (bas: string, bit: string) => {
      let n = 0;
      for (let t = bas; t <= bit; t = gunEkle(t, 1)) {
        const iso = new Date(`${t}T12:00:00Z`).getUTCDay() || 7;
        if (!isTakvimi.calismayanGunler.includes(iso) && !isTakvimi.tatiller.has(t)) n++;
      }
      return n;
    };
    const onayliIzinler = izinler.filter(
      (iz) => (!iz.durum || iz.durum === "ONAYLANDI") && iz.baslangic_tarihi <= dBit && iz.bitis_tarihi >= dBas && gorunenKisi.has(iz.personel_id)
    );
    if (kod === "izinOzet") {
      const grup = new Map<string, { pid: string; tur: string; adet: number; isGunu: number; takvim: number; dusulen: number }>();
      for (const iz of onayliIzinler.filter((x) => x.izin_turu !== "Saatlik İzin")) {
        const bas = iz.baslangic_tarihi > dBas ? iz.baslangic_tarihi : dBas;
        const bit = iz.bitis_tarihi < dBit ? iz.bitis_tarihi : dBit;
        const anahtar = `${iz.personel_id}|${iz.izin_turu}`;
        const g = grup.get(anahtar) ?? { pid: iz.personel_id, tur: iz.izin_turu, adet: 0, isGunu: 0, takvim: 0, dusulen: 0 };
        g.adet++;
        g.isGunu += isGunuSay(bas, bit);
        g.takvim += Math.round((Date.parse(bit) - Date.parse(bas)) / 86400000) + 1;
        if (iz.baslangic_tarihi >= dBas && iz.bitis_tarihi <= dBit) g.dusulen += Number(iz.gun_sayisi ?? 0);
        grup.set(anahtar, g);
      }
      return {
        baslik: `Personel İzin Raporu (${donem})`,
        dosyaAdi: `${ek}_Izin_Ozeti_${donem}`,
        veriler: [...grup.values()]
          .sort((a, b) => (kisi.get(a.pid)?.ad ?? "").localeCompare(kisi.get(b.pid)?.ad ?? "", "tr") || a.tur.localeCompare(b.tur, "tr"))
          .map((g, i) => {
            const x = kisi.get(g.pid);
            return {
              Sıra: i + 1,
              "Sicil No": x?.sicil_no ?? "",
              "Ad Soyad": x ? `${x.ad} ${x.soyad}` : "",
              Departman: x?.departman ?? "",
              Ünvan: x?.unvan ?? "",
              Şube: x?.subeler?.ad ?? "",
              "İzin Türü": g.tur,
              "İzin Sayısı": g.adet,
              "İş Günü (dönemde)": g.isGunu,
              "Takvim Günü (dönemde)": g.takvim,
            };
          }),
      };
    }
    if (kod === "saatlikIzin") {
      const satirlar: Satir[] = [];
      const sirali = onayliIzinler
        .filter((x) => x.izin_turu === "Saatlik İzin")
        .sort((a, b) => (kisi.get(a.personel_id)?.ad ?? "").localeCompare(kisi.get(b.personel_id)?.ad ?? "", "tr") || a.baslangic_tarihi.localeCompare(b.baslangic_tarihi));
      const saatOf = (iz: (typeof sirali)[number]) => {
        if (!iz.baslangic_saat || !iz.bitis_saat) return 0;
        const [a1, a2] = iz.baslangic_saat.split(":").map(Number);
        const [b1, b2] = iz.bitis_saat.split(":").map(Number);
        return Math.max(0, b1 * 60 + b2 - (a1 * 60 + a2));
      };
      let onceki = "";
      let toplam = 0;
      const kapat = () => {
        if (!onceki) return;
        const x = kisi.get(onceki);
        satirlar.push({ Sıra: "", "Sicil No": x?.sicil_no ?? "", "Ad Soyad": `${x ? `${x.ad} ${x.soyad}` : ""} toplamı`, Tarih: "", Saat: "", "Süre (sa:dk)": toplam, Açıklama: "" });
      };
      sirali.forEach((iz, i) => {
        if (iz.personel_id !== onceki) {
          kapat();
          onceki = iz.personel_id;
          toplam = 0;
        }
        const x = kisi.get(iz.personel_id);
        const dk = saatOf(iz);
        toplam += dk;
        satirlar.push({
          Sıra: i + 1,
          "Sicil No": x?.sicil_no ?? "",
          "Ad Soyad": x ? `${x.ad} ${x.soyad}` : "",
          Tarih: iz.baslangic_tarihi,
          Saat: `${(iz.baslangic_saat ?? "").slice(0, 5)}-${(iz.bitis_saat ?? "").slice(0, 5)}`,
          "Süre (sa:dk)": dk,
          Açıklama: iz.aciklama ?? "",
        });
      });
      kapat();
      return { baslik: `Saatlik İzin Raporu (${donem})`, dosyaAdi: `${ek}_Saatlik_Izin_${donem}`, veriler: satirlar, sureSutunlari: ["Süre (sa:dk)"] };
    }
    if (kod === "izinDonem") {
      const satirlar: Satir[] = [];
      for (const x of filtrelenmisPersoneller.filter((p) => p.aktif && p.ise_giris_tarihi)) {
        const hak = hakedisYillari(x, bugunTarih).filter((h) => h.sayildi);
        const kull = yillikKullanimlar(x, izinler);
        const kullanim = (bas: string, bit: string | null) =>
          kull.filter((iz) => iz.baslangic_tarihi >= bas && (!bit || iz.baslangic_tarihi < bit)).reduce((t, iz) => t + Number(iz.gun_sayisi ?? 0), 0);
        let bakiye = Number(x.devreden_izin_gun ?? 0);
        const ortak = { "Sicil No": x.sicil_no, "Ad Soyad": `${x.ad} ${x.soyad}`, Departman: x.departman ?? "", Şube: x.subeler?.ad ?? "" };
        const ilk = hak[0]?.tarih ?? null;
        const once = kullanim("0000-00-00", ilk);
        if (bakiye || once) {
          const devir = bakiye;
          bakiye -= once;
          satirlar.push({ ...ortak, Dönem: "Devir / hak öncesi", Başlangıç: x.devir_tarihi ?? x.ise_giris_tarihi ?? "", Bitiş: ilk ?? "", Devreden: devir, "Hak Edilen": 0, Kullanılan: once, Kalan: bakiye, Durum: ilk ? "Kapandı" : "Devam ediyor" });
        }
        hak.forEach((h, i) => {
          const sonraki = hak[i + 1]?.tarih ?? null;
          const devir = bakiye;
          const kullanilan = kullanim(h.tarih, sonraki);
          bakiye = bakiye + h.gun - kullanilan;
          satirlar.push({ ...ortak, Dönem: `${h.yil}. hizmet yılı`, Başlangıç: h.tarih, Bitiş: sonraki ? gunEkle(sonraki, -1) : "", Devreden: devir, "Hak Edilen": h.gun, Kullanılan: kullanilan, Kalan: bakiye, Durum: sonraki ? "Kapandı" : "Devam ediyor" });
        });
      }
      return {
        baslik: `Yıllık İzin Dönemleri (${bugunTarih})`,
        dosyaAdi: `${ek}_Yillik_Izin_Donemleri`,
        veriler: satirlar.map((x, i) => ({ Sıra: i + 1, ...x })),
      };
    }
    if (kod === "vardiyaPlan") {
      const harita = planHaritasi(k?.planlar ?? planlar);
      const vh = new Map(vardiyalar.map((v) => [v.id, v]));
      const satirlar: Satir[] = [];
      for (let t = dBas; t <= dBit; t = gunEkle(t, 1)) {
        const tatil = resmiTatiller.find((x) => x.tarih === t && !x.yarim_gun);
        for (const x of filtrelenmisPersoneller) {
          if (!x.aktif && (!x.cikis_tarihi || x.cikis_tarihi < t)) continue;
          if (x.ise_giris_tarihi && x.ise_giris_tarihi > t) continue;
          const gp = gunPlani(harita.get(`${x.id}|${t}`), t, x.vardiyalar ?? vardiyalar[0] ?? null, (id) => vh.get(id), ayarlar.calismayan_gunler);
          const v = gp.vardiyalar;
          satirlar.push({
            Tarih: t,
            Gün: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][new Date(`${t}T12:00:00Z`).getUTCDay()],
            "Sicil No": x.sicil_no,
            "Ad Soyad": `${x.ad} ${x.soyad}`,
            Departman: x.departman ?? "",
            Şube: x.subeler?.ad ?? "",
            Vardiya: tatil ? "-" : gp.tatil ? "-" : v.map((y) => y.ad).join(" + ") || "-",
            Saat: tatil || gp.tatil ? "" : v.map((y) => `${y.baslangic_saat.slice(0, 5)}-${y.bitis_saat.slice(0, 5)}`).join(", "),
            "Gün Türü": tatil ? `Resmî tatil (${tatil.ad})` : gp.tatil ? "Hafta tatili" : "Çalışma günü",
            Kaynak: gp.kaynak === "plan" ? "Vardiya planı" : "Varsayılan vardiya",
          });
        }
      }
      return { baslik: `Vardiya Planı (${donem})`, dosyaAdi: `${ek}_Vardiya_Plani_${donem}`, veriler: satirlar };
    }
    if (kod === "cetvel") {
      return {
        baslik: `Puantaj Cetveli (${donem})`,
        dosyaAdi: `${ek}_Puantaj_Cetveli_${donem}`,
        veriler: cetvelAktarimi(dPuantaj, k?.mesai ?? mesaiTalepleri),
      };
    }
    if (kod === "ayrintili") {
      return {
        baslik: `Ayrıntılı Devam Çizelgesi (${donem})`,
        dosyaAdi: `${ek}_Ayrintili_Devam_${donem}`,
        veriler: dPuantaj.flatMap((x) =>
          x.gunlukDetaylar.map((d) => ({
            "Sicil No": x.sicil_no,
            "Ad Soyad": x.adSoyad,
            Şube: x.subeAdi,
            Tarih: d.tarih,
            Gün: d.gunAdi,
            Giriş: d.giris,
            Çıkış: d.cikis,
            "Net Çalışma": d.netCalisma,
            Durum: d.durum,
            Not: d.not,
          }))
        ),
      };
    }
    return { baslik: "", dosyaAdi: "", veriler: [] };
  }

  /** Tarih aralığının hareketleri, planı ve fazla mesaileri çekilip puantaj o aralık için hesaplanır */
  async function aralikKaynagi(bas: string, bit: string): Promise<RaporKaynagi> {
    const gun = 24 * 60 * 60 * 1000;
    // Gece vardiyası eşleştirmesi için iki yanda birer gün pay
    const basAn = new Date(new Date(`${bas}T00:00:00+03:00`).getTime() - gun).toISOString();
    const sonAn = new Date(new Date(`${bit}T00:00:00+03:00`).getTime() + 2 * gun).toISOString();
    const [har, plan, mesai] = await Promise.all([
      tumunuGetir<Hareket>((a, b) =>
        supabase
          .from("hareketler")
          .select(`*, personeller (ad, soyad, sicil_no, tc_kimlik), subeler (ad)`)
          .gte("created_at", basAn)
          .lt("created_at", sonAn)
          .order("created_at", { ascending: true })
          .order("id")
          .range(a, b)
      ),
      tumunuGetir<PlanSatiri>((a, b) =>
        supabase
          .from("vardiya_plani")
          .select("id, personel_id, tarih, tur, vardiya_id, sube_id")
          .gte("tarih", gunEkle(bas, -1))
          .lte("tarih", gunEkle(bit, 1))
          .order("tarih")
          .order("id")
          .range(a, b)
      ).catch(() => [] as PlanSatiri[]),
      tumunuGetir<MesaiTalebi>((a, b) =>
        supabase
          .from("mesai_talepleri")
          .select("*, personeller (ad, soyad, sicil_no, varsayilan_sube_id)")
          .gte("tarih", bas)
          .lte("tarih", bit)
          .order("tarih", { ascending: false })
          .order("id")
          .range(a, b)
      ).catch(() => [] as MesaiTalebi[]),
    ]);
    const subede = (id: string | null | undefined) => seciliSubeFiltre === "TUMU" || id === seciliSubeFiltre;
    const puantaj = aralikPuantajHesapla({
      bas,
      bit,
      personeller,
      hareketler: har,
      izinler,
      resmiTatiller,
      vardiyalar,
      planlar: plan,
      ayarlar,
      bugun: bugunTarih,
      simdi: new Date(),
    }).filter((x) => subede(x.subeId));
    const kisiSubesi = new Map(personeller.map((x) => [x.id, x.varsayilan_sube_id]));
    return {
      donem: `${bas}_${bit}`,
      planlar: plan,
      hareketler: har
        .filter((h) => {
          const t = yerelTarih(h.created_at);
          return t >= bas && t <= bit && subede(h.sube_id);
        })
        .reverse(),
      puantaj,
      mesai,
      izinler: izinler.filter((iz) => iz.baslangic_tarihi <= bit && iz.bitis_tarihi >= bas && subede(kisiSubesi.get(iz.personel_id))),
    };
  }

  /** Raporu seçili ay için ya da verilen tarih aralığı için üretir */
  async function raporUret(kod: string, aralik?: { bas: string; bit: string }) {
    return cekirdekRapor(kod, aralik ? await aralikKaynagi(aralik.bas, aralik.bit) : undefined);
  }

  /** Tarih aralığıyla indirilebilen sekmeler ve rapor kodları */
  const ARALIK_RAPORU: Partial<Record<Sekme, string>> = { genel: "hareketler", bakis: "puantaj", puantaj: "puantaj", mesai: "mesai", talepler: "talepler" };

  async function aralikRaporIndir(bas: string, bit: string, format: Bicim) {
    const kod = ARALIK_RAPORU[aktifSekme];
    if (!kod) return;
    const pencere = format === "pdf" ? window.open("", "_blank") : null;
    try {
      const { baslik, dosyaAdi, veriler, sureSutunlari } = await raporUret(kod, { bas, bit });
      if (!veriler.length) {
        pencere?.close();
        bildir(`${bas} – ${bit} aralığında kayıt yok.`, "bilgi");
        return;
      }
      const sorun = disariAktar(format, baslik, dosyaAdi, veriler, sureSutunlari, pencere);
      if (sorun) bildir(sorun, "hata");
      else {
        bildir(`Rapor hazırlandı (${veriler.length} satır).`, "basari");
        setAralikFormu(false);
      }
    } catch (err) {
      pencere?.close();
      bildir(hataYaz(err), "hata");
    }
  }

  function raporIndir(format: Bicim) {
    const { baslik, dosyaAdi, veriler, sureSutunlari } = sekmeVerisi();
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
    // Pasife almak işten çıkıştır: çıkış tarihi ayrı formda sorulur
    if (p.aktif) return setForm({ tur: "cikis", hedef: p });
    const tamam = await onayla({
      baslik: `${p.ad} ${p.soyad} tekrar aktif edilsin mi?`,
      metin: p.cikis_tarihi
        ? `Mobil girişi yeniden açılır ve ${kisaTarih(p.cikis_tarihi)} çıkış tarihi kaldırılır (yeniden işe başlama).`
        : "Mobil girişi yeniden açılır.",
      onayEtiketi: "Aktif et",
    });
    if (!tamam) return;
    try {
      const { error } = await supabase.from("personeller").update({ aktif: true, cikis_tarihi: null }).eq("id", p.id);
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

  // Şubeler yalnızca genel yöneticide; İK işlemleri firmada en az bir modül açıksa
  const gorunenSekmeler = SEKMELER.filter(
    (s) => (s.id !== "subeler" || genel) && (s.id !== "ik" || yetki.moduller == null || yetki.moduller.length > 0) && (s.id !== "raporlar" || yetkili("rapor"))
  );
  const altAna = gorunenSekmeler.filter((s) => ALT_CUBUK.includes(s.id));
  const altDiger = gorunenSekmeler.filter((s) => !ALT_CUBUK.includes(s.id));
  const digerSayac = altDiger.reduce((t, s) => t + (sekmeSayaci[s.id] ?? 0), 0);
  // Yan menü: tek öğeler ve açılır kapanır gruplar
  const sekmeVar = (id: Sekme) => gorunenSekmeler.some((s) => s.id === id);
  const sekmeBilgi = (id: Sekme) => SEKMELER.find((s) => s.id === id)!;
  const ikListesi = sekmeVar("ik") ? ikBolumleri(yetki) : [];
  const etkinIk = ikListesi.find((b) => b.id === ikBolum)?.id ?? ikListesi[0]?.id ?? null;
  type MenuOgesi = { anahtar: string; etiket: string; ikon: IkonAdi; sekme: Sekme; alt?: string; sayac?: number };
  const oge = (id: Sekme, etiket?: string, alt?: string): MenuOgesi => ({
    anahtar: alt ? `${id}:${alt}` : id,
    etiket: etiket ?? sekmeBilgi(id).etiket,
    ikon: sekmeBilgi(id).ikon,
    sekme: id,
    alt,
    sayac: alt ? undefined : sekmeSayaci[id],
  });
  type MenuGrubu = { id: string; etiket: string | null; ikon: IkonAdi; ogeler: MenuOgesi[] };
  const tumGruplar: MenuGrubu[] = [
    { id: "bakis", etiket: null, ikon: "bakis", ogeler: [oge("bakis")] },
    { id: "pdks", etiket: "PDKS", ikon: "puantaj", ogeler: [oge("puantaj"), oge("genel"), oge("vardiya")] },
    { id: "talep", etiket: "Talepler", ikon: "talepler", ogeler: [oge("talepler"), oge("mesai")] },
    {
      id: "personel",
      etiket: "Personel işlemleri",
      ikon: "personel",
      ogeler: [
        oge("personel", "Personel listesi", "personel"),
        ...(genel ? [oge("personel", "Panel kullanıcıları", "kullanicilar"), oge("personel", "İşlem geçmişi", "gecmis")] : []),
        ...(sekmeVar("subeler") ? [oge("subeler")] : []),
      ],
    },
    { id: "ik", etiket: "İK işlemleri", ikon: "ik", ogeler: ikListesi.map((b) => ({ ...oge("ik", b.ad, b.id), ikon: "ik" as IkonAdi })) },
    { id: "raporlar", etiket: null, ikon: "rapor", ogeler: sekmeVar("raporlar") ? [oge("raporlar")] : [] },
  ];
  const menuGruplari = tumGruplar.filter((g) => g.ogeler.length > 0);
  const ogeEtkin = (o: MenuOgesi) =>
    aktifSekme === o.sekme && (o.alt === undefined || (o.sekme === "personel" ? personelGorunum === o.alt : o.sekme === "ik" ? etkinIk === o.alt : true));
  function ogeSec(o: MenuOgesi) {
    setAktifSekme(o.sekme);
    if (o.sekme === "personel" && o.alt) setPersonelGorunum(o.alt as "personel" | "kullanicilar" | "gecmis");
    if (o.sekme === "ik" && o.alt) setIkBolum(o.alt);
  }
  const etkinOge = menuGruplari.flatMap((g) => g.ogeler).find(ogeEtkin);
  const aktifBaslik = etkinOge?.etiket ?? SEKMELER.find((s) => s.id === aktifSekme)?.etiket ?? "";

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
            <p className="truncate text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              {yetki.firma?.ad ?? "Personel devam kontrol"}
            </p>
          </div>
        </div>

        <nav className="-mx-1 flex flex-col gap-1 overflow-y-auto px-1" aria-label="Ana menü">
          {menuGruplari.map((g) => {
            if (!g.etiket) {
              const o = g.ogeler[0];
              return (
                <button key={g.id} type="button" className="nav-oge" data-aktif={ogeEtkin(o)} onClick={() => ogeSec(o)}>
                  <Ikon ad={o.ikon} />
                  {o.etiket}
                  {(o.sayac ?? 0) > 0 && <span className="nav-sayac">{o.sayac}</span>}
                </button>
              );
            }
            const icinde = g.ogeler.some(ogeEtkin);
            const acik = grupAcik[g.id] ?? icinde;
            const toplam = g.ogeler.reduce((t, o) => t + (o.sayac ?? 0), 0);
            return (
              <div key={g.id}>
                <button
                  type="button"
                  className="nav-oge"
                  data-grup-etkin={icinde}
                  aria-expanded={acik}
                  onClick={() => setGrupAcik({ ...grupAcik, [g.id]: !acik })}
                >
                  <Ikon ad={g.ikon} />
                  {g.etiket}
                  {!acik && toplam > 0 && <span className="nav-sayac">{toplam}</span>}
                  <span className={`nav-ok ${!acik && toplam > 0 ? "" : "ml-auto"}`} data-acik={acik}>
                    <Ikon ad="sag" boyut={15} />
                  </span>
                </button>
                {acik && (
                  <div className="nav-alt">
                    {g.ogeler.map((o) => (
                      <button key={o.anahtar} type="button" className="nav-oge nav-alt-oge" data-aktif={ogeEtkin(o)} onClick={() => ogeSec(o)}>
                        {o.etiket}
                        {(o.sayac ?? 0) > 0 && <span className="nav-sayac">{o.sayac}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto space-y-1 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          {yetki.sistem && (
            <a href="/sistem" className="nav-oge">
              <Ikon ad="bina" />
              Firmalar
            </a>
          )}
          <a href="/mobil" target="_blank" rel="noopener noreferrer" className="nav-oge">
            <Ikon ad="telefon" />
            Mobil ekranı aç
          </a>
          <button type="button" className="nav-oge" onClick={() => setSifreAcik(true)}>
            <Ikon ad="anahtar" />
            Şifremi değiştir
          </button>
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

            {yetkili("rapor") && aktifSekme !== "ik" && aktifSekme !== "raporlar" && (
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
                  {ARALIK_RAPORU[aktifSekme] && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-oge"
                      onClick={() => {
                        kapat();
                        setAralikFormu(true);
                      }}
                    >
                      <Ikon ad="takvim" boyut={16} />
                      Tarih aralığıyla indir…
                    </button>
                  )}
                  {genel && (aktifSekme === "puantaj" || aktifSekme === "bakis") && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-oge"
                      onClick={() => {
                        kapat();
                        bordroIndir();
                      }}
                    >
                      <Ikon ad="rapor" boyut={16} />
                      Bordro aktarım dosyası (.xlsx)
                    </button>
                  )}
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
            <Karsilama veriZamani={veriZamani} yukleniyor={yukleniyor} onYenile={yukleyerekGetir} />
            <BugunSerit
              ozet={bugunOzet}
              yukleniyor={yukleniyor}
              hareketler={bugunkuHareketler}
              onGelmeyenler={() => setForm({ tur: "gelmeyen" })}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Yapilacaklar maddeler={yapilacaklar} />
              <SonHareketler hareketler={bugunkuHareketler} personeller={personeller} onTumu={() => setAktifSekme("genel")} />
            </div>
            <AyOzeti
              donem={ayAdi(seciliAy)}
              netDk={netToplamDk}
              mesaiDk={onayliMesaiDk}
              devamsiz={devamsizToplam}
              eksik={eksikToplam}
              onPuantaj={() => setAktifSekme("puantaj")}
              onMesai={() => setAktifSekme("mesai")}
            />
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
          </div>
        )}

        {aktifSekme === "puantaj" && (
          <PuantajSekmesi
            liste={filtrelenmisPuantaj}
            mesaiTalepleri={mesaiTalepleri}
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
            {yetkili("cihaz") && (
              <div className="segment" style={{ maxWidth: 360 }} role="tablist" aria-label="Talep türü">
                <button
                  type="button"
                  role="tab"
                  aria-selected={talepGorunum === "izin"}
                  data-aktif={talepGorunum === "izin"}
                  onClick={() => setTalepGorunum("izin")}
                >
                  İzin talepleri{bekleyenIzin > 0 ? ` (${bekleyenIzin})` : ""}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={talepGorunum === "cihaz"}
                  data-aktif={talepGorunum === "cihaz"}
                  onClick={() => setTalepGorunum("cihaz")}
                >
                  Telefon{bekleyenCihaz > 0 ? ` (${bekleyenCihaz})` : ""}
                </button>
              </div>
            )}
            {talepGorunum === "cihaz" && yetkili("cihaz") ? (
              <CihazTalepleriSekmesi talepler={cihazTalepleri} subeFiltre={seciliSubeFiltre} onKarar={cihazTalebiKarar} />
            ) : (
              <TaleplerSekmesi
                izinler={izinler}
                bakiyeler={bakiyeler}
                onForm={(iz) => {
                  const p = personeller.find((x) => x.id === iz.personel_id);
                  if (!p) return bildir("Personel bulunamadı.", "hata");
                  const sorun = izinFormuYazdir(yetki.firma?.ad ?? "", p, iz, bakiyeler[p.id], isTakvimi);
                  if (sorun) bildir(sorun, "hata");
                }}
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

        {aktifSekme === "mesai" && (
          <MesaiSekmesi
            talepler={mesaiTalepleri}
            personeller={personeller}
            hareketler={hareketler}
            seciliAy={seciliAy}
            subeFiltre={seciliSubeFiltre}
            onAyDegis={ayDegistir}
            brutHesap={
              bordroVerisi.hazir && !bordroVerisi.kurulmamis
                ? (pid, dk) => fazlaMesaiBrut(bordroVerisi, pid, dk, Number(seciliAy.slice(5, 7)))
                : undefined
            }
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
            {genel && personelGorunum === "kullanicilar" ? (
              <PanelKullanicilari subeler={subeler} />
            ) : genel && personelGorunum === "gecmis" ? (
              <IslemGecmisi personeller={personeller} />
            ) : (
              <PersonelSekmesi
                personeller={filtrelenmisPersoneller}
                bakiyeler={bakiyeler}
                izinliIdler={new Set(bugunOzet.izinli.map((p) => p.id))}
                devamsizIdler={new Set(bugunOzet.gelmedi.map((p) => p.id))}
                iceridekiIdler={new Set(bugunOzet.iceride.map((p) => p.id))}
                onIzinBilgileri={(p) => setForm({ tur: "izinBilgi", hedef: p })}
                onGorevBilgisi={yetkili("personel") ? (p) => setForm({ tur: "gorevBilgi", hedef: p }) : undefined}
                onOzluk={genel ? (p) => setForm({ tur: "ozluk", hedef: p }) : undefined}
                onYeni={yetkili("personel") ? () => setForm({ tur: "personel" }) : undefined}
                onPin={yetkili("pin") ? (p) => setForm({ tur: "pin", hedef: p }) : undefined}
                onCihaz={yetkili("cihaz") ? cihazSifirla : undefined}
                onAktif={yetkili("personel") ? personelAktifDegistir : undefined}
              />
            )}
          </div>
        )}

        {aktifSekme === "ik" && (
          <IkSekmesi
            personeller={personeller}
            subeler={subeler}
            yonetici={yetki}
            puantaj={filtrelenmisPuantaj}
            mesaiTalepleri={mesaiTalepleri}
            seciliAy={seciliAy}
            onAyDegis={ayDegistir}
            onHareketDuzelt={yetkili("manuel") ? (baslangic) => setForm({ tur: "manuel", baslangic }) : undefined}
            bolum={etkinIk}
          />
        )}

        {aktifSekme === "raporlar" && yetkili("rapor") && (
          <RaporlarSekmesi
            yonetici={yetki}
            personeller={filtrelenmisPersoneller}
            seciliAy={seciliAy}
            onAyDegis={ayDegistir}
            cekirdek={raporUret}
            onBordroAktarim={genel ? bordroIndir : undefined}
            onIzinKarti={(p) => {
              const sorun = izinKartiYazdir(yetki.firma?.ad ?? "", p, izinler, bakiyeler[p.id], isTakvimi);
              if (sorun) bildir(sorun, "hata");
            }}
            onGit={(sekme, alt) => {
              setAktifSekme(sekme);
              if (sekme === "ik" && alt) setIkBolum(alt);
            }}
          />
        )}

        {aktifSekme === "subeler" && genel && (
          <SubelerSekmesi subeler={subeler} personeller={personeller} duzenlenebilir={genel} onKayit={yenile} />
        )}

        {aktifSekme === "vardiya" && (
          <div className="space-y-4">
            <div className="segment segment-4" style={{ maxWidth: 560 }} role="tablist" aria-label="Vardiya bölümü">
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
              <button
                type="button"
                role="tab"
                aria-selected={vardiyaGorunum === "tatiller"}
                data-aktif={vardiyaGorunum === "tatiller"}
                onClick={() => setVardiyaGorunum("tatiller")}
              >
                Resmi tatiller
              </button>
            </div>
            {vardiyaGorunum === "tatiller" ? (
              <ResmiTatillerSekmesi
                tatiller={resmiTatiller}
                firmaDuzenleyebilir={genel}
                sistemYoneticisi={yetki.sistem}
                onKayit={yenile}
              />
            ) : vardiyaGorunum === "kurallar" ? (
              <div className="space-y-6">
                <AyarlarSekmesi key={JSON.stringify(ayarlar)} ayarlar={ayarlar} duzenlenebilir={genel} onKayit={yenile} />
                {genel && <KvkkAyari personeller={personeller} />}
              </div>
            ) : vardiyaGorunum === "plan" ? (
              <VardiyaPlani
                personeller={personeller}
                vardiyalar={vardiyalar}
                subeFiltre={seciliSubeFiltre}
                calismayanGunler={ayarlar.calismayan_gunler}
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
        {altAna.map((s) => (
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
            {(sekmeSayaci[s.id] ?? 0) > 0 && <span className="alt-sayac">{sekmeSayaci[s.id]}</span>}
          </button>
        ))}
        <button
          type="button"
          className="alt-sekme"
          data-aktif={altDiger.some((s) => s.id === aktifSekme)}
          onClick={() => setDigerAcik(true)}
          aria-label="Diğer bölümler"
          aria-haspopup="dialog"
        >
          <Ikon ad="daha" boyut={21} />
          {altDiger.some((s) => s.id === aktifSekme) ? (etkinOge?.etiket.split(" ")[0] ?? "Diğer") : "Diğer"}
          {digerSayac > 0 && <span className="alt-sayac">{digerSayac}</span>}
        </button>
      </nav>

      {aralikFormu && (
        <AralikRaporFormu
          baslik={etkinOge?.etiket ?? "Rapor"}
          onIndir={aralikRaporIndir}
          onKapat={() => setAralikFormu(false)}
        />
      )}

      {/* Telefonda "Diğer": alt çubuğa sığmayan sekmeler ve yan menüdeki bağlantılar */}
      {digerAcik && (
        <Modal onKapat={() => setDigerAcik(false)} baslik="Diğer bölümler">
          <div className="space-y-4">
            {menuGruplari
              .map((g) => ({ ...g, ogeler: g.ogeler.filter((o) => o.alt !== undefined || !ALT_CUBUK.includes(o.sekme)) }))
              .filter((g) => g.ogeler.length > 0)
              .map((g) => (
                <div key={g.id}>
                  {g.etiket && <p className="m3 mb-2 text-xs font-semibold uppercase tracking-wide">{g.etiket}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    {g.ogeler.map((o) => (
                      <button
                        key={o.anahtar}
                        type="button"
                        className="hizli-kutu"
                        data-aktif={ogeEtkin(o)}
                        onClick={() => {
                          ogeSec(o);
                          setDigerAcik(false);
                        }}
                      >
                        <span className="flex items-center justify-between">
                          <Ikon ad={o.ikon} boyut={20} />
                          {(o.sayac ?? 0) > 0 && <span className="baslik-font sayi text-xl">{o.sayac}</span>}
                        </span>
                        <span className="text-sm font-semibold">{o.etiket}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <div className="kenar-ust mt-4 space-y-2 pt-4">
            {yetki.sistem && (
              <a href="/sistem" className="btn btn-ikincil w-full">
                <Ikon ad="bina" boyut={16} />
                Firmalar
              </a>
            )}
            <a href="/mobil" target="_blank" rel="noopener noreferrer" className="btn btn-ikincil w-full">
              <Ikon ad="telefon" boyut={16} />
              Mobil ekranı aç
            </a>
            <button
              type="button"
              className="btn btn-ikincil w-full"
              onClick={() => {
                setDigerAcik(false);
                setSifreAcik(true);
              }}
            >
              <Ikon ad="anahtar" boyut={16} />
              Şifremi değiştir
            </button>
            <p className="m3 truncate pt-1 text-center text-xs">{eposta}</p>
          </div>
        </Modal>
      )}

      {/* Pencereler */}
      {sifreAcik && <SifreDegistirFormu onKapat={() => setSifreAcik(false)} />}
      {seciliSatir && <PuantajKarti satir={seciliSatir} seciliAy={seciliAy} onKapat={() => setSeciliPersonelId(null)} />}

      {form?.tur === "personel" && (
        <PersonelFormu subeler={subeler} vardiyalar={vardiyalar} onKapat={() => setForm(null)} onKayit={yenile} />
      )}
      {form?.tur === "pin" && <PinFormu hedef={form.hedef} onKapat={() => setForm(null)} onKayit={yenile} />}
      {form?.tur === "ozluk" && <OzlukKarti hedef={form.hedef} onKapat={() => setForm(null)} />}
      {form?.tur === "cikis" && <IstenCikisFormu hedef={form.hedef} onKapat={() => setForm(null)} onKayit={yenile} />}
      {form?.tur === "vardiya" && (
        <VardiyaFormu duzenlenen={form.duzenlenen} onKapat={() => setForm(null)} onKayit={yenile} />
      )}
      {form?.tur === "izin" && <IzinFormu personeller={personeller} onKapat={() => setForm(null)} onKayit={yenile} />}
      {form?.tur === "gorevBilgi" && <GorevBilgisiFormu hedef={form.hedef} onKapat={() => setForm(null)} onKayit={yenile} />}
      {form?.tur === "izinBilgi" && (
        <IzinBilgileriFormu
          hedef={form.hedef}
          bakiye={bakiyeler[form.hedef.id]}
          duzenlenebilir={yetkili("personel")}
          onKapat={() => setForm(null)}
          onKayit={yenile}
          onKartYazdir={() => {
            const sorun = izinKartiYazdir(yetki.firma?.ad ?? "", form.hedef, izinler, bakiyeler[form.hedef.id], isTakvimi);
            if (sorun) bildir(sorun, "hata");
          }}
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
