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
} from "../lib/tipler";
import { ayAdi, ayAraligi, haftaGunu, planAni, sureYaz, yerelSaat, yerelTarih } from "../lib/tarih";
import { cikisiEksikGirisler, planlananBitis, suankiGiris } from "../lib/mesai";
import { AcilirMenu, Bos, Ikon, Marka, useBildirim, type IkonAdi } from "../components/ui";
import BugunSerit, { type BugunOzet } from "../components/panel/BugunSerit";
import PuantajSekmesi from "../components/panel/PuantajSekmesi";
import PuantajKarti from "../components/panel/PuantajKarti";
import TaleplerSekmesi from "../components/panel/TaleplerSekmesi";
import LoglarSekmesi from "../components/panel/LoglarSekmesi";
import PersonelSekmesi from "../components/panel/PersonelSekmesi";
import VardiyaSekmesi from "../components/panel/VardiyaSekmesi";
import VardiyaPlani from "../components/panel/VardiyaPlani";
import {
  CikisEksikListesi,
  GelmeyenlerListesi,
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
  const [yetki, setYetki] = useState<{ id: string; yonetici: boolean } | null>(null);

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
  const yonetici = kullaniciId && yetki?.id === kullaniciId ? yetki.yonetici : null;

  useEffect(() => {
    if (!kullaniciId) return;
    supabase.rpc("is_admin").then(({ data, error }) => {
      setYetki({ id: kullaniciId, yonetici: !error && data === true });
    });
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

  return <Panel eposta={oturum.user.email || ""} onCikis={cikisYap} />;
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
    maddeler.push({ ikon: "talepler", metin: `${bekleyen} izin talebi onayınızı bekliyor`, etiket: "İncele", eylem: () => onGit("talepler") });
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
  | null;

/** Çıkışı eksik girişler bu kadar gün geriye kadar aranır */
const CIKIS_EKSIK_GUN = 31;

// Panelin seçili aya ait tüm verilerini çeker; hata olursa fırlatır
async function paneliGetir(seciliAy: string) {
  const { bas, son } = ayAraligi(seciliAy);
  const gun = 24 * 60 * 60 * 1000;
  // Gece vardiyası eşleştirmesi için ayın bir gün öncesi ve sonrası da alınır
  const aralikBas = new Date(bas.getTime() - gun).toISOString();
  const aralikSon = new Date(son.getTime() + gun).toISOString();
  // Bugünkü durum ve çıkışı eksik girişler için son CIKIS_EKSIK_GUN günün hareketleri
  const bugunBas = new Date(new Date(`${yerelTarih()}T00:00:00+03:00`).getTime() - CIKIS_EKSIK_GUN * gun).toISOString();

  const [subeD, varD, perler, harler, bugunD, izler, tatD] = await Promise.all([
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
  };
}

function Panel({ eposta, onCikis }: { eposta: string; onCikis: () => void }) {
  const { bildir, onayla } = useBildirim();
  const bugunTarih = yerelTarih();

  const [aktifSekme, setAktifSekme] = useState<Sekme>("bakis");
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [bugunHareketleri, setBugunHareketleri] = useState<BugunHareket[]>([]);
  const [vardiyalar, setVardiyalar] = useState<Vardiya[]>([]);
  const [izinler, setIzinler] = useState<Izin[]>([]);
  const [resmiTatiller, setResmiTatiller] = useState<ResmiTatil[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);
  // "İçeride" hesabındaki 18 saat sınırı için son veri çekme anı
  const [veriZamani, setVeriZamani] = useState(() => Date.now());

  const [seciliAy, setSeciliAy] = useState(bugunTarih.slice(0, 7));
  const [seciliSubeFiltre, setSeciliSubeFiltre] = useState("TUMU");
  const [form, setForm] = useState<FormDurumu>(null);
  const [seciliPersonelId, setSeciliPersonelId] = useState<string | null>(null);
  const [vardiyaGorunum, setVardiyaGorunum] = useState<"plan" | "tanimlar">("plan");

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
        bugun: bugunTarih,
        simdi: new Date(),
      }),
    [yil, ayNo, personeller, hareketler, izinler, resmiTatiller, vardiyalar, bugunTarih]
  );

  const filtrelenmisPuantaj = puantajListesi.filter(
    (p) => seciliSubeFiltre === "TUMU" || p.subeId === seciliSubeFiltre
  );

  const bekleyenSayisi = izinler.filter((iz) => iz.durum === "BEKLEMEDE").length;

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

  const bugunOzet: BugunOzet = useMemo(() => {
    const simdi = veriZamani;
    const bugunTatil = haftaGunu(bugunTarih) === 0 || resmiTatiller.some((t) => t.tarih === bugunTarih);

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

    const sonuc: BugunOzet = { toplam: aktifler.length, iceride: [], cikti: [], izinli: [], gelmedi: [], gec: [], tatil: bugunTatil };

    for (const p of aktifler) {
      const hs = kisiHareketleri.get(p.id) ?? [];
      const bugunkuler = hs.filter((h) => yerelTarih(h.created_at) === bugunTarih);
      const vardiya = p.vardiyalar ?? vardiyalar[0];

      if (suankiGiris(hs, vardiya, simdi)) {
        sonuc.iceride.push(p);
      } else if (bugunkuler.length > 0) {
        sonuc.cikti.push(p);
      } else if (izinliIdleri.has(p.id)) {
        sonuc.izinli.push(p);
        continue;
      } else {
        if (!bugunTatil) sonuc.gelmedi.push(p);
        continue;
      }

      const ilkGiris = bugunkuler.find((h) => h.islem_turu === "İşe Giriş");
      if (ilkGiris && vardiya) {
        const plan = planAni(bugunTarih, vardiya.baslangic_saat).getTime();
        if ((new Date(ilkGiris.created_at).getTime() - plan) / 60000 > 5) sonuc.gec.push(p);
      }
    }
    return sonuc;
  }, [personeller, kisiHareketleri, izinler, resmiTatiller, vardiyalar, seciliSubeFiltre, bugunTarih, veriZamani]);

  // Çıkış basmayı unutanlar: vardiyası (ve fazla mesai payı) bittiği halde çıkışı olmayan girişler
  const cikisEksikler: CikisEksikSatiri[] = useMemo(() => {
    const sonuc: CikisEksikSatiri[] = [];
    for (const p of personeller) {
      if (!p.aktif || (seciliSubeFiltre !== "TUMU" && p.varsayilan_sube_id !== seciliSubeFiltre)) continue;
      const vardiya = p.vardiyalar ?? vardiyalar[0] ?? null;
      for (const h of cikisiEksikGirisler(kisiHareketleri.get(p.id) ?? [], vardiya, veriZamani)) {
        const giris = new Date(h.created_at);
        sonuc.push({
          personel: p,
          giris: h.created_at,
          subeId: h.sube_id ?? p.varsayilan_sube_id,
          planliBitis: vardiya ? planlananBitis(giris, vardiya).toISOString() : null,
        });
      }
    }
    // En eski kayıt en üstte
    return sonuc.sort((a, b) => a.giris.localeCompare(b.giris));
  }, [personeller, kisiHareketleri, vardiyalar, seciliSubeFiltre, veriZamani]);

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
  function aktifSekmeVerisi(): { baslik: string; dosyaAdi: string; veriler: Satir[] } {
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
        "Toplam Net Çalışma (dk)": p.toplamCalismaDk,
        "Toplam Net Çalışma": sureYaz(p.toplamCalismaDk),
        "Plan Dışı Mesai (dk)": p.planDisiMesaiDk,
        "Resmi Tatil Mesaisi (dk)": p.resmiTatilMesaiDk,
        "Hafta Tatili Mesaisi (dk)": p.haftaTatiliMesaiDk,
        "Gecikme (dk)": p.gecikmeDk,
      })),
    };
  }

  function raporIndir(format: Bicim) {
    const { baslik, dosyaAdi, veriler } = aktifSekmeVerisi();
    const sorun = disariAktar(format, baslik, dosyaAdi, veriler);
    if (sorun) bildir(sorun, "hata");
    else bildir("Rapor hazırlandı.", "basari");
  }

  // -------------------------------------------------------------------
  // İşlemler
  // -------------------------------------------------------------------
  async function izinDurumGuncelle(id: string, yeniDurum: "ONAYLANDI" | "REDDEDILDI") {
    try {
      const { error } = await supabase.from("izinler").update({ durum: yeniDurum }).eq("id", id);
      if (error) throw error;
      bildir(yeniDurum === "ONAYLANDI" ? "Talep onaylandı." : "Talep reddedildi.", "basari");
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
                </>
              )}
            </AcilirMenu>

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
            <BugunSerit ozet={bugunOzet} yukleniyor={yukleniyor} onGelmeyenler={() => setForm({ tur: "gelmeyen" })} />
            <DikkatListesi
              cikisEksik={cikisEksikler.length}
              onCikisEksik={() => setForm({ tur: "cikisEksik" })}
              bekleyen={bekleyenSayisi}
              pinsiz={pinsizSayisi}
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
          />
        )}

        {aktifSekme === "talepler" && (
          <TaleplerSekmesi
            izinler={izinler}
            onDurum={izinDurumGuncelle}
            onSil={izinSil}
            onYeni={() => setForm({ tur: "izin" })}
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
          <PersonelSekmesi
            personeller={filtrelenmisPersoneller}
            onYeni={() => setForm({ tur: "personel" })}
            onPin={(p) => setForm({ tur: "pin", hedef: p })}
            onCihaz={cihazSifirla}
            onAktif={personelAktifDegistir}
          />
        )}

        {aktifSekme === "vardiya" && (
          <div className="space-y-4">
            <div className="segment" style={{ maxWidth: 320 }} role="tablist" aria-label="Vardiya bölümü">
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
            </div>
            {vardiyaGorunum === "plan" ? (
              <VardiyaPlani personeller={personeller} vardiyalar={vardiyalar} subeFiltre={seciliSubeFiltre} />
            ) : (
              <VardiyaSekmesi
                vardiyalar={vardiyalar}
                onYeni={() => setForm({ tur: "vardiya", duzenlenen: null })}
                onDuzenle={(v) => setForm({ tur: "vardiya", duzenlenen: v })}
                onSil={vardiyaSil}
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
      {form?.tur === "cikisEksik" && (
        <CikisEksikListesi
          liste={cikisEksikler}
          onKapat={() => setForm(null)}
          onCikisEkle={(baslangic) => setForm({ tur: "manuel", baslangic })}
        />
      )}
    </div>
  );
}
