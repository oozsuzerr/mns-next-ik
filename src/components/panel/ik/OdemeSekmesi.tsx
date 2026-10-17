"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type YoneticiBilgisi } from "../../../lib/tipler";
import { ayAdi, kisaTarih, yerelTarih } from "../../../lib/tarih";
import { olayBildir } from "../../../lib/bildirim";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim, type RozetTon } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";
import { DURUM_ADI, FIS_KOVASI, MASRAF_KATEGORILERI, tl, tutarOku, type OdemeDurumu, type OdemeTalebi } from "../../../lib/odeme";

type Durum = OdemeDurumu;

const DURUM_TONU: Record<Durum, RozetTon> = { BEKLEMEDE: "uyari", ONAYLANDI: "izin", REDDEDILDI: "hata", ODENDI: "giris" };

export default function OdemeSekmesi({ personeller, yonetici }: { personeller: Personel[]; yonetici: YoneticiBilgisi }) {
  const { bildir, onayla } = useBildirim();
  const yetkili = yonetici.rol === "GENEL" || yonetici.yetkiler.includes("odeme");
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [liste, setListe] = useState<OdemeTalebi[]>([]);
  const [filtre, setFiltre] = useState<"bekleyen" | "odenecek" | "hepsi">("bekleyen");
  const [ay, setAy] = useState(yerelTarih().slice(0, 7));
  const [formAcik, setFormAcik] = useState(false);
  const [redHedef, setRedHedef] = useState<OdemeTalebi | null>(null);

  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.from("odeme_talepleri").select("*").order("created_at", { ascending: false }).limit(2000)).then(({ data, error }) => {
        if (error) {
          setDurum(kurulmamis(error, "odeme_talepleri") ? "kurulmamis" : "hazir");
          if (!kurulmamis(error, "odeme_talepleri")) bildir(hataYaz(error), "hata");
          return;
        }
        setListe((data ?? []) as OdemeTalebi[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-17_avans_masraf.sql" />;

  const gorulen = liste.filter((t) => kisiler.has(t.personel_id));
  const gorunen = gorulen.filter((t) =>
    filtre === "bekleyen" ? t.durum === "BEKLEMEDE" : filtre === "odenecek" ? t.durum === "ONAYLANDI" : t.tarih.startsWith(ay)
  );
  const bekleyen = gorulen.filter((t) => t.durum === "BEKLEMEDE").length;
  const odenecek = gorulen.filter((t) => t.durum === "ONAYLANDI");
  const ayinKayitlari = gorulen.filter((t) => t.tarih.startsWith(ay) && (t.durum === "ONAYLANDI" || t.durum === "ODENDI"));
  const ayAvans = ayinKayitlari.filter((t) => t.tur === "Avans").reduce((s, t) => s + Number(t.tutar), 0);
  const ayMasraf = ayinKayitlari.filter((t) => t.tur === "Masraf").reduce((s, t) => s + Number(t.tutar), 0);

  async function durumDegistir(t: OdemeTalebi, yeni: Durum, not?: string) {
    const alanlar: Partial<OdemeTalebi> = { durum: yeni };
    if (yeni === "ODENDI") alanlar.odeme_tarihi = yerelTarih();
    if (yeni === "ONAYLANDI" || yeni === "BEKLEMEDE") alanlar.odeme_tarihi = null;
    if (not !== undefined) alanlar.karar_notu = not || null;
    const { error } = await supabase.from("odeme_talepleri").update(alanlar).eq("id", t.id);
    if (error) return bildir(hataYaz(error), "hata");
    if (t.kaynak === "mobil" && yeni !== "BEKLEMEDE") {
      const { data } = await supabase.auth.getSession();
      olayBildir({ olay: "odeme_sonuc", odeme_id: t.id }, data.session?.access_token);
    }
    bildir(yeni === "ODENDI" ? "Ödendi olarak işaretlendi." : yeni === "ONAYLANDI" ? "Onaylandı." : yeni === "REDDEDILDI" ? "Reddedildi." : "Geri alındı.", "basari");
    await getir();
  }

  async function sil(t: OdemeTalebi) {
    const tamam = await onayla({
      baslik: "Kayıt silinsin mi?",
      metin: `${t.tur}, ${tl(t.tutar)}. Yanlış girilen kayıtlar için; reddedilen talepler kayıt olarak kalabilir.`,
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("odeme_talepleri").delete().eq("id", t.id);
    if (error) return bildir(hataYaz(error), "hata");
    if (t.belge_yolu) await supabase.storage.from(FIS_KOVASI).remove([t.belge_yolu]);
    bildir("Kayıt silindi.", "basari");
    await getir();
  }

  async function fisAc(yol: string) {
    // Pencere tıklamayla hemen açılır; adres hazır olunca yönlendirilir (açılır pencere engeline takılmaz)
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(FIS_KOVASI).createSignedUrl(yol, 60);
    if (error || !data) {
      pencere?.close();
      return bildir(hataYaz(error ?? "Fiş açılamadı."), "hata");
    }
    if (pencere) pencere.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Onay bekleyen</p>
          <p className="baslik-font sayi m1 text-2xl">{bekleyen}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Ödenecek (onaylı)</p>
          <p className="baslik-font sayi m1 text-2xl">{tl(odenecek.reduce((s, t) => s + Number(t.tutar), 0))}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">{ayAdi(ay)} avans</p>
          <p className="baslik-font sayi m1 text-2xl">{tl(ayAvans)}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">{ayAdi(ay)} masraf</p>
          <p className="baslik-font sayi m1 text-2xl">{tl(ayMasraf)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="segment segment-3" style={{ width: 380, maxWidth: "100%" }} role="tablist" aria-label="Avans ve masraf görünümü">
          {(
            [
              ["bekleyen", `Bekleyen${bekleyen ? ` (${bekleyen})` : ""}`],
              ["odenecek", "Ödenecek"],
              ["hepsi", "Aylık liste"],
            ] as const
          ).map(([id, ad]) => (
            <button key={id} type="button" role="tab" aria-selected={filtre === id} data-aktif={filtre === id} onClick={() => setFiltre(id)}>
              {ad}
            </button>
          ))}
        </div>
        <input
          className="girdi sayi"
          style={{ width: 170 }}
          type="month"
          aria-label="Ay"
          value={ay}
          onChange={(e) => e.target.value && setAy(e.target.value)}
        />
        {yetkili && (
          <button type="button" className="btn btn-ana ml-auto" onClick={() => setFormAcik(true)}>
            <Ikon ad="arti" boyut={16} />
            Kayıt ekle
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
            ikon="rapor"
            baslik={filtre === "bekleyen" ? "Onay bekleyen talep yok" : filtre === "odenecek" ? "Ödenecek kayıt yok" : `${ayAdi(ay)} için kayıt yok`}
            metin="Personel telefondan avans isteyebilir ve fişiyle masraf bildirebilir. Onaylananlar bordro aktarım dosyasına eklenir."
          />
        ) : (
          <ul className="liste">
            {gorunen.map((t) => {
              const p = kisiler.get(t.personel_id);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="w-40">
                    <p className="m1 text-sm font-semibold">
                      {p?.ad} {p?.soyad}
                    </p>
                    <p className="m3 text-xs">
                      {kisaTarih(t.tarih)} · {t.kaynak === "mobil" ? "telefondan" : "panelden"}
                    </p>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <p className="m1 text-sm">
                      <strong className="sayi">{tl(t.tutar)}</strong> · {t.tur}
                      {t.kategori ? ` (${t.kategori})` : ""}
                    </p>
                    {t.aciklama && <p className="m2 text-xs">{t.aciklama}</p>}
                    {t.karar_notu && <p className="m3 text-xs">Not: {t.karar_notu}</p>}
                  </div>
                  <Rozet ton={DURUM_TONU[t.durum]}>
                    {DURUM_ADI[t.durum]}
                    {t.odeme_tarihi ? ` · ${kisaTarih(t.odeme_tarihi)}` : ""}
                  </Rozet>
                  <div className="flex flex-wrap gap-1">
                    {t.belge_yolu && (
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => fisAc(t.belge_yolu!)}>
                        <Ikon ad="goz" boyut={15} />
                        Fiş
                      </button>
                    )}
                    {yetkili && t.durum === "BEKLEMEDE" && (
                      <>
                        <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setRedHedef(t)}>
                          Reddet
                        </button>
                        <button type="button" className="btn btn-ana btn-kucuk" onClick={() => durumDegistir(t, "ONAYLANDI")}>
                          Onayla
                        </button>
                      </>
                    )}
                    {yetkili && t.durum === "ONAYLANDI" && (
                      <button type="button" className="btn btn-ana btn-kucuk" onClick={() => durumDegistir(t, "ODENDI")}>
                        Ödendi
                      </button>
                    )}
                    {yetkili && (t.durum === "ODENDI" || t.durum === "REDDEDILDI") && (
                      <button
                        type="button"
                        className="btn btn-hayalet btn-kucuk"
                        onClick={() => durumDegistir(t, t.durum === "ODENDI" ? "ONAYLANDI" : "BEKLEMEDE")}
                        title={t.durum === "ODENDI" ? "Ödenmedi olarak geri al" : "Yeniden değerlendir"}
                      >
                        Geri al
                      </button>
                    )}
                    {yetkili && (
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => sil(t)} aria-label="Sil">
                        <Ikon ad="cop" boyut={15} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="m3 text-xs">
        Onaylanan ve ödenen avanslar maaştan düşülmek, masraflar geri ödenmek üzere puantajdaki bordro aktarım dosyasına (o ayın tarihine göre)
        eklenir.
      </p>

      {formAcik && (
        <KayitFormu
          personeller={personeller.filter((p) => p.aktif)}
          onKapat={() => setFormAcik(false)}
          onKayit={async () => {
            setFormAcik(false);
            await getir();
          }}
        />
      )}
      {redHedef && (
        <RedFormu
          talep={redHedef}
          onKapat={() => setRedHedef(null)}
          onRed={async (not) => {
            const t = redHedef;
            setRedHedef(null);
            await durumDegistir(t, "REDDEDILDI", not);
          }}
        />
      )}
    </div>
  );
}

function RedFormu({ talep, onKapat, onRed }: { talep: OdemeTalebi; onKapat: () => void; onRed: (not: string) => Promise<void> }) {
  const [not, setNot] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  return (
    <Modal onKapat={onKapat} baslik="Talebi reddet">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setYukleniyor(true);
          await onRed(not.trim());
          setYukleniyor(false);
        }}
      >
        <p className="m2 text-sm">
          {talep.tur}, <strong className="m1">{tl(talep.tutar)}</strong>. Açıklama personelin telefonunda görünür.
        </p>
        <div>
          <label className="etiket" htmlFor="redNot">
            Açıklama
          </label>
          <input id="redNot" className="girdi" maxLength={300} placeholder="ör. Fiş okunmuyor, yeniden gönderin" value={not} onChange={(e) => setNot(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            Reddet
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KayitFormu({ personeller, onKapat, onKayit }: { personeller: Personel[]; onKapat: () => void; onKayit: () => Promise<void> }) {
  const { bildir } = useBildirim();
  const [personelId, setPersonelId] = useState("");
  const [tur, setTur] = useState<"Avans" | "Masraf">("Avans");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(yerelTarih());
  const [kategori, setKategori] = useState<string>(MASRAF_KATEGORILERI[0]);
  const [aciklama, setAciklama] = useState("");
  const [odendi, setOdendi] = useState(true);
  const [yukleniyor, setYukleniyor] = useState(false);

  const sirali = [...personeller].sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!personelId) return bildir("Personel seçin.", "hata");
    const sayi = tutarOku(tutar);
    if (sayi == null || sayi <= 0) return bildir("Tutarı girin (ör. 1.500 ya da 1500,50).", "hata");
    setYukleniyor(true);
    const { error } = await supabase.from("odeme_talepleri").insert({
      personel_id: personelId,
      tur,
      tutar: Math.round(sayi * 100) / 100,
      tarih,
      kategori: tur === "Masraf" ? kategori : null,
      aciklama: aciklama.trim() || null,
      durum: odendi ? "ODENDI" : "ONAYLANDI",
      odeme_tarihi: odendi ? yerelTarih() : null,
    });
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Kayıt eklendi.", "basari");
    await onKayit();
  }

  return (
    <Modal onKapat={onKapat} baslik="Avans / masraf kaydı">
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="oPersonel">
            Personel
          </label>
          <select id="oPersonel" className="girdi" required value={personelId} onChange={(e) => setPersonelId(e.target.value)}>
            <option value="">Seçin</option>
            {sirali.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad} {p.soyad} ({p.sicil_no})
              </option>
            ))}
          </select>
        </div>
        <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 280 }} role="radiogroup" aria-label="Tür">
          {(["Avans", "Masraf"] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={tur === x} data-aktif={tur === x} onClick={() => setTur(x)}>
              {x}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket" htmlFor="oTutar">
              Tutar (TL)
            </label>
            <input id="oTutar" className="girdi sayi" inputMode="decimal" required placeholder="ör. 2.500" value={tutar} onChange={(e) => setTutar(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="oTarih">
              {tur === "Avans" ? "Avans tarihi" : "Masraf tarihi"}
            </label>
            <input id="oTarih" className="girdi sayi" type="date" required value={tarih} onChange={(e) => setTarih(e.target.value)} />
          </div>
        </div>
        {tur === "Masraf" && (
          <div>
            <label className="etiket" htmlFor="oKategori">
              Masraf türü
            </label>
            <select id="oKategori" className="girdi" value={kategori} onChange={(e) => setKategori(e.target.value)}>
              {MASRAF_KATEGORILERI.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="etiket" htmlFor="oAciklama">
            Açıklama
          </label>
          <input id="oAciklama" className="girdi" maxLength={500} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
        </div>
        <label className="m1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={odendi} onChange={(e) => setOdendi(e.target.checked)} />
          Ödeme yapıldı (işaretli değilse &quot;Ödenecek&quot; listesine düşer)
        </label>
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
