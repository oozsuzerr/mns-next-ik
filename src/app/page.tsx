"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { aylikPuantajHesapla, type PuantajSatiri } from "../lib/puantaj";
import { disariAktar, type Bicim, type Satir } from "../lib/disaAktar";
import { ayAraligi, haftaGunu, sureYaz, yerelSaat, yerelTarih, yerelTarihSaat } from "../lib/tarih";

// ---------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------
interface Sube {
  id: string;
  ad: string;
  enlem: number;
  boylam: number;
  limit_metre: number;
}

interface Vardiya {
  id: string;
  ad: string;
  baslangic_saat: string;
  bitis_saat: string;
  mola_dakika: number;
}

interface Personel {
  id: string;
  sicil_no: string;
  tc_kimlik: string;
  ad: string;
  soyad: string;
  departman: string | null;
  varsayilan_sube_id: string | null;
  varsayilan_vardiya_id: string | null;
  rol: string;
  cihaz_id: string | null;
  aktif: boolean;
  created_at: string;
  pin_tanimli?: boolean;
  subeler?: { ad: string } | null;
  vardiyalar?: Vardiya | null;
}

interface Hareket {
  id: string;
  personel_id: string;
  sube_id: string;
  islem_turu: string;
  mesafe_metre: number;
  manuel?: boolean;
  yonetici_notu?: string | null;
  created_at: string;
  personeller?: { ad: string; soyad: string; sicil_no: string; tc_kimlik: string } | null;
  subeler?: { ad: string } | null;
}

interface Izin {
  id: string;
  personel_id: string;
  izin_turu: string;
  sgk_kodu?: string | null;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  aciklama: string | null;
  durum?: string;
  personeller?: { ad: string; soyad: string; sicil_no: string } | null;
}

interface ResmiTatil {
  id: string;
  tarih: string;
  ad: string;
}

type Sekme = "puantaj" | "genel" | "personel" | "vardiya" | "talepler";

const PERSONEL_KOLONLARI =
  "id, sicil_no, tc_kimlik, ad, soyad, departman, varsayilan_sube_id, varsayilan_vardiya_id, rol, cihaz_id, aktif, created_at, pin_tanimli, subeler:varsayilan_sube_id (ad), vardiyalar:varsayilan_vardiya_id (*)";

