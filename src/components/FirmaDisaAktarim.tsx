"use client";

// Sistem yöneticisi: firmanın bütün verisini JSON (tam yedek) ya da Excel (tablo başına sayfa) olarak indirir
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { DISA_AKTAR_TABLOLARI } from "../lib/firmaDisaAktar";
import { yerelTarih } from "../lib/tarih";
import { Ikon, Modal } from "./ui";

type Bicim = "json" | "xlsx";

function indir(icerik: BlobPart, ad: string, tur: string) {
  const url = URL.createObjectURL(new Blob([icerik], { type: tur }));
  const a = document.createElement("a");
  a.href = url;
  a.download = ad;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function FirmaDisaAktarim({ firma, onKapat }: { firma: { id: string; ad: string; kod: string }; onKapat: () => void }) {
  const [bicim, setBicim] = useState<Bicim>("xlsx");
  const [ilerleme, setIlerleme] = useState<{ tablo: string; sira: number; satir: number } | null>(null);
  const [sonuc, setSonuc] = useState<{ satir: number; hatalar: string[] } | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function baslat() {
    setHata(null);
    setSonuc(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return setHata("Oturum bulunamadı; yeniden giriş yapın.");
    const tablolar: Record<string, Record<string, unknown>[]> = {};
    const hatalar: string[] = [];
    let toplam = 0;
    try {
      for (const [i, tablo] of DISA_AKTAR_TABLOLARI.entries()) {
        const satirlar: Record<string, unknown>[] = [];
        for (let bas = 0; ; bas += 1000) {
          setIlerleme({ tablo, sira: i + 1, satir: toplam + satirlar.length });
          const r = await fetch("/api/sistem/disari-aktar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ firmaId: firma.id, tablo, bas }),
          });
          const j = (await r.json()) as { satirlar?: Record<string, unknown>[]; devam?: boolean; hata?: string };
          if (!r.ok) throw new Error(j.hata === "YETKISIZ" ? "Bu işlem yalnızca sistem yöneticisine açık." : (j.hata ?? "İstek başarısız"));
          if (j.hata) hatalar.push(`${tablo}: ${j.hata}`);
          satirlar.push(...(j.satirlar ?? []));
          if (!j.devam) break;
        }
        tablolar[tablo] = satirlar;
        toplam += satirlar.length;
      }
    } catch (e) {
      setIlerleme(null);
      return setHata(e instanceof Error ? e.message : "Dışa aktarma başarısız.");
    }
    const ad = `MNS_${firma.kod}_veri_${yerelTarih()}`;
    if (bicim === "json") {
      indir(JSON.stringify({ firma, olusturma: new Date().toISOString(), tablolar, hatalar }, null, 1), `${ad}.json`, "application/json");
    } else {
      const kitap = XLSX.utils.book_new();
      const bilgi = [
        { Alan: "Firma", Değer: firma.ad },
        { Alan: "Kod", Değer: firma.kod },
        { Alan: "Oluşturma", Değer: new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) },
        ...Object.entries(tablolar).map(([t, l]) => ({ Alan: t, Değer: `${l.length} satır` })),
        ...hatalar.map((h) => ({ Alan: "Okunamadı", Değer: h })),
      ];
      XLSX.utils.book_append_sheet(kitap, XLSX.utils.json_to_sheet(bilgi), "Bilgi");
      for (const [t, l] of Object.entries(tablolar)) {
        if (!l.length) continue;
        const duz = l.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
        XLSX.utils.book_append_sheet(kitap, XLSX.utils.json_to_sheet(duz), t.slice(0, 31));
      }
      indir(XLSX.write(kitap, { type: "array", bookType: "xlsx" }), `${ad}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    setIlerleme(null);
    setSonuc({ satir: toplam, hatalar });
  }

  return (
    <Modal onKapat={ilerleme ? () => {} : onKapat} baslik={`${firma.ad}: verileri dışa aktar`}>
      <div className="space-y-4">
        <p className="m2 text-sm">
          Firmanın bütün kayıtları (personel, özlük, hareketler, izinler, mesai, bordro ayarları, İK modülleri, işlem geçmişi) tek dosyada iner. Oturum
          anahtarları, bildirim abonelikleri ve PIN özetleri dosyaya girmez. Belge ve fiş dosyalarının kendisi değil, yolları yer alır. Dosya kişisel
          veri içerir; güvenli saklayın ve yalnızca firmanın yetkilisine verin.
        </p>
        <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }} role="radiogroup" aria-label="Biçim">
          <button type="button" role="radio" aria-checked={bicim === "xlsx"} data-aktif={bicim === "xlsx"} onClick={() => setBicim("xlsx")} disabled={!!ilerleme}>
            Excel (tablo başına sayfa)
          </button>
          <button type="button" role="radio" aria-checked={bicim === "json"} data-aktif={bicim === "json"} onClick={() => setBicim("json")} disabled={!!ilerleme}>
            JSON (tam yedek)
          </button>
        </div>
        {ilerleme && (
          <p className="m1 text-sm">
            {ilerleme.sira}/{DISA_AKTAR_TABLOLARI.length} · {ilerleme.tablo} okunuyor… ({ilerleme.satir} satır)
          </p>
        )}
        {sonuc && (
          <p className="text-sm" style={{ color: "var(--giris)" }}>
            İndirildi: {sonuc.satir} satır.{sonuc.hatalar.length ? ` Okunamayan ${sonuc.hatalar.length} tablo dosyadaki "Bilgi" kısmında.` : ""}
          </p>
        )}
        {hata && (
          <p className="text-sm" style={{ color: "var(--hata)" }}>
            {hata}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ikincil" onClick={onKapat} disabled={!!ilerleme}>
            Kapat
          </button>
          <button type="button" className="btn btn-ana" onClick={baslat} disabled={!!ilerleme}>
            <Ikon ad="indir" boyut={16} />
            {ilerleme ? "Hazırlanıyor..." : "İndir"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
