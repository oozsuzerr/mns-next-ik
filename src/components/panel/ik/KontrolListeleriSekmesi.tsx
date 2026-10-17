"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../../lib/tarih";
import { gunEkle } from "../../../lib/vardiyaPlani";
import { VARSAYILAN_MADDELER, type KontrolTuru, type SablonMaddesi } from "../../../lib/kontrolListesi";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

interface Liste {
  id: string;
  personel_id: string;
  tur: KontrolTuru;
  baslangic: string;
  tamamlandi_at: string | null;
  created_at: string;
}

interface Madde {
  id: string;
  liste_id: string;
  personel_id: string;
  sira: number;
  baslik: string;
  aciklama: string | null;
  son_tarih: string | null;
  tamamlandi: boolean;
  tamamlayan_ad: string | null;
  tamamlanma: string | null;
  notu: string | null;
}

interface SablonSatiri extends SablonMaddesi {
  id?: string;
  tur: KontrolTuru;
  sira: number;
}

/** Listesi olmayan yeni personel bu kadar gün içinde işe girdiyse öneri olarak gösterilir */
const ONERI_GUN = 60;

export default function KontrolListeleriSekmesi({ personeller, yonetici }: { personeller: Personel[]; yonetici: YoneticiBilgisi }) {
  const { bildir, onayla } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const yazabilir = genel || yonetici.yetkiler.includes("personel");
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [listeler, setListeler] = useState<Liste[]>([]);
  const [maddeler, setMaddeler] = useState<Madde[]>([]);
  const [sablon, setSablon] = useState<SablonSatiri[]>([]);
  const [gorunum, setGorunum] = useState<"acik" | "biten">("acik");
  const [acikListe, setAcikListe] = useState<string | null>(null);
  const [baslat, setBaslat] = useState<{ personelId: string; tur: KontrolTuru } | "yeni" | null>(null);
  const [sablonAcik, setSablonAcik] = useState(false);

  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);

  const getir = useCallback(
    () =>
      Promise.all([
        supabase.from("kontrol_listeleri").select("*").order("created_at", { ascending: false }),
        supabase.from("kontrol_maddeleri").select("*").order("sira"),
        supabase.from("kontrol_sablonlari").select("*").order("sira"),
      ]).then(([l, m, s]) => {
        const hata = l.error ?? m.error ?? s.error;
        if (hata) {
          setDurum(kurulmamis(hata, "kontrol_") ? "kurulmamis" : "hazir");
          if (!kurulmamis(hata, "kontrol_")) bildir(hataYaz(hata), "hata");
          return;
        }
        setListeler((l.data ?? []) as Liste[]);
        setMaddeler((m.data ?? []) as Madde[]);
        setSablon((s.data ?? []) as SablonSatiri[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-17_kontrol_listeleri.sql" />;

  const bugun = yerelTarih();
  const maddeHaritasi = new Map<string, Madde[]>();
  for (const m of maddeler) {
    if (!maddeHaritasi.has(m.liste_id)) maddeHaritasi.set(m.liste_id, []);
    maddeHaritasi.get(m.liste_id)!.push(m);
  }
  const gorulen = listeler.filter((l) => kisiler.has(l.personel_id));
  const gorunen = gorulen.filter((l) => (gorunum === "acik" ? !l.tamamlandi_at : !!l.tamamlandi_at));
  const varOlan = new Set(gorulen.map((l) => `${l.personel_id}|${l.tur}`));

  // Öneriler: yeni işe girip listesi olmayanlar, çıkış tarihi girilip listesi olmayanlar
  const oneriler: { p: Personel; tur: KontrolTuru; tarih: string }[] = [];
  for (const p of personeller) {
    if (p.cikis_tarihi && !varOlan.has(`${p.id}|Çıkış`) && p.cikis_tarihi >= gunEkle(bugun, -ONERI_GUN)) {
      oneriler.push({ p, tur: "Çıkış", tarih: p.cikis_tarihi });
    } else if (p.aktif && !p.cikis_tarihi && p.ise_giris_tarihi && p.ise_giris_tarihi >= gunEkle(bugun, -ONERI_GUN) && !varOlan.has(`${p.id}|Giriş`)) {
      oneriler.push({ p, tur: "Giriş", tarih: p.ise_giris_tarihi });
    }
  }

  function sablonMaddeleri(tur: KontrolTuru): SablonMaddesi[] {
    const firma = sablon.filter((s) => s.tur === tur).sort((a, b) => a.sira - b.sira);
    return firma.length ? firma : VARSAYILAN_MADDELER[tur];
  }

  async function sil(l: Liste) {
    const p = kisiler.get(l.personel_id);
    const tamam = await onayla({
      baslik: `${p?.ad} ${p?.soyad} ${l.tur.toLocaleLowerCase("tr")} listesi silinsin mi?`,
      metin: "Bütün maddeler ve işaretler silinir.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("kontrol_listeleri").delete().eq("id", l.id);
    if (error) return bildir(hataYaz(error), "hata");
    setAcikListe(null);
    bildir("Liste silindi.", "basari");
    await getir();
  }

  const secili = acikListe ? gorulen.find((l) => l.id === acikListe) ?? null : null;

  return (
    <div className="space-y-4">
      {yazabilir && oneriler.length > 0 && (
        <div className="panel overflow-hidden" style={{ borderColor: "var(--uyari)" }}>
          <p className="m1 px-5 pt-4 text-sm font-semibold">Listesi başlatılmamış personel</p>
          <ul className="liste">
            {oneriler.map(({ p, tur, tarih }) => (
              <li key={`${p.id}-${tur}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="m1 min-w-[160px] flex-1 text-sm">
                  {p.ad} {p.soyad}
                </span>
                <Rozet ton={tur === "Giriş" ? "giris" : "cikis"}>
                  {tur === "Giriş" ? "İşe giriş" : "İşten çıkış"}: {kisaTarih(tarih)}
                </Rozet>
                <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setBaslat({ personelId: p.id, tur })}>
                  Listeyi başlat
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: 280, maxWidth: "100%" }} role="tablist" aria-label="Liste görünümü">
          {(
            [
              ["acik", "Devam eden"],
              ["biten", "Tamamlanan"],
            ] as const
          ).map(([id, ad]) => (
            <button key={id} type="button" role="tab" aria-selected={gorunum === id} data-aktif={gorunum === id} onClick={() => setGorunum(id)}>
              {ad}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {genel && (
            <button type="button" className="btn btn-hayalet" onClick={() => setSablonAcik(true)}>
              <Ikon ad="kalem" boyut={15} />
              Maddeleri düzenle
            </button>
          )}
          {yazabilir && (
            <button type="button" className="btn btn-ana" onClick={() => setBaslat("yeni")}>
              <Ikon ad="arti" boyut={16} />
              Liste başlat
            </button>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {durum === "yukleniyor" ? (
          <div className="space-y-3 p-5">
            <Iskelet genislik="60%" />
            <Iskelet genislik="80%" />
          </div>
        ) : gorunen.length === 0 ? (
          <Bos
            ikon="tik"
            baslik={gorunum === "acik" ? "Devam eden liste yok" : "Tamamlanan liste yok"}
            metin="Yeni gelen ve ayrılan personel için SGK bildirgesi, sözleşme, zimmet, tazminat gibi adımları takip edin."
          />
        ) : (
          <ul className="liste">
            {gorunen.map((l) => {
              const p = kisiler.get(l.personel_id);
              const ms = maddeHaritasi.get(l.id) ?? [];
              const biten = ms.filter((m) => m.tamamlandi).length;
              const geciken = ms.filter((m) => !m.tamamlandi && m.son_tarih && m.son_tarih < bugun).length;
              return (
                <li key={l.id}>
                  <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left" onClick={() => setAcikListe(l.id)}>
                    <span className="min-w-[180px] flex-1">
                      <span className="m1 block text-sm font-semibold">
                        {p?.ad} {p?.soyad}
                      </span>
                      <span className="m3 block text-xs">
                        {l.tur === "Giriş" ? "İşe giriş" : "İşten çıkış"}: {kisaTarih(l.baslangic)}
                      </span>
                    </span>
                    {geciken > 0 && <Rozet ton="hata">{geciken} gecikmiş</Rozet>}
                    <Rozet ton={l.tur === "Giriş" ? "giris" : "cikis"}>{l.tur}</Rozet>
                    <span className="flex w-40 items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--cizgi, #e5e7eb)" }}>
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${ms.length ? (biten / ms.length) * 100 : 0}%`, background: "var(--giris, #16a34a)" }}
                        />
                      </span>
                      <span className="sayi m2 text-xs">
                        {biten}/{ms.length}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {secili && (
        <ListeDetay
          liste={secili}
          personel={kisiler.get(secili.personel_id)}
          maddeler={maddeHaritasi.get(secili.id) ?? []}
          yazabilir={yazabilir}
          yapanAd={yonetici.ad}
          onKapat={() => setAcikListe(null)}
          onDegisti={getir}
          onSil={() => sil(secili)}
        />
      )}

      {baslat && (
        <BaslatFormu
          baslangic={baslat === "yeni" ? null : baslat}
          personeller={personeller}
          varOlan={varOlan}
          sablonMaddeleri={sablonMaddeleri}
          onKapat={() => setBaslat(null)}
          onBasladi={async (id) => {
            setBaslat(null);
            await getir();
            setGorunum("acik");
            setAcikListe(id);
          }}
        />
      )}

      {sablonAcik && (
        <SablonFormu
          mevcut={sablon}
          onKapat={() => setSablonAcik(false)}
          onKayit={async () => {
            setSablonAcik(false);
            await getir();
          }}
        />
      )}
    </div>
  );
}

function BaslatFormu({
  baslangic,
  personeller,
  varOlan,
  sablonMaddeleri,
  onKapat,
  onBasladi,
}: {
  baslangic: { personelId: string; tur: KontrolTuru } | null;
  personeller: Personel[];
  varOlan: Set<string>;
  sablonMaddeleri: (tur: KontrolTuru) => SablonMaddesi[];
  onKapat: () => void;
  onBasladi: (id: string) => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [personelId, setPersonelId] = useState(baslangic?.personelId ?? "");
  const [tur, setTur] = useState<KontrolTuru>(baslangic?.tur ?? "Giriş");
  const p = personeller.find((x) => x.id === personelId);
  const varsayilanTarih = (tur === "Giriş" ? p?.ise_giris_tarihi : p?.cikis_tarihi) ?? yerelTarih();
  const [tarih, setTarih] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const gecerliTarih = tarih ?? varsayilanTarih;
  const sirali = [...personeller].sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));
  const maddeler = sablonMaddeleri(tur);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!personelId) return bildir("Personel seçin.", "hata");
    if (varOlan.has(`${personelId}|${tur}`)) return bildir(`Bu personelin ${tur.toLocaleLowerCase("tr")} listesi zaten var.`, "hata");
    setYukleniyor(true);
    try {
      const { data, error } = await supabase
        .from("kontrol_listeleri")
        .insert({ personel_id: personelId, tur, baslangic: gecerliTarih })
        .select("id")
        .single();
      if (error) throw error;
      const { error: mHata } = await supabase.from("kontrol_maddeleri").insert(
        maddeler.map((m, i) => ({
          liste_id: data.id,
          personel_id: personelId,
          sira: i,
          baslik: m.baslik,
          aciklama: m.aciklama,
          son_tarih: m.gun == null ? null : gunEkle(gecerliTarih, m.gun),
        }))
      );
      if (mHata) {
        await supabase.from("kontrol_listeleri").delete().eq("id", data.id);
        throw mHata;
      }
      bildir("Liste başlatıldı.", "basari");
      await onBasladi(data.id);
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Kontrol listesi başlat">
      <form onSubmit={kaydet} className="space-y-4">
        <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 300 }} role="radiogroup" aria-label="Tür">
          {(["Giriş", "Çıkış"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={tur === x}
              data-aktif={tur === x}
              onClick={() => {
                setTur(x);
                setTarih(null);
              }}
            >
              {x === "Giriş" ? "İşe başlama" : "Ayrılış"}
            </button>
          ))}
        </div>
        <div>
          <label className="etiket" htmlFor="kPersonel">
            Personel
          </label>
          <select
            id="kPersonel"
            className="girdi"
            required
            value={personelId}
            onChange={(e) => {
              setPersonelId(e.target.value);
              setTarih(null);
            }}
          >
            <option value="">Seçin</option>
            {sirali.map((x) => (
              <option key={x.id} value={x.id}>
                {x.ad} {x.soyad} ({x.sicil_no})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiket" htmlFor="kTarih">
            {tur === "Giriş" ? "İşe giriş tarihi" : "İşten çıkış tarihi"}
          </label>
          <input id="kTarih" className="girdi sayi" type="date" required value={gecerliTarih} onChange={(e) => setTarih(e.target.value)} />
          <p className="m3 mt-1 text-xs">Maddelerin son tarihleri bu tarihe göre hesaplanır.</p>
        </div>
        <div>
          <p className="etiket">Maddeler ({maddeler.length})</p>
          <ol className="m2 list-decimal space-y-0.5 pl-5 text-sm">
            {maddeler.map((m, i) => (
              <li key={i}>
                {m.baslik}
                {m.gun != null && <span className="m3 text-xs"> · {kisaTarih(gunEkle(gecerliTarih, m.gun))}</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Başlatılıyor..." : "Başlat"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ListeDetay({
  liste,
  personel,
  maddeler,
  yazabilir,
  yapanAd,
  onKapat,
  onDegisti,
  onSil,
}: {
  liste: Liste;
  personel: Personel | undefined;
  maddeler: Madde[];
  yazabilir: boolean;
  yapanAd: string | null;
  onKapat: () => void;
  onDegisti: () => Promise<void>;
  onSil: () => void;
}) {
  const { bildir } = useBildirim();
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [ipuclari, setIpuclari] = useState<string[]>([]);
  const bugun = yerelTarih();

  // Ayrılışta: personelde kalan zimmet ve kapanmamış avans/masraf hatırlatılır (tablolar yoksa sessizce atlanır)
  useEffect(() => {
    if (liste.tur !== "Çıkış") return;
    Promise.all([
      supabase.from("zimmetler").select("ad").eq("personel_id", liste.personel_id).is("iade_tarihi", null),
      supabase.from("odeme_talepleri").select("tur, tutar").eq("personel_id", liste.personel_id).in("durum", ["BEKLEMEDE", "ONAYLANDI"]),
    ]).then(([z, o]) => {
      const notlar: string[] = [];
      if (!z.error && z.data?.length) notlar.push(`İade edilmemiş zimmet: ${z.data.map((x) => x.ad).join(", ")}`);
      if (!o.error && o.data?.length) notlar.push(`Kapanmamış avans/masraf: ${o.data.length} kayıt`);
      setIpuclari(notlar);
    });
  }, [liste.tur, liste.personel_id]);

  async function isaretle(m: Madde, deger: boolean) {
    setIsleniyor(m.id);
    const { error } = await supabase
      .from("kontrol_maddeleri")
      .update({ tamamlandi: deger, tamamlayan_ad: deger ? yapanAd : null })
      .eq("id", m.id);
    if (error) {
      setIsleniyor(null);
      return bildir(hataYaz(error), "hata");
    }
    // Bütün maddeler bitince liste tamamlanır; biri geri alınırsa yeniden açılır
    const hepsi = maddeler.every((x) => (x.id === m.id ? deger : x.tamamlandi));
    if (hepsi !== !!liste.tamamlandi_at) {
      await supabase
        .from("kontrol_listeleri")
        .update({ tamamlandi_at: hepsi ? new Date().toISOString() : null })
        .eq("id", liste.id);
      if (hepsi) bildir("Bütün maddeler tamamlandı; liste kapatıldı.", "basari");
    }
    await onDegisti();
    setIsleniyor(null);
  }

  async function notKaydet(m: Madde, notu: string) {
    if ((m.notu ?? "") === notu.trim()) return;
    const { error } = await supabase.from("kontrol_maddeleri").update({ notu: notu.trim() || null }).eq("id", m.id);
    if (error) return bildir(hataYaz(error), "hata");
    await onDegisti();
  }

  const biten = maddeler.filter((m) => m.tamamlandi).length;

  return (
    <Modal onKapat={onKapat} baslik={`${personel?.ad ?? ""} ${personel?.soyad ?? ""} · ${liste.tur === "Giriş" ? "İşe başlama" : "Ayrılış"}`} genis>
      <div className="space-y-4">
        <p className="m2 text-sm">
          {liste.tur === "Giriş" ? "İşe giriş" : "İşten çıkış"}: <strong className="m1">{kisaTarih(liste.baslangic)}</strong> · {biten}/{maddeler.length} tamamlandı
        </p>
        {ipuclari.length > 0 && (
          <div className="panel flex items-start gap-3 px-4 py-3" style={{ borderColor: "var(--uyari)" }}>
            <Ikon ad="uyari" boyut={18} className="mt-0.5 flex-none" />
            <ul className="m1 space-y-1 text-sm">
              {ipuclari.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <ul className="panel liste overflow-hidden">
          {maddeler.map((m) => {
            const geciken = !m.tamamlandi && m.son_tarih && m.son_tarih < bugun;
            return (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 flex-none"
                  checked={m.tamamlandi}
                  disabled={!yazabilir || isleniyor === m.id}
                  onChange={(e) => isaretle(m, e.target.checked)}
                  aria-label={m.baslik}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${m.tamamlandi ? "m3 line-through" : "m1"}`}>{m.baslik}</p>
                  {m.aciklama && <p className="m3 text-xs">{m.aciklama}</p>}
                  {m.tamamlandi && m.tamamlanma && (
                    <p className="m3 text-xs">
                      {kisaTarih(yerelTarih(m.tamamlanma))}
                      {m.tamamlayan_ad ? ` · ${m.tamamlayan_ad}` : ""}
                    </p>
                  )}
                  {yazabilir ? (
                    <input
                      className="girdi mt-1 text-xs"
                      style={{ padding: "4px 8px" }}
                      maxLength={300}
                      placeholder="Not ekle"
                      defaultValue={m.notu ?? ""}
                      onBlur={(e) => notKaydet(m, e.target.value)}
                    />
                  ) : (
                    m.notu && <p className="m2 text-xs">Not: {m.notu}</p>
                  )}
                </div>
                {m.son_tarih && (
                  <Rozet ton={geciken ? "hata" : "notr"}>
                    {geciken ? "Gecikti · " : ""}
                    {kisaTarih(m.son_tarih)}
                  </Rozet>
                )}
              </li>
            );
          })}
        </ul>
        {yazabilir && (
          <div className="flex justify-end">
            <button type="button" className="btn btn-hayalet" onClick={onSil}>
              <Ikon ad="cop" boyut={15} />
              Listeyi sil
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SablonFormu({ mevcut, onKapat, onKayit }: { mevcut: SablonSatiri[]; onKapat: () => void; onKayit: () => Promise<void> }) {
  const { bildir, onayla } = useBildirim();
  const [tur, setTur] = useState<KontrolTuru>("Giriş");
  const ilk = (t: KontrolTuru): SablonSatiri[] => {
    const firma = mevcut.filter((s) => s.tur === t).sort((a, b) => a.sira - b.sira);
    return (firma.length ? firma : VARSAYILAN_MADDELER[t]).map((m, i) => ({ baslik: m.baslik, aciklama: m.aciklama, gun: m.gun, tur: t, sira: i }));
  };
  const [satirlar, setSatirlar] = useState<Record<KontrolTuru, SablonSatiri[]>>({ Giriş: ilk("Giriş"), Çıkış: ilk("Çıkış") });
  const [yukleniyor, setYukleniyor] = useState(false);
  const liste = satirlar[tur];

  function degistir(i: number, alan: Partial<SablonSatiri>) {
    setSatirlar((s) => ({ ...s, [tur]: s[tur].map((x, j) => (j === i ? { ...x, ...alan } : x)) }));
  }
  function tasi(i: number, yon: -1 | 1) {
    setSatirlar((s) => {
      const l = [...s[tur]];
      const j = i + yon;
      if (j < 0 || j >= l.length) return s;
      [l[i], l[j]] = [l[j], l[i]];
      return { ...s, [tur]: l };
    });
  }

  async function varsayilanaDon() {
    const tamam = await onayla({
      baslik: `${tur} listesi varsayılana dönsün mü?`,
      metin: "Bu türdeki değişiklikleriniz silinir; kaydettiğinizde varsayılan liste kullanılır. Başlatılmış listeler değişmez.",
      onayEtiketi: "Varsayılana dön",
    });
    if (tamam) setSatirlar((s) => ({ ...s, [tur]: VARSAYILAN_MADDELER[tur].map((m, i) => ({ ...m, tur, sira: i })) }));
  }

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const temiz = (t: KontrolTuru) =>
      satirlar[t]
        .filter((x) => x.baslik.trim())
        .map((x, i) => ({ tur: t, sira: i, baslik: x.baslik.trim(), aciklama: x.aciklama?.trim() || null, gun: x.gun }));
    const yeni = [...temiz("Giriş"), ...temiz("Çıkış")];
    setYukleniyor(true);
    try {
      // Önce eski maddeler silinir, sonra yeniler eklenir (başlatılmış listeler kendi kopyalarını tutar)
      const { error: sHata } = await supabase.from("kontrol_sablonlari").delete().in("tur", ["Giriş", "Çıkış"]);
      if (sHata) throw sHata;
      if (yeni.length) {
        const { error } = await supabase.from("kontrol_sablonlari").insert(yeni);
        if (error) throw error;
      }
      bildir("Maddeler kaydedildi. Yeni başlatılan listelerde geçerli olur.", "basari");
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Kontrol listesi maddeleri" genis>
      <form onSubmit={kaydet} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: 300 }} role="tablist" aria-label="Tür">
            {(["Giriş", "Çıkış"] as const).map((x) => (
              <button key={x} type="button" role="tab" aria-selected={tur === x} data-aktif={tur === x} onClick={() => setTur(x)}>
                {x === "Giriş" ? "İşe başlama" : "Ayrılış"}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-hayalet btn-kucuk ml-auto" onClick={varsayilanaDon}>
            Varsayılana dön
          </button>
        </div>
        <p className="m3 text-xs">
          &quot;Gün&quot;: son tarihin {tur === "Giriş" ? "işe giriş" : "işten çıkış"} tarihine göre kaç gün sonra olduğu (önce ise eksi, boşsa son tarih yok).
        </p>
        <ul className="space-y-2">
          {liste.map((m, i) => (
            <li key={i} className="panel flex flex-wrap items-start gap-2 p-3">
              <div className="flex flex-col">
                <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => tasi(i, -1)} aria-label="Yukarı" disabled={i === 0}>
                  ↑
                </button>
                <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => tasi(i, 1)} aria-label="Aşağı" disabled={i === liste.length - 1}>
                  ↓
                </button>
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <input className="girdi" maxLength={150} placeholder="Madde" value={m.baslik} onChange={(e) => degistir(i, { baslik: e.target.value })} aria-label="Madde" />
                <input
                  className="girdi text-xs"
                  maxLength={500}
                  placeholder="Açıklama (isteğe bağlı)"
                  value={m.aciklama ?? ""}
                  onChange={(e) => degistir(i, { aciklama: e.target.value })}
                  aria-label="Açıklama"
                />
              </div>
              <input
                className="girdi sayi"
                style={{ width: 80 }}
                type="number"
                min={-60}
                max={120}
                placeholder="Gün"
                value={m.gun ?? ""}
                onChange={(e) => degistir(i, { gun: e.target.value === "" ? null : Number(e.target.value) })}
                aria-label="Gün"
              />
              <button
                type="button"
                className="btn btn-hayalet btn-kucuk"
                onClick={() => setSatirlar((s) => ({ ...s, [tur]: s[tur].filter((_, j) => j !== i) }))}
                aria-label="Maddeyi sil"
              >
                <Ikon ad="cop" boyut={15} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-ikincil btn-kucuk"
          onClick={() => setSatirlar((s) => ({ ...s, [tur]: [...s[tur], { baslik: "", aciklama: null, gun: null, tur, sira: s[tur].length }] }))}
        >
          <Ikon ad="arti" boyut={15} />
          Madde ekle
        </button>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
