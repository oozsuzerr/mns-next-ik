"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, selamlama, sureYaz, uzunTarih, yerelSaat, yerelSaatSn, yerelTarih } from "../../lib/tarih";
import { Avatar, Ikon, Marka, Modal, useBildirim } from "../../components/ui";
import { cikisiEksikGirisler, suankiGiris, type MesaiVardiya } from "../../lib/mesai";

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

interface Hareket {
  id: string;
  islem_turu: string;
  created_at: string;
  sube_ad?: string | null;
}

const TOKEN_ANAHTAR = "mns_token";
const CIHAZ_ANAHTAR = "mns_device_id";
const IPUCU_ANAHTAR = "mns_ipucu_kapali";

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

// Cihaz kimliği: ilk açılışta rastgele üretilir ve tarayıcıda saklanır.
// Mevcut bir kimlik varsa korunur, eski eşleşmeler bozulmaz.
function cihazKimligi(): string {
  let id = localStorage.getItem(CIHAZ_ANAHTAR);
  if (!id) {
    const rastgele =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
    id = "D-" + rastgele;
    localStorage.setItem(CIHAZ_ANAHTAR, id);
  }
  return id;
}

function hataMetni(kod: string | undefined, veri?: Record<string, unknown>): string {
  switch (kod) {
    case "GIRIS_HATALI":
      return "T.C. kimlik numarası veya PIN hatalı.";
    case "HESAP_KILITLI":
      return "Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.";
    case "CIHAZ_KILITLI":
      return "Bu hesap başka bir telefona bağlı. İK yöneticinizden kilidi açmasını isteyin.";
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
  const [pinGiris, setPinGiris] = useState("");
  const [pinGoster, setPinGoster] = useState(false);
  const [girisHata, setGirisHata] = useState<string | null>(null);

  const [personel, setPersonel] = useState<Personel | null>(null);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [gecmis, setGecmis] = useState<Hareket[]>([]);
  // Personelin vardiyası (mobil_ozet döndürüyorsa); yoksa 18 saat kuralı kullanılır
  const [vardiya, setVardiya] = useState<MesaiVardiya | null>(null);
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
    aciklama: "",
  });

  const oturumuTemizle = useCallback(() => {
    localStorage.removeItem(TOKEN_ANAHTAR);
    setToken(null);
    setPersonel(null);
    setSubeler([]);
    setGecmis([]);
    setVardiya(null);
    setSonHareketler(null);
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
      setSubeler(data.subeler ?? []);
      setGecmis(data.gecmis ?? []);
      setVardiya(data.vardiya ?? null);
      setSonHareketler(data.son_hareketler ?? null);
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

    const bagimsiz =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIpucuGoster(!bagimsiz && localStorage.getItem(IPUCU_ANAHTAR) !== "1");

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
  const hesapHareketleri = sonHareketler ?? gecmis;
  const girisZamani = simdi ? suankiGiris(hesapHareketleri, vardiya, simdi.getTime()) : null;
  const icerde = girisZamani !== null;
  // Vardiyası bittiği halde çıkışı yapılmamış girişler (yönetici manuel çıkış ekleyene kadar uyarı gösterilir)
  const cikisiEksikler = simdi ? cikisiEksikGirisler(hesapHareketleri, vardiya, simdi.getTime()) : [];
  const gecenDk = girisZamani && simdi ? Math.max(0, Math.floor((simdi.getTime() - girisZamani.getTime()) / 60000)) : 0;

  // Durum değişince doğru işlemi önceden seç (önceki değer karşılaştırılarak, render sırasında)
  const [oncekiIcerde, setOncekiIcerde] = useState(icerde);
  if (icerde !== oncekiIcerde) {
    setOncekiIcerde(icerde);
    setSecilenIslem(icerde ? "cikis" : "giris");
  }

  async function girisYap(e: FormEvent) {
    e.preventDefault();
    if (tcGiris.length !== 11 || pinGiris.length < 4) return;

    setYukleniyor(true);
    setGirisHata(null);
    try {
      const { data, error } = await supabase.rpc("personel_giris", {
        p_tc: tcGiris,
        p_pin: pinGiris,
        p_cihaz: cihazKimligi(),
      });
      if (error) throw error;

      if (!data?.ok) {
        setGirisHata(hataMetni(data?.hata));
        setPinGiris("");
        return;
      }

      localStorage.setItem(TOKEN_ANAHTAR, data.token);
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

  async function talepGonder(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setTalepYukleniyor(true);
    try {
      const { data, error } = await supabase.rpc("izin_talep_olustur", {
        p_token: token,
        p_tur: izinTalep.izin_turu,
        p_baslangic: izinTalep.baslangic_tarihi,
        p_bitis: izinTalep.bitis_tarihi,
        p_aciklama: izinTalep.aciklama.trim() || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        bildir(hataMetni(data?.hata), "hata");
        return;
      }
      bildir("Talebiniz İK birimine iletildi.", "basari");
      setIzinAcik(false);
      const bugun = yerelTarih();
      setIzinTalep({ izin_turu: "Raporlu / İstirahat", baslangic_tarihi: bugun, bitis_tarihi: bugun, aciklama: "" });
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
        <h1 className="baslik-font m1 mt-8 text-4xl leading-tight">Mesaiye başlamadan önce giriş yapın</h1>
        <p className="m2 mt-3 text-base">T.C. kimlik numaranız ve İK birimi tarafından verilen PIN ile devam edin.</p>

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
          <span className="m3 block text-xs">İK onayına gönderilir, onaylanınca puantaja işlenir.</span>
        </span>
        <Ikon ad="sag" className="m3" />
      </button>

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
                <option value="Mazeret İzni">Mazeret izni</option>
                <option value="Ücretsiz İzin">Ücretsiz izin</option>
              </select>
            </div>
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
