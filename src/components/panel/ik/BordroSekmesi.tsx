"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type MesaiTalebi, type YoneticiBilgisi } from "../../../lib/tipler";
import type { PuantajSatiri } from "../../../lib/puantaj";
import { ayAdi, yerelTarih } from "../../../lib/tarih";
import { disariAktar } from "../../../lib/disaAktar";
import { modulAcik } from "../../../lib/moduller";
import {
  MESAI_KAYNAKLARI,
  VARSAYILAN_MESAI_KALEMLERI,
  VARSAYILAN_YASAL,
  tahminiBordro,
  tlYaz,
  type MesaiKalemi,
  type MesaiKaynagi,
  type TahminiBordro,
  type YasalParametreler,
} from "../../../lib/bordro";
import { Bos, Ikon, Modal, Rozet, useBildirim } from "../../ui";
import { KurulumUyarisi } from "./ortak";
import { useBordroVerisi, type BordroVerisi } from "./bordroVerisi";

interface Satir {
  id: string;
  ad: string;
  sicil: string;
  sube: string;
  primGun: number;
  /** Prim günü 30'dan azsa nedeni (devamsız, rapor, işe giriş...) */
  eksikNedeni: string;
  ucretVar: boolean;
  b: TahminiBordro | null;
}

const saat = (dk: number) => Math.round((dk / 60) * 100) / 100;

