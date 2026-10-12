"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

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

export default function Home() {
  const [aktifSekme, setAktifSekme] = useState<"puantaj" | "genel" | "personel" | "vardiya" | "talepler">("puantaj");
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [vardiyalar, setVardiyalar] = useState<Vardiya[]>([]);
  const [izinler, setIzinler] = useState<Izin[]>([]);
  const [resmiTatiller, setResmiTatiller] = useState<ResmiTatil[]>([]);
  const [yukleniyor, setYukleniyor] = useState<boolean>(true);
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);

  const bugunStr = new Date().toISOString();
  const [seciliAy, setSeciliAy] = useState<string>(bugunStr.slice(0, 7));
  const bugunTarihStr = bugunStr.slice(0, 10);

  const [raporMenuAcik, setRaporMenuAcik] = useState<boolean>(false);
  const [aramaMetni, setAramaMetni] = useState<string>("");
  const [seciliSubeFiltre, setSeciliSubeFiltre] = useState<string>("TUMU");

  // Modallar
  const [personelModalAcik, setPersonelModalAcik] = useState<boolean>(false);
  const [personelKayitYukleniyor, setPersonelKayitYukleniyor] = useState<boolean>(false);
  const [yeniPersonel, setYeniPersonel] = useState({
    sicil_no: "",
    tc_kimlik: "",
    ad: "",
    soyad: "",
    departman: "Yazılım / Teknoloji",
    varsayilan_sube_id: "",
    varsayilan_vardiya_id: "",
    rol: "PERSONEL",
  });

  const [vardiyaModalAcik, setVardiyaModalAcik] = useState<boolean>(false);
  const [duzenlenenVardiyaId, setDuzenlenenVardiyaId] = useState<string | null>(null);
  const [vardiyaKayitYukleniyor, setVardiyaKayitYukleniyor] = useState<boolean>(false);
  const [vardiyaForm, setVardiyaForm] = useState({
    ad: "",
    baslangic_saat: "09:00",
    bitis_saat: "18:00",
    mola_dakika: 60,
  });

  const [izinModalAcik, setIzinModalAcik] = useState<boolean>(false);
  const [izinKayitYukleniyor, setIzinKayitYukleniyor] = useState<boolean>(false);
  const [izinForm, setIzinForm] = useState({
    personel_id: "",
    izin_turu: "Raporlu / İstirahat",
    sgk_kodu: "01 - İstirahat / Sağlık Raporu",
    baslangic_tarihi: bugunTarihStr,
    bitis_tarihi: bugunTarihStr,
    aciklama: "",
  });

  const [manuelHareketModalAcik, setManuelHareketModalAcik] = useState<boolean>(false);
  const [manuelHareketYukleniyor, setManuelHareketYukleniyor] = useState<boolean>(false);
  const [manuelForm, setManuelForm] = useState({
    personel_id: "",
    sube_id: "",
    islem_turu: "İşe Çıkış",
    tarih: bugunTarihStr,
    saat: "18:00",
    yonetici_notu: "Personel çıkış basmayı unuttu, yönetici onayıyla eklendi.",
  });

  const [seciliPersonelKart, setSeciliPersonelKart] = useState<Personel | null>(null);

  async function verileriGetir() {
    setYukleniyor(true);
    setHataMesaji(null);

    try {
      const { data: subeData, error: subeErr } = await supabase
        .from("subeler")
        .select("*")
        .order("created_at", { ascending: true });
      if (subeErr) throw subeErr;
      if (subeData) setSubeler(subeData);

      const { data: varData, error: varErr } = await supabase
        .from("vardiyalar")
        .select("*")
        .order("created_at", { ascending: true });
      if (varErr) throw varErr;
      if (varData) setVardiyalar(varData);

      const { data: perData, error: perErr } = await supabase
        .from("personeller")
        .select(`*, subeler:varsayilan_sube_id (ad), vardiyalar:varsayilan_vardiya_id (*)`)
        .order("created_at", { ascending: false });
      if (perErr) throw perErr;
      if (perData) setPersoneller(perData as any);

      const { data: harData, error: harErr } = await supabase
        .from("hareketler")
        .select(`*, personeller (ad, soyad, sicil_no, tc_kimlik), subeler (ad)`)
        .order("created_at", { ascending: false });
      if (harErr) throw harErr;
      if (harData) setHareketler(harData as any);

      const { data: izData, error: izErr } = await supabase
        .from("izinler")
        .select(`*, personeller (ad, soyad, sicil_no)`)
        .order("baslangic_tarihi", { ascending: false });
      if (!izErr && izData) setIzinler(izData as any);

      const { data: tatilData, error: tatilErr } = await supabase
        .from("resmi_tatiller")
        .select("*")
        .order("tarih", { ascending: true });
      if (!tatilErr && tatilData) setResmiTatiller(tatilData);
    } catch (err: any) {
      setHataMesaji(err.message || "Bilinmeyen bir hata oluştu");
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    verileriGetir();
  }, []);

  // İzin Talebi Onaylama / Reddetme
  async function izinDurumGuncelle(id: string, yeniDurum: "ONAYLANDI" | "REDDEDILDI") {
    try {
      const { error } = await supabase.from("izinler").update({ durum: yeniDurum }).eq("id", id);
      if (error) throw error;
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    }
  }

  // CANLI RADAR: Bugün giriş yapmayanlar veya çıkış yapmayanlar
  const bugununGirisleri = hareketler.filter(
    (h) => h.islem_turu === "İşe Giriş" && h.created_at.slice(0, 10) === bugunTarihStr
  );
  const bugunGirisYapanPersonelIdleri = new Set(bugununGirisleri.map((h) => h.personel_id));
  const bugunHenuzGelmeyenler = personeller.filter((p) => p.aktif && !bugunGirisYapanPersonelIdleri.has(p.id));

  const bekleyenTalepler = izinler.filter((iz) => iz.durum === "BEKLEMEDE");

  // Puantaj Motoru
  const aylikPuantajHesapla = () => {
    const [yil, ay] = seciliAy.split("-").map(Number);
    const aydakiGunSayisi = new Date(yil, ay, 0).getDate();

    return personeller.map((personel) => {
      const ayHareketleri = hareketler.filter((h) => {
        const tarih = new Date(h.created_at);
        return (
          h.personel_id === personel.id &&
          tarih.getFullYear() === yil &&
          tarih.getMonth() + 1 === ay
        );
      });

      // Yalnızca ONAYLANMIŞ izinler puantaja işlenir
      const personelIzinleri = izinler.filter(
        (iz) => iz.personel_id === personel.id && (iz.durum === "ONAYLANDI" || !iz.durum)
      );

      let calisilanGunler = 0;
      let raporluGunler = 0;
      let izinliGunler = 0;
      let resmiTatilCalismalari = 0;
      let toplamCalismaDk = 0;
      let normalFazlaMesaiDk = 0;
      let resmiTatilMesaiDk = 0;
      let toplamGecKalmaDk = 0;

      const vardiya = personel.vardiyalar || (vardiyalar.length > 0 ? vardiyalar[0] : null);
      const gunlukDetaylar: any[] = [];

      for (let gun = 1; gun <= aydakiGunSayisi; gun++) {
        const gunTarihStr = `${yil}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
        const gunTarih = new Date(yil, ay - 1, gun);
        const haftaninGunu = gunTarih.getDay();
        const haftaTatili = haftaninGunu === 0;

        const resmiTatil = resmiTatiller.find((t) => t.tarih === gunTarihStr);

        const oGununHareketleri = ayHareketleri.filter((h) => {
          return new Date(h.created_at).toISOString().slice(0, 10) === gunTarihStr;
        });

        const aktifIzin = personelIzinleri.find((iz) => {
          return gunTarihStr >= iz.baslangic_tarihi && gunTarihStr <= iz.bitis_tarihi;
        });

        let gunDurumu = "Gelmedi (Eksik)";
        let gunCalismaDk = 0;
        let girisSaatiStr = "-";
        let cikisSaatiStr = "-";
        let gunNotu = "";

        if (oGununHareketleri.length > 0) {
          calisilanGunler++;
          const girisler = oGununHareketleri.filter((h) => h.islem_turu === "İşe Giriş");
          const cikislar = oGununHareketleri.filter((h) => h.islem_turu === "İşe Çıkış");

          if (girisler.length > 0) {
            const ilkGiris = new Date(girisler[0].created_at);
            girisSaatiStr = ilkGiris.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

            if (girisler[0].manuel) gunNotu += "Giriş: Manuel Düzeltildi. ";

            if (vardiya) {
              const [vBasSaat, vBasDk] = vardiya.baslangic_saat.split(":").map(Number);
              const planGiris = new Date(gunTarihStr);
              planGiris.setHours(vBasSaat, vBasDk, 0, 0);

              const gecikme = Math.round((ilkGiris.getTime() - planGiris.getTime()) / (1000 * 60));
              if (gecikme > 5) toplamGecKalmaDk += gecikme;
            }

            if (cikislar.length > 0) {
              const sonCikis = new Date(cikislar[cikislar.length - 1].created_at);
              cikisSaatiStr = sonCikis.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

              if (cikislar[cikislar.length - 1].manuel) gunNotu += "Çıkış: Manuel Düzeltildi. ";

              const brutDk = Math.max(0, Math.round((sonCikis.getTime() - ilkGiris.getTime()) / (1000 * 60)));
              gunCalismaDk = brutDk >= 240 && vardiya ? Math.max(0, brutDk - (vardiya.mola_dakika || 0)) : brutDk;
              toplamCalismaDk += gunCalismaDk;

              if (resmiTatil) {
                resmiTatilCalismalari++;
                resmiTatilMesaiDk += gunCalismaDk;
                gunDurumu = `Resmi Tatil (${resmiTatil.ad}) - 2x Mesai`;
              } else {
                gunDurumu = "Fiili Çalışma";
                if (vardiya) {
                  const [vBitSaat, vBitDk] = vardiya.bitis_saat.split(":").map(Number);
                  const planCikis = new Date(gunTarihStr);
                  planCikis.setHours(vBitSaat, vBitDk, 0, 0);
                  const mesai = Math.round((sonCikis.getTime() - planCikis.getTime()) / (1000 * 60));
                  if (mesai > 15) normalFazlaMesaiDk += mesai;
                }
              }
            } else {
              gunDurumu = "Çıkış Yapılmadı (Eksik)";
            }
          }
        } else if (aktifIzin) {
          if (aktifIzin.izin_turu.includes("Rapor")) {
            raporluGunler++;
            gunDurumu = `Sağlık Raporu [${aktifIzin.sgk_kodu || "01"}]`;
          } else {
            izinliGunler++;
            gunDurumu = `${aktifIzin.izin_turu} [${aktifIzin.sgk_kodu || "İzin"}]`;
          }
          gunNotu = aktifIzin.aciklama || "";
        } else if (resmiTatil) {
          gunDurumu = `Resmi Tatil (${resmiTatil.ad})`;
        } else if (haftaTatili) {
          gunDurumu = "Hafta Tatili (Pazar)";
        }

        gunlukDetaylar.push({
          gun,
          tarih: gunTarihStr,
          gunAdi: gunTarih.toLocaleDateString("tr-TR", { weekday: "short" }),
          giris: girisSaatiStr,
          cikis: cikisSaatiStr,
          netCalisma: gunCalismaDk > 0 ? `${Math.floor(gunCalismaDk / 60)}s ${gunCalismaDk % 60}d` : "-",
          durum: gunDurumu,
          not: gunNotu,
        });
      }

      const pazarSayisi = Array.from({ length: aydakiGunSayisi }, (_, i) => new Date(yil, ay - 1, i + 1).getDay()).filter((d) => d === 0).length;
      const resmiIsGunu = aydakiGunSayisi - pazarSayisi;
      const devamsizGunler = Math.max(0, resmiIsGunu - (calisilanGunler + raporluGunler + izinliGunler));

      return {
        id: personel.id,
        sicil_no: personel.sicil_no,
        adSoyad: `${personel.ad} ${personel.soyad}`,
        departman: personel.departman || "Genel",
        subeAdi: personel.subeler?.ad || "Atanmamış",
        subeId: personel.varsayilan_sube_id,
        vardiyaAdi: vardiya?.ad || "Varsayılan",
        calisilanGunler,
        raporluGunler,
        izinliGunler,
        devamsizGunler,
        resmiTatilCalismalari,
        toplamCalismaSaati:
          toplamCalismaDk >= 60 ? `${Math.floor(toplamCalismaDk / 60)} sa ${toplamCalismaDk % 60} dk` : `${toplamCalismaDk} dk`,
        normalFazlaMesaiSaati:
          normalFazlaMesaiDk >= 60 ? `+${Math.floor(normalFazlaMesaiDk / 60)} sa ${normalFazlaMesaiDk % 60} dk` : `+${normalFazlaMesaiDk} dk`,
        resmiTatilMesaiSaati:
          resmiTatilMesaiDk >= 60 ? `+${Math.floor(resmiTatilMesaiDk / 60)} sa ${resmiTatilMesaiDk % 60} dk (2x)` : resmiTatilMesaiDk > 0 ? `+${resmiTatilMesaiDk} dk (2x)` : "-",
        toplamGecKalmaDk,
        gunlukDetaylar,
      };
    });
  };

  const puantajListesi = aylikPuantajHesapla();

  const filtrelenmisPersoneller = personeller.filter((p) => {
    const aramaUygun =
      p.ad.toLowerCase().includes(aramaMetni.toLowerCase()) ||
      p.soyad.toLowerCase().includes(aramaMetni.toLowerCase()) ||
      p.tc_kimlik.includes(aramaMetni) ||
      p.sicil_no.toLowerCase().includes(aramaMetni.toLowerCase());
    const subeUygun = seciliSubeFiltre === "TUMU" || p.varsayilan_sube_id === seciliSubeFiltre;
    return aramaUygun && subeUygun;
  });

  const filtrelenmisPuantaj = puantajListesi.filter((p) => {
    return seciliSubeFiltre === "TUMU" || p.subeId === seciliSubeFiltre;
  });

  function aktifSekmeVerisiniHazirla() {
    const dosyaEki = `MNS_Next_IK_${bugunTarihStr}`;

    if (aktifSekme === "puantaj") {
      const veriler = filtrelenmisPuantaj.map((p, i) => ({
        "Sıra": i + 1,
        "Dönem": seciliAy,
        "Sicil No": p.sicil_no,
        "Ad Soyad": p.adSoyad,
        "Departman": p.departman,
        "Şube": p.subeAdi,
        "Çalışılan Gün": p.calisilanGunler,
        "Raporlu Gün (SGK 01)": p.raporluGunler,
        "İzinli Gün": p.izinliGunler,
        "Devamsız Gün": p.devamsizGunler,
        "Resmi Tatil Gün Sayısı": p.resmiTatilCalismalari,
        "Toplam Normal Çalışma": p.toplamCalismaSaati,
        "Fazla Mesai (+1.5x)": p.normalFazlaMesaiSaati,
        "Resmi Tatil Mesaisi (2x)": p.resmiTatilMesaiSaati,
        "Gecikme (Dk)": p.toplamGecKalmaDk,
      }));
      return { baslik: `Aylık Puantaj & Bordro Cetveli (${seciliAy})`, dosyaAdi: `${dosyaEki}_Puantaj`, veriler };
    } else if (aktifSekme === "genel") {
      const veriler = hareketler.map((h, i) => {
        const d = new Date(h.created_at);
        return {
          "Sıra": i + 1,
          "Tarih": d.toLocaleDateString("tr-TR"),
          "Saat": d.toLocaleTimeString("tr-TR"),
          "Sicil No": h.personeller?.sicil_no || "-",
          "Ad Soyad": `${h.personeller?.ad || ""} ${h.personeller?.soyad || ""}`.trim(),
          "Şube": h.subeler?.ad || "-",
          "İşlem": h.islem_turu,
          "Tür": h.manuel ? "Manuel Düzeltme" : "GPS Mobil",
          "Mesafe (m)": h.mesafe_metre ?? 0,
          "Yönetici Notu": h.yonetici_notu || "-",
        };
      });
      return { baslik: "PDKS Canlı Hareketleri", dosyaAdi: `${dosyaEki}_Hareketler`, veriler };
    } else {
      const veriler = filtrelenmisPersoneller.map((p, i) => ({
        "Sıra": i + 1,
        "Sicil No": p.sicil_no,
        "Ad Soyad": `${p.ad} ${p.soyad}`.trim(),
        "T.C. Kimlik": p.tc_kimlik,
        "Departman": p.departman || "Genel",
        "Şube": p.subeler?.ad || "Atanmamış",
        "Cihaz": p.cihaz_id ? `Eşleşti (${p.cihaz_id})` : "Boşta",
      }));
      return { baslik: "Personel Listesi", dosyaAdi: `${dosyaEki}_Personeller`, veriler };
    }
  }

  function disariAktar(format: "xlsx" | "csv" | "json" | "pdf") {
    setRaporMenuAcik(false);
    const { baslik, dosyaAdi, veriler } = aktifSekmeVerisiniHazirla();

    if (veriler.length === 0) {
      alert("Bu sekmede dışa aktarılacak veri bulunamadı.");
      return;
    }

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(veriler);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, baslik.slice(0, 31));
      XLSX.writeFile(workbook, `${dosyaAdi}.xlsx`);
    } else if (format === "csv") {
      const basliklar = Object.keys(veriler[0]);
      const satirlar = veriler.map((item: any) =>
        basliklar.map((key) => `"${(item[key] ?? "").toString().replace(/"/g, '""')}"`).join(";")
      );
      const csvIcerik = "\uFEFF" + [basliklar.join(";"), ...satirlar].join("\r\n");
      const blob = new Blob([csvIcerik], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${dosyaAdi}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (format === "json") {
      const jsonIcerik = JSON.stringify(veriler, null, 2);
      const blob = new Blob([jsonIcerik], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${dosyaAdi}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (format === "pdf") {
      const basliklar = Object.keys(veriler[0]);
      const yazdirPenceresi = window.open("", "_blank");
      if (!yazdirPenceresi) {
        alert("Açılır pencere engellendi.");
        return;
      }

      const htmlIcerik = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>${baslik}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1e293b; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 12px; }
            .logo { font-size: 18px; font-weight: 900; color: #2563eb; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; }
            td { padding: 6px 8px; border: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            @media print { @page { size: landscape; margin: 8mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">MNS NEXT IK • ${baslik}</div>
            <div style="font-size:11px;">Tarih: ${new Date().toLocaleString("tr-TR")}</div>
          </div>
          <table>
            <thead><tr>${basliklar.map((b) => `<th>${b}</th>`).join("")}</tr></thead>
            <tbody>
              ${veriler.map((s: any) => `<tr>${basliklar.map((b) => `<td>${s[b] ?? "-"}</td>`).join("")}</tr>`).join("")}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
      `;
      yazdirPenceresi.document.write(htmlIcerik);
      yazdirPenceresi.document.close();
    }
  }

  // Manuel Hareket Kaydet
  async function manuelHareketKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!manuelForm.personel_id || !manuelForm.sube_id) {
      alert("Lütfen personel ve şube seçin.");
      return;
    }

    setManuelHareketYukleniyor(true);
    try {
      const seciliSube = subeler.find((s) => s.id === manuelForm.sube_id);
      const enlemDegeri = seciliSube ? Number(seciliSube.enlem) : 0;
      const boylamDegeri = seciliSube ? Number(seciliSube.boylam) : 0;

      const tamZaman = new Date(`${manuelForm.tarih}T${manuelForm.saat}:00`).toISOString();
      const { error } = await supabase.from("hareketler").insert([
        {
          personel_id: manuelForm.personel_id,
          sube_id: manuelForm.sube_id,
          islem_turu: manuelForm.islem_turu,
          created_at: tamZaman,
          enlem: enlemDegeri,
          boylam: boylamDegeri,
          mesafe_metre: 0,
          manuel: true,
          yonetici_notu: manuelForm.yonetici_notu.trim() || "İK tarafından manuel eklendi",
        },
      ]);
      if (error) throw error;

      setManuelHareketModalAcik(false);
      setManuelForm({
        personel_id: "",
        sube_id: "",
        islem_turu: "İşe Çıkış",
        tarih: bugunTarihStr,
        saat: "18:00",
        yonetici_notu: "Personel çıkış basmayı unuttu, yönetici onayıyla eklendi.",
      });
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setManuelHareketYukleniyor(false);
    }
  }

  // İzin Kaydet
  async function izinKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!izinForm.personel_id) {
      alert("Lütfen bir personel seçin.");
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
      setIzinForm({
        personel_id: "",
        izin_turu: "Raporlu / İstirahat",
        sgk_kodu: "01 - İstirahat / Sağlık Raporu",
        baslangic_tarihi: bugunTarihStr,
        bitis_tarihi: bugunTarihStr,
        aciklama: "",
      });
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setIzinKayitYukleniyor(false);
    }
  }

  async function izinSil(id: string) {
    if (!confirm("Bu izin/rapor kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const { error } = await supabase.from("izinler").delete().eq("id", id);
      if (error) throw error;
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    }
  }

  // Personel Ekle
  async function personelEkle(e: React.FormEvent) {
    e.preventDefault();
    if (!yeniPersonel.tc_kimlik || yeniPersonel.tc_kimlik.length !== 11) {
      alert("Lütfen 11 haneli T.C. Kimlik No girin.");
      return;
    }
    if (!yeniPersonel.sicil_no || !yeniPersonel.ad || !yeniPersonel.soyad) {
      alert("Zorunlu alanları doldurun.");
      return;
    }

    setPersonelKayitYukleniyor(true);
    try {
      const { error } = await supabase.from("personeller").insert([
        {
          sicil_no: yeniPersonel.sicil_no.trim(),
          tc_kimlik: yeniPersonel.tc_kimlik.trim(),
          ad: yeniPersonel.ad.trim(),
          soyad: yeniPersonel.soyad.trim(),
          departman: yeniPersonel.departman,
          varsayilan_sube_id: yeniPersonel.varsayilan_sube_id || null,
          varsayilan_vardiya_id: yeniPersonel.varsayilan_vardiya_id || null,
          rol: yeniPersonel.rol,
          aktif: true,
        },
      ]);
      if (error) throw error;

      setYeniPersonel({
        sicil_no: "",
        tc_kimlik: "",
        ad: "",
        soyad: "",
        departman: "Yazılım / Teknoloji",
        varsayilan_sube_id: "",
        varsayilan_vardiya_id: "",
        rol: "PERSONEL",
      });
      setPersonelModalAcik(false);
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setPersonelKayitYukleniyor(false);
    }
  }

  async function cihazSifirla(personelId: string) {
    if (!confirm("Cihaz kilidini sıfırlamak istiyor musunuz?")) return;
    try {
      const { error } = await supabase.from("personeller").update({ cihaz_id: null }).eq("id", personelId);
      if (error) throw error;
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    }
  }

  async function vardiyaKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!vardiyaForm.ad) return;

    setVardiyaKayitYukleniyor(true);
    try {
      if (duzenlenenVardiyaId) {
        const { error } = await supabase
          .from("vardiyalar")
          .update({
            ad: vardiyaForm.ad,
            baslangic_saat: vardiyaForm.baslangic_saat,
            bitis_saat: vardiyaForm.bitis_saat,
            mola_dakika: Number(vardiyaForm.mola_dakika),
          })
          .eq("id", duzenlenenVardiyaId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vardiyalar").insert([
          {
            ad: vardiyaForm.ad,
            baslangic_saat: vardiyaForm.baslangic_saat,
            bitis_saat: vardiyaForm.bitis_saat,
            mola_dakika: Number(vardiyaForm.mola_dakika),
          },
        ]);
        if (error) throw error;
      }

      setVardiyaModalAcik(false);
      setDuzenlenenVardiyaId(null);
      setVardiyaForm({ ad: "", baslangic_saat: "09:00", bitis_saat: "18:00", mola_dakika: 60 });
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    } finally {
      setVardiyaKayitYukleniyor(false);
    }
  }

  async function vardiyaSil(id: string) {
    if (!confirm("Vardiyayı silmek istediğinize emin misiniz?")) return;
    try {
      const { error } = await supabase.from("vardiyalar").delete().eq("id", id);
      if (error) throw error;
      await verileriGetir();
    } catch (err: any) {
      alert("Hata: " + err.message);
    }
  }

  const stats = [
    { title: "Toplam Şube", value: subeler.length.toString(), change: "Aktif Ofis/Saha", color: "bg-blue-600" },
    { title: "Kayıtlı Kadro", value: personeller.length.toString(), change: "Sistemde Tanımlı", color: "bg-emerald-600" },
    { title: "Bekleyen Talep", value: bekleyenTalepler.length.toString(), change: "Mobil İzin Onayı", color: bekleyenTalepler.length > 0 ? "bg-rose-500 animate-pulse" : "bg-amber-500" },
    { title: "Tanımlı Vardiya", value: vardiyalar.length.toString(), change: "Çalışma Düzeni", color: "bg-indigo-600" },
  ];

  const seciliPersonelPuantaj = seciliPersonelKart
    ? puantajListesi.find((p) => p.id === seciliPersonelKart.id)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Üst Navigasyon */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xl tracking-wider shadow-sm">
                M
              </div>
              <div>
                <h1 className="font-extrabold text-lg text-slate-900 leading-tight">MNS NEXT IK</h1>
                <p className="text-xs font-semibold text-blue-600 tracking-wide uppercase">
                  Akıllı PDKS & İK Yönetim Platformu
                </p>
              </div>
            </div>

            {/* Menü Sekmeleri */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setAktifSekme("puantaj")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  aktifSekme === "puantaj" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📋 Aylık Puantaj & Bordro
              </button>
              <button
                onClick={() => setAktifSekme("talepler")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition relative ${
                  aktifSekme === "talepler" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🔔 İzin Onay Havuzu
                {bekleyenTalepler.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[10px]">
                    {bekleyenTalepler.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setAktifSekme("genel")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  aktifSekme === "genel" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📊 Canlı Loglar
              </button>
              <button
                onClick={() => setAktifSekme("personel")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  aktifSekme === "personel" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                👥 Personeller ({personeller.length})
              </button>
              <button
                onClick={() => setAktifSekme("vardiya")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  aktifSekme === "vardiya" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ⏰ Vardiyalar ({vardiyalar.length})
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/mobil"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
            >
              <span>📱</span> Mobil Ekranı Aç
            </a>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sistem Aktif
            </span>
          </div>
        </div>
      </header>

      {/* Ana Gövde */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Üst Başlık & Aksiyon Barı */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              {aktifSekme === "puantaj"
                ? "Aylık Puantaj, SGK & Mesai Cetveli"
                : aktifSekme === "talepler"
                ? "Personel İzin & Rapor Talep Onay Havuzu"
                : aktifSekme === "genel"
                ? "Saha Giriş-Çıkış Canlı İzleme"
                : aktifSekme === "personel"
                ? "Personel Kadrosu & Cihaz Kilitleri"
                : "Vardiya & Çalışma Planı"}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              MNS Next IK otomatik çalışma günü, fazla mesai, SGK kodları ve resmi tatil matrisi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 relative">
            {/* Şube Filtresi (Şube Müdürü Yetkilendirmesi İçin Hazır) */}
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

            {/* Rapor İndir Menüsü */}
            <div className="relative">
              <button
                onClick={() => setRaporMenuAcik(!raporMenuAcik)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <span>📥</span> Rapor İndir ▾
              </button>

              {raporMenuAcik && (
                <div className="fixed inset-0 z-20" onClick={() => setRaporMenuAcik(false)}></div>
              )}

              {raporMenuAcik && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-1.5 space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    MNS Next IK Formatı Seçin
                  </div>
                  <button
                    onClick={() => disariAktar("xlsx")}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition flex items-center justify-between"
                  >
                    <span>📗 Excel Belgesi</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">.XLSX</span>
                  </button>
                  <button
                    onClick={() => disariAktar("csv")}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-800 transition flex items-center justify-between"
                  >
                    <span>📄 CSV Tablosu</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">.CSV</span>
                  </button>
                  <button
                    onClick={() => disariAktar("pdf")}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-800 transition flex items-center justify-between"
                  >
                    <span>📑 PDF / Yazdır</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">.PDF</span>
                  </button>
                  <button
                    onClick={() => disariAktar("json")}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-800 transition flex items-center justify-between"
                  >
                    <span>🔤 JSON Ham Veri</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">.JSON</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setManuelHareketModalAcik(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <span>🕒</span> + Manuel Düzeltme
            </button>

            <button
              onClick={() => setIzinModalAcik(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <span>🏥</span> + İzin/Rapor (SGK)
            </button>

            <button
              onClick={() => setPersonelModalAcik(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <span>+</span> Yeni Personel
            </button>
          </div>
        </div>

        {/* CANLI RADAR & UYARI ALARMI */}
        {bugunHenuzGelmeyenler.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-xs font-extrabold text-amber-900">
                  Bugün Henüz Giriş Yapmamış Personeller ({bugunHenuzGelmeyenler.length} Kişi)
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {bugunHenuzGelmeyenler.map((p) => `${p.ad} ${p.soyad}`).slice(0, 4).join(", ")}
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

        {/* İstatistik Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((item, idx) => (
            <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${item.color}`}></div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.title}</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2">{item.value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-2 flex items-center gap-1">
                <span>•</span> {item.change}
              </p>
            </div>
          ))}
        </div>

        {/* SEKME 1: AY PUANTAJ */}
        {aktifSekme === "puantaj" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-base text-slate-900">MNS Next IK Aylık Puantaj Matrisi</h3>
                  <p className="text-xs text-slate-500">
                    Detaylı takvimi açmak için personelin ismine veya '30 Gün Detay' butonuna tıklayın.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-slate-700">Dönem Seçin:</label>
                  <input
                    type="month"
                    value={seciliAy}
                    onChange={(e) => setSeciliAy(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white shadow-sm focus:outline-none"
                  />
                  <button
                    onClick={verileriGetir}
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
                      <th className="py-3 px-3 text-center bg-emerald-50/50 text-emerald-900">Çalışılan Gün</th>
                      <th className="py-3 px-3 text-center bg-amber-50/50 text-amber-900">Raporlu (01)</th>
                      <th className="py-3 px-3 text-center bg-blue-50/50 text-blue-900">İzinli Gün</th>
                      <th className="py-3 px-3 text-center bg-rose-50/50 text-rose-900">Devamsız</th>
                      <th className="py-3 px-3 text-center bg-purple-50/50 text-purple-900">Resmi Tatil (2x)</th>
                      <th className="py-3 px-3">Toplam Normal</th>
                      <th className="py-3 px-3">Fazla Mesai</th>
                      <th className="py-3 px-3 text-right">Puantaj Kartı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-xs">
                    {filtrelenmisPuantaj.length > 0 ? (
                      filtrelenmisPuantaj.map((p) => {
                        const orgPersonel = personeller.find((item) => item.id === p.id);
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3.5 px-3">
                              <p
                                onClick={() => orgPersonel && setSeciliPersonelKart(orgPersonel)}
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
                            <td className="py-3.5 px-3 text-center font-bold text-purple-700 bg-purple-50/30">
                              {p.resmiTatilCalismalari > 0 ? `${p.resmiTatilCalismalari} Gün (${p.resmiTatilMesaiSaati})` : "-"}
                            </td>
                            <td className="py-3.5 px-3 font-bold text-slate-900">{p.toplamCalismaSaati}</td>
                            <td className="py-3.5 px-3">
                              <span className="font-semibold text-indigo-700">{p.normalFazlaMesaiSaati}</span>
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <button
                                onClick={() => orgPersonel && setSeciliPersonelKart(orgPersonel)}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 text-[11px] font-bold transition shadow-sm"
                              >
                                🔍 30 Gün Detay
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          Seçili filtreye uygun puantaj kaydı bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SEKME 2: İZİN ONAY HAVUZU (MOBİL TALEP) */}
        {aktifSekme === "talepler" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Personel İzin & Rapor Talepleri</h3>
              <p className="text-xs text-slate-500">
                Personellerin mobil portaldan gönderdiği talepler. Onaylanan talepler doğrudan bordro ve puantaja yansır.
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
                          <span className="block text-[11px] font-mono text-slate-400">{iz.personeller?.sicil_no}</span>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800">{iz.izin_turu}</td>
                        <td className="py-3 px-3 font-mono text-[11px]">{iz.sgk_kodu || "01"}</td>
                        <td className="py-3 px-3 font-mono">{iz.baslangic_tarihi} ➔ {iz.bitis_tarihi}</td>
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
                            <button
                              onClick={() => izinSil(iz.id)}
                              className="text-xs text-slate-400 hover:text-rose-600"
                            >
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

        {/* SEKME 3: GENEL LOGLAR */}
        {aktifSekme === "genel" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Canlı Hareket Akışı (Tüm Loglar)</h3>
                <p className="text-xs text-slate-500">Mobil GPS girişleri ve İK onaylı düzeltmeler</p>
              </div>
              <button onClick={verileriGetir} className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                Yenile ↻
              </button>
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
                  {hareketler.length > 0 ? (
                    hareketler.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3 font-mono font-bold text-slate-800">
                          {new Date(h.created_at).toLocaleDateString("tr-TR")}{" "}
                          {new Date(h.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
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
                      <td colSpan={6} className="py-8 text-center text-slate-400">Henüz kayıt yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEKME 4: PERSONEL LİSTESİ */}
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
                    <th className="py-3 px-4">Departman</th>
                    <th className="py-3 px-4">Şube</th>
                    <th className="py-3 px-4">Cihaz Kilidi</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filtrelenmisPersoneller.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{p.sicil_no}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{p.ad} {p.soyad}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{p.tc_kimlik}</td>
                      <td className="py-3 px-4">{p.departman || "Genel"}</td>
                      <td className="py-3 px-4">{p.subeler?.ad || "Atanmamış"}</td>
                      <td className="py-3 px-4">
                        {p.cihaz_id ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🔒 Eşleşti ({p.cihaz_id})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            🔓 Boşta
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {p.cihaz_id && (
                          <button
                            onClick={() => cihazSifirla(p.id)}
                            className="text-xs text-red-600 hover:underline font-bold"
                          >
                            Kilidi Sıfırla
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEKME 5: VARDİYALAR */}
        {aktifSekme === "vardiya" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-slate-900">Tanımlı Şube Vardiyaları</h3>
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
                <div key={v.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
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

      {/* MODAL 1: 30 GÜNLÜK PUANTAJ KARTI */}
      {seciliPersonelKart && seciliPersonelPuantaj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  {seciliPersonelKart.ad} {seciliPersonelKart.soyad} • MNS Next IK Puantaj Kartı
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Sicil: {seciliPersonelKart.sicil_no} | Dönem: {seciliAy}
                </p>
              </div>
              <button onClick={() => setSeciliPersonelKart(null)} className="text-slate-400 text-xl font-bold">✕</button>
            </div>

            <div className="grid grid-cols-4 gap-3 my-4">
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
                <p className="text-[11px] font-bold text-blue-800">Toplam Normal</p>
                <p className="text-xl font-black text-blue-700">{seciliPersonelPuantaj.toplamCalismaSaati}</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-center">
                <p className="text-[11px] font-bold text-purple-800">Resmi Tatil (2x)</p>
                <p className="text-xl font-black text-purple-700">{seciliPersonelPuantaj.resmiTatilCalismalari} Gün</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl">
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
                  {seciliPersonelPuantaj.gunlukDetaylar.map((g: any) => (
                    <tr key={g.gun} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{g.tarih}</td>
                      <td className="py-2 px-3 font-semibold text-slate-500">{g.gunAdi}</td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-700">{g.giris}</td>
                      <td className="py-2 px-3 font-mono font-bold text-rose-700">{g.cikis}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{g.netCalisma}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {g.durum}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500 italic">{g.not || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
              <button onClick={() => setSeciliPersonelKart(null)} className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MANUEL HAREKET */}
      {manuelHareketModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">Manuel Giriş / Çıkış Düzeltme</h3>
              <button onClick={() => setManuelHareketModalAcik(false)} className="text-slate-400 font-bold">✕</button>
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
                  {personeller.map((p) => (
                    <option key={p.id} value={p.id}>{p.sicil_no} - {p.ad} {p.soyad}</option>
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
                    <option key={s.id} value={s.id}>{s.ad}</option>
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

      {/* MODAL 3: İZİN / SGK EKLE */}
      {izinModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">İzin / SGK Eksik Gün Tanımla</h3>
              <button onClick={() => setIzinModalAcik(false)} className="text-slate-400 font-bold">✕</button>
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
                  {personeller.map((p) => (
                    <option key={p.id} value={p.id}>{p.sicil_no} - {p.ad} {p.soyad}</option>
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

      {/* MODAL 4: YENİ PERSONEL */}
      {personelModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">Yeni Personel Tanımla</h3>
              <button onClick={() => setPersonelModalAcik(false)} className="text-slate-400 font-bold">✕</button>
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
                      <option key={s.id} value={s.id}>{s.ad}</option>
                    ))}
                  </select>
                </div>
              </div>

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

      {/* MODAL 5: VARDİYA EKLE */}
      {vardiyaModalAcik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-base text-slate-900">
                {duzenlenenVardiyaId ? "Vardiyayı Düzenle" : "Yeni Vardiya Ekle"}
              </h3>
              <button onClick={() => setVardiyaModalAcik(false)} className="text-slate-400 font-bold">✕</button>
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mola Süresi (Dakika)</label>
                <input
                  type="number"
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