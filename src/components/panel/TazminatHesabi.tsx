"use client";

// Kıdem ve ihbar tazminatı + kullanılmayan yıllık izin ücreti (tahmini); yalnızca genel yönetici (ücret bilgisi)
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { IzinBakiyesi, Personel } from "../../lib/tipler";
import { bordroAyarlariniTamamla, temelUcret, tlYaz, UCRET_TURLERI, type UcretTuru } from "../../lib/bordro";
import { CIKIS_NEDENLERI, tazminatHesapla } from "../../lib/tazminat";
import { k } from "../../lib/izinBelgeleri";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { Ikon, Modal, useBildirim } from "../ui";

const sayi = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const yaz = (n: number) => (n ? String(Math.round(n * 100) / 100).replace(".", ",") : "");

export default function TazminatHesabi({ hedef, bakiye, firma, onKapat }: { hedef: Personel; bakiye?: IzinBakiyesi; firma: string; onKapat: () => void }) {
  const { bildir } = useBildirim();
  const [yasal, setYasal] = useState(() => bordroAyarlariniTamamla(null).yasal);
  const [f, setF] = useState({
    iseGiris: hedef.ise_giris_tarihi ?? "",
    cikis: hedef.cikis_tarihi ?? yerelTarih(),
    brut: "",
    ek: "",
    neden: "isveren",
    kidemVar: true,
    ihbarVar: true,
    izinGun: yaz(Math.max(0, Number(bakiye?.kalan ?? 0))),
    matrah: "",
    tavan: "",
  });
  const [hazir, setHazir] = useState(false);

  // Özlük ücreti ve firmanın bordro ayarları (kıdem tavanı, vergi dilimleri)
  useEffect(() => {
    Promise.all([
      supabase.from("personel_ozluk").select("ucret, ucret_turu").eq("personel_id", hedef.id).maybeSingle(),
      supabase.from("bordro_ayarlari").select("yasal, mesai_kalemleri").maybeSingle(),
    ]).then(([o, b]) => {
      const ayar = bordroAyarlariniTamamla((b.data ?? null) as Parameters<typeof bordroAyarlariniTamamla>[0]);
      setYasal(ayar.yasal);
      const ucret = Number(o.data?.ucret ?? 0);
      const tur = (UCRET_TURLERI as string[]).includes(o.data?.ucret_turu ?? "") ? (o.data!.ucret_turu as UcretTuru) : "Aylık brüt";
      const ay = Number((hedef.cikis_tarihi ?? yerelTarih()).slice(5, 7));
      const aylik = ucret > 0 ? temelUcret(ucret, tur, ay, ayar.yasal).aylikBrut : 0;
      // Kümülatif matrah tahmini: çıkış ayına kadar aynı ücret (SGK düşülmüş)
      const matrah = aylik * (1 - (ayar.yasal.sgkIsci + ayar.yasal.issizlikIsci) / 100) * (ay - 1);
      setF((x) => ({ ...x, brut: yaz(aylik), matrah: yaz(matrah), tavan: yaz(ayar.yasal.kidemTavani) }));
      setHazir(true);
    });
  }, [hedef.id, hedef.cikis_tarihi]);

  const gecerli = !!f.iseGiris && !!f.cikis && f.iseGiris <= f.cikis;
  const s = useMemo(
    () =>
      gecerli
        ? tazminatHesapla({
            iseGiris: f.iseGiris,
            cikis: f.cikis,
            brutUcret: sayi(f.brut),
            ekOdemeler: sayi(f.ek),
            kidemVar: f.kidemVar,
            ihbarVar: f.ihbarVar,
            izinGun: sayi(f.izinGun),
            kumulatifMatrah: sayi(f.matrah),
            kidemTavani: sayi(f.tavan),
            yasal,
          })
        : null,
    [f, gecerli, yasal]
  );

  function nedenSec(kod: string) {
    const n = CIKIS_NEDENLERI.find((x) => x.kod === kod)!;
    setF({ ...f, neden: kod, kidemVar: n.kidem, ihbarVar: n.ihbar });
  }

  function yazdir() {
    if (!s) return;
    const w = window.open("", "_blank");
    if (!w) return bildir("Açılır pencere engellendi. Tarayıcıdan bu site için izin verin.", "hata");
    const neden = CIKIS_NEDENLERI.find((x) => x.kod === f.neden)?.ad ?? "";
    const satir = (a: string, v: string) => `<tr><td>${k(a)}</td><td class="sag">${k(v)}</td></tr>`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tazminat hesabı ${k(hedef.ad)} ${k(hedef.soyad)}</title>
<style>body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e293b;padding:24px;font-size:12px}h1{font-size:16px;margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin-top:10px}td{border:1px solid #e2e8f0;padding:5px 8px}.sag{text-align:right}.k td{font-weight:700;background:#f8fafc}
.not{color:#64748b;margin-top:12px}.imza{display:flex;justify-content:space-between;margin-top:48px}.imza div{border-top:1px solid #94a3b8;width:40%;text-align:center;padding-top:4px}</style></head><body>
<h1>Kıdem, ihbar ve yıllık izin alacağı hesabı (tahmini)</h1><div>${k(firma)} · Düzenleme: ${k(kisaTarih(yerelTarih()))}</div>
<table>${satir("Personel", `${hedef.ad} ${hedef.soyad} (${hedef.sicil_no})`)}${satir("İşe giriş / çıkış", `${kisaTarih(f.iseGiris)} – ${kisaTarih(f.cikis)}`)}
${satir("Hizmet süresi", `${s.hizmet.yil} yıl ${s.hizmet.ay} ay ${s.hizmet.gun} gün`)}${satir("Çıkış nedeni", neden)}
${satir("Aylık brüt ücret / giydirilmiş", `${tlYaz(sayi(f.brut))} / ${tlYaz(s.giydirilmis)} TL`)}</table>
<table>${satir("Kıdem tazminatı brüt", s.kidem.hak ? `${tlYaz(s.kidem.brut)} TL` : `Yok (${s.kidem.neden})`)}${s.kidem.hak ? satir("Damga vergisi", `−${tlYaz(s.kidem.damga)} TL`) + `<tr class="k"><td>Kıdem net</td><td class="sag">${tlYaz(s.kidem.net)} TL</td></tr>` : ""}
${satir("İhbar tazminatı brüt", s.ihbar.hak ? `${tlYaz(s.ihbar.brut)} TL (${s.ihbar.gun} gün)` : "Yok")}${s.ihbar.hak ? satir("Gelir + damga vergisi", `−${tlYaz(s.ihbar.gelirVergisi + s.ihbar.damga)} TL`) + `<tr class="k"><td>İhbar net</td><td class="sag">${tlYaz(s.ihbar.net)} TL</td></tr>` : ""}
${satir("Kullanılmayan izin ücreti brüt", s.izin.gun ? `${tlYaz(s.izin.brut)} TL (${yaz(s.izin.gun)} gün)` : "Yok")}${s.izin.gun ? satir("SGK + gelir + damga", `−${tlYaz(s.izin.sgk + s.izin.gelirVergisi + s.izin.damga)} TL`) + `<tr class="k"><td>İzin ücreti net</td><td class="sag">${tlYaz(s.izin.net)} TL</td></tr>` : ""}
<tr class="k"><td>Toplam brüt / net</td><td class="sag">${tlYaz(s.toplamBrut)} / ${tlYaz(s.toplamNet)} TL</td></tr></table>
<p class="not">Tahminidir; resmî hesap yerine geçmez. Kıdem tavanı ${tlYaz(sayi(f.tavan))} TL. Mali müşavirinizle kontrol edin.</p>
<div class="imza"><div>İşveren</div><div>Personel</div></div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const alan = (etiket: string, anahtar: "brut" | "ek" | "izinGun" | "matrah" | "tavan", ipucu?: string) => (
    <div>
      <label className="etiket" htmlFor={`tz-${anahtar}`}>
        {etiket}
      </label>
      <input id={`tz-${anahtar}`} className="girdi sayi" inputMode="decimal" value={f[anahtar]} onChange={(e) => setF({ ...f, [anahtar]: e.target.value })} />
      {ipucu && <p className="ipucu">{ipucu}</p>}
    </div>
  );
  const kalem = (ad: string, t: number, eksi = false, kalin = false) => (
    <tr style={{ borderTop: "1px solid var(--cizgi)" }}>
      <td className={`px-2 py-1.5 ${kalin ? "m1 font-semibold" : "m2"}`}>{ad}</td>
      <td className={`sayi px-2 py-1.5 text-right ${kalin ? "m1 font-semibold" : "m1"}`}>
        {eksi && t ? "−" : ""}
        {tlYaz(t)} TL
      </td>
    </tr>
  );

  return (
    <Modal onKapat={onKapat} baslik={`${hedef.ad} ${hedef.soyad}: kıdem ve ihbar tazminatı`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiket" htmlFor="tz-giris">
              İşe giriş
            </label>
            <input id="tz-giris" className="girdi sayi" type="date" value={f.iseGiris} onChange={(e) => setF({ ...f, iseGiris: e.target.value })} />
          </div>
          <div>
            <label className="etiket" htmlFor="tz-cikis">
              Çıkış tarihi
            </label>
            <input id="tz-cikis" className="girdi sayi" type="date" value={f.cikis} onChange={(e) => setF({ ...f, cikis: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="tz-neden">
            Çıkış nedeni
          </label>
          <select id="tz-neden" className="girdi" value={f.neden} onChange={(e) => nedenSec(e.target.value)}>
            {CIKIS_NEDENLERI.map((n) => (
              <option key={n.kod} value={n.kod}>
                {n.ad}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="m2 flex items-center gap-2">
              <input type="checkbox" checked={f.kidemVar} onChange={(e) => setF({ ...f, kidemVar: e.target.checked })} />
              Kıdem tazminatı ödenecek
            </label>
            <label className="m2 flex items-center gap-2">
              <input type="checkbox" checked={f.ihbarVar} onChange={(e) => setF({ ...f, ihbarVar: e.target.checked })} />
              İhbar tazminatı ödenecek (bildirim süresi verilmedi)
            </label>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {alan("Aylık brüt ücret (TL)", "brut", hazir ? "Özlük'ten alındı; değiştirebilirsiniz" : "Yükleniyor...")}
          {alan("Düzenli aylık ek ödemeler (TL)", "ek", "Yol, yemek, düzenli prim: giydirilmiş ücrete eklenir")}
          {alan("Kullanılmayan yıllık izin (gün)", "izinGun", "İzin bakiyesinden alındı")}
          {alan("Bu yılki gelir vergisi matrahı (TL)", "matrah", "Kümülatif; ihbar ve izin ücretinin vergi dilimi için")}
          {alan("Kıdem tazminatı tavanı (TL)", "tavan", "Bordro ayarlarından; dönem başında güncellenir")}
        </div>
        {!gecerli && <p className="text-sm" style={{ color: "var(--hata)" }}>İşe giriş ve çıkış tarihlerini kontrol edin.</p>}
        {s && (
          <>
            <p className="m2 text-sm">
              Hizmet: <strong className="m1">{s.hizmet.yil} yıl {s.hizmet.ay} ay {s.hizmet.gun} gün</strong> · Giydirilmiş aylık {tlYaz(s.giydirilmis)} TL · günlük{" "}
              {tlYaz(s.gunluk)} TL
            </p>
            <table className="w-full text-sm">
              <tbody>
                {s.kidem.hak ? (
                  <>
                    {kalem(`Kıdem tazminatı (esas ${tlYaz(s.kidem.esas)} TL${s.kidem.tavanli ? ", tavanla sınırlı" : ""})`, s.kidem.brut)}
                    {kalem("Damga vergisi", s.kidem.damga, true)}
                    {kalem("Kıdem net", s.kidem.net, false, true)}
                  </>
                ) : (
                  <tr>
                    <td className="m3 px-2 py-1.5" colSpan={2}>
                      Kıdem tazminatı yok: {s.kidem.neden}
                    </td>
                  </tr>
                )}
                {s.ihbar.hak ? (
                  <>
                    {kalem(`İhbar tazminatı (${s.ihbar.gun} gün)`, s.ihbar.brut)}
                    {kalem("Gelir ve damga vergisi", s.ihbar.gelirVergisi + s.ihbar.damga, true)}
                    {kalem("İhbar net", s.ihbar.net, false, true)}
                  </>
                ) : (
                  <tr>
                    <td className="m3 px-2 py-1.5" colSpan={2}>
                      İhbar tazminatı yok
                    </td>
                  </tr>
                )}
                {s.izin.gun > 0 && (
                  <>
                    {kalem(`Kullanılmayan izin ücreti (${yaz(s.izin.gun)} gün)`, s.izin.brut)}
                    {kalem("SGK, gelir ve damga vergisi", s.izin.sgk + s.izin.gelirVergisi + s.izin.damga, true)}
                    {kalem("İzin ücreti net", s.izin.net, false, true)}
                  </>
                )}
                {kalem("Toplam brüt", s.toplamBrut, false, true)}
                {kalem("Toplam net (ödenecek)", s.toplamNet, false, true)}
              </tbody>
            </table>
          </>
        )}
        <p className="m3 text-xs">
          Tahminidir; resmî hesap yerine geçmez. Kıdem için en az 1 yıl hizmet gerekir; kıdemde yalnızca damga vergisi kesilir. İhbar süreleri: 6 aydan
          az 2, 1,5 yıla kadar 4, 3 yıla kadar 6, daha fazlası 8 hafta. Ödeme öncesi mali müşavirinizle kontrol edin.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ikincil" onClick={yazdir} disabled={!s}>
            <Ikon ad="rapor" boyut={16} />
            Yazdır
          </button>
          <button type="button" className="btn btn-ana" onClick={onKapat}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}
