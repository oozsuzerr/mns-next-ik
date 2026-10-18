"use client";

// Mobil: personelin kendi aylık maaş özeti (firma "personel maaş özetini görsün" kuralını açtıysa).
// Tam ay (30 gün) varsayılır; yalnızca onaylı mesai, avans ve masraf girer. Resmî bordro değildir.
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { bordroAyarlariniTamamla, tahminiBordro, tlYaz, UCRET_TURLERI, type MesaiKalemi, type UcretTuru } from "../../lib/bordro";
import { ayAdi, yerelTarih } from "../../lib/tarih";

interface Veri {
  acik: boolean;
  ucret?: number | null;
  ucret_turu?: string | null;
  ayarlar?: { yasal: Record<string, unknown>; mesai_kalemleri: MesaiKalemi[] } | null;
  calismayan_gunler?: number[] | null;
  tatiller?: string[];
  mesailer?: { tarih: string; sure_dk: number }[];
  avans?: number;
  masraf?: number;
  ekler?: { tur: string; tutar: number; vergili: boolean }[];
}

const oncekiAy = (ay: string) => {
  const [y, m] = ay.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export default function MobilMaasOzeti({ token }: { token: string }) {
  const buAy = yerelTarih().slice(0, 7);
  const [ay, setAy] = useState(buAy);
  const [veri, setVeri] = useState<{ ay: string; v: Veri | null } | null>(null);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    if (!acik) return;
    Promise.resolve(supabase.rpc("mobil_maas_ozeti", { p_token: token, p_ay: ay })).then(({ data, error }) => setVeri({ ay, v: error ? null : (data as Veri) }));
  }, [acik, ay, token]);

  const v = veri?.ay === ay ? veri.v : undefined;
  let icerik: React.ReactNode = <p className="m3 text-sm">Yükleniyor...</p>;
  if (v === null) icerik = <p className="m3 text-sm">Özet alınamadı.</p>;
  else if (v && !v.acik) icerik = <p className="m3 text-sm">Maaş özeti şu anda kapalı.</p>;
  else if (v && v.acik && !(Number(v.ucret) > 0)) icerik = <p className="m3 text-sm">Ücret bilginiz henüz girilmemiş. İnsan kaynaklarına başvurun.</p>;
  else if (v && v.acik) {
    const ayar = bordroAyarlariniTamamla(v.ayarlar ? { yasal: v.ayarlar.yasal, mesai_kalemleri: v.ayarlar.mesai_kalemleri } : null);
    const tatil = new Set(v.tatiller ?? []);
    const calismayan = v.calismayan_gunler?.length ? v.calismayan_gunler : [7];
    const saat = { fazla_mesai: 0, fazla_calisma: 0, hafta_tatili: 0, resmi_tatil: 0, plan_disi: 0 };
    for (const m of v.mesailer ?? []) {
      const iso = new Date(`${m.tarih}T12:00:00Z`).getUTCDay() || 7;
      const k = tatil.has(m.tarih) ? "resmi_tatil" : calismayan.includes(iso) ? "hafta_tatili" : "fazla_mesai";
      saat[k] += m.sure_dk / 60;
    }
    const ekler = v.ekler ?? [];
    const tur = (UCRET_TURLERI as string[]).includes(v.ucret_turu ?? "") ? (v.ucret_turu as UcretTuru) : "Aylık brüt";
    const b = tahminiBordro(
      {
        ucret: Number(v.ucret),
        ucretTuru: tur,
        primGun: 30,
        calismaSaati: 0,
        eksikSaat: 0,
        tatilGun: 0,
        mesaiSaatleri: saat,
        ekVergili: ekler.filter((e) => e.vergili).reduce((t, e) => t + Number(e.tutar), 0),
        ekVergisiz: ekler.filter((e) => !e.vergili).reduce((t, e) => t + Number(e.tutar), 0),
        avans: Number(v.avans ?? 0),
        masraf: Number(v.masraf ?? 0),
        ay: Number(ay.slice(5, 7)),
      },
      ayar
    );
    const satir = (ad: string, t: number, eksi = false, kalin = false) => (
      <div className={`flex justify-between py-1 text-sm ${kalin ? "m1 font-semibold" : "m2"}`} style={{ borderTop: "1px solid var(--cizgi)" }}>
        <span>{ad}</span>
        <span className="sayi">
          {eksi && t ? "−" : ""}
          {tlYaz(t)} TL
        </span>
      </div>
    );
    const mesaiSaat = saat.fazla_mesai + saat.hafta_tatili + saat.resmi_tatil;
    icerik = (
      <div>
        {satir(`Ücret (${tur})`, b.ucretBrut)}
        {b.mesai.toplam > 0 && satir(`Onaylı mesai (${String(Math.round(mesaiSaat * 100) / 100).replace(".", ",")} saat)`, b.mesai.toplam)}
        {b.ekVergili > 0 && satir("Ek kazanç (prim vb.)", b.ekVergili)}
        {satir("Toplam brüt", b.brut, false, true)}
        {satir("SGK ve işsizlik", b.sgkIsci + b.issizlikIsci, true)}
        {satir("Gelir ve damga vergisi", b.gelirVergisi + b.damgaVergisi, true)}
        {satir("Net", b.net, false, true)}
        {b.ekVergisiz > 0 && satir("Vergisiz ek ödeme", b.ekVergisiz)}
        {b.avans > 0 && satir("Avans", b.avans, true)}
        {b.masraf > 0 && satir("Masraf ödemesi", b.masraf)}
        {satir("Tahmini ödenecek", b.odenecek, false, true)}
        <p className="m3 mt-2 text-xs">Tahminidir; tam ay çalışma varsayılır. Devamsızlık, eksik gün ve resmî bordro farkları maaşınıza yansıyabilir.</p>
      </div>
    );
  }

  return (
    <section>
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setAcik(!acik)} aria-expanded={acik}>
        <h2 className="baslik-font m1 text-lg">Maaş özetim</h2>
        <span className="m3 text-sm">{acik ? "Gizle" : "Göster"}</span>
      </button>
      {acik && (
        <div className="panel mt-3 space-y-2 p-4">
          <div className="flex items-center justify-between">
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setAy(oncekiAy(ay))} aria-label="Önceki ay">
              ‹
            </button>
            <span className="m1 text-sm font-semibold">{ayAdi(ay)}</span>
            <button type="button" className="btn btn-hayalet btn-kucuk" disabled={ay >= buAy} onClick={() => setAy(ay === oncekiAy(buAy) ? buAy : buAy)} aria-label="Bu ay">
              ›
            </button>
          </div>
          {icerik}
        </div>
      )}
    </section>
  );
}
