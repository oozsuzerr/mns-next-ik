"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "../supabase";

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
  tc_kimlik: string;
  ad: string;
  soyad: string;
  departman: string | null;
  cihaz_id: string | null;
}

interface Hareket {
  id: string;
  islem_turu: string;
  mesafe_metre: number;
  created_at: string;
  subeler?: { ad: string } | null;
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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

function cihazKimligiUret(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("mns_device_id");
  if (!id) {
    const raw = `${navigator.userAgent}_${screen.width}x${screen.height}_${new Date().getTime()}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    id = "MNS-" + Math.abs(hash).toString(16).toUpperCase();
    localStorage.setItem("mns_device_id", id);
  }
  return id;
}

function MobilGirisEkrani() {
  const [tcGiris, setTcGiris] = useState("");
  const [personel, setPersonel] = useState<Personel | null>(null);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [gecmis, setGecmis] = useState<Hareket[]>([]);

  // Konum bilgileri
  const [enlem, setEnlem] = useState<number | null>(null);
  const [boylam, setBoylam] = useState<number | null>(null);
  const [enYakinSube, setEnYakinSube] = useState<Sube | null>(null);
  const [mesafe, setMesafe] = useState<number | null>(null);
  const [konumHata, setKonumHata] = useState<string | null>(null);

  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemMesaj, setIslemMesaj] = useState<{ tip: "basarili" | "hata"; metin: string } | null>(null);

  // TEŞHİS (geçici): sorun çözülünce silinecek
  const [subeHata, setSubeHata] = useState<string | null>(null);
  const [subeYuklendi, setSubeYuklendi] = useState(false);
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const urlHost = envUrl.replace(/^https?:\/\//, "").split(".")[0];
  const anahtarBosluk = envKey !== envKey.trim() || /\s/.test(envKey);

  // İzin / Rapor Talep Modalı
  const [izinModalAcik, setIzinModalAcik] = useState(false);
  const [talepYukleniyor, setTalepYukleniyor] = useState(false);
  const bugun = new Date().toISOString().slice(0, 10);
  const [izinTalep, setIzinTalep] = useState({
    izin_turu: "Raporlu / İstirahat",
    baslangic_tarihi: bugun,
    bitis_tarihi: bugun,
    aciklama: "",
  });

  useEffect(() => {
    async function baslat() {
      const { data, error } = await supabase.from("subeler").select("*");
      if (error) {
        setSubeHata(`${error.message} (kod: ${error.code || "-"})`);
      } else if (data) {
        setSubeler(data);
      }
      setSubeYuklendi(true);

      const kayitliTc = localStorage.getItem("mns_user_tc");
      if (kayitliTc) {
        setTcGiris(kayitliTc);
        personelDogrula(kayitliTc);
      }
    }
    baslat();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setKonumHata("Tarayıcınız konum servisini desteklemiyor.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setEnlem(pos.coords.latitude);
        setBoylam(pos.coords.longitude);
        setKonumHata(null);
      },
      () => {
        setKonumHata("Lütfen konum (GPS) iznini açın.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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

  async function personelDogrula(tc: string) {
    if (tc.length !== 11) return;
    setYukleniyor(true);
    setIslemMesaj(null);

    try {
      const { data, error } = await supabase
        .from("personeller")
        .select("*")
        .eq("tc_kimlik", tc)
        .single();

      if (error || !data) {
        // PGRST116 = sorgu çalıştı ama satır bulunamadı. Başka bir kod gerçek bir hatadır.
        if (error && error.code !== "PGRST116") {
          setIslemMesaj({
            tip: "hata",
            metin: `Veritabanı hatası: ${error.message} (kod: ${error.code || "-"})`,
          });
        } else {
          setIslemMesaj({ tip: "hata", metin: "Bu T.C. Kimlik No ile kayıtlı personel bulunamadı." });
        }
        setPersonel(null);
        return;
      }

      const buCihaz = cihazKimligiUret();

      if (!data.cihaz_id) {
        await supabase.from("personeller").update({ cihaz_id: buCihaz }).eq("id", data.id);
        data.cihaz_id = buCihaz;
      } else if (data.cihaz_id !== buCihaz) {
        setIslemMesaj({
          tip: "hata",
          metin: "Bu hesap başka bir cihaza kilitli! İK yöneticinize başvurun.",
        });
        setPersonel(null);
        return;
      }

      localStorage.setItem("mns_user_tc", tc);
      setPersonel(data);
      gecmisiYukle(data.id);
    } catch (err: any) {
      setIslemMesaj({ tip: "hata", metin: err.message });
    } finally {
      setYukleniyor(false);
    }
  }

  async function gecmisiYukle(personelId: string) {
    const { data } = await supabase
      .from("hareketler")
      .select(`*, subeler (ad)`)
      .eq("personel_id", personelId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (data) setGecmis(data as any);
  }

  async function hareketKaydet(islemTuru: "İşe Giriş" | "İşe Çıkış") {
    if (!personel || !enYakinSube || mesafe === null || enlem === null || boylam === null) {
      alert("Konum veya personel bilgisi henüz hazır değil.");
      return;
    }

    if (mesafe > enYakinSube.limit_metre) {
      alert(`Şube sınırları dışındasınız! ${enYakinSube.ad} şubesine ${mesafe} metre uzaktasınız.`);
      return;
    }

    setYukleniyor(true);
    setIslemMesaj(null);

    try {
      const { error } = await supabase.from("hareketler").insert([
        {
          personel_id: personel.id,
          sube_id: enYakinSube.id,
          islem_turu: islemTuru,
          enlem: enlem,
          boylam: boylam,
          mesafe_metre: mesafe,
          durum_notu: "Normal",
          manuel: false,
        },
      ]);

      if (error) throw error;

      setIslemMesaj({
        tip: "basarili",
        metin: `${islemTuru} başarıyla kaydedildi! (${enYakinSube.ad})`,
      });

      gecmisiYukle(personel.id);
    } catch (err: any) {
      setIslemMesaj({ tip: "hata", metin: "Kayıt hatası: " + err.message });
    } finally {
      setYukleniyor(false);
    }
  }

  async function talepGonder(e: React.FormEvent) {
    e.preventDefault();
    if (!personel) return;

    setTalepYukleniyor(true);
    try {
      let kod = "01 - İstirahat / Sağlık Raporu";
      if (izinTalep.izin_turu === "Yıllık İzin") kod = "Ücretli İzin";
      else if (izinTalep.izin_turu === "Ücretsiz İzin") kod = "05 - Ücretsiz İzin";
      else if (izinTalep.izin_turu === "Mazeret İzni") kod = "13 - Diğer Nedenler";

      const { error } = await supabase.from("izinler").insert([
        {
          personel_id: personel.id,
          izin_turu: izinTalep.izin_turu,
          sgk_kodu: kod,
          baslangic_tarihi: izinTalep.baslangic_tarihi,
          bitis_tarihi: izinTalep.bitis_tarihi,
          aciklama: izinTalep.aciklama.trim() || "Mobil personel talebi",
          durum: "BEKLEMEDE",
        },
      ]);

      if (error) throw error;

      alert("Talebiniz İK birimine iletildi! Onaylandığında puantajınıza yansıyacaktır.");
      setIzinModalAcik(false);
      setIzinTalep({
        izin_turu: "Raporlu / İstirahat",
        baslangic_tarihi: bugun,
        bitis_tarihi: bugun,
        aciklama: "",
      });
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setTalepYukleniyor(false);
    }
  }

  const sinirdaMi = enYakinSube && mesafe !== null && mesafe <= enYakinSube.limit_metre;

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

        {/* Giriş Ekranı */}
        {!personel ? (
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-2xl space-y-4 backdrop-blur-sm shadow-xl">
            <div>
              <h2 className="text-sm font-bold text-slate-200">Personel Girişi</h2>
              <p className="text-xs text-slate-400 mt-0.5">İşlem yapmak için 11 haneli T.C. Kimlik numaranızı girin.</p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                maxLength={11}
                placeholder="T.C. Kimlik No"
                value={tcGiris}
                onChange={(e) => setTcGiris(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-center tracking-widest text-lg focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => personelDogrula(tcGiris)}
                disabled={yukleniyor || tcGiris.length !== 11}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition shadow-lg"
              >
                {yukleniyor ? "Doğrulanıyor..." : "Giriş Yap"}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl flex items-center justify-between backdrop-blur-sm">
            <div>
              <p className="text-xs text-slate-400 font-medium">{personel.sicil_no} • {personel.departman || "Genel"}</p>
              <h2 className="text-base font-extrabold text-white">
                {personel.ad} {personel.soyad}
              </h2>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("mns_user_tc");
                setPersonel(null);
                setTcGiris("");
              }}
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
              {enlem ? `${enlem.toFixed(4)}, ${boylam?.toFixed(4)}` : "Taranıyor..."}
            </span>
          </div>

          {konumHata ? (
            <p className="text-xs text-red-400 font-medium">{konumHata}</p>
          ) : enYakinSube ? (
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-200">{enYakinSube.ad}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mesafe: <strong className="text-white">{mesafe} metre</strong> (Limit: ±{enYakinSube.limit_metre}m)
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
              {subeYuklendi && subeler.length === 0
                ? "Sistemde tanımlı şube bulunamadı."
                : "En yakın şube taranıyor..."}
            </p>
          )}
        </div>

        {/* Aksiyon Butonları */}
        {personel && (
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
        {personel && (
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
                      <span className="text-slate-400">{h.subeler?.ad || "Şube"}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {new Date(h.created_at).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2 text-center">Henüz bir hareket kaydınız yok.</p>
            )}
          </div>
        )}

        {/* TEŞHİS KUTUSU (geçici, sorun çözülünce silinecek) */}
        <div className="bg-slate-950 border border-dashed border-slate-600 p-3 rounded-2xl text-[11px] font-mono text-slate-400 space-y-1">
          <p className="text-slate-200 font-bold">🔧 Teşhis (geçici)</p>
          <p>URL proje: {urlHost || "YOK (boş)"}</p>
          <p>Anahtar uzunluğu: {envKey.length} {envKey.length === 0 && "(BOŞ!)"}</p>
          <p>Anahtar eyJ ile başlıyor: {envKey.startsWith("eyJ") ? "evet" : "HAYIR"}</p>
          <p>Anahtarda boşluk/satır sonu: {anahtarBosluk ? "VAR (SORUN)" : "yok"}</p>
          <p>Şube sorgusu bitti: {subeYuklendi ? "evet" : "hayır"}</p>
          <p>Gelen şube sayısı: {subeler.length}</p>
          <p className={subeHata ? "text-red-400" : ""}>Şube hatası: {subeHata || "yok"}</p>
        </div>
      </div>

      {/* İzin / Rapor Talep Modalı */}
      {izinModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <h3 className="font-extrabold text-sm text-white">İzin / Rapor Talebi</h3>
              <button onClick={() => setIzinModalAcik(false)} className="text-slate-400 text-lg">✕</button>
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
