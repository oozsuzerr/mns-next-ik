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
  VARSAYILAN_KURALLAR,
  VARSAYILAN_MESAI_KALEMLERI,
  VARSAYILAN_YASAL,
  tahminiBordro,
  tlYaz,
  type HesapKurallari,
  type MesaiKalemi,
  type MesaiKaynagi,
  type TahminiBordro,
  type YasalParametreler,
} from "../../../lib/bordro";
import { gunOzeti, ondalik, saatYaz, type GunOzeti } from "../../../lib/puantajCetveli";
import { bordroDokumuYazdir, hesapKalemleri, kisiDokumuSatirlari, type DokumKisi } from "../../../lib/bordroDokumu";
import type { ManuelBaslangic } from "../Formlar";
import { Bos, Ikon, Modal, Rozet, useBildirim } from "../../ui";
import { KurulumUyarisi } from "./ortak";
import { useBordroVerisi, type BordroVerisi } from "./bordroVerisi";

interface EkKazanc {
  id: string;
  personel_id: string;
  tur: string;
  tutar: number;
  vergili: boolean;
  aciklama: string | null;
}

interface Satir {
  id: string;
  ad: string;
  sicil: string;
  sube: string;
  subeId: string | null;
  primGun: number;
  /** Prim günü 30'dan azsa nedeni (devamsız, rapor, işe giriş...) */
  eksikNedeni: string;
  ucretVar: boolean;
  ucretTuru: string;
  p: PuantajSatiri;
  oz: GunOzeti;
  ek: EkKazanc[];
  b: TahminiBordro | null;
}

const saat = (dk: number) => Math.round((dk / 60) * 100) / 100;
const EK_TURLERI = ["Prim", "İkramiye", "Yol yardımı", "Yemek yardımı", "Satış primi", "Diğer"];

/** Tablo sütunları: grup, varsayılan görünürlük ve değer */
interface Sutun {
  id: string;
  ad: string;
  grup: "Gün" | "Saat" | "Ücret";
  acik: boolean;
  aciklama?: string;
  deger: (s: Satir) => number | null;
  tl?: boolean;
  kalin?: boolean;
}

const SUTUNLAR: Sutun[] = [
  { id: "ayGun", ad: "Ay", grup: "Gün", acik: false, aciklama: "Ayın gün sayısı", deger: (s) => s.oz.ayGun },
  { id: "sgkGun", ad: "SGK gün", grup: "Gün", acik: false, aciklama: "SGK'nın esas aldığı gün (tam ay 30)", deger: (s) => s.oz.sgkGun },
  { id: "tg", ad: "TG", grup: "Gün", acik: true, aciklama: "Ücretlendirilen gün (prim günü)", deger: (s) => s.primGun },
  { id: "ng", ad: "NG", grup: "Gün", acik: false, aciklama: "İş günlerinde çalışılan gün", deger: (s) => s.oz.normalGun },
  { id: "rtGun", ad: "RT gün", grup: "Gün", acik: false, aciklama: "Resmî tatil günleri", deger: (s) => s.oz.rtGun },
  { id: "htGun", ad: "HT gün", grup: "Gün", acik: false, aciklama: "Hafta tatili ve çalışılmayan günler", deger: (s) => s.oz.htGun },
  { id: "dev", ad: "Dvmsz", grup: "Gün", acik: false, aciklama: "Devamsız gün", deger: (s) => s.oz.devamsiz },
  { id: "ucIzin", ad: "Üc. izin", grup: "Gün", acik: false, aciklama: "Ücretli izin (yıllık dahil)", deger: (s) => s.oz.ucretliIzin },
  { id: "ucsIzin", ad: "Ücsz. izin", grup: "Gün", acik: false, aciklama: "Ücretsiz izin", deger: (s) => s.oz.ucretsizIzin },
  { id: "nm", ad: "NM", grup: "Saat", acik: false, aciklama: "Normal mesai (saat)", deger: (s) => ondalik(s.oz.normalDk) },
  { id: "ec", ad: "EÇ", grup: "Saat", acik: false, aciklama: "Eksik çalışma (saat)", deger: (s) => -ondalik(s.oz.eksikDk) },
  { id: "fm", ad: "FM", grup: "Saat", acik: false, aciklama: "Plandan fazla çalışma (saat)", deger: (s) => ondalik(s.oz.fazlaDk) },
  { id: "ht", ad: "HT", grup: "Saat", acik: false, aciklama: "Hafta tatili çalışması (saat)", deger: (s) => ondalik(s.oz.htDk) },
  { id: "rt", ad: "RT", grup: "Saat", acik: false, aciklama: "Resmî tatil çalışması (saat)", deger: (s) => ondalik(s.oz.rtDk) },
  { id: "ucretBrut", ad: "Ücret brüt", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.ucretBrut + s.b.tatilUcreti, tl: true },
  { id: "kesinti", ad: "Eksik kesinti", grup: "Ücret", acik: true, deger: (s) => s.b && -s.b.eksikKesinti, tl: true },
  { id: "mesai", ad: "Mesai brüt", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.mesai.toplam, tl: true },
  { id: "ek", ad: "Ek kazanç", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.ekVergili + s.b.ekVergisiz, tl: true },
  { id: "brut", ad: "Toplam brüt", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.brut, tl: true, kalin: true },
  { id: "sgk", ad: "SGK + işsizlik", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.sgkIsci + s.b.issizlikIsci, tl: true },
  { id: "gv", ad: "Gelir v.", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.gelirVergisi, tl: true },
  { id: "dv", ad: "Damga v.", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.damgaVergisi, tl: true },
  { id: "net", ad: "Net", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.net, tl: true, kalin: true },
  { id: "avans", ad: "Avans", grup: "Ücret", acik: true, deger: (s) => s.b && -s.b.avans, tl: true },
  { id: "odenecek", ad: "Ödenecek", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.odenecek, tl: true, kalin: true },
  { id: "maliyet", ad: "İşveren maliyeti", grup: "Ücret", acik: true, deger: (s) => s.b && s.b.isverenMaliyeti, tl: true },
];
const SUTUN_ANAHTARI = "mns_bordro_sutunlar";