// Supabase en fazla 1000 satır döndürür; hepsini sayfa sayfa çeker.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tumunuGetir<T>(kur: (bas: number, son: number) => PromiseLike<any>): Promise<T[]> {
  const sonuc: T[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await kur(bas, bas + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    sonuc.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return sonuc;
}

function tcGecerliMi(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split("").map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === d10 && d[10] === d11;
}

function hataYaz(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Bilinmeyen bir hata oluştu";
}

// =====================================================================
// 1) GİRİŞ KAPISI (Supabase Auth)
// =====================================================================
export default function Home() {
  const [oturum, setOturum] = useState<Session | null>(null);
  const [hazir, setHazir] = useState(false);
  const [yonetici, setYonetici] = useState<boolean | null>(null);

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

  useEffect(() => {
    if (!kullaniciId) {
      setYonetici(null);
      return;
    }
    supabase.rpc("is_admin").then(({ data, error }) => {
      setYonetici(!error && data === true);
    });
  }, [kullaniciId]);

  async function cikisYap() {
    await supabase.auth.signOut();
  }

  if (!hazir) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!oturum) {
    return <YoneticiGiris />;
  }

  if (yonetici === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Yetki kontrol ediliyor...
      </div>
    );
  }

  if (!yonetici) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full space-y-3 text-center shadow-sm">
          <p className="text-3xl">🔒</p>
          <h2 className="font-extrabold text-slate-900">Yönetici yetkisi yok</h2>
          <p className="text-xs text-slate-500">
            {oturum.user.email} hesabı yönetici olarak tanımlı değil. Sistem yöneticisinden yetki isteyin.
          </p>
          <button onClick={cikisYap} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold">
            Çıkış Yap
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
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function girisYap(e: React.FormEvent) {
    e.preventDefault();
    setYukleniyor(true);
    setHata(null);
    const { error } = await supabase.auth.signInWithPassword({ email: eposta.trim(), password: sifre });
    if (error) setHata("E-posta veya şifre hatalı.");
    setYukleniyor(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xl">
            M
          </div>
          <div>
            <h1 className="font-extrabold text-lg text-slate-900 leading-tight">MNS NEXT IK</h1>
            <p className="text-xs text-slate-500">Yönetici Girişi</p>
          </div>
        </div>

        <form onSubmit={girisYap} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">E-posta</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={eposta}
              onChange={(e) => setEposta(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Şifre</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {hata && <p className="text-xs font-bold text-rose-600">{hata}</p>}
          <button
            type="submit"
            disabled={yukleniyor}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold"
          >
            {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        <a href="/mobil" className="block text-center text-xs font-semibold text-blue-600 hover:underline">
          📱 Personel mobil ekranına git
        </a>
      </div>
    </div>
  );
}

// =====================================================================
// 2) YÖNETİCİ PANELİ
// =====================================================================
function Panel({ eposta, onCikis }: { eposta: string; onCikis: () => void }) {
  const bugunTarih = yerelTarih();

  const [aktifSekme, setAktifSekme] = useState<Sekme>("puantaj");
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [bugunHareketleri, setBugunHareketleri] = useState<{ id: string; personel_id: string; islem_turu: string }[]>([]);
  const [vardiyalar, setVardiyalar] = useState<Vardiya[]>([]);
  const [izinler, setIzinler] = useState<Izin[]>([]);
  const [resmiTatiller, setResmiTatiller] = useState<ResmiTatil[]>([]);
  const [yukleniyor, setYukleniyor] = useState<boolean>(true);
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);

  const [seciliAy, setSeciliAy] = useState<string>(bugunTarih.slice(0, 7));
  const [raporMenuAcik, setRaporMenuAcik] = useState<boolean>(false);
  const [aramaMetni, setAramaMetni] = useState<string>("");
  const [seciliSubeFiltre, setSeciliSubeFiltre] = useState<string>("TUMU");

  // Modallar
  const [personelModalAcik, setPersonelModalAcik] = useState(false);
  const [personelKayitYukleniyor, setPersonelKayitYukleniyor] = useState(false);
  const bosPersonel = {
    sicil_no: "",
    tc_kimlik: "",
    ad: "",
    soyad: "",
    departman: "Yazılım / Teknoloji",
    varsayilan_sube_id: "",
    varsayilan_vardiya_id: "",
    rol: "PERSONEL",
    pin: "",
  };
  const [yeniPersonel, setYeniPersonel] = useState(bosPersonel);

  const [pinHedef, setPinHedef] = useState<Personel | null>(null);
  const [pinDeger, setPinDeger] = useState("");
  const [pinYukleniyor, setPinYukleniyor] = useState(false);

  const [vardiyaModalAcik, setVardiyaModalAcik] = useState(false);
  const [duzenlenenVardiyaId, setDuzenlenenVardiyaId] = useState<string | null>(null);
  const [vardiyaKayitYukleniyor, setVardiyaKayitYukleniyor] = useState(false);
  const [vardiyaForm, setVardiyaForm] = useState({
    ad: "",
    baslangic_saat: "09:00",
    bitis_saat: "18:00",
    mola_dakika: 60,
  });

  const [izinModalAcik, setIzinModalAcik] = useState(false);
  const [izinKayitYukleniyor, setIzinKayitYukleniyor] = useState(false);
  const bosIzin = {
    personel_id: "",
    izin_turu: "Raporlu / İstirahat",
    sgk_kodu: "01 - İstirahat / Sağlık Raporu",
    baslangic_tarihi: bugunTarih,
    bitis_tarihi: bugunTarih,
    aciklama: "",
  };
  const [izinForm, setIzinForm] = useState(bosIzin);

  const [manuelHareketModalAcik, setManuelHareketModalAcik] = useState(false);
  const [manuelHareketYukleniyor, setManuelHareketYukleniyor] = useState(false);
  const bosManuel = {
    personel_id: "",
    sube_id: "",
    islem_turu: "İşe Çıkış",
    tarih: bugunTarih,
    saat: "18:00",
    yonetici_notu: "Personel çıkış basmayı unuttu, yönetici onayıyla eklendi.",
  };
  const [manuelForm, setManuelForm] = useState(bosManuel);

  const [seciliPersonelId, setSeciliPersonelId] = useState<string | null>(null);

  // -------------------------------------------------------------------
  // Veri çekme
  // -------------------------------------------------------------------
  const verileriGetir = useCallback(
    async (sessiz = false) => {
      if (!sessiz) setYukleniyor(true);
      try {
        const { bas, son } = ayAraligi(seciliAy);
        const gun = 24 * 60 * 60 * 1000;
        // Gece vardiyası eşleştirmesi için ayın bir gün öncesi ve bir gün sonrası da alınır
        const aralikBas = new Date(bas.getTime() - gun).toISOString();
        const aralikSon = new Date(son.getTime() + gun).toISOString();
        const bugunBas = new Date(`${yerelTarih()}T00:00:00+03:00`).toISOString();

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
          supabase.from("hareketler").select("id, personel_id, islem_turu").gte("created_at", bugunBas).limit(1000),
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
        if (bugunD.error) throw bugunD.error;
        if (tatD.error) throw tatD.error;

        setSubeler((subeD.data ?? []) as Sube[]);
        setVardiyalar((varD.data ?? []) as Vardiya[]);
        setPersoneller(perler);
        setHareketler(harler);
        setBugunHareketleri(bugunD.data ?? []);
        setIzinler(izler);
        setResmiTatiller((tatD.data ?? []) as ResmiTatil[]);
        setHataMesaji(null);
      } catch (err) {
        setHataMesaji(hataYaz(err));
      } finally {
        setYukleniyor(false);
      }
    },
    [seciliAy]
  );

  useEffect(() => {
    verileriGetir();
    const zamanlayici = setInterval(() => verileriGetir(true), 60000);
    return () => clearInterval(zamanlayici);
  }, [verileriGetir]);

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

  const bekleyenTalepler = izinler.filter((iz) => iz.durum === "BEKLEMEDE");

  // Canlı radar: bugün giriş yapmayanlar (pazar, resmi tatil ve onaylı izinliler hariç)
  const bugunGirisYapanlar = new Set(
    bugunHareketleri.filter((h) => h.islem_turu === "İşe Giriş").map((h) => h.personel_id)
  );
  const bugunIzinliler = new Set(
    izinler
      .filter(
        (iz) =>
          (!iz.durum || iz.durum === "ONAYLANDI") &&
          bugunTarih >= iz.baslangic_tarihi &&
          bugunTarih <= iz.bitis_tarihi
      )
      .map((iz) => iz.personel_id)
  );
  const bugunTatilMi = haftaGunu(bugunTarih) === 0 || resmiTatiller.some((t) => t.tarih === bugunTarih);
  const bugunHenuzGelmeyenler = bugunTatilMi
    ? []
    : personeller.filter(
        (p) =>
          p.aktif &&
          !bugunGirisYapanlar.has(p.id) &&
          !bugunIzinliler.has(p.id) &&
          (seciliSubeFiltre === "TUMU" || p.varsayilan_sube_id === seciliSubeFiltre)
      );

  const filtrelenmisPersoneller = personeller.filter((p) => {
    const q = aramaMetni.toLowerCase();
    const aramaUygun =
      p.ad.toLowerCase().includes(q) ||
      p.soyad.toLowerCase().includes(q) ||
      p.tc_kimlik.includes(aramaMetni) ||
      p.sicil_no.toLowerCase().includes(q);
    const subeUygun = seciliSubeFiltre === "TUMU" || p.varsayilan_sube_id === seciliSubeFiltre;
    return aramaUygun && subeUygun;
  });

  const filtrelenmisPuantaj = puantajListesi.filter(
    (p) => seciliSubeFiltre === "TUMU" || p.subeId === seciliSubeFiltre
  );

  // Seçili aya ait hareketler (en yeni üstte), şube filtresine göre
  const ayHareketleri = hareketler
    .filter(
      (h) =>
        yerelTarih(h.created_at).startsWith(seciliAy) &&
        (seciliSubeFiltre === "TUMU" || h.sube_id === seciliSubeFiltre)
    )
    .reverse();

  const seciliPersonelPuantaj = seciliPersonelId
    ? puantajListesi.find((p) => p.id === seciliPersonelId) || null
    : null;

  // -------------------------------------------------------------------
  // Dışa aktarma
  // -------------------------------------------------------------------
  function aktifSekmeVerisi(): { baslik: string; dosyaAdi: string; veriler: Satir[] } {
    const ek = `MNS_Next_IK_${bugunTarih}`;

    if (aktifSekme === "puantaj") {
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

    if (aktifSekme === "genel") {
      return {
        baslik: `PDKS Hareketleri (${seciliAy})`,
        dosyaAdi: `${ek}_Hareketler_${seciliAy}`,
        veriler: ayHareketleri.map((h, i) => ({
          Sıra: i + 1,
          Tarih: yerelTarihSaat(h.created_at).split(" ")[0],
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

  function raporIndir(format: Bicim) {
    setRaporMenuAcik(false);
    const { baslik, dosyaAdi, veriler } = aktifSekmeVerisi();
    const sorun = disariAktar(format, baslik, dosyaAdi, veriler);
    if (sorun) alert(sorun);
  }

  // -------------------------------------------------------------------
  // İşlemler
  // -------------------------------------------------------------------
  async function izinDurumGuncelle(id: string, yeniDurum: "ONAYLANDI" | "REDDEDILDI") {
    try {
      const { error } = await supabase.from("izinler").update({ durum: yeniDurum }).eq("id", id);
      if (error) throw error;
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    }
  }

  async function manuelHareketKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!manuelForm.personel_id || !manuelForm.sube_id) {
      alert("Lütfen personel ve şube seçin.");
      return;
    }

    setManuelHareketYukleniyor(true);
    try {
      const sube = subeler.find((s) => s.id === manuelForm.sube_id);
      const tamZaman = new Date(`${manuelForm.tarih}T${manuelForm.saat}:00+03:00`).toISOString();

      const { error } = await supabase.from("hareketler").insert([
        {
          personel_id: manuelForm.personel_id,
          sube_id: manuelForm.sube_id,
          islem_turu: manuelForm.islem_turu,
          created_at: tamZaman,
          enlem: sube ? Number(sube.enlem) : 0,
          boylam: sube ? Number(sube.boylam) : 0,
          mesafe_metre: 0,
          manuel: true,
          yonetici_notu: manuelForm.yonetici_notu.trim() || "İK tarafından manuel eklendi",
        },
      ]);
      if (error) throw error;

      setManuelHareketModalAcik(false);
      setManuelForm(bosManuel);
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    } finally {
      setManuelHareketYukleniyor(false);
    }
  }

  async function izinKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!izinForm.personel_id) {
      alert("Lütfen bir personel seçin.");
      return;
    }
    if (izinForm.bitis_tarihi < izinForm.baslangic_tarihi) {
      alert("Bitiş tarihi başlangıçtan önce olamaz.");
      return;
    }

    setIzinKayitYukleniyor(true);
    try {
      const { error } = await supabase.from("izinler").insert([
        {
          personel_id: izinForm.personel_id,
          izin_turu: izinForm.izin_turu,
          sgk_kodu: izinForm.sgk_kodu,
          baslangic_tarihi: izinForm.baslangic_tarihi,
          bitis_tarihi: izinForm.bitis_tarihi,
          aciklama: izinForm.aciklama.trim() || null,
          durum: "ONAYLANDI",
        },
      ]);
      if (error) throw error;

      setIzinModalAcik(false);
      setIzinForm(bosIzin);
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    } finally {
      setIzinKayitYukleniyor(false);
    }
  }

  async function izinSil(id: string) {
    if (!confirm("Bu izin/rapor kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const { error } = await supabase.from("izinler").delete().eq("id", id);
      if (error) throw error;
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    }
  }

  async function personelEkle(e: React.FormEvent) {
    e.preventDefault();
    const tc = yeniPersonel.tc_kimlik.trim();

    if (!/^[0-9]{11}$/.test(tc)) {
      alert("Lütfen 11 haneli (sadece rakam) T.C. Kimlik No girin.");
      return;
    }
    if (!tcGecerliMi(tc) && !confirm("Bu T.C. Kimlik No geçerlilik kontrolünden geçmedi. Yine de kaydedilsin mi?")) {
      return;
    }
    if (!yeniPersonel.sicil_no.trim() || !yeniPersonel.ad.trim() || !yeniPersonel.soyad.trim()) {
      alert("Zorunlu alanları doldurun.");
      return;
    }
    if (!/^[0-9]{4,8}$/.test(yeniPersonel.pin)) {
      alert("Mobil giriş PIN'i 4 ile 8 haneli rakamlardan oluşmalıdır.");
      return;
    }

    setPersonelKayitYukleniyor(true);
    try {
      const { data, error } = await supabase
        .from("personeller")
        .insert([
          {
            sicil_no: yeniPersonel.sicil_no.trim(),
            tc_kimlik: tc,
            ad: yeniPersonel.ad.trim(),
            soyad: yeniPersonel.soyad.trim(),
            departman: yeniPersonel.departman,
            varsayilan_sube_id: yeniPersonel.varsayilan_sube_id || null,
            varsayilan_vardiya_id: yeniPersonel.varsayilan_vardiya_id || null,
            rol: yeniPersonel.rol,
            aktif: true,
          },
        ])
        .select("id")
        .single();
      if (error) throw error;

      const { error: pinHata } = await supabase.rpc("personel_pin_belirle", {
        p_personel_id: data.id,
        p_pin: yeniPersonel.pin,
      });
      if (pinHata) throw pinHata;

      setYeniPersonel(bosPersonel);
      setPersonelModalAcik(false);
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    } finally {
      setPersonelKayitYukleniyor(false);
    }
  }

  async function pinKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!pinHedef) return;
    if (!/^[0-9]{4,8}$/.test(pinDeger)) {
      alert("PIN 4 ile 8 haneli rakamlardan oluşmalıdır.");
      return;
    }
    setPinYukleniyor(true);
    try {
      const { error } = await supabase.rpc("personel_pin_belirle", {
        p_personel_id: pinHedef.id,
        p_pin: pinDeger,
      });
      if (error) throw error;
      alert(`${pinHedef.ad} ${pinHedef.soyad} için PIN güncellendi. Açık oturumları kapatıldı.`);
      setPinHedef(null);
      setPinDeger("");
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    } finally {
      setPinYukleniyor(false);
    }
  }

  async function personelAktifDegistir(p: Personel) {
    const mesaj = p.aktif
      ? `${p.ad} ${p.soyad} pasife alınsın mı? (Mobil girişi kapanır, geçmiş kayıtlar korunur)`
      : `${p.ad} ${p.soyad} tekrar aktif edilsin mi?`;
    if (!confirm(mesaj)) return;
    try {
      const { error } = await supabase.from("personeller").update({ aktif: !p.aktif }).eq("id", p.id);
      if (error) throw error;
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    }
  }

  async function cihazSifirla(personelId: string) {
    if (!confirm("Cihaz kilidini sıfırlamak istiyor musunuz? Personelin açık oturumu da kapanır.")) return;
    try {
      const { error } = await supabase.rpc("cihaz_sifirla", { p_personel_id: personelId });
      if (error) throw error;
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    }
  }

  async function vardiyaKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!vardiyaForm.ad.trim()) return;

    setVardiyaKayitYukleniyor(true);
    try {
      const kayit = {
        ad: vardiyaForm.ad.trim(),
        baslangic_saat: vardiyaForm.baslangic_saat,
        bitis_saat: vardiyaForm.bitis_saat,
        mola_dakika: Number(vardiyaForm.mola_dakika),
      };
      if (duzenlenenVardiyaId) {
        const { error } = await supabase.from("vardiyalar").update(kayit).eq("id", duzenlenenVardiyaId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vardiyalar").insert([kayit]);
        if (error) throw error;
      }

      setVardiyaModalAcik(false);
      setDuzenlenenVardiyaId(null);
      setVardiyaForm({ ad: "", baslangic_saat: "09:00", bitis_saat: "18:00", mola_dakika: 60 });
      await verileriGetir(true);
    } catch (err) {
      alert("Hata: " + hataYaz(err));
    } finally {
      setVardiyaKayitYukleniyor(false);
    }
  }

  async function vardiyaSil(id: string) {
    if (!confirm("Vardiyayı silmek istediğinize emin misiniz?")) return;
    try {
      const { error } = await supabase.from("vardiyalar").delete().eq("id", id);
      if (error) throw error;
      await verileriGetir(true);
    } catch (err) {
      alert("Hata (vardiya bir personele atanmış olabilir): " + hataYaz(err));
    }
  }

  const stats = [
    { title: "Toplam Şube", value: subeler.length.toString(), change: "Aktif Ofis/Saha", color: "bg-blue-600" },
    {
      title: "Kayıtlı Kadro",
      value: personeller.filter((p) => p.aktif).length.toString(),
      change: "Aktif Personel",
      color: "bg-emerald-600",
    },
    {
      title: "Bekleyen Talep",
      value: bekleyenTalepler.length.toString(),
      change: "Mobil İzin Onayı",
      color: bekleyenTalepler.length > 0 ? "bg-rose-500 animate-pulse" : "bg-amber-500",
    },
    { title: "Tanımlı Vardiya", value: vardiyalar.length.toString(), change: "Çalışma Düzeni", color: "bg-indigo-600" },
  ];

  const sekmeler: { id: Sekme; etiket: string }[] = [
    { id: "puantaj", etiket: "📋 Aylık Puantaj" },
    { id: "talepler", etiket: "🔔 İzin Onay Havuzu" },
    { id: "genel", etiket: "📊 Canlı Loglar" },
    { id: "personel", etiket: `👥 Personeller (${personeller.length})` },
    { id: "vardiya", etiket: `⏰ Vardiyalar (${vardiyalar.length})` },
  ];

  const tipRenk: Record<string, string> = {
    calisma: "bg-emerald-50 text-emerald-800",
    eksik: "bg-amber-100 text-amber-800",
    rapor: "bg-amber-50 text-amber-800",
    izin: "bg-blue-50 text-blue-800",
    devamsiz: "bg-rose-100 text-rose-800",
    tatil: "bg-purple-50 text-purple-800",
    bos: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Üst Navigasyon */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-sm">
              M
            </div>
            <div>
              <h1 className="font-extrabold text-lg text-slate-900 leading-tight">MNS NEXT IK</h1>
              <p className="text-[11px] font-semibold text-blue-600 tracking-wide uppercase">
                Akıllı PDKS & İK Yönetim Platformu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/mobil"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition"
            >
              📱 Mobil Ekran
            </a>
            <span className="hidden sm:inline text-[11px] text-slate-500 max-w-[160px] truncate">{eposta}</span>
            <button
              onClick={onCikis}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Çıkış
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
            {sekmeler.map((s) => (
              <button
                key={s.id}
                onClick={() => setAktifSekme(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                  aktifSekme === s.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {s.etiket}
                {s.id === "talepler" && bekleyenTalepler.length > 0 && (
                  <span className="ml-1.5 px-1.5 bg-rose-600 text-white rounded-full text-[10px]">
                    {bekleyenTalepler.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Başlık & Aksiyon Barı */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              {aktifSekme === "puantaj"
                ? "Aylık Puantaj, SGK & Mesai Cetveli"
                : aktifSekme === "talepler"
                ? "Personel İzin & Rapor Talep Onay Havuzu"
                : aktifSekme === "genel"
                ? "Saha Giriş-Çıkış Canlı İzleme"
                : aktifSekme === "personel"
                ? "Personel Kadrosu, PIN & Cihaz Kilitleri"
                : "Vardiya & Çalışma Planı"}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Veriler her dakika kendiliğinden yenilenir.
              {yukleniyor && " Yükleniyor..."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 relative">
            <select
              value={seciliSubeFiltre}
              onChange={(e) => setSeciliSubeFiltre(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white shadow-sm focus:outline-none"
            >
              <option value="TUMU">🏢 Tüm Şubeler ({subeler.length})</option>
              {subeler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </select>

            <div className="relative">
              <button
                onClick={() => setRaporMenuAcik(!raporMenuAcik)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                📥 Rapor İndir ▾
              </button>

              {raporMenuAcik && <div className="fixed inset-0 z-20" onClick={() => setRaporMenuAcik(false)}></div>}

              {raporMenuAcik && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-1.5 space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Biçim Seçin
                  </div>
                  {(
                    [
                      ["xlsx", "📗 Excel Belgesi", ".XLSX", "hover:bg-emerald-50 hover:text-emerald-800"],
                      ["csv", "📄 CSV Tablosu", ".CSV", "hover:bg-blue-50 hover:text-blue-800"],
                      ["pdf", "📑 PDF / Yazdır", ".PDF", "hover:bg-rose-50 hover:text-rose-800"],
                      ["json", "🔤 JSON Ham Veri", ".JSON", "hover:bg-amber-50 hover:text-amber-800"],
                    ] as [Bicim, string, string, string][]
                  ).map(([f, ad, uzanti, renk]) => (
                    <button
                      key={f}
                      onClick={() => raporIndir(f)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 ${renk} transition flex items-center justify-between`}
                    >
                      <span>{ad}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {uzanti}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setManuelHareketModalAcik(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              🕒 + Manuel Düzeltme
            </button>
            <button
              onClick={() => setIzinModalAcik(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              🏥 + İzin/Rapor (SGK)
            </button>
            <button
              onClick={() => setPersonelModalAcik(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              + Yeni Personel
            </button>
          </div>
        </div>

        {hataMesaji && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs font-bold flex items-center justify-between gap-3">
            <span>⚠️ Veri alınamadı: {hataMesaji}</span>
            <button onClick={() => verileriGetir()} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white">
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Canlı radar */}
        {bugunHenuzGelmeyenler.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-xs font-extrabold text-amber-900">
                  Bugün Henüz Giriş Yapmamış Personeller ({bugunHenuzGelmeyenler.length} Kişi)
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {bugunHenuzGelmeyenler
                    .map((p) => `${p.ad} ${p.soyad}`)
                    .slice(0, 4)
                    .join(", ")}
                  {bugunHenuzGelmeyenler.length > 4 && " ve diğerleri..."}
                </p>
              </div>
            </div>
            <button
              onClick={() => setAktifSekme("genel")}
              className="text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-xl hover:bg-amber-700 transition"
            >
              Canlı Logları Gör ➔
            </button>
          </div>
        )}

        {/* İstatistikler */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((item, idx) => (
            <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${item.color}`}></div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.title}</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2">{item.value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-2">• {item.change}</p>
            </div>
          ))}
        </div>

        {/* SEKME: PUANTAJ */}
        {aktifSekme === "puantaj" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Aylık Puantaj Matrisi</h3>
                <p className="text-xs text-slate-500">
                  Gün detayı için personelin adına ya da &quot;Gün Detay&quot; butonuna tıklayın.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-700">Dönem:</label>
                <input
                  type="month"
                  value={seciliAy}
                  onChange={(e) => e.target.value && setSeciliAy(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white shadow-sm focus:outline-none"
                />
                <button
                  onClick={() => verileriGetir()}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  ↻ Yenile
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Sicil & Ad Soyad</th>
                    <th className="py-3 px-3">Şube</th>
                    <th className="py-3 px-3 text-center bg-emerald-50/50 text-emerald-900">Çalışılan</th>
                    <th className="py-3 px-3 text-center bg-amber-50/50 text-amber-900">Raporlu (01)</th>
                    <th className="py-3 px-3 text-center bg-blue-50/50 text-blue-900">İzinli</th>
                    <th className="py-3 px-3 text-center bg-rose-50/50 text-rose-900">Devamsız</th>
                    <th className="py-3 px-3 text-center bg-orange-50/50 text-orange-900">Eksik Hareket</th>
                    <th className="py-3 px-3 text-center bg-purple-50/50 text-purple-900">Resmi Tatil</th>
                    <th className="py-3 px-3">Toplam Net</th>
                    <th className="py-3 px-3">Plan Dışı Mesai</th>
                    <th className="py-3 px-3">Gecikme</th>
                    <th className="py-3 px-3 text-right">Kart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-xs">
                  {filtrelenmisPuantaj.length > 0 ? (
                    filtrelenmisPuantaj.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-3">
                          <p
                            onClick={() => setSeciliPersonelId(p.id)}
                            className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer hover:underline"
                          >
                            {p.adSoyad}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">{p.sicil_no}</p>
                        </td>
                        <td className="py-3.5 px-3 text-slate-700">{p.subeAdi}</td>
                        <td className="py-3.5 px-3 text-center font-bold text-emerald-700 bg-emerald-50/30">
                          {p.calisilanGunler} Gün
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-amber-700 bg-amber-50/30">
                          {p.raporluGunler > 0 ? `${p.raporluGunler} Gün` : "-"}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-blue-700 bg-blue-50/30">
                          {p.izinliGunler > 0 ? `${p.izinliGunler} Gün` : "-"}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-rose-700 bg-rose-50/30">
                          {p.devamsizGunler > 0 ? `${p.devamsizGunler} Gün` : "-"}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-orange-700 bg-orange-50/30">
                          {p.eksikGunler > 0 ? `${p.eksikGunler} Gün` : "-"}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-purple-700 bg-purple-50/30">
                          {p.resmiTatilCalismalari > 0
                            ? `${p.resmiTatilCalismalari} Gün (${sureYaz(p.resmiTatilMesaiDk)})`
                            : "-"}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-slate-900">{sureYaz(p.toplamCalismaDk)}</td>
                        <td className="py-3.5 px-3 font-semibold text-indigo-700">
                          {p.planDisiMesaiDk > 0 ? `+${sureYaz(p.planDisiMesaiDk)}` : "-"}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600">{p.gecikmeDk > 0 ? `${p.gecikmeDk} dk` : "-"}</td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => setSeciliPersonelId(p.id)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 text-[11px] font-bold transition shadow-sm"
                          >
                            🔍 Gün Detay
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-400">
                        Seçili filtreye uygun puantaj kaydı bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Not: Hesaplama; giriş-çıkış eşleştirme (gece vardiyası dahil), 5 dk gecikme ve 15 dk mesai toleransı,
              4 saati aşan günlerde vardiya molasının düşülmesi ve Pazar/resmi tatil ayrımına dayanır. Plan dışı mesai,
              vardiya bitişine göre hesaplanır; yasal haftalık 45 saat sınırı ve zamlı ücret hesabı için bordro
              öncesi mali müşavir onayı alınmalıdır.
            </p>
          </div>
        )}

        {/* SEKME: TALEPLER */}
        {aktifSekme === "talepler" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Personel İzin & Rapor Talepleri</h3>
              <p className="text-xs text-slate-500">
                Mobil portaldan gelen talepler. Onaylananlar puantaja yansır.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Personel</th>
                    <th className="py-3 px-3">Talep Türü</th>
                    <th className="py-3 px-3">SGK Kodu</th>
                    <th className="py-3 px-3">Tarih Aralığı</th>
                    <th className="py-3 px-3">Açıklama</th>
                    <th className="py-3 px-3">Durum</th>
                    <th className="py-3 px-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-xs">
                  {izinler.length > 0 ? (
                    izinler.map((iz) => (
                      <tr key={iz.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {iz.personeller?.ad} {iz.personeller?.soyad}
                          <span className="block text-[11px] font-mono text-slate-400">
                            {iz.personeller?.sicil_no}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800">{iz.izin_turu}</td>
                        <td className="py-3 px-3 font-mono text-[11px]">{iz.sgk_kodu || "01"}</td>
                        <td className="py-3 px-3 font-mono">
                          {iz.baslangic_tarihi} ➔ {iz.bitis_tarihi}
                        </td>
                        <td className="py-3 px-3 italic text-slate-500">{iz.aciklama || "-"}</td>
                        <td className="py-3 px-3">
                          {iz.durum === "BEKLEMEDE" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                              ⏳ Onay Bekliyor
                            </span>
                          ) : iz.durum === "REDDEDILDI" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              ✕ Reddedildi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ Onaylandı
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {iz.durum === "BEKLEMEDE" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => izinDurumGuncelle(iz.id, "ONAYLANDI")}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700"
                              >
                                Onayla
                              </button>
                              <button
                                onClick={() => izinDurumGuncelle(iz.id, "REDDEDILDI")}
                                className="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 font-bold text-[11px] hover:bg-rose-100"
                              >
                                Reddet
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => izinSil(iz.id)} className="text-xs text-slate-400 hover:text-rose-600">
                              Sil
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Kayıtlı izin veya talep bulunmuyor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEKME: LOGLAR */}
        {aktifSekme === "genel" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-bold text-base text-slate-900">Hareket Akışı ({seciliAy})</h3>
                <p className="text-xs text-slate-500">
                  Mobil GPS girişleri ve İK onaylı düzeltmeler. Ekranda en yeni 300 kayıt gösterilir; dışa aktarımda
                  tümü yer alır.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={seciliAy}
                  onChange={(e) => e.target.value && setSeciliAy(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                />
                <button
                  onClick={() => verileriGetir()}
                  className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg"
                >
                  Yenile ↻
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Tarih & Saat</th>
                    <th className="py-3 px-3">Personel</th>
                    <th className="py-3 px-3">Şube</th>
                    <th className="py-3 px-3">İşlem</th>
                    <th className="py-3 px-3">Kayıt Türü</th>
                    <th className="py-3 px-3 text-right">Mesafe / Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-xs">
                  {ayHareketleri.length > 0 ? (
                    ayHareketleri.slice(0, 300).map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3 font-mono font-bold text-slate-800">
                          {yerelTarihSaat(h.created_at)}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {h.personeller?.ad} {h.personeller?.soyad}
                        </td>
                        <td className="py-3 px-3">{h.subeler?.ad || "Şube"}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              h.islem_turu === "İşe Giriş"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {h.islem_turu}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {h.manuel ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              ✍️ İK Manuel
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              📱 Mobil GPS
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          {h.manuel ? h.yonetici_notu : `${h.mesafe_metre}m`}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Bu ay için kayıt yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEKME: PERSONEL */}
        {aktifSekme === "personel" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <input
                type="text"
                placeholder="İsim, TC veya Sicil No ile ara..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                className="w-full sm:w-80 px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none"
              />
              <button
                onClick={() => setPersonelModalAcik(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm"
              >
                + Yeni Personel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Sicil No</th>
                    <th className="py-3 px-4">Ad Soyad</th>
                    <th className="py-3 px-4">T.C. Kimlik</th>
                    <th className="py-3 px-4">Şube</th>
                    <th className="py-3 px-4">Mobil PIN</th>
                    <th className="py-3 px-4">Cihaz Kilidi</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-xs">
                  {filtrelenmisPersoneller.map((p) => (
                    <tr key={p.id} className={`hover:bg-slate-50/80 ${p.aktif ? "" : "opacity-60"}`}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.sicil_no}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {p.ad} {p.soyad}
                        <span className="block text-[11px] font-normal text-slate-400">{p.departman || "Genel"}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{p.tc_kimlik}</td>
                      <td className="py-3 px-4">{p.subeler?.ad || "Atanmamış"}</td>
                      <td className="py-3 px-4">
                        {p.pin_tanimli ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🔑 Tanımlı
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            ⚠️ Yok
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {p.cihaz_id ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🔒 Eşleşti
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            🔓 Boşta
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            p.aktif ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {p.aktif ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                        <button
                          onClick={() => {
                            setPinHedef(p);
                            setPinDeger("");
                          }}
                          className="text-[11px] text-blue-600 hover:underline font-bold"
                        >
                          PIN Belirle
                        </button>
                        {p.cihaz_id && (
                          <button
                            onClick={() => cihazSifirla(p.id)}
                            className="text-[11px] text-amber-600 hover:underline font-bold"
                          >
                            Kilidi Sıfırla
                          </button>
                        )}
                        <button
                          onClick={() => personelAktifDegistir(p)}
                          className="text-[11px] text-slate-500 hover:underline font-bold"
                        >
                          {p.aktif ? "Pasife Al" : "Aktif Et"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEKME: VARDİYA */}
        {aktifSekme === "vardiya" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-slate-900">Tanımlı Vardiyalar</h3>
                <p className="text-xs text-slate-500">Mola ve mesai başlangıç/bitiş saatleri</p>
              </div>
              <button
                onClick={() => {
                  setDuzenlenenVardiyaId(null);
                  setVardiyaForm({ ad: "", baslangic_saat: "09:00", bitis_saat: "18:00", mola_dakika: 60 });
                  setVardiyaModalAcik(true);
                }}
                className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                + Yeni Vardiya
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {vardiyalar.map((v) => (
                <div
                  key={v.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Mola: {v.mola_dakika} Dk</span>
                    <h4 className="font-bold text-sm text-slate-900 mt-1">{v.ad}</h4>
                    <p className="text-2xl font-black text-blue-600 font-mono mt-2">
                      {v.baslangic_saat.slice(0, 5)} - {v.bitis_saat.slice(0, 5)}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between mt-3 text-xs">
                    <button
                      onClick={() => {
                        setDuzenlenenVardiyaId(v.id);
                        setVardiyaForm({
                          ad: v.ad,
                          baslangic_saat: v.baslangic_saat.slice(0, 5),
                          bitis_saat: v.bitis_saat.slice(0, 5),
                          mola_dakika: v.mola_dakika,
                        });
                        setVardiyaModalAcik(true);
                      }}
                      className="font-bold text-blue-600 hover:underline"
                    >
                      Düzenle
                    </button>
                    <button onClick={() => vardiyaSil(v.id)} className="font-bold text-red-600 hover:underline">
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL: GÜNLÜK PUANTAJ KARTI */}
      {seciliPersonelPuantaj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  {seciliPersonelPuantaj.adSoyad} • Puantaj Kartı
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Sicil: {seciliPersonelPuantaj.sicil_no} | Dönem: {seciliAy} | Vardiya:{" "}
                  {seciliPersonelPuantaj.vardiyaAdi}
                </p>
              </div>
              <button onClick={() => setSeciliPersonelId(null)} className="text-slate-400 text-xl font-bold">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                <p className="text-[11px] font-bold text-emerald-800">Çalışılan Gün</p>
                <p className="text-xl font-black text-emerald-700">{seciliPersonelPuantaj.calisilanGunler} Gün</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                <p className="text-[11px] font-bold text-amber-800">Rapor / İzin</p>
                <p className="text-xl font-black text-amber-700">
                  {seciliPersonelPuantaj.raporluGunler + seciliPersonelPuantaj.izinliGunler} Gün
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                <p className="text-[11px] font-bold text-blue-800">Toplam Net</p>
                <p className="text-xl font-black text-blue-700">{sureYaz(seciliPersonelPuantaj.toplamCalismaDk)}</p>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-center">
                <p className="text-[11px] font-bold text-rose-800">Devamsız / Eksik</p>
                <p className="text-xl font-black text-rose-700">
                  {seciliPersonelPuantaj.devamsizGunler} / {seciliPersonelPuantaj.eksikGunler}
                </p>
              </div>
            </div>

            <div className="overflow-auto flex-1 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Tarih</th>
                    <th className="py-2.5 px-3">Gün</th>
                    <th className="py-2.5 px-3">Giriş</th>
                    <th className="py-2.5 px-3">Çıkış</th>
                    <th className="py-2.5 px-3">Net Çalışma</th>
                    <th className="py-2.5 px-3">Durum</th>
                    <th className="py-2.5 px-3">Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {seciliPersonelPuantaj.gunlukDetaylar.map((g) => (
                    <tr key={g.gun} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{g.tarih}</td>
                      <td className="py-2 px-3 font-semibold text-slate-500">{g.gunAdi}</td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-700">{g.giris}</td>
                      <td className="py-2 px-3 font-mono font-bold text-rose-700">{g.cikis}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{g.netCalisma}</td>
                      <td className="py-2 px-3">
                        {g.durum && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tipRenk[g.tip]}`}>
                            {g.durum}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500 italic">{g.not || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
              <button
                onClick={() => setSeciliPersonelId(null)}
                className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUEL HAREKET */}
      {manuelHareketModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">Manuel Giriş / Çıkış Düzeltme</h3>
              <button onClick={() => setManuelHareketModalAcik(false)} className="text-slate-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={manuelHareketKaydet} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Personel *</label>
                <select
                  required
                  value={manuelForm.personel_id}
                  onChange={(e) => setManuelForm({ ...manuelForm, personel_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                >
                  <option value="">-- Personel Seçin --</option>
                  {personeller
                    .filter((p) => p.aktif)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sicil_no} - {p.ad} {p.soyad}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Şube *</label>
                <select
                  required
                  value={manuelForm.sube_id}
                  onChange={(e) => setManuelForm({ ...manuelForm, sube_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                >
                  <option value="">-- Şube Seçin --</option>
                  {subeler.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ad}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">İşlem Türü *</label>
                <select
                  value={manuelForm.islem_turu}
                  onChange={(e) => setManuelForm({ ...manuelForm, islem_turu: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                >
                  <option value="İşe Giriş">İşe Giriş</option>
                  <option value="İşe Çıkış">İşe Çıkış</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tarih</label>
                  <input
                    type="date"
                    required
                    value={manuelForm.tarih}
                    onChange={(e) => setManuelForm({ ...manuelForm, tarih: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Saat</label>
                  <input
                    type="time"
                    required
                    value={manuelForm.saat}
                    onChange={(e) => setManuelForm({ ...manuelForm, saat: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Yönetici Notu</label>
                <input
                  type="text"
                  value={manuelForm.yonetici_notu}
                  onChange={(e) => setManuelForm({ ...manuelForm, yonetici_notu: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setManuelHareketModalAcik(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={manuelHareketYukleniyor}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                >
                  {manuelHareketYukleniyor ? "Kaydediliyor..." : "Kaydet ve Düzelt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: İZİN / SGK */}
      {izinModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">İzin / SGK Eksik Gün Tanımla</h3>
              <button onClick={() => setIzinModalAcik(false)} className="text-slate-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={izinKaydet} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Personel *</label>
                <select
                  required
                  value={izinForm.personel_id}
                  onChange={(e) => setIzinForm({ ...izinForm, personel_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                >
                  <option value="">-- Personel Seçin --</option>
                  {personeller
                    .filter((p) => p.aktif)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sicil_no} - {p.ad} {p.soyad}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kayıt Türü *</label>
                <select
                  value={izinForm.izin_turu}
                  onChange={(e) => {
                    const yeniTur = e.target.value;
                    let kod = "01 - İstirahat / Sağlık Raporu";
                    if (yeniTur === "Yıllık İzin") kod = "Ücretli İzin (SGK Bildirilmez)";
                    else if (yeniTur === "Ücretsiz İzin") kod = "05 - Ücretsiz İzin";
                    else if (yeniTur === "Mazeret İzni") kod = "13 - Diğer Nedenler";
                    setIzinForm({ ...izinForm, izin_turu: yeniTur, sgk_kodu: kod });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                >
                  <option value="Raporlu / İstirahat">Raporlu / İstirahat (Sağlık Raporu)</option>
                  <option value="Yıllık İzin">Yıllık Ücretli İzin</option>
                  <option value="Mazeret İzni">Mazeret / İdari İzin</option>
                  <option value="Ücretsiz İzin">Ücretsiz İzin</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">SGK Eksik Gün Kodu</label>
                <select
                  value={izinForm.sgk_kodu}
                  onChange={(e) => setIzinForm({ ...izinForm, sgk_kodu: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs"
                >
                  <option value="01 - İstirahat / Sağlık Raporu">01 - İstirahat / Sağlık Raporu</option>
                  <option value="05 - Ücretsiz İzin">05 - Ücretsiz İzin</option>
                  <option value="13 - Diğer Nedenler">13 - Diğer Nedenler</option>
                  <option value="Ücretli İzin (SGK Bildirilmez)">Ücretli İzin (SGK Bildirilmez)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Başlangıç</label>
                  <input
                    type="date"
                    required
                    value={izinForm.baslangic_tarihi}
                    onChange={(e) => setIzinForm({ ...izinForm, baslangic_tarihi: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bitiş</label>
                  <input
                    type="date"
                    required
                    value={izinForm.bitis_tarihi}
                    onChange={(e) => setIzinForm({ ...izinForm, bitis_tarihi: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Açıklama / Belge</label>
                <input
                  type="text"
                  placeholder="Rapor veya İzin Belgesi No"
                  value={izinForm.aciklama}
                  onChange={(e) => setIzinForm({ ...izinForm, aciklama: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIzinModalAcik(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={izinKayitYukleniyor}
                  className="flex-1 py-2 rounded-xl bg-amber-600 text-white font-bold"
                >
                  {izinKayitYukleniyor ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: YENİ PERSONEL */}
      {personelModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">Yeni Personel Tanımla</h3>
              <button onClick={() => setPersonelModalAcik(false)} className="text-slate-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={personelEkle} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sicil No *</label>
                  <input
                    type="text"
                    required
                    placeholder="MNS-101"
                    value={yeniPersonel.sicil_no}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, sicil_no: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">T.C. Kimlik No *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    required
                    value={yeniPersonel.tc_kimlik}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, tc_kimlik: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ad *</label>
                  <input
                    type="text"
                    required
                    value={yeniPersonel.ad}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, ad: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Soyad *</label>
                  <input
                    type="text"
                    required
                    value={yeniPersonel.soyad}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, soyad: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Departman</label>
                  <input
                    type="text"
                    value={yeniPersonel.departman}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, departman: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Şube</label>
                  <select
                    value={yeniPersonel.varsayilan_sube_id}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, varsayilan_sube_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  >
                    <option value="">-- Şube Seçin --</option>
                    {subeler.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ad}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vardiya</label>
                  <select
                    value={yeniPersonel.varsayilan_vardiya_id}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, varsayilan_vardiya_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  >
                    <option value="">-- Vardiya Seçin --</option>
                    {vardiyalar.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.ad}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobil PIN (4-8 rakam) *</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    required
                    autoComplete="new-password"
                    value={yeniPersonel.pin}
                    onChange={(e) => setYeniPersonel({ ...yeniPersonel, pin: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                PIN, personelin mobil girişte T.C. kimlik numarasıyla birlikte kullanacağı gizli koddur. Sistemde yalnızca
                şifrelenmiş olarak saklanır; personele güvenli bir yolla iletin.
              </p>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setPersonelModalAcik(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={personelKayitYukleniyor}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  {personelKayitYukleniyor ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PIN BELİRLE */}
      {pinHedef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">Mobil PIN Belirle</h3>
              <button onClick={() => setPinHedef(null)} className="text-slate-400 font-bold">
                ✕
              </button>
            </div>
            <form onSubmit={pinKaydet} className="space-y-3 text-xs">
              <p className="text-slate-600">
                <strong>
                  {pinHedef.ad} {pinHedef.soyad}
                </strong>{" "}
                için yeni PIN girin. Kaydedince personelin açık oturumları kapanır ve hatalı deneme kilidi kalkar.
              </p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                required
                autoFocus
                autoComplete="new-password"
                placeholder="4-8 haneli rakam"
                value={pinDeger}
                onChange={(e) => setPinDeger(e.target.value.replace(/\D/g, ""))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono text-center tracking-widest text-lg"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPinHedef(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={pinYukleniyor}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  {pinYukleniyor ? "Kaydediliyor..." : "PIN'i Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VARDİYA */}
      {vardiyaModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                {duzenlenenVardiyaId ? "Vardiyayı Düzenle" : "Yeni Vardiya Ekle"}
              </h3>
              <button onClick={() => setVardiyaModalAcik(false)} className="text-slate-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={vardiyaKaydet} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Vardiya Adı *</label>
                <input
                  type="text"
                  required
                  placeholder="Standart Mesai (09:00 - 18:00)"
                  value={vardiyaForm.ad}
                  onChange={(e) => setVardiyaForm({ ...vardiyaForm, ad: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Başlangıç Saati</label>
                  <input
                    type="time"
                    required
                    value={vardiyaForm.baslangic_saat}
                    onChange={(e) => setVardiyaForm({ ...vardiyaForm, baslangic_saat: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bitiş Saati</label>
                  <input
                    type="time"
                    required
                    value={vardiyaForm.bitis_saat}
                    onChange={(e) => setVardiyaForm({ ...vardiyaForm, bitis_saat: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Gece vardiyası için bitiş saatini başlangıçtan küçük girin (ör. 22:00 - 06:00); sistem bitişi ertesi güne
                sayar.
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mola Süresi (Dakika)</label>
                <input
                  type="number"
                  min={0}
                  value={vardiyaForm.mola_dakika}
                  onChange={(e) => setVardiyaForm({ ...vardiyaForm, mola_dakika: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setVardiyaModalAcik(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={vardiyaKayitYukleniyor}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  {vardiyaKayitYukleniyor ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
