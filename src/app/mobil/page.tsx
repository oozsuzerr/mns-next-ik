"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, selamlama, sureYaz, uzunTarih, yerelSaat, yerelSaatSn, yerelTarih } from "../../lib/tarih";
import { Avatar, Ikon, Marka, Modal, useBildirim } from "../../components/ui";
import { cikisiEksikGirisler, suankiGiris, type MesaiVardiya, type VardiyaBilgisi } from "../../lib/mesai";
import { gunPlani, planHaritasi, vardiyaCozucu, type GunPlani, type PlanSatiri, type PlanVardiya } from "../../lib/vardiyaPlani";
import { VardiyamKarti } from "../../components/mobil/Vardiyam";
import BildirimDugmesi from "../../components/BildirimDugmesi";
import MobilDuyurular from "../../components/mobil/MobilDuyurular";
import MobilZimmetler from "../../components/mobil/MobilZimmetler";
import MobilOdemeler from "../../components/mobil/MobilOdemeler";
import MobilEgitimler from "../../components/mobil/MobilEgitimler";
import MobilPerformans from "../../components/mobil/MobilPerformans";
import { olayBildir } from "../../lib/bildirim";
import { anaEkrandaMi, cihazBilgisi, cihazKimligi, iosMu } from "../../lib/cihazKimligi";
import { gunYaz, type IzinBakiyesi } from "../../lib/tipler";
import { DK_MS, VARSAYILAN_AYARLAR } from "../../lib/ayarlar";

interface Sube {
  id: string;
  ad: string;
  enlem: number;
  boylam: number;
  limit_metre: number;
}

interface Personel {
  id: string;
  sicil_no: string;
  ad: string;
  soyad: string;
  departman: string | null;
}

/** mobil_ozet'in döndürdüğü vardiya planı satırı */
interface MobilPlan {
  tarih: string;
  tur: "VARDIYA" | "TATIL";
  vardiya_id: string | null;
  ad: string | null;
  baslangic_saat: string | null;
  bitis_saat: string | null;
  mola_dakika: number | null;
}

/** Personelin kendi izin talepleri (mobil_ozet) */
interface Talep {
  id: string;
  izin_turu: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  baslangic_saat: string | null;
  bitis_saat: string | null;
  gun_sayisi: number | null;
  durum: string | null;
  karar_notu?: string | null;
}

/** Personelin kendi fazla mesai talepleri (mobil_ozet) */
interface MesaiTalep {
  id: string;
  tarih: string;
  baslangic_saat: string;
  bitis_saat: string;
  sure_dk: number;
  neden: string;
  durum: string;
  karar_notu?: string | null;
}

/** "17:00" - "19:30" arası dakika; bitiş küçükse gece yarısını geçmiştir */
function mesaiDakika(bas: string, bit: string): number {
  const [bs, bd] = bas.split(":").map(Number);
  const [es, ed] = bit.split(":").map(Number);
  let dk = es * 60 + ed - (bs * 60 + bd);
  if (dk <= 0) dk += 1440;
  return dk;
}

interface Hareket {
  id: string;
  islem_turu: string;
  created_at: string;
  sube_ad?: string | null;
}

const TOKEN_ANAHTAR = "mns_token";
const IPUCU_ANAHTAR = "mns_ipucu_kapali";
// Firmaya özel giriş bağlantısındaki kod (/mobil?f=kod); telefonda hatırlanır
const FIRMA_ANAHTAR = "mns_firma";
const FIRMA_KODU = /^[a-z0-9-]{3,20}$/;

/** "14 Eki Salı" */
function gunMetni(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", weekday: "long" }).format(
    new Date(iso)
  );
}

function mesafeHesapla(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Kilitli girişte bu telefondan gönderilmiş yeni telefon talebi */
interface CihazTalebi {
  id: string;
  durum: "BEKLEMEDE" | "ONAYLANDI" | "REDDEDILDI" | "IPTAL";
}

function hataMetni(kod: string | undefined, veri?: Record<string, unknown>): string {
  switch (kod) {
    case "FIRMA_YOK":
      return "Firma bulunamadı. Yöneticinizden aldığınız giriş bağlantısını kullanın.";
    case "GIRIS_HATALI":
      return "T.C. kimlik numarası veya PIN hatalı.";
    case "HESAP_KILITLI":
      return "Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.";
    case "CIHAZ_KILITLI":
      return "Hesabınız başka bir telefona kayıtlı.";
    case "CIHAZ_BASKASINDA":
      return "Bu telefon başka bir personele kayıtlı. Herkes yalnızca kendi telefonundan giriş yapabilir.";
    case "COK_FAZLA_TALEP":
      return "Bugün çok fazla telefon talebi gönderildi. Yöneticinize başvurun.";
    case "PIN_TANIMSIZ":
      return "Henüz PIN tanımlanmamış. İK yöneticinize başvurun.";
    case "SINIR_DISI":
      return `${veri?.sube ?? "Şube"} şubesine ${veri?.mesafe ?? "?"} metre uzaktasınız (sınır ${veri?.limit ?? "?"} m).`;
    case "GPS_ZAYIF":
      return "GPS sinyali zayıf. Açık alana çıkıp birkaç saniye bekleyin.";
    case "TEKRAR":
      return "Bu işlem az önce zaten kaydedildi.";
    case "SUBE_YOK":
      return "Sistemde tanımlı şube bulunamadı.";
    case "KONUM_GECERSIZ":
      return "Konum alınamadı. GPS iznini kontrol edin.";
    case "SURE_GECERSIZ":
      return "Mesai süresi en az 15 dakika, en çok 16 saat olabilir.";
    case "NEDEN_GEREKLI":
      return "Lütfen fazla mesainin nedenini yazın.";
    case "CAKISMA":
      return "Bu saatlere denk gelen bir fazla mesai talebiniz zaten var.";
    case "AY_KILITLI":
      return "Bu ayın puantajı kapatılmış; yöneticinize başvurun.";
    case "SAAT_GECERSIZ":
      return "Saat aralığı geçersiz. Bitiş saati başlangıçtan sonra olmalı.";
    case "TARIH_GECERSIZ":
      return "Tarih aralığı geçersiz. Bitiş başlangıçtan önce olamaz, en fazla 90 gün seçilebilir.";
    default:
      return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }
}

// ---------------------------------------------------------------------
// Mesai kadranı
// ---------------------------------------------------------------------
type KadranDurumu = "bekliyor" | "uzakta" | "hazir" | "kaydediliyor" | "tamam";

function Kadran({
  durum,
  islem,
  ilerleme,
  ana,
  alt,
  onBas,
}: {
  durum: KadranDurumu;
  islem: "giris" | "cikis";
  ilerleme: number;
  ana: string;
  alt: string;
  onBas: () => void;
}) {
  const R = 118;
  const C = 2 * Math.PI * R;
  const renk =
    durum === "uzakta" ? "var(--uyari)" : durum === "tamam" || islem === "giris" ? "var(--giris)" : "var(--cikis)";
  const dolu = Math.max(0, Math.min(1, ilerleme));
  const hazir = durum === "hazir";
  const dugmeSinif = hazir ? (islem === "giris" ? "kd-giris kd-nabiz" : "kd-cikis kd-nabiz") : durum === "tamam" ? "kd-tamam" : durum === "kaydediliyor" ? (islem === "giris" ? "kd-giris" : "kd-cikis") : "kd-pasif";
  const ikon = durum === "tamam" ? "tik" : durum === "uzakta" || durum === "bekliyor" ? "konum" : islem === "giris" ? "gunes" : "ay";

  return (
    <div className="kadran-kap">
      <svg viewBox="0 0 260 260" className="kadran-halka" aria-hidden="true">
        <circle cx="130" cy="130" r={R} fill="none" stroke="var(--cizgi)" strokeWidth="10" />
        <circle
          cx="130"
          cy="130"
          r={R}
          fill="none"
          stroke={renk}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - dolu)}
          transform="rotate(-90 130 130)"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.2,0.8,0.2,1), stroke 0.3s" }}
        />
      </svg>
      <button type="button" className={`kadran-dugme ${dugmeSinif}`} onClick={onBas} disabled={!hazir} aria-label={`${ana}. ${alt}`}>
        <Ikon ad={ikon} boyut={30} />
        <span className="baslik-font kd-ana">{ana}</span>
        <span className="kd-alt">{alt}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------