export default function BordroSekmesi({
  puantaj,
  mesaiTalepleri,
  seciliAy,
  onAyDegis,
  yonetici,
}: {
  puantaj: PuantajSatiri[];
  mesaiTalepleri: MesaiTalebi[];
  seciliAy: string;
  onAyDegis: (ay: string) => void;
  yonetici: YoneticiBilgisi;
}) {
  const { bildir } = useBildirim();
  const veri = useBordroVerisi(true);
  const [gorunum, setGorunum] = useState<"bordro" | "ayarlar">("bordro");
  const [odemeler, setOdemeler] = useState<{ ay: string; avans: Map<string, number>; masraf: Map<string, number> } | null>(null);
  const [detay, setDetay] = useState<Satir | null>(null);
  // Puantaja göre: SGK prim günü kadar (devamsızlık, rapor, ücretsiz izin düşülür). Tam ay: herkes 30 gün.
  const [gunModu, setGunModu] = useState<"puantaj" | "tam">("puantaj");
  const ayNo = Number(seciliAy.slice(5, 7));

  // Seçili ayın onaylı/ödenmiş avans ve masrafları (modül kapalıysa ya da okunamazsa sıfır)
  useEffect(() => {
    if (!modulAcik(yonetici.moduller, "odeme")) return;
    const [y, m] = seciliAy.split("-").map(Number);
    const sonraki = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    Promise.resolve(
      supabase.from("odeme_talepleri").select("personel_id, tur, tutar").in("durum", ["ONAYLANDI", "ODENDI"]).gte("tarih", `${seciliAy}-01`).lt("tarih", sonraki)
    ).then(({ data }) => {
      const avans = new Map<string, number>();
      const masraf = new Map<string, number>();
      for (const o of (data ?? []) as { personel_id: string; tur: string; tutar: number }[]) {
        const h = o.tur === "Avans" ? avans : masraf;
        h.set(o.personel_id, (h.get(o.personel_id) ?? 0) + Number(o.tutar));
      }
      setOdemeler({ ay: seciliAy, avans, masraf });
    });
  }, [seciliAy, yonetici.moduller]);

  const satirlar: Satir[] = useMemo(() => {
    const mesaiDk = new Map<string, number>();
    for (const t of mesaiTalepleri) {
      if (t.durum === "ONAYLANDI" && t.tarih.startsWith(seciliAy)) mesaiDk.set(t.personel_id, (mesaiDk.get(t.personel_id) ?? 0) + t.sure_dk);
    }
    const ayinOdemesi = odemeler?.ay === seciliAy ? odemeler : null;
    return puantaj
      .filter((p) => p.sgkPrimGun > 0 || p.toplamCalismaDk > 0)
      .map((p) => {
        const u = veri.ucretler.get(p.id);
        const primGun = gunModu === "tam" ? 30 : p.sgkPrimGun;
        const nedenler = [
          p.sgkTabanGun < 30 ? `${30 - p.sgkTabanGun} gün kadro dışı` : "",
          p.devamsizGunler ? `${p.devamsizGunler} devamsız` : "",
          p.raporluGunler ? `${p.raporluGunler} raporlu` : "",
          p.ucretsizIzinGunler ? `${p.ucretsizIzinGunler} ücretsiz izin` : "",
        ].filter(Boolean);
        const b = u
          ? tahminiBordro(
              {
                ucret: u.ucret,
                ucretTuru: u.tur,
                primGun,
                calismaSaati: saat(p.toplamCalismaDk),
                mesaiSaatleri: {
                  fazla_mesai: saat(mesaiDk.get(p.id) ?? 0),
                  hafta_tatili: saat(p.haftaTatiliMesaiDk),
                  resmi_tatil: saat(p.resmiTatilMesaiDk),
                  plan_disi: saat(p.planDisiMesaiDk),
                },
                avans: ayinOdemesi?.avans.get(p.id) ?? 0,
                masraf: ayinOdemesi?.masraf.get(p.id) ?? 0,
                ay: ayNo,
              },
              veri.ayarlar
            )
          : null;
        return { id: p.id, ad: p.adSoyad, sicil: p.sicil_no, sube: p.subeAdi, primGun, eksikNedeni: gunModu === "tam" ? "" : nedenler.join(", "), ucretVar: !!u, b };
      });
  }, [puantaj, mesaiTalepleri, seciliAy, odemeler, veri.ucretler, veri.ayarlar, ayNo, gunModu]);

  if (veri.kurulmamis) return <KurulumUyarisi dosya="supabase/2026-10-18_bordro.sql" />;

  const hesaplanan = satirlar.filter((s) => s.b);
  const topla = (f: (b: TahminiBordro) => number) => hesaplanan.reduce((t, s) => t + f(s.b!), 0);
  const ucretsiz = satirlar.filter((s) => !s.ucretVar);
  const eskiYil = veri.ayarlar.yasal.yil < Number(seciliAy.slice(0, 4));

  function excelIndir() {
    const veriler = hesaplanan.map((s, i) => ({
      Sıra: i + 1,
      Dönem: seciliAy,
      "Sicil No": s.sicil,
      "Ad Soyad": s.ad,
      Şube: s.sube,
      "Prim Günü": s.primGun,
      "Ücret Brüt": s.b!.ucretBrut,
      "Mesai Brüt": s.b!.mesai.toplam,
      "Toplam Brüt": s.b!.brut,
      "SGK İşçi": s.b!.sgkIsci,
      "İşsizlik İşçi": s.b!.issizlikIsci,
      "Gelir Vergisi": s.b!.gelirVergisi,
      "Damga Vergisi": s.b!.damgaVergisi,
      Net: s.b!.net,
      Avans: s.b!.avans,
      Masraf: s.b!.masraf,
      Ödenecek: s.b!.odenecek,
      "SGK İşveren": s.b!.sgkIsveren,
      "İşsizlik İşveren": s.b!.issizlikIsveren,
      "İşveren Maliyeti": s.b!.isverenMaliyeti,
    }));
    const h = disariAktar("xlsx", `Tahmini bordro ${seciliAy}`, `Tahmini_Bordro_${seciliAy}_${yerelTarih()}`, veriler);
    if (h) bildir(h, "hata");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: 360, maxWidth: "100%" }} role="tablist" aria-label="Bordro görünümü">
          <button type="button" role="tab" aria-selected={gorunum === "bordro"} data-aktif={gorunum === "bordro"} onClick={() => setGorunum("bordro")}>
            Tahmini bordro
          </button>
          <button type="button" role="tab" aria-selected={gorunum === "ayarlar"} data-aktif={gorunum === "ayarlar"} onClick={() => setGorunum("ayarlar")}>
            Oranlar ve mesai çarpanları
          </button>
        </div>
        {gorunum === "bordro" && (
          <>
            <input
              type="month"
              className="girdi sayi"
              style={{ width: 170 }}
              value={seciliAy}
              onChange={(e) => e.target.value && onAyDegis(e.target.value)}
              aria-label="Dönem"
            />
            <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: 280, maxWidth: "100%" }} role="tablist" aria-label="Gün hesabı">
              <button type="button" role="tab" aria-selected={gunModu === "puantaj"} data-aktif={gunModu === "puantaj"} onClick={() => setGunModu("puantaj")} title="SGK prim günü: devamsızlık, rapor ve ücretsiz izin düşülür">
                Puantaja göre
              </button>
              <button type="button" role="tab" aria-selected={gunModu === "tam"} data-aktif={gunModu === "tam"} onClick={() => setGunModu("tam")} title="Herkes 30 gün çalışmış sayılır">
                Tam ay (30 gün)
              </button>
            </div>
            <button type="button" className="btn btn-ikincil ml-auto" onClick={excelIndir} disabled={!hesaplanan.length}>
              <Ikon ad="indir" boyut={16} />
              Excel
            </button>
          </>
        )}
      </div>

      {(eskiYil || !veri.kayitli) && (
        <div className="panel flex items-start gap-3 px-5 py-4" style={{ borderColor: "var(--uyari)" }}>
          <Ikon ad="uyari" boyut={18} className="mt-0.5 flex-none" />
          <p className="m1 text-sm">
            Hesapta kullanılan yasal değerler <strong>{veri.ayarlar.yasal.yil}</strong> yılına ait
            {veri.kayitli ? "" : " (uygulamanın varsayılanları)"}. Asgari ücret, vergi dilimleri ve SGK oranlarını{" "}
            <button type="button" className="underline" onClick={() => setGorunum("ayarlar")}>
              Oranlar
            </button>{" "}
            bölümünden {eskiYil ? "bu yılın resmî rakamlarıyla güncelleyin" : "kontrol edip firmanız için kaydedin (teşvikli işveren oranı gibi)"}.
          </p>
        </div>
      )}

      {gorunum === "ayarlar" ? (
        veri.hazir ? (
          <AyarFormu key={veri.kayitli ? "kayitli" : "varsayilan"} veri={veri} firmaId={yonetici.firma?.id ?? null} />
        ) : (
          <p className="m3 text-sm">Yükleniyor...</p>
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ["Toplam brüt", topla((b) => b.brut)],
                ["Mesai brüt", topla((b) => b.mesai.toplam)],
                ["Toplam net", topla((b) => b.net)],
                ["İşveren maliyeti", topla((b) => b.isverenMaliyeti)],
              ] as const
            ).map(([ad, t]) => (
              <div key={ad} className="panel px-5 py-4">
                <p className="m3 text-xs">
                  {ayAdi(seciliAy)} · {ad}
                </p>
                <p className="baslik-font sayi m1 text-xl">{tlYaz(t)} TL</p>
              </div>
            ))}
          </div>

          {ucretsiz.length > 0 && (
            <p className="m2 text-sm">
              Ücreti girilmemiş {ucretsiz.length} personel hesaba katılmadı ({ucretsiz.map((s) => s.ad).join(", ")}). Ücreti Personel → Özlük&apos;ten girin.
            </p>
          )}

          <div className="panel overflow-x-auto">
            {!veri.hazir ? (
              <p className="m3 p-5 text-sm">Yükleniyor...</p>
            ) : satirlar.length === 0 ? (
              <Bos ikon="puantaj" baslik="Bu ay için puantaj yok" metin="Tahmini bordro, seçili ayın puantajı ve Özlük'teki ücretlerden hesaplanır." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="m2 text-left text-xs">
                    {["Personel", "Gün", "Ücret brüt", "Mesai brüt", "Toplam brüt", "SGK + işsizlik", "Gelir v.", "Damga v.", "Net", "Avans", "Ödenecek", "İşveren maliyeti"].map((b, i) => (
                      <th key={b} className={`whitespace-nowrap px-3 py-3 font-semibold ${i > 0 ? "text-right" : ""}`}>
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((s) => (
                    <tr key={s.id} className="cursor-pointer" style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }} onClick={() => s.b && setDetay(s)}>
                      <td className="m1 whitespace-nowrap px-3 py-2">
                        {s.ad}
                        <span className="m3 block text-xs">{s.sube}</span>
                      </td>
                      <td className="sayi px-3 py-2 text-right" title={s.eksikNedeni || undefined}>
                        {s.primGun}
                        {s.eksikNedeni && <span className="block whitespace-nowrap text-xs" style={{ color: "var(--uyari)" }}>{s.eksikNedeni}</span>}
                      </td>
                      {s.b ? (
                        <>
                          <td className="sayi px-3 py-2 text-right">{tlYaz(s.b.ucretBrut)}</td>
                          <td className="sayi px-3 py-2 text-right">{s.b.mesai.toplam ? tlYaz(s.b.mesai.toplam) : "-"}</td>
                          <td className="sayi m1 px-3 py-2 text-right font-semibold">{tlYaz(s.b.brut)}</td>
                          <td className="sayi px-3 py-2 text-right">{tlYaz(s.b.sgkIsci + s.b.issizlikIsci)}</td>
                          <td className="sayi px-3 py-2 text-right">{tlYaz(s.b.gelirVergisi)}</td>
                          <td className="sayi px-3 py-2 text-right">{tlYaz(s.b.damgaVergisi)}</td>
                          <td className="sayi m1 px-3 py-2 text-right font-semibold">{tlYaz(s.b.net)}</td>
                          <td className="sayi px-3 py-2 text-right">{s.b.avans ? tlYaz(s.b.avans) : "-"}</td>
                          <td className="sayi m1 px-3 py-2 text-right">{tlYaz(s.b.odenecek)}</td>
                          <td className="sayi px-3 py-2 text-right">{tlYaz(s.b.isverenMaliyeti)}</td>
                        </>
                      ) : (
                        <td colSpan={10} className="m3 px-3 py-2 text-xs">
                          Ücret girilmemiş
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="m3 text-xs">
            Tahminidir, resmî bordro yerine geçmez. Gelir vergisi, yılın önceki aylarında da aynı ücretin ödendiği varsayımıyla kümülatif hesaplanır;
            teşvik, BES, icra, yemek/yol yardımı gibi kalemler yoktur. Mesai saatleri onaylı fazla mesai talepleri ve puantajdan gelir; saatlik ücret aylık
            brüt / {veri.ayarlar.yasal.saatBoleni}.
          </p>
        </>
      )}

      {detay?.b && <BordroDetay satir={detay} b={detay.b} ay={seciliAy} onKapat={() => setDetay(null)} />}
    </div>
  );
}

function BordroDetay({ satir, b, ay, onKapat }: { satir: Satir; b: TahminiBordro; ay: string; onKapat: () => void }) {
  const kalem = (ad: string, tutar: number, vurgu = false, eksi = false) => (
    <tr style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }}>
      <td className={`px-2 py-1.5 ${vurgu ? "m1 font-semibold" : "m2"}`}>{ad}</td>
      <td className={`sayi px-2 py-1.5 text-right ${vurgu ? "m1 font-semibold" : "m1"}`}>
        {eksi && tutar ? "−" : ""}
        {tlYaz(tutar)}
      </td>
    </tr>
  );
  return (
    <Modal onKapat={onKapat} baslik={`${satir.ad} · ${ayAdi(ay)}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Rozet>{satir.primGun} prim günü</Rozet>
          <Rozet>Saatlik brüt {tlYaz(b.saatlik)} TL</Rozet>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {kalem("Ücret (brüt)", b.ucretBrut)}
            {b.mesai.satirlar.map((m) => (
              <tr key={m.ad + m.kaynak} style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }}>
                <td className="m2 px-2 py-1.5">
                  {m.ad}
                  <span className="m3 block text-xs">
                    {String(m.saat).replace(".", ",")} saat × {tlYaz(b.saatlik)} × {String(m.carpan).replace(".", ",")}
                  </span>
                </td>
                <td className="sayi m1 px-2 py-1.5 text-right">{tlYaz(m.tutar)}</td>
              </tr>
            ))}
            {kalem("Toplam brüt", b.brut, true)}
            {kalem(`SGK işçi payı (matrah ${tlYaz(b.sgkMatrahi)})`, b.sgkIsci, false, true)}
            {kalem("İşsizlik işçi payı", b.issizlikIsci, false, true)}
            {kalem("Gelir vergisi (asgari ücret istisnası düşülmüş)", b.gelirVergisi, false, true)}
            {kalem("Damga vergisi (istisna düşülmüş)", b.damgaVergisi, false, true)}
            {kalem("Net ücret", b.net, true)}
            {b.avans > 0 && kalem("Avans kesintisi", b.avans, false, true)}
            {b.masraf > 0 && kalem("Masraf ödemesi", b.masraf)}
            {kalem("Ödenecek", b.odenecek, true)}
            {kalem("SGK işveren payı", b.sgkIsveren)}
            {kalem("İşsizlik işveren payı", b.issizlikIsveren)}
            {kalem("İşveren maliyeti", b.isverenMaliyeti, true)}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function AyarFormu({ veri, firmaId }: { veri: BordroVerisi; firmaId: string | null }) {
  const { bildir, onayla } = useBildirim();
  const [y, setY] = useState<YasalParametreler>(veri.ayarlar.yasal);
  const [kalemler, setKalemler] = useState<MesaiKalemi[]>(veri.ayarlar.mesaiKalemleri);
  const [yukleniyor, setYukleniyor] = useState(false);

  const sayi = (deger: string) => Number(deger.replace(/\./g, "").replace(",", "."));
  const alan = (etiket: string, anahtar: keyof YasalParametreler, ipucu?: string) => (
    <div>
      <label className="etiket" htmlFor={`y-${anahtar}`}>
        {etiket}
      </label>
      <input
        id={`y-${anahtar}`}
        className="girdi sayi"
        inputMode="decimal"
        value={String(y[anahtar] as number).replace(".", ",")}
        onChange={(e) => setY({ ...y, [anahtar]: sayi(e.target.value) || 0 })}
      />
      {ipucu && <p className="ipucu">{ipucu}</p>}
    </div>
  );

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!firmaId) return bildir("Firma bilgisi okunamadı; sayfayı yenileyin.", "hata");
    if (y.asgariBrut <= 0 || y.saatBoleni <= 0) return bildir("Asgari ücret ve saat böleni sıfırdan büyük olmalı.", "hata");
    const dilimler = [...y.vergiDilimleri];
    if (dilimler.some((d, i) => d.oran < 0 || d.oran > 100 || (i < dilimler.length - 1 && (!d.ust || d.ust <= (dilimler[i - 1]?.ust ?? 0))))) {
      return bildir("Vergi dilimleri küçükten büyüğe sıralı olmalı; son dilim dışında hepsinin üst sınırı olmalı.", "hata");
    }
    const temiz = kalemler.filter((k) => k.ad.trim());
    if (temiz.some((k) => !(k.carpan > 0 && k.carpan <= 10))) return bildir("Mesai çarpanı 0 ile 10 arasında olmalı.", "hata");
    setYukleniyor(true);
    const { error } = await supabase.from("bordro_ayarlari").upsert(
      {
        firma_id: firmaId,
        yasal: { ...y, vergiDilimleri: dilimler.map((d, i) => ({ ust: i === dilimler.length - 1 ? null : d.ust, oran: d.oran })) },
        mesai_kalemleri: temiz.map((k) => ({ ...k, ad: k.ad.trim() })),
        guncelleme: new Date().toISOString(),
      },
      { onConflict: "firma_id" }
    );
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Bordro ayarları kaydedildi.", "basari");
    await veri.yenile();
  }

  async function varsayilan() {
    const tamam = await onayla({
      baslik: "Varsayılanlara dönülsün mü?",
      metin: `Yasal değerler uygulamanın ${VARSAYILAN_YASAL.yil} varsayılanlarına, mesai çarpanları yasal asgari çarpanlara döner. Kaydedince geçerli olur.`,
      onayEtiketi: "Varsayılana dön",
    });
    if (!tamam) return;
    setY(VARSAYILAN_YASAL);
    setKalemler(VARSAYILAN_MESAI_KALEMLERI);
  }

  async function resmiYukle() {
    const tamam = await onayla({
      baslik: `${VARSAYILAN_YASAL.yil} resmî değerleri yüklensin mi?`,
      metin: `Asgari ücret ${tlYaz(VARSAYILAN_YASAL.asgariBrut)} TL, SGK tavanı ${String(VARSAYILAN_YASAL.sgkTavanKatsayi).replace(".", ",")} kat, işveren SGK payı teşviksiz %${String(VARSAYILAN_YASAL.sgkIsveren).replace(".", ",")} ve ${VARSAYILAN_YASAL.yil} vergi dilimleri yazılır. Mesai çarpanlarınız değişmez. Kaydedince geçerli olur.`,
      onayEtiketi: "Yükle",
    });
    if (tamam) setY(VARSAYILAN_YASAL);
  }

  const kaynakSayisi = (k: MesaiKaynagi) => kalemler.filter((x) => x.aktif && x.kaynak === k).length;

  return (
    <form onSubmit={kaydet} className="space-y-6">
      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="baslik-font m1 text-lg">Mesai çarpanları</h3>
          <button
            type="button"
            className="btn btn-ikincil btn-kucuk"
            onClick={() => setKalemler([...kalemler, { id: crypto.randomUUID(), ad: "", kaynak: "fazla_mesai", carpan: 1.5, aktif: true }])}
          >
            <Ikon ad="arti" boyut={15} />
            Kalem ekle
          </button>
        </div>
        <p className="m2 text-sm">
          Her kalem, seçilen kaynaktaki saatleri saatlik brüt ücretle ve çarpanla çarpar. Yasal asgari: fazla mesai 1,5; hafta tatili çalışması 1,5;
          resmî tatil çalışması için aylık ücrete ek 1 günlük ücret (saat başı 1,0). Firma daha yüksek çarpan verebilir. Aynı kaynağa birden çok aktif
          kalem varsa tutarlar toplanır (ör. fazla mesai 1,5 + gece zammı 0,25).
        </p>
        <ul className="space-y-2">
          {kalemler.map((k, i) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--cizgi, #e5e7eb)", opacity: k.aktif ? 1 : 0.6 }}>
              <label className="m2 flex items-center gap-1 text-xs">
                <input type="checkbox" checked={k.aktif} onChange={(e) => setKalemler(kalemler.map((x, j) => (j === i ? { ...x, aktif: e.target.checked } : x)))} />
                Aktif
              </label>
              <input
                className="girdi min-w-[180px] flex-1"
                maxLength={80}
                placeholder="Kalem adı"
                value={k.ad}
                onChange={(e) => setKalemler(kalemler.map((x, j) => (j === i ? { ...x, ad: e.target.value } : x)))}
                aria-label="Kalem adı"
              />
              <select
                className="girdi"
                style={{ width: 210 }}
                value={k.kaynak}
                onChange={(e) => setKalemler(kalemler.map((x, j) => (j === i ? { ...x, kaynak: e.target.value as MesaiKaynagi } : x)))}
                aria-label="Saat kaynağı"
              >
                {(Object.keys(MESAI_KAYNAKLARI) as MesaiKaynagi[]).map((m) => (
                  <option key={m} value={m}>
                    {MESAI_KAYNAKLARI[m].ad}
                  </option>
                ))}
              </select>
              <label className="m2 flex items-center gap-1 text-xs">
                ×
                <input
                  className="girdi sayi"
                  style={{ width: 80 }}
                  inputMode="decimal"
                  value={String(k.carpan).replace(".", ",")}
                  onChange={(e) => setKalemler(kalemler.map((x, j) => (j === i ? { ...x, carpan: sayi(e.target.value) || 0 } : x)))}
                  aria-label="Çarpan"
                />
              </label>
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setKalemler(kalemler.filter((_, j) => j !== i))} aria-label="Kalemi sil">
                <Ikon ad="cop" boyut={15} />
              </button>
              {k.aktif && kaynakSayisi(k.kaynak) > 1 && <span className="w-full text-xs" style={{ color: "var(--uyari)" }}>Bu kaynakta birden çok aktif kalem var; tutarlar toplanır.</span>}
            </li>
          ))}
          {kalemler.length === 0 && <li className="m3 text-sm">Mesai kalemi yok; mesailer ücrete eklenmez.</li>}
        </ul>
        {kaynakSayisi("fazla_mesai") > 0 && kaynakSayisi("plan_disi") > 0 && (
          <p className="text-xs" style={{ color: "var(--uyari)" }}>
            Onaylı fazla mesai ile plan dışı çalışma aynı saatleri içerebilir; ikisini birden açarsanız mesai iki kez ödenmiş görünebilir.
          </p>
        )}
      </section>

      <section className="panel space-y-4 p-5">
        <h3 className="baslik-font m1 text-lg">Yasal oranlar</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {alan("Değerlerin yılı", "yil")}
          {alan("Brüt asgari ücret (aylık)", "asgariBrut")}
          {alan("SGK tavan katsayısı", "sgkTavanKatsayi", "Tavan = asgari ücret × katsayı")}
          {alan("SGK işçi payı (%)", "sgkIsci")}
          {alan("İşsizlik işçi payı (%)", "issizlikIsci")}
          {alan("SGK işveren payı (%)", "sgkIsveren", "Teşvikten yararlanıyorsanız indirimli oranı girin")}
          {alan("İşsizlik işveren payı (%)", "issizlikIsveren")}
          {alan("Damga vergisi (binde)", "damgaBinde")}
          {alan("Saatlik ücret böleni", "saatBoleni", "Aylık ücret / bu sayı = saatlik ücret (30 × 7,5 = 225)")}
        </div>
        <div>
          <p className="etiket">Gelir vergisi dilimleri (yıllık kümülatif matrah)</p>
          <ul className="space-y-2">
            {y.vergiDilimleri.map((d, i) => {
              const son = i === y.vergiDilimleri.length - 1;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="m2 w-40">
                    {i === 0 ? "0" : tlYaz(y.vergiDilimleri[i - 1].ust ?? 0)} TL&apos;den
                  </span>
                  {son ? (
                    <span className="m2 w-40">fazlası</span>
                  ) : (
                    <input
                      className="girdi sayi"
                      style={{ width: 160 }}
                      inputMode="decimal"
                      value={String(d.ust ?? "").replace(".", ",")}
                      onChange={(e) => setY({ ...y, vergiDilimleri: y.vergiDilimleri.map((x, j) => (j === i ? { ...x, ust: sayi(e.target.value) || 0 } : x)) })}
                      aria-label={`${i + 1}. dilim üst sınırı`}
                    />
                  )}
                  <span className="m2">%</span>
                  <input
                    className="girdi sayi"
                    style={{ width: 70 }}
                    inputMode="decimal"
                    value={String(d.oran).replace(".", ",")}
                    onChange={(e) => setY({ ...y, vergiDilimleri: y.vergiDilimleri.map((x, j) => (j === i ? { ...x, oran: sayi(e.target.value) || 0 } : x)) })}
                    aria-label={`${i + 1}. dilim oranı`}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {y.yil < VARSAYILAN_YASAL.yil && (
          <button type="button" className="btn btn-ikincil" onClick={resmiYukle}>
            {VARSAYILAN_YASAL.yil} resmî değerlerini yükle
          </button>
        )}
        <button type="button" className="btn btn-hayalet mr-auto" onClick={varsayilan}>
          Varsayılanlara dön
        </button>
        <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
          {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </form>
  );
}
