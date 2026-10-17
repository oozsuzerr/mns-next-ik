"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../../lib/tarih";
import { k, personelBilgisi, tr, yazdir } from "../../../lib/izinBelgeleri";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

export const ZIMMET_KATEGORILERI = [
  "Bilgisayar",
  "Telefon",
  "Tablet",
  "Araç",
  "Anahtar / kart",
  "İş kıyafeti / KKD",
  "Alet / ekipman",
  "Diğer",
] as const;
const IADE_DURUMLARI = ["Sağlam", "Hasarlı", "Kayıp"] as const;

export interface Zimmet {
  id: string;
  personel_id: string;
  kategori: (typeof ZIMMET_KATEGORILERI)[number];
  ad: string;
  seri_no: string | null;
  adet: number;
  deger: number | null;
  teslim_tarihi: string;
  teslim_notu: string | null;
  iade_tarihi: string | null;
  iade_durumu: (typeof IADE_DURUMLARI)[number] | null;
  iade_notu: string | null;
}

const para = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Personelin bütün zimmetlerini (üzerindekiler ve iade ettikleri) gösteren imzalı tutanak */
function tutanakYazdir(firmaAd: string, p: Personel, liste: Zimmet[]): string | null {
  const acik = liste.filter((z) => !z.iade_tarihi);
  const iade = liste.filter((z) => z.iade_tarihi);
  const satir = (z: Zimmet, i: number, iadeli: boolean) => `<tr>
      <td class="sag">${i + 1}</td><td>${k(z.kategori)}</td><td>${k(z.ad)}${z.teslim_notu ? `<div class="kucuk">${k(z.teslim_notu)}</div>` : ""}</td>
      <td>${k(z.seri_no ?? "-")}</td><td class="sag">${z.adet}</td><td>${tr(z.teslim_tarihi)}</td>
      ${iadeli ? `<td>${tr(z.iade_tarihi)}</td><td>${k(z.iade_durumu)}${z.iade_notu ? `<div class="kucuk">${k(z.iade_notu)}</div>` : ""}</td>` : `<td class="sag">${z.deger != null ? para(Number(z.deger)) : "-"}</td>`}
    </tr>`;
  const govde = `
    <div class="ust">
      <div><h1>Zimmet Teslim Tutanağı</h1><div class="kucuk">Demirbaş ve malzeme zimmeti</div></div>
      <div class="kucuk">Düzenleme tarihi: ${tr(yerelTarih())}</div>
    </div>
    ${personelBilgisi(firmaAd, p)}

    <h2>Personelde bulunan eşyalar</h2>
    <table>
      <tr><th class="sag">#</th><th>Tür</th><th>Eşya</th><th>Seri / plaka no</th><th class="sag">Adet</th><th>Teslim</th><th class="sag">Değer (TL)</th></tr>
      ${acik.map((z, i) => satir(z, i, false)).join("") || `<tr><td colspan="7">Personelde zimmetli eşya yok.</td></tr>`}
    </table>
    ${
      iade.length
        ? `<h2>İade edilen eşyalar</h2>
    <table>
      <tr><th class="sag">#</th><th>Tür</th><th>Eşya</th><th>Seri / plaka no</th><th class="sag">Adet</th><th>Teslim</th><th>İade</th><th>Durum</th></tr>
      ${iade.map((z, i) => satir(z, i, true)).join("")}
    </table>`
        : ""
    }
    <p class="beyan">Yukarıda yazılı eşyaları sağlam ve çalışır durumda teslim aldım. Bu eşyaları işimle ilgili amaçlarla, özenle kullanacağımı;
    iş sözleşmemin sona ermesi ya da işveren tarafından istenmesi hâlinde eksiksiz iade edeceğimi; kusurum nedeniyle oluşacak kayıp ve
    hasarlardan yasal sınırlar içinde sorumlu olduğumu kabul ederim.</p>
    <div class="imzalar">
      <div>Teslim eden<br /><span class="kucuk">İşveren / yetkili adına</span></div>
      <div>Teslim alan<br /><span class="kucuk">${k(`${p.ad} ${p.soyad}`)}</span></div>
    </div>`;
  return yazdir(`Zimmet tutanağı - ${p.ad} ${p.soyad}`, govde);
}