function MobilGirisEkrani() {
  const { bildir } = useBildirim();

  const [token, setToken] = useState<string | null>(null);
  const [baslatildi, setBaslatildi] = useState(false);
  const [simdi, setSimdi] = useState<Date | null>(null);

  const [tcGiris, setTcGiris] = useState("");
  const [firmaKod, setFirmaKod] = useState<string | null>(null);
  const [firmaAd, setFirmaAd] = useState<string | null>(null);
  const [pinGiris, setPinGiris] = useState("");
  const [pinGoster, setPinGoster] = useState(false);
  const [girisHata, setGirisHata] = useState<string | null>(null);
  // Hesap başka telefona kayıtlıysa: bu telefondan gönderilen talep (null: henüz talep yok)
  const [cihazKilidi, setCihazKilidi] = useState<{ talep: CihazTalebi | null } | null>(null);
  const [talepGonderiliyor, setTalepGonderiliyor] = useState(false);
  // iPhone Safari: ana ekran uygulaması ayrı telefon sayılır, giriş ekranında uyarılır
  const [iosTarayici, setIosTarayici] = useState(false);

  const [personel, setPersonel] = useState<Personel | null>(null);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [gecmis, setGecmis] = useState<Hareket[]>([]);
  // Personelin vardiyası (mobil_ozet döndürüyorsa); yoksa 18 saat kuralı kullanılır
  const [vardiya, setVardiya] = useState<(MesaiVardiya & { ad?: string; mola_dakika?: number }) | null>(null);
  // Vardiya planı (mobil_ozet döndürüyorsa); yoksa yalnızca varsayılan vardiya kullanılır
  const [plan, setPlan] = useState<MobilPlan[] | null>(null);
  // Mesai hesabı için son 31 günün hareketleri (mobil_ozet döndürüyorsa); yoksa ekrandaki son 5 işlem kullanılır
  const [sonHareketler, setSonHareketler] = useState<Hareket[] | null>(null);

  const [enlem, setEnlem] = useState<number | null>(null);
  const [boylam, setBoylam] = useState<number | null>(null);
  const [dogruluk, setDogruluk] = useState<number | null>(null);
  const [konumHata, setKonumHata] = useState<string | null>(null);

  const [secilenIslem, setSecilenIslem] = useState<"giris" | "cikis">("giris");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [tamam, setTamam] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [ipucuGoster, setIpucuGoster] = useState(false);

  const [izinAcik, setIzinAcik] = useState(false);
  const [talepYukleniyor, setTalepYukleniyor] = useState(false);
  const [izinTalep, setIzinTalep] = useState({
    izin_turu: "Raporlu / İstirahat",
    baslangic_tarihi: "",
    bitis_tarihi: "",
    baslangic_saat: "09:00",
    bitis_saat: "11:00",
    aciklama: "",
  });
  // Şirket kuralları, yıllık izin bakiyesi ve son talepler (mobil_ozet döndürüyorsa)
  const [mobilAyar, setMobilAyar] = useState<{ cikis_tolerans_dk: number; erken_giris_payi_dk: number; calismayan_gunler?: number[] | null } | null>(null);
  const [yillikIzin, setYillikIzin] = useState<IzinBakiyesi | null>(null);
  const [talepler, setTalepler] = useState<Talep[] | null>(null);
  const [mesaiTalepleri, setMesaiTalepleri] = useState<MesaiTalep[] | null>(null);
  const [mesaiAcik, setMesaiAcik] = useState(false);
  const [mesaiYukleniyor, setMesaiYukleniyor] = useState(false);
  const [mesai, setMesai] = useState({ tarih: "", baslangic_saat: "17:00", bitis_saat: "19:00", neden: "" });

  const oturumuTemizle = useCallback(() => {
    localStorage.removeItem(TOKEN_ANAHTAR);
    setToken(null);
    setPersonel(null);
    setSubeler([]);
    setGecmis([]);
    setVardiya(null);
    setPlan(null);
    setSonHareketler(null);
    setMobilAyar(null);
    setYillikIzin(null);
    setTalepler(null);
    setMesaiTalepleri(null);
  }, []);

  const ozetYukle = useCallback(
    async (t: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("mobil_ozet", { p_token: t });
      if (error) {
        if (error.message.includes("OTURUM_GECERSIZ")) {
          oturumuTemizle();
          setGirisHata("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
        } else {
          setMesaj("Veriler alınamadı. İnternet bağlantınızı kontrol edin.");
        }
        return false;
      }
      setPersonel(data.personel);
      if (data.firma?.kod) {
        localStorage.setItem(FIRMA_ANAHTAR, data.firma.kod);
        setFirmaKod(data.firma.kod);
        setFirmaAd(data.firma.ad ?? null);
      }
      setSubeler(data.subeler ?? []);
      setGecmis(data.gecmis ?? []);
      setVardiya(data.vardiya ?? null);
      setPlan(data.plan ?? null);
      setSonHareketler(data.son_hareketler ?? null);
      setMobilAyar(data.ayarlar ?? null);
      setYillikIzin(data.yillik_izin ?? null);
      setTalepler(data.talepler ?? null);
      setMesaiTalepleri(data.mesai_talepleri ?? null);
      return true;
    },
    [oturumuTemizle]
  );

  // Açılış: kayıtlı oturumu geri yükle
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_ANAHTAR);
    const bugun = yerelTarih();
    // Tarayıcıya özel değer (localStorage/saat/konum) sayfa hidrasyonundan sonra okunur; render sırasında okunamaz
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIzinTalep((s) => ({ ...s, baslangic_tarihi: bugun, bitis_tarihi: bugun }));

    // Firma: bağlantıdaki ?f= kodu önceliklidir, yoksa telefonda kayıtlı olan
    const baglantiKodu = new URLSearchParams(window.location.search).get("f")?.trim().toLowerCase() ?? "";
    const kod = FIRMA_KODU.test(baglantiKodu) ? baglantiKodu : localStorage.getItem(FIRMA_ANAHTAR);
    if (kod) {
      localStorage.setItem(FIRMA_ANAHTAR, kod);
      setFirmaKod(kod);
      supabase
        .rpc("firma_adi", { p_kod: kod })
        .then(({ data }) => setFirmaAd(typeof data === "string" ? data : null), () => {});
    }

    const bagimsiz = anaEkrandaMi();
    setIpucuGoster(!bagimsiz && localStorage.getItem(IPUCU_ANAHTAR) !== "1");
    setIosTarayici(!bagimsiz && iosMu());
    // Silinmiş depoları diğerlerinden geri yükler
    cihazKimligi().catch(() => {});

    async function baslat() {
      if (t) {
        setToken(t);
        await ozetYukle(t);
      }
      setBaslatildi(true);
    }
    baslat();
  }, [ozetYukle]);

  // Canlı saat
  useEffect(() => {
    // Tarayıcıya özel değer (localStorage/saat/konum) sayfa hidrasyonundan sonra okunur; render sırasında okunamaz
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSimdi(new Date());
    const z = setInterval(() => setSimdi(new Date()), 1000);
    return () => clearInterval(z);
  }, []);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      // Tarayıcıya özel değer (localStorage/saat/konum) sayfa hidrasyonundan sonra okunur; render sırasında okunamaz
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKonumHata("Tarayıcınız konum servisini desteklemiyor.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setEnlem(pos.coords.latitude);
        setBoylam(pos.coords.longitude);
        setDogruluk(pos.coords.accuracy);
        setKonumHata(null);
      },
      () => setKonumHata("Konum izni kapalı. Tarayıcı ayarlarından açın."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // En yakın şube (yalnızca ekranda göstermek için; kesin karar sunucuda verilir)
  const yakin = useMemo(() => {
    if (enlem === null || boylam === null || subeler.length === 0) return null;
    let enYakin: Sube | null = null;
    let min = Infinity;
    for (const s of subeler) {
      const m = mesafeHesapla(enlem, boylam, Number(s.enlem), Number(s.boylam));
      if (m < min) {
        min = m;
        enYakin = s;
      }
    }
    return enYakin ? { sube: enYakin, mesafe: min } : null;
  }, [enlem, boylam, subeler]);

  const sinirda = !!yakin && yakin.mesafe <= Number(yakin.sube.limit_metre);

  // Mesai durumu: son hareket "giriş" ise ve vardiyası (fazla mesai payıyla) bitmediyse içeridedir
  // Plan çözümü: bir günün geçerli planı (ekran için) ve mesai hesabı için vardiya bilgisi
  const { gunPlaniBul, vardiyaBilgisi } = useMemo((): {
    gunPlaniBul: (tarih: string) => GunPlani;
    vardiyaBilgisi: VardiyaBilgisi;
  } => {
    const satirlar: PlanSatiri[] = (plan ?? []).map((x, i) => ({
      id: String(i),
      personel_id: "ben",
      tarih: x.tarih,
      tur: x.tur,
      vardiya_id: x.vardiya_id,
      sube_id: null,
    }));
    const vardiyalar = new Map<string, PlanVardiya>();
    for (const x of plan ?? []) {
      if (x.vardiya_id && x.baslangic_saat && x.bitis_saat) {
        vardiyalar.set(x.vardiya_id, {
          id: x.vardiya_id,
          ad: x.ad ?? "Vardiya",
          baslangic_saat: x.baslangic_saat,
          bitis_saat: x.bitis_saat,
          mola_dakika: x.mola_dakika ?? 0,
        });
      }
    }
    const varsayilan: PlanVardiya | null = vardiya
      ? { id: "varsayilan", ad: vardiya.ad ?? "Vardiya", mola_dakika: vardiya.mola_dakika ?? 0, ...vardiya }
      : null;
    const harita = planHaritasi(satirlar);
    const bul = (tarih: string) => gunPlani(harita.get(`ben|${tarih}`), tarih, varsayilan, (id) => vardiyalar.get(id), mobilAyar?.calismayan_gunler ?? [7]);
    const cozucu = vardiyaCozucu(bul, (mobilAyar?.erken_giris_payi_dk ?? VARSAYILAN_AYARLAR.erken_giris_payi_dk) * DK_MS);
    // Plan gelmediyse (SQL güncellenmemiş) eski davranış: sabit varsayılan vardiya
    return { gunPlaniBul: bul, vardiyaBilgisi: plan ? (an: Date) => cozucu(an)?.son ?? null : vardiya };
  }, [plan, vardiya, mobilAyar]);

  const hesapHareketleri = sonHareketler ?? gecmis;
  const cikisToleransMs = (mobilAyar?.cikis_tolerans_dk ?? VARSAYILAN_AYARLAR.cikis_tolerans_dk) * DK_MS;
  const girisZamani = simdi ? suankiGiris(hesapHareketleri, vardiyaBilgisi, simdi.getTime(), cikisToleransMs) : null;
  const icerde = girisZamani !== null;
  // Vardiyası bittiği halde çıkışı yapılmamış girişler (yönetici manuel çıkış ekleyene kadar uyarı gösterilir)
  const cikisiEksikler = simdi
    ? cikisiEksikGirisler(hesapHareketleri, vardiyaBilgisi, simdi.getTime(), cikisToleransMs)
    : [];
  const gecenDk = girisZamani && simdi ? Math.max(0, Math.floor((simdi.getTime() - girisZamani.getTime()) / 60000)) : 0;

  // Durum değişince doğru işlemi önceden seç (önceki değer karşılaştırılarak, render sırasında)
  const [oncekiIcerde, setOncekiIcerde] = useState(icerde);
  if (icerde !== oncekiIcerde) {
    setOncekiIcerde(icerde);
    setSecilenIslem(icerde ? "cikis" : "giris");
  }

  async function girisDene() {
    if (tcGiris.length !== 11 || pinGiris.length < 4) return;

    setYukleniyor(true);
    setGirisHata(null);
    try {
      // Firma kodu yoksa eski giriş (geçiş döneminde MNS)
      const { data, error } = await supabase.rpc("personel_giris", {
        ...(firmaKod ? { p_firma_kod: firmaKod } : {}),
        p_tc: tcGiris,
        p_pin: pinGiris,
        p_cihaz: await cihazKimligi(),
      });
      if (error) throw error;

      if (!data?.ok) {
        if (data?.hata === "CIHAZ_KILITLI") {
          // PIN doğru, telefon farklı: PIN onay beklenirken bellekte tutulur, onay gelince otomatik giriş yapılır
          setCihazKilidi({ talep: data.talep ?? null });
          return;
        }
        setCihazKilidi(null);
        setGirisHata(hataMetni(data?.hata));
        setPinGiris("");
        return;
      }

      localStorage.setItem(TOKEN_ANAHTAR, data.token);
      setCihazKilidi(null);
      setToken(data.token);
      setPersonel(data.personel);
      setPinGiris("");
      setTcGiris("");
      await ozetYukle(data.token);
    } catch {
      setGirisHata("Giriş yapılamadı. İnternet bağlantınızı kontrol edin.");
    } finally {
      setYukleniyor(false);
    }
  }

  function girisYap(e: FormEvent) {
    e.preventDefault();
    girisDene();
  }

  async function cihazTalebiGonder() {
    setTalepGonderiliyor(true);
    setGirisHata(null);
    try {
      const cihaz = await cihazKimligi();
      const { data, error } = await supabase.rpc("cihaz_talebi_olustur", {
        ...(firmaKod ? { p_firma_kod: firmaKod } : {}),
        p_tc: tcGiris,
        p_pin: pinGiris,
        p_cihaz: cihaz,
        p_bilgi: cihazBilgisi(),
      });
      if (error) throw error;
      if (!data?.ok) {
        // Bu arada kilit açıldıysa doğrudan giriş yapılır
        if (data?.hata === "TALEP_GEREKSIZ") return girisDene();
        setCihazKilidi(null);
        setGirisHata(hataMetni(data?.hata));
        setPinGiris("");
        return;
      }
      setCihazKilidi({ talep: { id: data.talep_id, durum: "BEKLEMEDE" } });
      if (data.yeni) olayBildir({ olay: "cihaz", talep_id: data.talep_id, cihaz });
    } catch {
      setGirisHata("Talep gönderilemedi. İnternet bağlantınızı kontrol edin.");
    } finally {
      setTalepGonderiliyor(false);
    }
  }

  function cihazKilidiVazgec() {
    setCihazKilidi(null);
    setPinGiris("");
  }

  // Onay beklenirken talep durumu birkaç saniyede bir sorulur; onaylanınca otomatik giriş yapılır
  const talepSonuclandi = useEffectEvent((durum: CihazTalebi["durum"]) => {
    if (durum === "ONAYLANDI") girisDene();
    else setCihazKilidi((k) => (k?.talep ? { talep: { ...k.talep, durum } } : k));
  });
  const bekleyenTalepId = cihazKilidi?.talep?.durum === "BEKLEMEDE" ? cihazKilidi.talep.id : null;
  useEffect(() => {
    if (!bekleyenTalepId) return;
    let iptal = false;
    const zamanlayici = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.rpc("cihaz_talebi_durum", { p_talep_id: bekleyenTalepId, p_cihaz: await cihazKimligi() });
      if (!iptal && data?.ok && data.durum !== "BEKLEMEDE") talepSonuclandi(data.durum);
    }, 5000);
    return () => {
      iptal = true;
      clearInterval(zamanlayici);
    };
  }, [bekleyenTalepId]);

  async function cikisYap() {
    if (token) await supabase.rpc("oturum_kapat", { p_token: token });
    oturumuTemizle();
    setMesaj(null);
  }

  async function hareketKaydet() {
    if (!token || enlem === null || boylam === null) return;
    const islemTuru = secilenIslem === "giris" ? "İşe Giriş" : "İşe Çıkış";

    setYukleniyor(true);
    setMesaj(null);
    try {
      const { data, error } = await supabase.rpc("hareket_kaydet", {
        p_token: token,
        p_islem: islemTuru,
        p_enlem: enlem,
        p_boylam: boylam,
        p_dogruluk: dogruluk,
      });

      if (error) {
        if (error.message.includes("OTURUM_GECERSIZ")) {
          oturumuTemizle();
          setGirisHata("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
          return;
        }
        throw error;
      }

      if (!data?.ok) {
        setMesaj(hataMetni(data?.hata, data));
        return;
      }

      setTamam(true);
      setTimeout(() => setTamam(false), 2600);
      await ozetYukle(token);
    } catch {
      setMesaj("Kayıt yapılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setYukleniyor(false);
    }
  }

  async function mesaiGonder(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (mesai.neden.trim().length < 3) {
      bildir(hataMetni("NEDEN_GEREKLI"), "hata");
      return;
    }
    setMesaiYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("mesai_talep_olustur", {
        p_token: token,
        p_tarih: mesai.tarih,
        p_baslangic_saat: mesai.baslangic_saat,
        p_bitis_saat: mesai.bitis_saat,
        p_neden: mesai.neden.trim(),
      });
      if (error) throw error;
      if (!data?.ok) {
        bildir(hataMetni(data?.hata), "hata");
        return;
      }
      bildir("Fazla mesainiz yöneticinizin onayına gönderildi.", "basari");
      // Yöneticinin telefonuna haber ver
      olayBildir({ olay: "mesai", token });
      setMesaiAcik(false);
      setMesai({ ...mesai, neden: "" });
      await ozetYukle(token);
    } catch {
      bildir("Talep gönderilemedi. Lütfen tekrar deneyin.", "hata");
    } finally {
      setMesaiYukleniyor(false);
    }
  }

  async function talepGonder(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setTalepYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("izin_talep_olustur", {
        p_token: token,
        p_tur: izinTalep.izin_turu,
        p_baslangic: izinTalep.baslangic_tarihi,
        p_bitis: izinTalep.izin_turu === "Saatlik İzin" ? izinTalep.baslangic_tarihi : izinTalep.bitis_tarihi,
        p_aciklama: izinTalep.aciklama.trim() || null,
        ...(izinTalep.izin_turu === "Saatlik İzin"
          ? { p_baslangic_saat: izinTalep.baslangic_saat, p_bitis_saat: izinTalep.bitis_saat }
          : {}),
      });
      if (error) throw error;
      if (!data?.ok) {
        bildir(hataMetni(data?.hata), "hata");
        return;
      }
      bildir("Talebiniz İK birimine iletildi.", "basari");
      // Yöneticinin telefonuna haber ver
      olayBildir({ olay: "talep", token });
      setIzinAcik(false);
      const bugun = yerelTarih();
      setIzinTalep({ ...izinTalep, izin_turu: "Raporlu / İstirahat", baslangic_tarihi: bugun, bitis_tarihi: bugun, aciklama: "" });
      // Talep listesi ve bakiye güncellensin
      await ozetYukle(token);
    } catch {
      bildir("Talep gönderilemedi. Lütfen tekrar deneyin.", "hata");
    } finally {
      setTalepYukleniyor(false);
    }
  }

  // -------------------------------------------------------------------
  // Görünüm
  // -------------------------------------------------------------------
  if (!baslatildi) return <div className="min-h-screen" />;

  const girisli = !!token && !!personel;

  // ---------- Giriş ekranı ----------
  if (!girisli) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-8 pt-14">
        <Marka boyut={48} />
        {firmaAd && <p className="m2 mt-8 text-sm font-semibold uppercase tracking-wide">{firmaAd}</p>}
        <h1 className={`baslik-font m1 ${firmaAd ? "mt-2" : "mt-8"} text-4xl leading-tight`}>Mesaiye başlamadan önce giriş yapın</h1>
        <p className="m2 mt-3 text-base">T.C. kimlik numaranız ve İK birimi tarafından verilen PIN ile devam edin.</p>

        {cihazKilidi ? (
          <div className="panel-ic mt-8 space-y-4 p-5">
            {cihazKilidi.talep?.durum === "BEKLEMEDE" ? (
              <>
                <p className="baslik-font m1 flex items-center gap-2 text-xl">
                  <Ikon ad="telefon" />
                  Onay bekleniyor
                </p>
                <p className="m2 text-sm">
                  Yöneticinize bildirim gönderildi. Onayladığında bu ekrandan kendiliğinden giriş yapılacak. Sayfayı
                  kapatırsanız onaydan sonra PIN&apos;inizle yeniden giriş yapın.
                </p>
              </>
            ) : (
              <>
                <p className="baslik-font m1 flex items-center gap-2 text-xl">
                  <Ikon ad="kilit" />
                  Bu telefon hesabınıza kayıtlı değil
                </p>
                <p className="m2 text-sm">
                  {cihazKilidi.talep?.durum === "REDDEDILDI" ? "Önceki talebiniz reddedildi. " : ""}
                  Telefonunuzu değiştirdiyseniz ya da tarayıcı verileri silindiyse, bu telefonu tanımlatmak için
                  yöneticinize onay isteği gönderin. Onaylanınca eski telefondaki oturumunuz kapanır.
                </p>
                {girisHata && (
                  <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: "var(--hata)" }} role="alert">
                    <Ikon ad="uyari" boyut={17} />
                    <span>{girisHata}</span>
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-ana btn-buyuk w-full"
                  disabled={talepGonderiliyor || yukleniyor}
                  onClick={cihazTalebiGonder}
                >
                  {talepGonderiliyor ? "Gönderiliyor..." : "Bu telefonu tanımlat"}
                </button>
              </>
            )}
            <button type="button" className="btn btn-hayalet w-full" onClick={cihazKilidiVazgec}>
              Vazgeç
            </button>
          </div>
        ) : (
          <form onSubmit={girisYap} className="mt-8 space-y-4">
            <div>
              <label className="etiket" htmlFor="tc">
                T.C. kimlik no
              </label>
              <input
                id="tc"
                className="girdi sayi"
                style={{ height: 52, fontSize: 18 }}
                inputMode="numeric"
                maxLength={11}
                autoComplete="username"
                value={tcGiris}
                onChange={(e) => setTcGiris(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <label className="etiket" htmlFor="pin">
                PIN
              </label>
              <div className="relative">
                <input
                  id="pin"
                  className="girdi sayi"
                  style={{ height: 52, fontSize: 18, paddingRight: 52 }}
                  type={pinGoster ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={8}
                  autoComplete="current-password"
                  value={pinGiris}
                  onChange={(e) => setPinGiris(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  type="button"
                  onClick={() => setPinGoster(!pinGoster)}
                  className="btn btn-hayalet btn-ikon absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label={pinGoster ? "PIN'i gizle" : "PIN'i göster"}
                >
                  <Ikon ad={pinGoster ? "gozkapali" : "goz"} />
                </button>
              </div>
            </div>

            {girisHata && (
              <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: "var(--hata)" }} role="alert">
                <Ikon ad="uyari" boyut={17} />
                <span>{girisHata}</span>
              </p>
            )}

            <button
              type="submit"
              className="btn btn-ana btn-buyuk w-full"
              disabled={yukleniyor || tcGiris.length !== 11 || pinGiris.length < 4}
            >
              {yukleniyor ? "Doğrulanıyor..." : "Giriş yap"}
            </button>
          </form>
        )}

        {iosTarayici && !cihazKilidi && (
          <p className="panel-ic m2 mt-6 flex items-start gap-3 p-4 text-sm">
            <Ikon ad="bilgi" className="m2" />
            <span>
              iPhone&apos;da Safari ile ana ekrana eklenen uygulama ayrı telefon sayılır. Hep aynı yerden, tercihen ana
              ekrandaki uygulamadan giriş yapın.
            </span>
          </p>
        )}

        <p className="m3 mt-auto pt-10 text-center text-sm">
          Yönetici misiniz?{" "}
          <Link href="/" className="m2 font-semibold underline">
            Yönetim paneline gidin
          </Link>
        </p>
      </div>
    );
  }

  // ---------- Ana ekran ----------
  const saatMetni = simdi ? yerelSaatSn(simdi) : "--:--:--";
  const [ss, dd, sn] = saatMetni.split(":");

  const bugun = yerelTarih();
  const bugunkuler = gecmis.filter((h) => yerelTarih(h.created_at) === bugun).slice().reverse();

  let kadranDurumu: KadranDurumu = "hazir";
  let ana = secilenIslem === "giris" ? "Giriş yap" : "Çıkış yap";
  let alt = yakin ? yakin.sube.ad : "";
  let ilerleme = 1;

  if (tamam) {
    kadranDurumu = "tamam";
    ana = "Kaydedildi";
    alt = yakin?.sube.ad ?? "";
  } else if (yukleniyor) {
    kadranDurumu = "kaydediliyor";
    ana = "Kaydediliyor";
    alt = "";
  } else if (konumHata || enlem === null) {
    kadranDurumu = "bekliyor";
    ana = "Konum bekleniyor";
    alt = konumHata ?? "GPS taranıyor";
    ilerleme = 0;
  } else if (!yakin) {
    kadranDurumu = "bekliyor";
    ana = "Şube bulunamadı";
    alt = "İK ile iletişime geçin";
    ilerleme = 0;
  } else if (!sinirda) {
    kadranDurumu = "uzakta";
    ana = `${yakin.mesafe} m`;
    alt = `${yakin.sube.ad} şubesine uzaktasınız`;
    ilerleme = Number(yakin.sube.limit_metre) / yakin.mesafe;
  } else if (icerde && secilenIslem === "cikis") {
    ilerleme = Math.min(1, gecenDk / 540);
  }

  const durumSatiri = icerde
    ? `Mesaidesiniz: ${sureYaz(gecenDk)} (${girisZamani ? yerelSaat(girisZamani) : ""} girişinden beri)`
    : bugunkuler.some((h) => h.islem_turu === "İşe Çıkış")
    ? "Bugünkü çıkışınız kaydedildi."
    : "Henüz giriş yapmadınız.";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-7 px-5 pb-10 pt-5">
      {/* Üst bilgi */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar ad={personel.ad} soyad={personel.soyad} boyut={42} />
          <div>
            <p className="m2 text-sm">{selamlama()}</p>
            <p className="baslik-font m1 text-lg leading-tight">
              {personel.ad} {personel.soyad}
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-hayalet btn-ikon" onClick={cikisYap} aria-label="Çıkış yap">
          <Ikon ad="cikis" />
        </button>
      </header>

      {/* Saat */}
      <section className="text-center">
        <p className="baslik-font sayi saat-buyuk m1">
          {ss}:{dd}
          <span className="m3 saat-sn">:{sn}</span>
        </p>
        <p className="m2 mt-1 text-sm">{uzunTarih()}</p>
      </section>

      {/* Duyurular: okunmamışlar açık durur */}
      {token && <MobilDuyurular token={token} />}

      {/* Vardiyam: bugün, yarın ve aylık takvim (plan verisi geldiyse) */}
      {plan && <VardiyamKarti gunPlaniBul={gunPlaniBul} />}

      {/* Telefon bildirimleri */}
      {token && (
        <BildirimDugmesi
          aciklama="İzin talebinizin sonucu, vardiya değişikliği ve unutulan çıkış için bildirim alın."
          kaydet={async (a) => {
            const { error } = await supabase.rpc("push_abone_ol", {
              p_token: token,
              p_endpoint: a.endpoint,
              p_p256dh: a.p256dh,
              p_auth: a.auth,
            });
            if (error) throw error;
          }}
          birak={async (endpoint) => {
            await supabase.rpc("push_abonelik_birak", { p_token: token, p_endpoint: endpoint });
          }}
        />
      )}

      {/* Çıkışı unutulan günler */}
      {cikisiEksikler.length > 0 && (
        <section
          className="flex items-start gap-3 rounded-2xl p-4 text-sm"
          style={{ background: "var(--hata-acik)", color: "var(--hata)" }}
          role="alert"
        >
          <Ikon ad="uyari" boyut={20} className="mt-0.5 flex-none" />
          <div className="flex-1">
            <p className="font-semibold">
              {cikisiEksikler.length === 1
                ? `${gunMetni(cikisiEksikler[0].created_at)} günü işten çıkış kaydınız yok.`
                : "Şu günlerde işten çıkış kaydınız yok:"}
            </p>
            {cikisiEksikler.length > 1 && (
              <ul className="mt-1 list-disc pl-5">
                {cikisiEksikler.map((h) => (
                  <li key={h.id}>
                    {gunMetni(h.created_at)} (<span className="sayi">{yerelSaat(h.created_at)}</span> girişi)
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1">Lütfen yöneticinize bildiriniz. Yönetici çıkışınızı ekleyince bu uyarı kalkar.</p>
          </div>
        </section>
      )}

      {/* Kadran */}
      <section>
        <Kadran durum={kadranDurumu} islem={secilenIslem} ilerleme={ilerleme} ana={ana} alt={alt} onBas={hareketKaydet} />
        <p className="m2 mt-4 min-h-[1.5rem] text-center text-sm font-medium" aria-live="polite">
          {durumSatiri}
        </p>
        {mesaj && (
          <p
            className="mt-2 flex items-start justify-center gap-2 text-center text-sm font-semibold"
            style={{ color: "var(--hata)" }}
            role="alert"
          >
            <Ikon ad="uyari" boyut={17} />
            <span>{mesaj}</span>
          </p>
        )}
        {yakin && sinirda && dogruluk !== null && (
          <p className="m3 mt-1 text-center text-xs">
            Şubeye {yakin.mesafe} m, konum doğruluğu ±{Math.round(dogruluk)} m
          </p>
        )}
      </section>

      {/* İşlem seçici */}
      <section>
        <div className="segment" role="tablist" aria-label="İşlem türü">
          <button
            type="button"
            role="tab"
            aria-selected={secilenIslem === "giris"}
            data-aktif={secilenIslem === "giris"}
            onClick={() => setSecilenIslem("giris")}
          >
            Giriş
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={secilenIslem === "cikis"}
            data-aktif={secilenIslem === "cikis"}
            onClick={() => setSecilenIslem("cikis")}
          >
            Çıkış
          </button>
        </div>
        <p className="ipucu text-center">Sistem sizin için doğru işlemi seçer, gerekirse buradan değiştirin.</p>
      </section>

      {/* Bugün */}
      <section className="panel p-5">
        <h2 className="baslik-font m1 mb-3 text-lg">Bugün</h2>
        {bugunkuler.length === 0 ? (
          <p className="m3 text-sm">Bugün henüz işlem yapılmadı.</p>
        ) : (
          <div className="zaman">
            {bugunkuler.map((h) => (
              <div key={h.id} className="zaman-oge" data-islem={h.islem_turu === "İşe Giriş" ? "giris" : "cikis"}>
                <p className="m1 text-sm font-semibold">
                  <span className="sayi">{yerelSaat(h.created_at)}</span>
                  <span className="m2 ml-2 font-medium">{h.islem_turu === "İşe Giriş" ? "Giriş" : "Çıkış"}</span>
                </p>
                <p className="m3 text-xs">{h.sube_ad || "Şube"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* İzin talebi */}
      <button
        type="button"
        onClick={() => setIzinAcik(true)}
        className="panel flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="bos-ikon flex h-10 w-10 items-center justify-center rounded-full">
          <Ikon ad="rapor" />
        </span>
        <span className="flex-1">
          <span className="m1 block font-semibold">İzin veya rapor talebi</span>
          <span className="m3 block text-xs">
            {yillikIzin?.tanimli
              ? `Yıllık izin bakiyeniz: ${gunYaz(yillikIzin.kalan)} gün${
                  yillikIzin.bekleyen ? ` (onay bekleyen ${gunYaz(yillikIzin.bekleyen)})` : ""
                }`
              : "İK onayına gönderilir, onaylanınca puantaja işlenir."}
          </span>
        </span>
        <Ikon ad="sag" className="m3" />
      </button>

      {/* Fazla mesai bildir (mobil_ozet destekliyorsa) */}
      {mesaiTalepleri && (
        <button
          type="button"
          onClick={() => {
            setMesai({ ...mesai, tarih: mesai.tarih || yerelTarih() });
            setMesaiAcik(true);
          }}
          className="panel flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="bos-ikon flex h-10 w-10 items-center justify-center rounded-full">
            <Ikon ad="ay" />
          </span>
          <span className="flex-1">
            <span className="m1 block font-semibold">Fazla mesai bildir</span>
            <span className="m3 block text-xs">Mesaiye kaldığınız saatleri girin, yöneticinizin onayına gider.</span>
          </span>
          <Ikon ad="sag" className="m3" />
        </button>
      )}

      {/* Avans ve masraf */}
      {token && <MobilOdemeler token={token} />}

      {/* Mesai taleplerim */}
      {mesaiTalepleri && mesaiTalepleri.length > 0 && (
        <section>
          <h2 className="baslik-font m1 mb-2 px-1 text-lg">Fazla mesailerim</h2>
          <ul className="panel liste overflow-hidden">
            {mesaiTalepleri.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="m1 block text-sm font-semibold">
                    {kisaTarih(t.tarih)}, {sureYaz(t.sure_dk)}
                  </span>
                  <span className="m3 block truncate text-xs">
                    {t.baslangic_saat.slice(0, 5)}-{t.bitis_saat.slice(0, 5)} · {t.neden}
                  </span>
                  {t.karar_notu && (
                    <span className="mt-0.5 block text-xs" style={{ color: t.durum === "REDDEDILDI" ? "var(--hata)" : undefined }}>
                      Amir: {t.karar_notu}
                    </span>
                  )}
                </span>
                <span
                  className={`rozet ${
                    t.durum === "ONAYLANDI" ? "rozet-giris" : t.durum === "REDDEDILDI" ? "rozet-hata" : "rozet-uyari"
                  }`}
                >
                  {t.durum === "ONAYLANDI" ? "Onaylandı" : t.durum === "REDDEDILDI" ? "Reddedildi" : "Bekliyor"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Taleplerim */}
      {talepler && talepler.length > 0 && (
        <section>
          <h2 className="baslik-font m1 mb-2 px-1 text-lg">Taleplerim</h2>
          <ul className="panel liste overflow-hidden">
            {talepler.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="m1 block truncate text-sm font-semibold">{t.izin_turu}</span>
                  <span className="m3 block text-xs">
                    {t.izin_turu === "Saatlik İzin"
                      ? `${kisaTarih(t.baslangic_tarihi)}, ${t.baslangic_saat?.slice(0, 5)}-${t.bitis_saat?.slice(0, 5)}`
                      : t.baslangic_tarihi === t.bitis_tarihi
                      ? kisaTarih(t.baslangic_tarihi)
                      : `${kisaTarih(t.baslangic_tarihi)} - ${kisaTarih(t.bitis_tarihi)}`}
                  </span>
                  {t.karar_notu && (
                    <span className="mt-0.5 block text-xs" style={{ color: t.durum === "REDDEDILDI" ? "var(--hata)" : undefined }}>
                      Amir: {t.karar_notu}
                    </span>
                  )}
                </span>
                <span
                  className={`rozet ${
                    t.durum === "ONAYLANDI" ? "rozet-giris" : t.durum === "REDDEDILDI" ? "rozet-hata" : "rozet-uyari"
                  }`}
                >
                  {t.durum === "ONAYLANDI" ? "Onaylandı" : t.durum === "REDDEDILDI" ? "Reddedildi" : "Bekliyor"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Zimmetimdeki eşyalar */}
      {token && <MobilZimmetler token={token} />}

      {/* Eğitimlerim */}
      {token && <MobilEgitimler token={token} />}

      {/* Performans değerlendirmelerim */}
      {token && <MobilPerformans token={token} />}

      {/* Önceki işlemler */}
      {gecmis.length > 0 && (
        <section>
          <h2 className="baslik-font m1 mb-2 px-1 text-lg">Son işlemler</h2>
          <ul className="panel liste overflow-hidden">
            {gecmis.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <span className="nokta" style={{ background: h.islem_turu === "İşe Giriş" ? "var(--giris)" : "var(--cikis)" }} />
                <span className="m1 flex-1 text-sm font-semibold">
                  {h.islem_turu === "İşe Giriş" ? "Giriş" : "Çıkış"}
                  <span className="m3 ml-2 text-xs font-normal">{h.sube_ad || "Şube"}</span>
                </span>
                <span className="m2 sayi text-sm">
                  {yerelTarih(h.created_at) === bugun ? "Bugün" : kisaTarih(yerelTarih(h.created_at))}, {yerelSaat(h.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ana ekrana ekle ipucu */}
      {ipucuGoster && (
        <div className="panel-ic flex items-start gap-3 p-4 text-sm">
          <Ikon ad="telefon" className="m2" />
          <p className="m2 flex-1">
            Uygulama gibi kullanmak için: <strong>iPhone</strong>&apos;da Safari&apos;de Paylaş, ardından &quot;Ana Ekrana
            Ekle&quot;. <strong>Android</strong>&apos;de Chrome menüsünden &quot;Uygulamayı yükle&quot;.
          </p>
          <button
            type="button"
            className="btn btn-hayalet btn-ikon btn-kucuk"
            aria-label="İpucunu kapat"
            onClick={() => {
              localStorage.setItem(IPUCU_ANAHTAR, "1");
              setIpucuGoster(false);
            }}
          >
            <Ikon ad="kapat" boyut={15} />
          </button>
        </div>
      )}

      {/* Fazla mesai penceresi */}
      {mesaiAcik && (
        <Modal onKapat={() => setMesaiAcik(false)} baslik="Fazla mesai bildir">
          <form onSubmit={mesaiGonder} className="space-y-4">
            <div>
              <label className="etiket">Tarih</label>
              <input
                className="girdi sayi"
                type="date"
                required
                max={yerelTarih()}
                value={mesai.tarih}
                onChange={(e) => setMesai({ ...mesai, tarih: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiket">Başlangıç</label>
                <input
                  className="girdi sayi"
                  type="time"
                  required
                  value={mesai.baslangic_saat}
                  onChange={(e) => setMesai({ ...mesai, baslangic_saat: e.target.value })}
                />
              </div>
              <div>
                <label className="etiket">Bitiş</label>
                <input
                  className="girdi sayi"
                  type="time"
                  required
                  value={mesai.bitis_saat}
                  onChange={(e) => setMesai({ ...mesai, bitis_saat: e.target.value })}
                />
              </div>
            </div>
            <p className="m2 text-sm">
              Süre: <strong className="m1">{sureYaz(mesaiDakika(mesai.baslangic_saat, mesai.bitis_saat))}</strong>
              {mesai.bitis_saat <= mesai.baslangic_saat ? " (gece yarısını geçiyor, ertesi gün biter)" : ""}
            </p>
            <div>
              <label className="etiket">Nedeni</label>
              <textarea
                className="girdi"
                rows={3}
                required
                maxLength={300}
                placeholder="Örn: Ay sonu sayımı için kaldım"
                value={mesai.neden}
                onChange={(e) => setMesai({ ...mesai, neden: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn btn-ikincil flex-1" onClick={() => setMesaiAcik(false)}>
                Vazgeç
              </button>
              <button type="submit" className="btn btn-ana flex-1" disabled={mesaiYukleniyor}>
                {mesaiYukleniyor ? "Gönderiliyor..." : "Onaya gönder"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* İzin talebi penceresi */}
      {izinAcik && (
        <Modal onKapat={() => setIzinAcik(false)} baslik="İzin veya rapor talebi">
          <form onSubmit={talepGonder} className="space-y-4">
            <div>
              <label className="etiket">Talep türü</label>
              <select
                className="girdi"
                value={izinTalep.izin_turu}
                onChange={(e) => setIzinTalep({ ...izinTalep, izin_turu: e.target.value })}
              >
                <option value="Raporlu / İstirahat">Sağlık raporu / istirahat</option>
                <option value="Yıllık İzin">Yıllık ücretli izin</option>
                <option value="Saatlik İzin">Saatlik izin</option>
                <option value="Mazeret İzni">Mazeret izni</option>
                <option value="Ücretsiz İzin">Ücretsiz izin</option>
              </select>
            </div>
            {(izinTalep.izin_turu === "Yıllık İzin" || izinTalep.izin_turu === "Saatlik İzin") && yillikIzin?.tanimli && (
              <p className="m2 text-sm">
                Kalan yıllık izniniz: <strong className="m1">{gunYaz(yillikIzin.kalan)} gün</strong>. Hafta tatili ve
                resmi tatiller izinden düşmez.
              </p>
            )}
            {izinTalep.izin_turu === "Saatlik İzin" ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="etiket">Tarih</label>
                  <input
                    className="girdi sayi"
                    type="date"
                    required
                    value={izinTalep.baslangic_tarihi}
                    onChange={(e) => setIzinTalep({ ...izinTalep, baslangic_tarihi: e.target.value })}
                  />
                </div>
                <div>
                  <label className="etiket">Başlangıç</label>
                  <input
                    className="girdi sayi"
                    type="time"
                    required
                    value={izinTalep.baslangic_saat}
                    onChange={(e) => setIzinTalep({ ...izinTalep, baslangic_saat: e.target.value })}
                  />
                </div>
                <div>
                  <label className="etiket">Bitiş</label>
                  <input
                    className="girdi sayi"
                    type="time"
                    required
                    value={izinTalep.bitis_saat}
                    onChange={(e) => setIzinTalep({ ...izinTalep, bitis_saat: e.target.value })}
                  />
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiket">Başlangıç</label>
                <input
                  className="girdi sayi"
                  type="date"
                  required
                  value={izinTalep.baslangic_tarihi}
                  onChange={(e) => setIzinTalep({ ...izinTalep, baslangic_tarihi: e.target.value })}
                />
              </div>
              <div>
                <label className="etiket">Bitiş</label>
                <input
                  className="girdi sayi"
                  type="date"
                  required
                  value={izinTalep.bitis_tarihi}
                  onChange={(e) => setIzinTalep({ ...izinTalep, bitis_tarihi: e.target.value })}
                />
              </div>
            </div>
            )}
            <div>
              <label className="etiket">Not veya belge numarası</label>
              <input
                className="girdi"
                maxLength={300}
                placeholder="Örn: 2 gün rapor aldım, rapor no 4321"
                value={izinTalep.aciklama}
                onChange={(e) => setIzinTalep({ ...izinTalep, aciklama: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn btn-ikincil flex-1" onClick={() => setIzinAcik(false)}>
                Vazgeç
              </button>
              <button type="submit" className="btn btn-ana flex-1" disabled={talepYukleniyor}>
                {talepYukleniyor ? "Gönderiliyor..." : "Talebi gönder"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function MobilPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <MobilGirisEkrani />
    </Suspense>
  );
}