function sutunlariOku(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SUTUN_ANAHTARI) ?? "null");
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  } catch {
    // tarayıcı depolaması kapalı olabilir
  }
  return SUTUNLAR.filter((s) => s.acik).map((s) => s.id);
}

export default function BordroSekmesi({
  puantaj,
  mesaiTalepleri,
  seciliAy,
  onAyDegis,
  yonetici,
  onHareketDuzelt,
}: {
  puantaj: PuantajSatiri[];
  mesaiTalepleri: MesaiTalebi[];
  seciliAy: string;
  onAyDegis: (ay: string) => void;
  yonetici: YoneticiBilgisi;
  /** Detaydaki günden manuel giriş/çıkış düzeltme formunu açar ("manuel" yetkisi) */
  onHareketDuzelt?: (b: ManuelBaslangic) => void;
}) {
  const { bildir } = useBildirim();
  const veri = useBordroVerisi(true);
  const [gorunum, setGorunum] = useState<"bordro" | "ayarlar">("bordro");
  const [odemeler, setOdemeler] = useState<{ ay: string; avans: Map<string, number>; masraf: Map<string, number> } | null>(null);
  const [ekler, setEkler] = useState<{ ay: string; liste: EkKazanc[] } | null>(null);
  const [detayId, setDetayId] = useState<string | null>(null);
  // Puantaja göre: SGK prim günü kadar (devamsızlık, rapor, ücretsiz izin düşülür). Tam ay: herkes 30 gün.
  const [gunModu, setGunModu] = useState<"puantaj" | "tam">("puantaj");
  const [ara, setAra] = useState("");
  const [sutunlar, setSutunlar] = useState<string[]>(sutunlariOku);
  const [sutunMenusu, setSutunMenusu] = useState(false);
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

  // Seçili ayın ek kazançları (tablo kurulmamışsa boş)
  const ekleriYukle = useMemo(
    () => () =>
      Promise.resolve(supabase.from("ek_kazanclar").select("id, personel_id, tur, tutar, vergili, aciklama").eq("donem", seciliAy).order("olusturma")).then(({ data }) =>
        setEkler({ ay: seciliAy, liste: ((data ?? []) as EkKazanc[]).map((e) => ({ ...e, tutar: Number(e.tutar) })) })
      ),
    [seciliAy]
  );
  useEffect(() => {
    ekleriYukle();
  }, [ekleriYukle]);

  const satirlar: Satir[] = useMemo(() => {
    const mesaiDk = new Map<string, number>();
    for (const t of mesaiTalepleri) {
      if (t.durum === "ONAYLANDI" && t.tarih.startsWith(seciliAy)) mesaiDk.set(t.personel_id, (mesaiDk.get(t.personel_id) ?? 0) + t.sure_dk);
    }
    const ayinOdemesi = odemeler?.ay === seciliAy ? odemeler : null;
    const ayinEkleri = ekler?.ay === seciliAy ? ekler.liste : [];
    const kurallar = veri.ayarlar.kurallar;
    return puantaj
      .filter((p) => p.sgkPrimGun > 0 || p.toplamCalismaDk > 0)
      .map((p) => {
        const u = veri.ucretler.get(p.id);
        const oz = gunOzeti(p, kurallar.eksikToleransDk);
        const ek = ayinEkleri.filter((e) => e.personel_id === p.id);
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
                // Tam ay görünümünde eksik saat kesintisi uygulanmaz
                eksikSaat: gunModu === "tam" ? 0 : saat(oz.kesintiliEksikDk),
                tatilGun: oz.htGun + oz.rtGun,
                mesaiSaatleri: {
                  fazla_mesai: saat(mesaiDk.get(p.id) ?? 0),
                  fazla_calisma: saat(oz.fazlaDk),
                  hafta_tatili: saat(p.haftaTatiliMesaiDk),
                  resmi_tatil: saat(p.resmiTatilMesaiDk),
                  plan_disi: saat(p.planDisiMesaiDk),
                },
                ekVergili: ek.filter((e) => e.vergili).reduce((t, e) => t + e.tutar, 0),
                ekVergisiz: ek.filter((e) => !e.vergili).reduce((t, e) => t + e.tutar, 0),
                avans: ayinOdemesi?.avans.get(p.id) ?? 0,
                masraf: ayinOdemesi?.masraf.get(p.id) ?? 0,
                ay: ayNo,
              },
              veri.ayarlar
            )
          : null;
        return {
          id: p.id,
          ad: p.adSoyad,
          sicil: p.sicil_no,
          sube: p.subeAdi,
          subeId: p.subeId,
          primGun,
          eksikNedeni: gunModu === "tam" ? "" : nedenler.join(", "),
          ucretVar: !!u,
          ucretTuru: u?.tur ?? "",
          p,
          oz,
          ek,
          b,
        };
      });
  }, [puantaj, mesaiTalepleri, seciliAy, odemeler, ekler, veri.ucretler, veri.ayarlar, ayNo, gunModu]);

  if (veri.kurulmamis) return <KurulumUyarisi dosya="supabase/2026-10-18_bordro.sql" />;

  const q = ara.trim().toLocaleLowerCase("tr");
  const gorunen = q ? satirlar.filter((s) => `${s.ad} ${s.sicil} ${s.sube}`.toLocaleLowerCase("tr").includes(q)) : satirlar;
  const hesaplanan = gorunen.filter((s) => s.b);
  const topla = (f: (b: TahminiBordro) => number) => hesaplanan.reduce((t, s) => t + f(s.b!), 0);
  const ucretsiz = gorunen.filter((s) => !s.ucretVar);
  const eskiYil = veri.ayarlar.yasal.yil < Number(seciliAy.slice(0, 4));
  const acikSutunlar = SUTUNLAR.filter((s) => sutunlar.includes(s.id));
  const detay = satirlar.find((s) => s.id === detayId) ?? null;
  const dokum = (s: Satir): DokumKisi => ({ p: s.p, oz: s.oz, b: s.b!, ucretTuru: s.ucretTuru, ekKazanclar: s.ek });

  function sutunDegis(id: string) {
    const yeni = sutunlar.includes(id) ? sutunlar.filter((x) => x !== id) : [...sutunlar, id];
    setSutunlar(yeni);
    try {
      localStorage.setItem(SUTUN_ANAHTARI, JSON.stringify(yeni));
    } catch {
      // kaydedilemezse yalnızca bu oturumda geçerli
    }
  }

  function excelIndir() {
    const veriler = hesaplanan.map((s, i) => {
      const r: Record<string, string | number> = { Sıra: i + 1, Dönem: seciliAy, "Sicil No": s.sicil, "Ad Soyad": s.ad, Şube: s.sube, "Ücret Türü": s.ucretTuru };
      for (const c of SUTUNLAR) r[c.ad] = c.deger(s) ?? "";
      return r;
    });
    const h = disariAktar("xlsx", `Tahmini bordro ${seciliAy}`, `Tahmini_Bordro_${seciliAy}_${yerelTarih()}`, veriler);
    if (h) bildir(h, "hata");
  }

  function topluYazdir() {
    const h = bordroDokumuYazdir(hesaplanan.map(dokum), seciliAy, yonetici.firma?.ad ?? "");
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
            Oranlar, kurallar ve çarpanlar
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

          <div className="flex flex-wrap items-center gap-2">
            <div className="arama-kutu min-w-[200px] flex-1 sm:max-w-xs">
              <Ikon ad="ara" boyut={16} />
              <input className="girdi girdi-sik" placeholder="Listede ara (ad, sicil, şube)" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Listede ara" />
            </div>
            <div className="relative">
              <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setSutunMenusu(!sutunMenusu)} aria-expanded={sutunMenusu}>
                <Ikon ad="goz" boyut={14} />
                Sütunlar
              </button>
              {sutunMenusu && (
                <div className="panel absolute z-20 mt-1 w-[300px] space-y-3 p-3 shadow-lg" style={{ left: 0 }}>
                  {(["Gün", "Saat", "Ücret"] as const).map((g) => (
                    <div key={g}>
                      <p className="m3 mb-1 text-xs font-semibold">{g}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {SUTUNLAR.filter((s) => s.grup === g).map((s) => (
                          <label key={s.id} className="m2 flex items-center gap-1.5 text-xs" title={s.aciklama}>
                            <input type="checkbox" checked={sutunlar.includes(s.id)} onChange={() => sutunDegis(s.id)} />
                            {s.ad}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn btn-hayalet btn-kucuk w-full" onClick={() => setSutunMenusu(false)}>
                    Kapat
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="btn btn-ikincil btn-kucuk ml-auto" onClick={topluYazdir} disabled={!hesaplanan.length}>
              <Ikon ad="rapor" boyut={14} />
              Yazdır (kişi başı döküm)
            </button>
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={excelIndir} disabled={!hesaplanan.length}>
              <Ikon ad="indir" boyut={14} />
              Excel
            </button>
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
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">Personel</th>
                    {acikSutunlar.map((c) => (
                      <th key={c.id} className="whitespace-nowrap px-3 py-3 text-right font-semibold" title={c.aciklama}>
                        {c.ad}
                      </th>
                    ))}
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map((s) => (
                    <tr key={s.id} className="cursor-pointer" style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }} onClick={() => s.b && setDetayId(s.id)}>
                      <td className="m1 whitespace-nowrap px-3 py-2">
                        {s.ad}
                        <span className="m3 block text-xs">{s.sube}</span>
                        {s.eksikNedeni && <span className="block whitespace-nowrap text-xs" style={{ color: "var(--uyari)" }}>{s.eksikNedeni}</span>}
                      </td>
                      {acikSutunlar.map((c) => {
                        if (!s.b && c.grup === "Ücret") return <td key={c.id} className="m3 px-3 py-2 text-right text-xs">{c.id === "ucretBrut" ? "Ücret yok" : ""}</td>;
                        const v = c.deger(s);
                        return (
                          <td key={c.id} className={`sayi whitespace-nowrap px-3 py-2 text-right ${c.kalin ? "m1 font-semibold" : ""}`}>
                            {v == null || v === 0 ? (c.grup === "Gün" ? "0" : "-") : c.tl ? tlYaz(v) : saatYaz(v)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right">{s.b && <Ikon ad="sag" boyut={14} className="m3" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="m3 text-xs">
            Tahminidir, resmî bordro yerine geçmez. Gelir vergisi, yılın önceki aylarında da aynı ücretin ödendiği varsayımıyla kümülatif hesaplanır;
            teşvik, BES, icra gibi kalemler yoktur. Saatler ondalıktır. Saatlik ücret aylık brüt / {veri.ayarlar.yasal.saatBoleni}. Satıra tıklayınca kişi
            dökümü, ek kazançlar ve gün gün puantaj açılır; sütunları &quot;Sütunlar&quot;dan seçebilirsiniz.
          </p>
        </>
      )}

      {detay?.b && (
        <BordroDetay
          satir={detay}
          b={detay.b}
          ay={seciliAy}
          firma={yonetici.firma?.ad ?? ""}
          onEkDegisti={ekleriYukle}
          onHareketDuzelt={
            onHareketDuzelt && detay.subeId
              ? (tarih, girisVar) => {
                  setDetayId(null);
                  onHareketDuzelt({
                    personel_id: detay.id,
                    sube_id: detay.subeId!,
                    islem_turu: girisVar ? "İşe Çıkış" : "İşe Giriş",
                    tarih,
                    saat: girisVar ? "18:00" : "08:00",
                  });
                }
              : undefined
          }
          dokum={dokum(detay)}
          onKapat={() => setDetayId(null)}
        />
      )}
    </div>
  );
}

function BordroDetay({
  satir,
  b,
  ay,
  firma,
  dokum,
  onEkDegisti,
  onHareketDuzelt,
  onKapat,
}: {
  satir: Satir;
  b: TahminiBordro;
  ay: string;
  firma: string;
  dokum: DokumKisi;
  onEkDegisti: () => Promise<void>;
  onHareketDuzelt?: (tarih: string, girisVar: boolean) => void;
  onKapat: () => void;
}) {
  const { bildir, onayla } = useBildirim();
  const [sekme, setSekme] = useState<"hesap" | "puantaj" | "ek">("hesap");
  const [ekForm, setEkForm] = useState({ tur: "Prim", tutar: "", vergili: true, aciklama: "" });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const oz = satir.oz;

  async function ekKaydet(e: FormEvent) {
    e.preventDefault();
    const tutar = Number(ekForm.tutar.replace(/\./g, "").replace(",", "."));
    if (!ekForm.tur.trim()) return bildir("Ek kazanç türünü yazın.", "hata");
    if (!(tutar > 0)) return bildir("Tutar sıfırdan büyük olmalı.", "hata");
    setKaydediliyor(true);
    const { error } = await supabase.from("ek_kazanclar").insert({
      personel_id: satir.id,
      donem: ay,
      tur: ekForm.tur.trim(),
      tutar,
      vergili: ekForm.vergili,
      aciklama: ekForm.aciklama.trim() || null,
    });
    setKaydediliyor(false);
    if (error) {
      if (/ek_kazanclar|schema cache|does not exist/i.test(error.message)) return bildir("Ek kazanç tablosu kurulmamış: supabase/2026-10-18_ek_kazanc.sql çalıştırılmalı.", "hata");
      return bildir(hataYaz(error), "hata");
    }
    setEkForm({ ...ekForm, tutar: "", aciklama: "" });
    bildir("Ek kazanç eklendi.", "basari");
    await onEkDegisti();
  }

  async function ekSil(e: EkKazanc) {
    const tamam = await onayla({ baslik: "Ek kazanç silinsin mi?", metin: `${e.tur} · ${tlYaz(e.tutar)} TL`, onayEtiketi: "Sil" });
    if (!tamam) return;
    const { error } = await supabase.from("ek_kazanclar").delete().eq("id", e.id);
    if (error) return bildir(hataYaz(error), "hata");
    await onEkDegisti();
  }

  function kisiExcel() {
    const h = disariAktar("xlsx", `${satir.ad} ${ay}`, `Maas_Dokumu_${satir.sicil}_${ay}`, kisiDokumuSatirlari(dokum));
    if (h) bildir(h, "hata");
  }

  function kisiYazdir() {
    const h = bordroDokumuYazdir([dokum], ay, firma);
    if (h) bildir(h, "hata");
  }

  const ozetler: [string, string | number][] = [
    ["TG", oz.primGun],
    ["NG", oz.normalGun],
    ["HT gün", oz.htGun],
    ["RT gün", oz.rtGun],
    ["Devamsız", oz.devamsiz],
    ["Üc. izin", oz.ucretliIzin],
    ["Ücsz. izin", oz.ucretsizIzin],
    ["NM", saatYaz(ondalik(oz.normalDk))],
    ["FM", saatYaz(ondalik(oz.fazlaDk))],
    ["EÇ", saatYaz(-ondalik(oz.eksikDk))],
    ["HT sa", saatYaz(ondalik(oz.htDk))],
    ["RT sa", saatYaz(ondalik(oz.rtDk))],
  ];

  return (
    <Modal onKapat={onKapat} baslik={`${satir.ad} · ${ayAdi(ay)}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Rozet>{satir.ucretTuru}</Rozet>
          <Rozet>Saatlik brüt {tlYaz(b.saatlik)} TL</Rozet>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={kisiYazdir}>
              <Ikon ad="rapor" boyut={14} />
              Yazdır
            </button>
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={kisiExcel}>
              <Ikon ad="indir" boyut={14} />
              Excel
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {ozetler.map(([a, v]) => (
            <div key={a} className="panel-ic px-2 py-1.5 text-center">
              <p className="m3 text-[10px]">{a}</p>
              <p className="sayi m1 text-sm font-semibold">{v}</p>
            </div>
          ))}
        </div>
        <div className="segment" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} role="tablist" aria-label="Detay">
          {(
            [
              ["hesap", "Ücret hesabı"],
              ["puantaj", "Gün gün puantaj"],
              ["ek", `Ek kazançlar (${satir.ek.length})`],
            ] as const
          ).map(([id, ad]) => (
            <button key={id} type="button" role="tab" aria-selected={sekme === id} data-aktif={sekme === id} onClick={() => setSekme(id)}>
              {ad}
            </button>
          ))}
        </div>

        {sekme === "hesap" && (
          <table className="w-full text-sm">
            <tbody>
              {hesapKalemleri(dokum).map(([ad, t, i], n) => (
                <tr key={n} style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }}>
                  <td className={`px-2 py-1.5 ${i === "=" ? "m1 font-semibold" : "m2"}`}>{ad}</td>
                  <td className={`sayi px-2 py-1.5 text-right ${i === "=" ? "m1 font-semibold" : "m1"}`}>
                    {i === "-" && t ? "−" : ""}
                    {tlYaz(t)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {sekme === "puantaj" && (
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="m2 text-left">
                  <th className="px-1 py-1">Gün</th>
                  <th className="px-1 py-1">Giriş</th>
                  <th className="px-1 py-1">Çıkış</th>
                  <th className="px-1 py-1 text-right">Plan</th>
                  <th className="px-1 py-1 text-right">Çalışma</th>
                  <th className="px-1 py-1">Durum</th>
                  {onHareketDuzelt && <th />}
                </tr>
              </thead>
              <tbody>
                {satir.p.gunlukDetaylar.map((g) => (
                  <tr key={g.tarih} style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }}>
                    <td className="sayi whitespace-nowrap px-1 py-1">
                      {g.tarih.slice(8, 10)} {g.gunAdi}
                    </td>
                    <td className="sayi px-1 py-1">{g.giris}</td>
                    <td className="sayi px-1 py-1">{g.cikis}</td>
                    <td className="sayi px-1 py-1 text-right">{g.planDk ? saatYaz(ondalik(g.planDk)) : ""}</td>
                    <td className="sayi px-1 py-1 text-right">{g.calismaDk ? saatYaz(ondalik(g.calismaDk)) : ""}</td>
                    <td className="m2 px-1 py-1">{g.durum}</td>
                    {onHareketDuzelt && (
                      <td className="px-1 py-1 text-right">
                        {(g.tip === "eksik" || g.tip === "devamsiz" || g.tip === "calisma") && (
                          <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => onHareketDuzelt(g.tarih, g.giris !== "-")} title="Giriş/çıkış ekle veya düzelt">
                            Düzelt
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {onHareketDuzelt && <p className="m3 mt-2 text-xs">Düzelt: manuel giriş/çıkış kaydı eklenir (elle eklenen hareket olarak işaretlenir).</p>}
          </div>
        )}

        {sekme === "ek" && (
          <div className="space-y-3">
            <ul className="space-y-1">
              {satir.ek.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cizgi)" }}>
                  <span className="m1 flex-1">
                    {e.tur}
                    <span className="m3 block text-xs">
                      {e.vergili ? "Brüte eklenir (vergili)" : "Netten sonra eklenir (vergisiz)"}
                      {e.aciklama ? ` · ${e.aciklama}` : ""}
                    </span>
                  </span>
                  <span className="sayi m1 font-semibold">{tlYaz(e.tutar)} TL</span>
                  <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => ekSil(e)} aria-label="Sil">
                    <Ikon ad="cop" boyut={14} />
                  </button>
                </li>
              ))}
              {satir.ek.length === 0 && <li className="m3 text-sm">Bu ay için ek kazanç yok.</li>}
            </ul>
            <form onSubmit={ekKaydet} className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="etiket" htmlFor="ekTur">
                  Tür
                </label>
                <input id="ekTur" className="girdi" list="ekTurleri" maxLength={60} value={ekForm.tur} onChange={(e) => setEkForm({ ...ekForm, tur: e.target.value })} />
                <datalist id="ekTurleri">
                  {EK_TURLERI.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="etiket" htmlFor="ekTutar">
                  Tutar (TL)
                </label>
                <input id="ekTutar" className="girdi sayi" inputMode="decimal" value={ekForm.tutar} onChange={(e) => setEkForm({ ...ekForm, tutar: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="etiket" htmlFor="ekAciklama">
                  Açıklama (isteğe bağlı)
                </label>
                <input id="ekAciklama" className="girdi" maxLength={300} value={ekForm.aciklama} onChange={(e) => setEkForm({ ...ekForm, aciklama: e.target.value })} />
              </div>
              <label className="m2 flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={ekForm.vergili} onChange={(e) => setEkForm({ ...ekForm, vergili: e.target.checked })} />
                Brüt tutar (SGK ve vergiye tabi). İşaretsizse netten sonra eklenir (ör. istisna kapsamındaki yemek/yol bedeli).
              </label>
              <div className="flex justify-end sm:col-span-2">
                <button type="submit" className="btn btn-ana" disabled={kaydediliyor}>
                  {kaydediliyor ? "Kaydediliyor..." : "Ek kazanç ekle"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AyarFormu({ veri, firmaId }: { veri: BordroVerisi; firmaId: string | null }) {
  const { bildir, onayla } = useBildirim();
  const [y, setY] = useState<YasalParametreler>(veri.ayarlar.yasal);
  const [kalemler, setKalemler] = useState<MesaiKalemi[]>(veri.ayarlar.mesaiKalemleri);
  const [kurallar, setKurallar] = useState<HesapKurallari>(veri.ayarlar.kurallar);
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
        yasal: { ...y, vergiDilimleri: dilimler.map((d, i) => ({ ust: i === dilimler.length - 1 ? null : d.ust, oran: d.oran })), kurallar },
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
    setKurallar(VARSAYILAN_KURALLAR);
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
        {kaynakSayisi("fazla_mesai") > 0 && (kaynakSayisi("plan_disi") > 0 || kaynakSayisi("fazla_calisma") > 0) && (
          <p className="text-xs" style={{ color: "var(--uyari)" }}>
            Onaylı fazla mesai ile puantajdaki fazla / plan dışı çalışma aynı saatleri içerebilir; ikisini birden açarsanız mesai iki kez ödenmiş görünebilir.
            Mesaiyi talep onayıyla yönetiyorsanız yalnızca &quot;Onaylı fazla mesai&quot;yi, talep kullanmıyorsanız yalnızca &quot;Puantajdaki fazla çalışma&quot;yı açın.
          </p>
        )}
      </section>

      <section className="panel space-y-4 p-5">
        <h3 className="baslik-font m1 text-lg">Hesap kuralları</h3>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={kurallar.eksikSaatKesintisi} onChange={(e) => setKurallar({ ...kurallar, eksikSaatKesintisi: e.target.checked })} />
          <span>
            <span className="m1 font-semibold">Eksik çalışılan saatler ücretten düşülsün</span>
            <span className="m2 block text-xs">
              İş günlerinde plandan eksik çalışılan süre (geç gelme, erken çıkma) saat ücretiyle kesilir. Kapalıyken eksik çalışılan günlerde tam mesai verilmiş
              sayılır. Devamsız günler her durumda prim gününden düşer. Saatlik ücretlilere uygulanmaz (zaten çalıştığı saat kadar alır).
            </span>
          </span>
        </label>
        <div className="max-w-xs">
          <label className="etiket" htmlFor="k-tolerans">
            Günlük eksik toleransı (dakika)
          </label>
          <input
            id="k-tolerans"
            className="girdi sayi"
            inputMode="numeric"
            disabled={!kurallar.eksikSaatKesintisi}
            value={String(kurallar.eksikToleransDk)}
            onChange={(e) => setKurallar({ ...kurallar, eksikToleransDk: Math.max(0, Math.min(240, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
          />
          <p className="ipucu">Bir günde bu kadar dakikaya kadar eksik kesintiye girmez (ör. 10).</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={kurallar.saatliktenTatilUcreti} onChange={(e) => setKurallar({ ...kurallar, saatliktenTatilUcreti: e.target.checked })} />
          <span>
            <span className="m1 font-semibold">Saatlik ücretlilere hafta tatili ve resmî tatil ücreti ödensin</span>
            <span className="m2 block text-xs">Her tatil günü için 7,5 saatlik ücret eklenir. Aylık, haftalık ve günlük ücrette tatil günleri zaten ücretin içindedir.</span>
          </span>
        </label>
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