export default function ZimmetSekmesi({ personeller, yonetici }: { personeller: Personel[]; yonetici: YoneticiBilgisi }) {
  const { bildir, onayla } = useBildirim();
  const yazabilir = yonetici.rol === "GENEL" || yonetici.yetkiler.includes("personel");
  const firmaAd = yonetici.firma?.ad ?? "";
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [zimmetler, setZimmetler] = useState<Zimmet[]>([]);
  const [gorunum, setGorunum] = useState<"acik" | "iade" | "hepsi">("acik");
  const [arama, setArama] = useState("");
  const [form, setForm] = useState<Zimmet | "yeni" | null>(null);
  const [iadeHedef, setIadeHedef] = useState<Zimmet | null>(null);

  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.from("zimmetler").select("*").order("teslim_tarihi", { ascending: false }).limit(2000)).then(({ data, error }) => {
        if (error) {
          setDurum(kurulmamis(error, "zimmet") ? "kurulmamis" : "hazir");
          if (!kurulmamis(error, "zimmet")) bildir(hataYaz(error), "hata");
          return [] as Zimmet[];
        }
        const liste = (data ?? []) as Zimmet[];
        setZimmetler(liste);
        setDurum("hazir");
        return liste;
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-17_zimmet.sql" />;

  const aranan = arama.trim().toLocaleLowerCase("tr");
  const gorunen = zimmetler.filter((z) => {
    if (gorunum === "acik" && z.iade_tarihi) return false;
    if (gorunum === "iade" && !z.iade_tarihi) return false;
    if (!kisiler.has(z.personel_id)) return false; // şube müdürü yalnızca kendi personelini görür
    if (!aranan) return true;
    const p = kisiler.get(z.personel_id);
    return `${p?.ad} ${p?.soyad} ${z.ad} ${z.seri_no ?? ""} ${z.kategori}`.toLocaleLowerCase("tr").includes(aranan);
  });
  const acikZimmetler = zimmetler.filter((z) => !z.iade_tarihi && kisiler.has(z.personel_id));
  const toplamDeger = acikZimmetler.reduce((t, z) => t + Number(z.deger ?? 0), 0);
  // Ayrılmış ama eşyası üzerinde kalan personel
  const bugun = yerelTarih();
  const ayrilanda = new Set(
    acikZimmetler.filter((z) => {
      const p = kisiler.get(z.personel_id);
      return p && (!p.aktif || (p.cikis_tarihi && p.cikis_tarihi <= bugun));
    }).map((z) => z.personel_id)
  );

  async function sil(z: Zimmet) {
    const tamam = await onayla({
      baslik: `"${z.ad}" kaydı silinsin mi?`,
      metin: "Yanlış girilen kayıtlar için. Eşya geri alındıysa silmek yerine İade al'ı kullanın; geçmiş kayıt kalır.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("zimmetler").delete().eq("id", z.id);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Kayıt silindi.", "basari");
    await getir();
  }

  function yazdirKisi(personelId: string) {
    const p = kisiler.get(personelId);
    if (!p) return;
    const hata = tutanakYazdir(firmaAd, p, zimmetler.filter((z) => z.personel_id === personelId));
    if (hata) bildir(hata, "hata");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Personeldeki eşya</p>
          <p className="baslik-font sayi m1 text-2xl">{acikZimmetler.reduce((t, z) => t + z.adet, 0)}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Zimmetli personel</p>
          <p className="baslik-font sayi m1 text-2xl">{new Set(acikZimmetler.map((z) => z.personel_id)).size}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Toplam değer (girilenler)</p>
          <p className="baslik-font sayi m1 text-2xl">{para(toplamDeger)} TL</p>
        </div>
      </div>

      {ayrilanda.size > 0 && (
        <div className="panel flex items-start gap-3 px-5 py-4" style={{ borderColor: "var(--hata)" }}>
          <Ikon ad="uyari" boyut={18} className="mt-0.5 flex-none" />
          <p className="m1 text-sm">
            İşten ayrılan personelde iade edilmemiş eşya var:{" "}
            <strong>{[...ayrilanda].map((id) => `${kisiler.get(id)?.ad} ${kisiler.get(id)?.soyad}`).join(", ")}</strong>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="segment segment-3" style={{ width: 340, maxWidth: "100%" }} role="tablist" aria-label="Zimmet görünümü">
          {(
            [
              ["acik", "Personelde"],
              ["iade", "İade edilen"],
              ["hepsi", "Hepsi"],
            ] as const
          ).map(([id, ad]) => (
            <button key={id} type="button" role="tab" aria-selected={gorunum === id} data-aktif={gorunum === id} onClick={() => setGorunum(id)}>
              {ad}
            </button>
          ))}
        </div>
        <input
          className="girdi min-w-[200px] flex-1"
          style={{ maxWidth: 320 }}
          type="search"
          placeholder="Personel, eşya veya seri no ara"
          aria-label="Zimmet ara"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
        />
        {yazabilir && (
          <button type="button" className="btn btn-ana ml-auto" onClick={() => setForm("yeni")}>
            <Ikon ad="arti" boyut={16} />
            Zimmet ver
          </button>
        )}
      </div>

      <div className="panel overflow-hidden">
        {durum === "yukleniyor" ? (
          <div className="space-y-3 p-5">
            <Iskelet genislik="60%" />
            <Iskelet genislik="80%" />
          </div>
        ) : gorunen.length === 0 ? (
          <Bos
            ikon="ik"
            baslik={zimmetler.length === 0 ? "Henüz zimmet kaydı yok" : "Bu filtrede kayıt yok"}
            metin="Personele verilen bilgisayar, telefon, araç, anahtar ve iş kıyafetlerini kaydedin; imzalı tutanak yazdırın."
          />
        ) : (
          <ul className="liste">
            {gorunen.map((z) => {
              const p = kisiler.get(z.personel_id);
              return (
                <li key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="m1 text-sm font-semibold">
                      {z.ad}
                      {z.adet > 1 && <span className="m3 font-normal"> × {z.adet}</span>}
                    </p>
                    <p className="m3 text-xs">
                      {z.kategori}
                      {z.seri_no ? ` · ${z.seri_no}` : ""}
                      {z.deger != null ? ` · ${para(Number(z.deger))} TL` : ""}
                    </p>
                  </div>
                  <div className="w-44">
                    <p className="m1 text-sm">
                      {p?.ad} {p?.soyad}
                    </p>
                    <p className="m3 text-xs">{kisaTarih(z.teslim_tarihi)} teslim</p>
                  </div>
                  {z.iade_tarihi ? (
                    <Rozet ton={z.iade_durumu === "Sağlam" ? "giris" : "hata"}>
                      {kisaTarih(z.iade_tarihi)} iade · {z.iade_durumu}
                    </Rozet>
                  ) : (
                    <Rozet ton="izin">Personelde</Rozet>
                  )}
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => yazdirKisi(z.personel_id)} title="Personelin zimmet tutanağını yazdır">
                      <Ikon ad="rapor" boyut={15} />
                      <span className="hidden sm:inline">Tutanak</span>
                    </button>
                    {yazabilir && !z.iade_tarihi && (
                      <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setIadeHedef(z)}>
                        İade al
                      </button>
                    )}
                    {yazabilir && (
                      <>
                        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setForm(z)} aria-label={`${z.ad} düzenle`}>
                          <Ikon ad="kalem" boyut={15} />
                        </button>
                        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => sil(z)} aria-label={`${z.ad} sil`}>
                          <Ikon ad="cop" boyut={15} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <ZimmetFormu
          zimmet={form === "yeni" ? null : form}
          personeller={personeller.filter((p) => p.aktif || (form !== "yeni" && p.id === form.personel_id))}
          onKapat={() => setForm(null)}
          onKayit={async (personelId, yeni) => {
            setForm(null);
            const liste = await getir();
            if (yeni) {
              const tamam = await onayla({
                baslik: "Tutanak yazdırılsın mı?",
                metin: "Personelin zimmetindeki bütün eşyaları gösteren teslim tutanağı açılır; iki tarafça imzalanıp özlük dosyasına konur.",
                onayEtiketi: "Yazdır",
              });
              // Pencere onay tıklamasıyla hemen açılır (araya istek girerse tarayıcı açılır pencereyi engelleyebilir)
              const p = kisiler.get(personelId);
              if (tamam && p) {
                const hata = tutanakYazdir(firmaAd, p, liste.filter((z) => z.personel_id === personelId));
                if (hata) bildir(hata, "hata");
              }
            }
          }}
        />
      )}

      {iadeHedef && (
        <IadeFormu
          zimmet={iadeHedef}
          personelAd={`${kisiler.get(iadeHedef.personel_id)?.ad ?? ""} ${kisiler.get(iadeHedef.personel_id)?.soyad ?? ""}`}
          onKapat={() => setIadeHedef(null)}
          onKayit={async () => {
            setIadeHedef(null);
            await getir();
          }}
        />
      )}
    </div>
  );
}

function ZimmetFormu({
  zimmet,
  personeller,
  onKapat,
  onKayit,
}: {
  zimmet: Zimmet | null;
  personeller: Personel[];
  onKapat: () => void;
  onKayit: (personelId: string, yeni: boolean) => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [personelId, setPersonelId] = useState(zimmet?.personel_id ?? "");
  const [kategori, setKategori] = useState<Zimmet["kategori"]>(zimmet?.kategori ?? "Bilgisayar");
  const [ad, setAd] = useState(zimmet?.ad ?? "");
  const [seri, setSeri] = useState(zimmet?.seri_no ?? "");
  const [adet, setAdet] = useState(String(zimmet?.adet ?? 1));
  const [deger, setDeger] = useState(zimmet?.deger != null ? String(zimmet.deger) : "");
  const [teslim, setTeslim] = useState(zimmet?.teslim_tarihi ?? yerelTarih());
  const [not, setNot] = useState(zimmet?.teslim_notu ?? "");
  const [yukleniyor, setYukleniyor] = useState(false);

  const sirali = [...personeller].sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!personelId) return bildir("Personel seçin.", "hata");
    if (!ad.trim()) return bildir("Eşya adını yazın.", "hata");
    const adetSayi = Number(adet);
    if (!Number.isInteger(adetSayi) || adetSayi < 1) return bildir("Adet en az 1 olmalı.", "hata");
    const degerSayi = deger.trim() ? Number(deger.replace(/\./g, "").replace(",", ".")) : null;
    if (degerSayi != null && (!Number.isFinite(degerSayi) || degerSayi < 0)) return bildir("Değer geçerli bir tutar olmalı.", "hata");
    setYukleniyor(true);
    try {
      const alanlar = {
        personel_id: personelId,
        kategori,
        ad: ad.trim(),
        seri_no: seri.trim() || null,
        adet: adetSayi,
        deger: degerSayi,
        teslim_tarihi: teslim,
        teslim_notu: not.trim() || null,
      };
      const { error } = zimmet
        ? await supabase.from("zimmetler").update(alanlar).eq("id", zimmet.id)
        : await supabase.from("zimmetler").insert(alanlar);
      if (error) throw error;
      bildir(zimmet ? "Zimmet güncellendi." : "Zimmet kaydedildi.", "basari");
      await onKayit(personelId, !zimmet);
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={zimmet ? "Zimmeti düzenle" : "Zimmet ver"}>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="zPersonel">
            Personel
          </label>
          <select id="zPersonel" className="girdi" required value={personelId} onChange={(e) => setPersonelId(e.target.value)} disabled={!!zimmet}>
            <option value="">Seçin</option>
            {sirali.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad} {p.soyad} ({p.sicil_no})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket" htmlFor="zKategori">
              Tür
            </label>
            <select id="zKategori" className="girdi" value={kategori} onChange={(e) => setKategori(e.target.value as Zimmet["kategori"])}>
              {ZIMMET_KATEGORILERI.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiket" htmlFor="zTeslim">
              Teslim tarihi
            </label>
            <input id="zTeslim" className="girdi sayi" type="date" required value={teslim} onChange={(e) => setTeslim(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="zAd">
            Eşya
          </label>
          <input id="zAd" className="girdi" required maxLength={150} placeholder="ör. Dell Latitude 5440 dizüstü" value={ad} onChange={(e) => setAd(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="etiket" htmlFor="zSeri">
              Seri / plaka no
            </label>
            <input id="zSeri" className="girdi" maxLength={100} value={seri} onChange={(e) => setSeri(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="zAdet">
              Adet
            </label>
            <input id="zAdet" className="girdi sayi" type="number" min={1} max={1000} required value={adet} onChange={(e) => setAdet(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="zDeger">
              Değer (TL)
            </label>
            <input id="zDeger" className="girdi sayi" inputMode="decimal" placeholder="isteğe bağlı" value={deger} onChange={(e) => setDeger(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="zNot">
            Not
          </label>
          <input id="zNot" className="girdi" maxLength={500} placeholder="ör. şarj aleti ve çanta ile" value={not} onChange={(e) => setNot(e.target.value)} />
        </div>
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

function IadeFormu({
  zimmet,
  personelAd,
  onKapat,
  onKayit,
}: {
  zimmet: Zimmet;
  personelAd: string;
  onKapat: () => void;
  onKayit: () => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [tarih, setTarih] = useState(yerelTarih());
  const [durum, setDurum] = useState<(typeof IADE_DURUMLARI)[number]>("Sağlam");
  const [not, setNot] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (tarih < zimmet.teslim_tarihi) return bildir("İade tarihi teslim tarihinden önce olamaz.", "hata");
    if (durum !== "Sağlam" && !not.trim()) return bildir("Hasar ya da kaybı kısaca açıklayın.", "hata");
    setYukleniyor(true);
    const { error } = await supabase
      .from("zimmetler")
      .update({ iade_tarihi: tarih, iade_durumu: durum, iade_notu: not.trim() || null })
      .eq("id", zimmet.id);
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("İade kaydedildi.", "basari");
    await onKayit();
  }

  return (
    <Modal onKapat={onKapat} baslik="İade al">
      <form onSubmit={kaydet} className="space-y-4">
        <p className="m2 text-sm">
          <strong className="m1">{zimmet.ad}</strong> ({zimmet.kategori}
          {zimmet.seri_no ? `, ${zimmet.seri_no}` : ""}) · {personelAd}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket" htmlFor="iTarih">
              İade tarihi
            </label>
            <input id="iTarih" className="girdi sayi" type="date" required value={tarih} onChange={(e) => setTarih(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="iDurum">
              Durum
            </label>
            <select id="iDurum" className="girdi" value={durum} onChange={(e) => setDurum(e.target.value as (typeof IADE_DURUMLARI)[number])}>
              {IADE_DURUMLARI.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="iNot">
            Not {durum !== "Sağlam" && "(zorunlu)"}
          </label>
          <input id="iNot" className="girdi" maxLength={500} value={not} onChange={(e) => setNot(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "İadeyi kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
