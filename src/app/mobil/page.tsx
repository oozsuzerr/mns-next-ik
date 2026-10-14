"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { supabase } from "../../lib/supabase";
import { yerelSaat, yerelTarih, yerelTarihSaat } from "../../lib/tarih";

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

// Cihaz kimliği: ilk açılışta rastgele üretilir, tarayıcıda saklanır.
// (Mevcut bir kimlik varsa korunur; eski eşleşmeler bozulmaz.)
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

function hataMetni(kod: string, veri?: Record<string, unknown>): string {
  switch (kod) {
    case "GIRIS_HATALI":
      return "T.C. Kimlik No veya PIN hatalı.";
    case "HESAP_KILITLI":
      return "Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.";
    case "CIHAZ_KILITLI":
      return "Bu hesap başka bir cihaza kilitli! İK yöneticinize başvurun.";
    case "PIN_TANIMSIZ":
      return "Henüz PIN tanımlanmamış. İK yöneticinize başvurun.";
    case "SINIR_DISI":
      return `Şube sınırları dışındasınız! ${veri?.sube ?? "Şube"} şubesine ${veri?.mesafe ?? "?"} metre uzaktasınız (limit ${veri?.limit ?? "?"} m).`;
    case "GPS_ZAYIF":
      return "GPS sinyali zayıf. Açık alana çıkıp birkaç saniye bekleyin, tekrar deneyin.";
    case "TEKRAR":
      return "Bu işlem az önce zaten kaydedildi.";
    case "SUBE_YOK":
      return "Sistemde tanımlı şube bulunamadı.";
    case "KONUM_GECERSIZ":
      return "Konum bilgisi alınamadı. GPS iznini kontrol edin.";
    case "TARIH_GECERSIZ":
      return "Tarih aralığı geçersiz. Bitiş, başlangıçtan önce olamaz (en fazla 90 gün).";
    default:
      return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }
}

