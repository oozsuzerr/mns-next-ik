"use client";

// Aylık puantaj cetveli: personeller satırda, günler sütunda; üstte plan, altta gerçekleşen fark (ondalık saat)
import { useMemo, useState, type CSSProperties } from "react";
import type { PuantajSatiri } from "../../lib/puantaj";
import { cetvelAktarimi, cetvelSatiri, saatYaz, TON_ACIKLAMA, TOPLAM_SUTUNLARI, type HucreTon, type MesaiTalepOzu } from "../../lib/puantajCetveli";
import { disariAktar } from "../../lib/disaAktar";
import { ayAdi } from "../../lib/tarih";
import { Ikon, useBildirim } from "../ui";

const RENK: Record<HucreTon, CSSProperties> = {
  fazla: { background: "var(--giris-acik)", color: "var(--giris)" },
  eksik: { background: "var(--uyari-acik)", color: "var(--uyari)" },
  devamsiz: { background: "var(--hata-acik)", color: "var(--hata)" },
  ht: { background: "color-mix(in srgb, #1c9ad6 16%, var(--yuzey))", color: "#1c8fc4" },
  rt: { background: "var(--cikis-acik)", color: "var(--cikis)" },
  izin: { background: "var(--izin-acik)", color: "var(--izin)" },
  rapor: { background: "var(--izin-acik)", color: "var(--izin)" },
  hareket: { background: "var(--uyari-acik)", color: "var(--uyari)" },
  devam: { background: "var(--giris-acik)", color: "var(--giris)" },
  bos: { background: "var(--zemin)", color: "var(--m3)" },
};

const kutu: CSSProperties = { borderRadius: 4, padding: "1px 4px", fontSize: 11, lineHeight: "16px", textAlign: "center", minWidth: 42, whiteSpace: "nowrap" };
const SAYFA = 50;

export default function PuantajCetveli({
  liste,
  talepler,
  seciliAy,
  onSec,
}: {
  liste: PuantajSatiri[];
  /** Fazla mesai talepleri: toplamlara yalnızca onaylananlar girer */
  talepler: MesaiTalepOzu[];
  seciliAy: string;
  onSec: (id: string) => void;
}) {
  const { bildir } = useBildirim();
  const [sayfa, setSayfa] = useState(1);
  const satirlar = useMemo(() => liste.map((p) => cetvelSatiri(p, talepler)), [liste, talepler]);
  const sayfaSayisi = Math.max(1, Math.ceil(satirlar.length / SAYFA));
  const gecerli = Math.min(sayfa, sayfaSayisi);
  const gorunen = satirlar.slice((gecerli - 1) * SAYFA, gecerli * SAYFA);
  const basliklar = satirlar[0]?.hucreler.map((h) => ({ baslik: h.baslik, tarih: h.tarih })) ?? [];

  function excel() {
    const h = disariAktar("xlsx", `Puantaj Cetveli (${ayAdi(seciliAy)})`, `Puantaj_Cetveli_${seciliAy}`, cetvelAktarimi(liste, talepler));
    if (h) bildir(h, "hata");
  }

  if (!satirlar.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(TON_ACIKLAMA) as (keyof typeof TON_ACIKLAMA)[]).map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span style={{ ...kutu, ...RENK[t], minWidth: 14, padding: 0, width: 14, height: 14, display: "inline-block" }} />
            <span className="m2">{TON_ACIKLAMA[t]}</span>
          </span>
        ))}
        <button type="button" className="btn btn-ikincil btn-kucuk ml-auto" onClick={excel}>
          <Ikon ad="indir" boyut={14} />
          Excel aktarım
        </button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr className="m2 text-xs">
              <th className="px-3 py-2 text-left font-semibold" style={{ position: "sticky", left: 0, background: "var(--yuzey)", zIndex: 1, minWidth: 170 }}>
                Adı soyadı
              </th>
              {basliklar.map((b) => (
                <th key={b.tarih} className="whitespace-nowrap px-1 py-2 text-center font-semibold" title={b.tarih}>
                  {b.baslik}
                </th>
              ))}
              {TOPLAM_SUTUNLARI.map((t) => (
                <th key={t.anahtar} className="whitespace-nowrap px-2 py-2 text-right font-semibold" title={t.ad} style={{ borderLeft: t.anahtar === "toplam" ? "2px solid var(--cizgi)" : undefined }}>
                  {t.kisa}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gorunen.map((s) => (
              <tr key={s.id} className="tr-tikla" style={{ borderTop: "1px solid var(--cizgi)" }} onClick={() => onSec(s.id)}>
                <td className="px-3 py-1.5" style={{ position: "sticky", left: 0, background: "var(--yuzey)", zIndex: 1, borderTop: "1px solid var(--cizgi)" }}>
                  <p className="m1 truncate font-semibold" style={{ maxWidth: 190 }}>
                    {s.adSoyad}
                  </p>
                  <p className="m3 text-xs">{s.sicil}</p>
                </td>
                {s.hucreler.map((h) => (
                  <td key={h.tarih} className="px-0.5 py-1.5" title={`${h.tarih}: ${h.aciklama}`} style={{ borderTop: "1px solid var(--cizgi)" }}>
                    <div className="sayi" style={{ ...kutu, ...RENK.bos, color: h.plan != null ? "var(--m1)" : "var(--m3)" }}>
                      {h.plan != null ? saatYaz(h.plan) : "--:--"}
                    </div>
                    <div className="sayi mt-0.5 font-semibold" style={{ ...kutu, ...RENK[h.ton] }}>
                      {h.metin}
                    </div>
                  </td>
                ))}
                {TOPLAM_SUTUNLARI.map((t) => {
                  const v = s.toplam[t.anahtar];
                  return (
                    <td
                      key={t.anahtar}
                      className="sayi m2 whitespace-nowrap px-2 py-1.5 text-right"
                      style={{
                        borderTop: "1px solid var(--cizgi)",
                        borderLeft: t.anahtar === "toplam" ? "2px solid var(--cizgi)" : undefined,
                        color: t.anahtar === "devamsiz" && v > 0 ? "var(--hata)" : t.anahtar === "eksik" && v < 0 ? "var(--uyari)" : undefined,
                        fontWeight: t.anahtar === "toplam" ? 600 : undefined,
                      }}
                    >
                      {v ? saatYaz(v) : "0"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="m3">
          Saatler ondalıktır (7.5 = 7 saat 30 dk). Üst satır planlanan, alt satır iş günlerinde plana göre fark, tatillerde çalışılan süredir (fiilî çalışma). FM, HT ve RT toplamlarına yalnızca müdürün
          onayladığı fazla mesai talepleri girer; onaylanmamış fazla çalışma ONYZ sütunundadır ve ücrete girmez. Toplam:{" "}
          {satirlar.length} personel.
        </p>
        {sayfaSayisi > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-hayalet btn-kucuk" disabled={gecerli <= 1} onClick={() => setSayfa(gecerli - 1)} aria-label="Önceki sayfa">
              ‹
            </button>
            <span className="m2 sayi">
              {gecerli} / {sayfaSayisi}
            </span>
            <button type="button" className="btn btn-hayalet btn-kucuk" disabled={gecerli >= sayfaSayisi} onClick={() => setSayfa(gecerli + 1)} aria-label="Sonraki sayfa">
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