function MobilGirisEkrani() {
  const [token, setToken] = useState<string | null>(null);
  const [baslatildi, setBaslatildi] = useState(false);

  const [tcGiris, setTcGiris] = useState("");
  const [pinGiris, setPinGiris] = useState("");
  const [personel, setPersonel] = useState<Personel | null>(null);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [gecmis, setGecmis] = useState<Hareket[]>([]);

  const [enlem, setEnlem] = useState<number | null>(null);
  const [boylam, setBoylam] = useState<number | null>(null);
  const [dogruluk, setDogruluk] = useState<number | null>(null);
  const [enYakinSube, setEnYakinSube] = useState<Sube | null>(null);
  const [mesafe, setMesafe] = useState<number | null>(null);
  const [konumHata, setKonumHata] = useState<string | null>(null);

  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemMesaj, setIslemMesaj] = useState<{ tip: "basarili" | "hata"; metin: string } | null>(null);
  const [anaEkranIpucu, setAnaEkranIpucu] = useState(false);

  const [izinModalAcik, setIzinModalAcik] = useState(false);
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
  }, []);

  const ozetYukle = useCallback(
    async (t: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc("mobil_ozet", { p_token: t });
      if (error) {
        if (error.message.includes("OTURUM_GECERSIZ")) {
          oturumuTemizle();
          setIslemMesaj({ tip: "hata", metin: "Oturum süresi doldu. Lütfen tekrar giriş yapın." });
        } else {
          setIslemMesaj({ tip: "hata", metin: "Veriler alınamadı. İnternet bağlantınızı kontrol edin." });
        }
        return false;
      }
      setPersonel(data.personel);
      setSubeler(data.subeler ?? []);
      setGecmis(data.gecmis ?? []);
      return true;
    },
    [oturumuTemizle]
  );

  // Açılışta kayıtlı oturum varsa geri yükle
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_ANAHTAR);
    const bugun = yerelTarih();
    setIzinTalep((s) => ({ ...s, baslangic_tarihi: bugun, bitis_tarihi: bugun }));

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setAnaEkranIpucu(!standalone);

    async function baslat() {
      if (t) {
        setToken(t);
        await ozetYukle(t);
      }
      setBaslatildi(true);
    }
    baslat();
  }, [ozetYukle]);

  // GPS takibi
  useEffect(() => {
    if (!navigator.geolocation) {
      setKonumHata("Tarayıcınız konum servisini desteklemiyor.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setEnlem(pos.coords.latitude);
        setBoylam(pos.coords.longitude);
        setDogruluk(pos.coords.accuracy);
        setKonumHata(null);
      },
      () => setKonumHata("Lütfen konum (GPS) iznini açın."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // En yakın şube (yalnızca ekranda göstermek için; kesin karar sunucuda verilir)
  useEffect(() => {
    if (enlem === null || boylam === null || subeler.length === 0) return;
    let enYakin: Sube | null = null;
    let minMesafe = Infinity;
    for (const sube of subeler) {
      const m = mesafeHesapla(enlem, boylam, Number(sube.enlem), Number(sube.boylam));
      if (m < minMesafe) {
        minMesafe = m;
        enYakin = sube;
      }
    }
    setEnYakinSube(enYakin);
    setMesafe(minMesafe);
  }, [enlem, boylam, subeler]);

  async function girisYap(e: React.FormEvent) {
    e.preventDefault();
    if (tcGiris.length !== 11 || pinGiris.length < 4) return;

    setYukleniyor(true);
    setIslemMesaj(null);
    try {
      const { data, error } = await supabase.rpc("personel_giris", {
        p_tc: tcGiris,
        p_pin: pinGiris,
        p_cihaz: cihazKimligi(),
      });
      if (error) throw error;

      if (!data?.ok) {
        setIslemMesaj({ tip: "hata", metin: hataMetni(data?.hata) });
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
      setIslemMesaj({ tip: "hata", metin: "Giriş yapılamadı. İnternet bağlantınızı kontrol edin." });
    } finally {
      setYukleniyor(false);
    }
  }

  async function cikisYap() {
    if (token) {
      await supabase.rpc("oturum_kapat", { p_token: token });
    }
    oturumuTemizle();
    setIslemMesaj(null);
  }

  async function hareketKaydet(islemTuru: "İşe Giriş" | "İşe Çıkış") {
    if (!token || enlem === null || boylam === null) {
      alert("Konum bilgisi henüz hazır değil.");
      return;
    }

    setYukleniyor(true);
    setIslemMesaj(null);
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
          setIslemMesaj({ tip: "hata", metin: "Oturum süresi doldu. Lütfen tekrar giriş yapın." });
          return;
        }
        throw error;
      }

      if (!data?.ok) {
        setIslemMesaj({ tip: "hata", metin: hataMetni(data?.hata, data) });
        return;
      }

      setIslemMesaj({ tip: "basarili", metin: `${islemTuru} başarıyla kaydedildi! (${data.sube})` });
      await ozetYukle(token);
    } catch {
      setIslemMesaj({ tip: "hata", metin: "Kayıt yapılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." });
    } finally {
      setYukleniyor(false);
    }
  }

  async function talepGonder(e: React.FormEvent) {
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
        alert(hataMetni(data?.hata));
        return;
      }

      alert("Talebiniz İK birimine iletildi! Onaylandığında puantajınıza yansıyacaktır.");
      setIzinModalAcik(false);
      const bugun = yerelTarih();
      setIzinTalep({ izin_turu: "Raporlu / İstirahat", baslangic_tarihi: bugun, bitis_tarihi: bugun, aciklama: "" });
    } catch {
      alert("Talep gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setTalepYukleniyor(false);
    }
  }

  const sinirdaMi = !!enYakinSube && mesafe !== null && mesafe <= Number(enYakinSube.limit_metre);
  const girisli = !!personel && !!token;

  if (!baslatildi) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 max-w-md mx-auto">
      <div className="space-y-4">
        {/* Üst Logo */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-md border border-blue-500">
              M
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-wide text-white">MNS NEXT IK</h1>
              <p className="text-[11px] text-slate-400 font-medium">Mobil Çalışan Portalı</p>
            </div>
          </div>
          <a
            href="/"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition border border-slate-700"
          >
            Yönetici ➔
          </a>
        </div>

        {/* Giriş / Profil */}
        {!girisli ? (
          <form
            onSubmit={girisYap}
            className="bg-slate-800/80 border border-slate-700 p-5 rounded-2xl space-y-4 backdrop-blur-sm shadow-xl"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-200">Personel Girişi</h2>
              <p className="text-xs text-slate-400 mt-0.5">T.C. Kimlik numaranızı ve İK&apos;nın verdiği PIN&apos;i girin.</p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                autoComplete="username"
                placeholder="T.C. Kimlik No"
                value={tcGiris}
                onChange={(e) => setTcGiris(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-blue-500"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoComplete="current-password"
                placeholder="PIN"
                value={pinGiris}
                onChange={(e) => setPinGiris(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={yukleniyor || tcGiris.length !== 11 || pinGiris.length < 4}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition shadow-lg"
              >
                {yukleniyor ? "Doğrulanıyor..." : "Giriş Yap"}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl flex items-center justify-between backdrop-blur-sm">
            <div>
              <p className="text-xs text-slate-400 font-medium">
                {personel?.sicil_no} • {personel?.departman || "Genel"}
              </p>
              <h2 className="text-base font-extrabold text-white">
                {personel?.ad} {personel?.soyad}
              </h2>
            </div>
            <button
              onClick={cikisYap}
              className="text-xs text-slate-400 hover:text-red-400 font-medium px-2 py-1 rounded bg-slate-900 border border-slate-700"
            >
              Çıkış
            </button>
          </div>
        )}

        {islemMesaj && (
          <div
            className={`p-3.5 rounded-xl text-xs font-bold border ${
              islemMesaj.tip === "basarili"
                ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                : "bg-red-950/60 text-red-300 border-red-800"
            }`}
          >
            {islemMesaj.metin}
          </div>
        )}

        {/* GPS Durumu */}
        <div className="bg-slate-800/50 border border-slate-700/80 p-4 rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  konumHata ? "bg-red-500" : sinirdaMi ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              ></span>
              GPS & Şube Durumu
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {enlem !== null && boylam !== null ? `${enlem.toFixed(4)}, ${boylam.toFixed(4)}` : "Taranıyor..."}
            </span>
          </div>

          {konumHata ? (
            <p className="text-xs text-red-400 font-medium">{konumHata}</p>
          ) : !girisli ? (
            <p className="text-xs text-slate-400">Şube durumunu görmek için giriş yapın.</p>
          ) : enYakinSube ? (
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-200">{enYakinSube.ad}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mesafe: <strong className="text-white">{mesafe} metre</strong> (Limit: ±{enYakinSube.limit_metre}m)
                  {dogruluk !== null && <span className="text-slate-500"> • GPS ±{Math.round(dogruluk)}m</span>}
                </p>
              </div>
              <div>
                {sinirdaMi ? (
                  <span className="px-2 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Şubedesiniz ✓
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Sınır Dışı
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {subeler.length === 0 ? "Sistemde tanımlı şube bulunamadı." : "En yakın şube taranıyor..."}
            </p>
          )}
        </div>

        {/* Aksiyonlar */}
        {girisli && (
          <div className="space-y-2.5 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => hareketKaydet("İşe Giriş")}
                disabled={yukleniyor || !sinirdaMi}
                className="py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 font-extrabold text-sm text-white shadow-lg transition flex flex-col items-center justify-center gap-1"
              >
                <span className="text-lg">☀️</span>
                İşe Giriş Yap
              </button>

              <button
                onClick={() => hareketKaydet("İşe Çıkış")}
                disabled={yukleniyor || !sinirdaMi}
                className="py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 disabled:opacity-40 font-extrabold text-sm text-white shadow-lg transition flex flex-col items-center justify-center gap-1"
              >
                <span className="text-lg">🌙</span>
                İşe Çıkış Yap
              </button>
            </div>

            <button
              onClick={() => setIzinModalAcik(true)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-2"
            >
              <span>🏥</span> İzin / Sağlık Raporu Talep Et
            </button>
          </div>
        )}

        {/* Son Hareketler */}
        {girisli && (
          <div className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-slate-300">Son İşlemleriniz</h3>
            {gecmis.length > 0 ? (
              <div className="space-y-2">
                {gecmis.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                  >
                    <div>
                      <span
                        className={`font-bold mr-2 ${
                          h.islem_turu === "İşe Giriş" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {h.islem_turu}
                      </span>
                      <span className="text-slate-400">{h.sube_ad || "Şube"}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]" title={yerelTarihSaat(h.created_at)}>
                      {yerelTarih(h.created_at) === yerelTarih() ? "" : yerelTarih(h.created_at).slice(5) + " "}
                      {yerelSaat(h.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2 text-center">Henüz bir hareket kaydınız yok.</p>
            )}
          </div>
        )}

        {/* Ana ekrana ekle ipucu */}
        {anaEkranIpucu && (
          <div className="bg-blue-950/40 border border-blue-900/60 p-3 rounded-2xl text-[11px] text-blue-200 leading-relaxed">
            📲 Uygulama gibi kullanmak için: <strong>iPhone</strong>&apos;da Safari&apos;de Paylaş ▸ &quot;Ana Ekrana Ekle&quot;,{" "}
            <strong>Android</strong>&apos;de Chrome menüsü ▸ &quot;Ana ekrana ekle / Uygulamayı yükle&quot;.
          </div>
        )}
      </div>

      {/* İzin / Rapor Talep Modalı */}
      {izinModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-extrabold text-sm text-white">İzin / Rapor Talebi</h3>
              <button onClick={() => setIzinModalAcik(false)} className="text-slate-400 text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={talepGonder} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Talep Türü</label>
                <select
                  value={izinTalep.izin_turu}
                  onChange={(e) => setIzinTalep({ ...izinTalep, izin_turu: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="Raporlu / İstirahat">Sağlık Raporu / İstirahat</option>
                  <option value="Yıllık İzin">Yıllık Ücretli İzin</option>
                  <option value="Mazeret İzni">Mazeret İzni</option>
                  <option value="Ücretsiz İzin">Ücretsiz İzin</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Başlangıç</label>
                  <input
                    type="date"
                    required
                    value={izinTalep.baslangic_tarihi}
                    onChange={(e) => setIzinTalep({ ...izinTalep, baslangic_tarihi: e.target.value })}
                    className="w-full px-2 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Bitiş</label>
                  <input
                    type="date"
                    required
                    value={izinTalep.bitis_tarihi}
                    onChange={(e) => setIzinTalep({ ...izinTalep, bitis_tarihi: e.target.value })}
                    className="w-full px-2 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Mazeret / Belge Notu</label>
                <input
                  type="text"
                  maxLength={300}
                  placeholder="Örn: 2 gün rapor aldım, rapor no: 4321"
                  value={izinTalep.aciklama}
                  onChange={(e) => setIzinTalep({ ...izinTalep, aciklama: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIzinModalAcik(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={talepYukleniyor}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  {talepYukleniyor ? "Gönderiliyor..." : "Talebi İlet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="pt-4 pb-1 text-center">
        <p className="text-[10px] text-slate-500">MNS Next IK Akıllı PDKS Platformu • GPS Korumalı</p>
      </footer>
    </div>
  );
}

export default function MobilPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <MobilGirisEkrani />
    </Suspense>
  );
}
