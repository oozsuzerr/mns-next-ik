"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../../lib/tarih";
import { k, personelBilgisi, tr, yazdir } from "../../../lib/izinBelgeleri";
import {
  ONERILEN_KRITERLER,
  PUAN_ADLARI,
  agirlikliOrtalama,
  puanAdi,
  puanYaz,
  type KriterPuani,
  type PerformansDegerlendirmesi,
  type PerformansDonemi,
  type PerformansKriteri,
} from "../../../lib/performans";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim, type RozetTon } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

function puanTonu(o: number | null): RozetTon {
  if (o == null) return "notr";
  return o >= 4 ? "giris" : o >= 3 ? "izin" : o >= 2 ? "uyari" : "hata";
}

/** İki tarafın imzalayacağı değerlendirme formu */
function formYazdir(firmaAd: string, p: Personel, donem: PerformansDonemi, d: PerformansDegerlendirmesi): string | null {
  const satirlar = d.puanlar
    .map((x) => `<tr><td>${k(x.ad)}</td><td class="sag">${x.agirlik}</td><td class="sag">${x.puan || "-"}</td><td>${k(PUAN_ADLARI[x.puan] ?? "")}</td></tr>`)
    .join("");
  const metin = (baslik: string, deger: string | null) =>
    `<h2>${baslik}</h2><div style="border:1px solid #9ca3af;padding:8px;min-height:40px;white-space:pre-wrap">${k(deger ?? "")}</div>`;
  const govde = `
    <div class="ust">
      <div><h1>Performans Değerlendirme Formu</h1><div class="kucuk">${k(donem.ad)} (${tr(donem.baslangic)} - ${tr(donem.bitis)})</div></div>
      <div class="kucuk">Düzenleme tarihi: ${tr(yerelTarih())}</div>
    </div>
    ${personelBilgisi(firmaAd, p)}
    <h2>Kriterler (1 = Yetersiz, 5 = Mükemmel)</h2>
    <table>
      <tr><th>Kriter</th><th class="sag">Ağırlık</th><th class="sag">Puan</th><th>Açıklama</th></tr>
      ${satirlar}
      <tr class="toplam"><td colspan="2">Ağırlıklı ortalama</td><td class="sag">${puanYaz(d.ortalama)}</td><td>${k(puanAdi(d.ortalama))}</td></tr>
    </table>
    ${metin("Güçlü yönler", d.guclu_yonler)}
    ${metin("Gelişim alanları", d.gelisim_alanlari)}
    ${metin("Önümüzdeki dönem hedefleri", d.hedefler)}
    ${metin("Genel değerlendirme", d.genel_yorum)}
    <div class="imzalar">
      <div>Değerlendiren<br /><span class="kucuk">${k(d.degerlendiren_ad ?? "")}</span></div>
      <div>Çalışan<br /><span class="kucuk">${k(`${p.ad} ${p.soyad}`)} · Okudum</span></div>
    </div>`;
  return yazdir(`Performans - ${p.ad} ${p.soyad} - ${donem.ad}`, govde);
}

export default function PerformansSekmesi({ personeller, yonetici }: { personeller: Personel[]; yonetici: YoneticiBilgisi }) {
  const { bildir, onayla } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const yazabilir = genel || yonetici.yetkiler.includes("personel");
  const firmaAd = yonetici.firma?.ad ?? "";
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [kriterler, setKriterler] = useState<PerformansKriteri[]>([]);
  const [donemler, setDonemler] = useState<PerformansDonemi[]>([]);
  const [degerlendirmeler, setDegerlendirmeler] = useState<PerformansDegerlendirmesi[]>([]);
  const [donemId, setDonemId] = useState<string | null>(null);
  const [formHedef, setFormHedef] = useState<Personel | null>(null);
  const [donemForm, setDonemForm] = useState(false);
  const [kriterForm, setKriterForm] = useState(false);


  const getir = useCallback(
    () =>
      Promise.all([
        supabase.from("performans_kriterleri").select("*").order("sira"),
        supabase.from("performans_donemleri").select("*").order("bitis", { ascending: false }),
        supabase.from("performans_degerlendirmeleri").select("*"),
      ]).then(([kr, dn, dg]) => {
        const hata = kr.error ?? dn.error ?? dg.error;
        if (hata) {
          setDurum(kurulmamis(hata, "performans_") ? "kurulmamis" : "hazir");
          if (!kurulmamis(hata, "performans_")) bildir(hataYaz(hata), "hata");
          return;
        }
        setKriterler((kr.data ?? []) as PerformansKriteri[]);
        setDonemler((dn.data ?? []) as PerformansDonemi[]);
        setDegerlendirmeler((dg.data ?? []) as PerformansDegerlendirmesi[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-17_performans.sql" />;

  const donem = donemler.find((d) => d.id === donemId) ?? donemler[0] ?? null;
  const bugun = yerelTarih();
  // Dönem içinde çalışmış personel (dönem bitmeden ayrılan ya da dönemden sonra gelen hariç)
  const kapsam = donem
    ? personeller
        .filter((p) => (!p.cikis_tarihi || p.cikis_tarihi >= donem.bitis) && (!p.ise_giris_tarihi || p.ise_giris_tarihi <= donem.bitis) && (p.aktif || p.cikis_tarihi))
        .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"))
    : [];
  const donemDeg = new Map(degerlendirmeler.filter((d) => d.donem_id === donem?.id).map((d) => [d.personel_id, d]));
  const tamamlanan = kapsam.filter((p) => donemDeg.get(p.id)?.durum === "Tamamlandı");
  const ortalamalar = tamamlanan.map((p) => donemDeg.get(p.id)!.ortalama).filter((x): x is number => x != null);
  const genelOrtalama = ortalamalar.length ? Math.round((ortalamalar.reduce((t, x) => t + x, 0) / ortalamalar.length) * 100) / 100 : null;

  async function donemDurumu(acik: boolean) {
    if (!donem) return;
    const tamam = await onayla({
      baslik: acik ? `${donem.ad} yeniden açılsın mı?` : `${donem.ad} kapatılsın mı?`,
      metin: acik ? "Değerlendirmeler yeniden değiştirilebilir." : "Kapalı dönemde değerlendirme eklenemez, değiştirilemez ve silinemez.",
      onayEtiketi: acik ? "Aç" : "Kapat",
    });
    if (!tamam) return;
    const { error } = await supabase.from("performans_donemleri").update({ acik }).eq("id", donem.id);
    if (error) return bildir(hataYaz(error), "hata");
    await getir();
  }

  async function sil(d: PerformansDegerlendirmesi, p: Personel) {
    const tamam = await onayla({ baslik: `${p.ad} ${p.soyad} değerlendirmesi silinsin mi?`, metin: "Puanlar ve yorumlar silinir.", onayEtiketi: "Sil", tehlikeli: true });
    if (!tamam) return;
    const { error } = await supabase.from("performans_degerlendirmeleri").delete().eq("id", d.id);
    if (error) return bildir(hataYaz(error), "hata");
    await getir();
  }

  if (durum === "yukleniyor") {
    return (
      <div className="panel space-y-3 p-5">
        <Iskelet genislik="60%" />
        <Iskelet genislik="80%" />
      </div>
    );
  }

  if (!kriterler.length || !donem) {
    return (
      <div className="space-y-4">
        <div className="panel">
          <Bos
            ikon="rapor"
            baslik={!kriterler.length ? "Önce değerlendirme kriterlerini belirleyin" : "Önce bir değerlendirme dönemi açın"}
            metin="Kriterler (ör. iş kalitesi, devam, takım çalışması) 1-5 arası puanlanır; dönem sonunda her personel için form doldurulur."
          >
            {genel ? (
              <div className="flex flex-wrap justify-center gap-2">
                {!kriterler.length && (
                  <button type="button" className="btn btn-ana" onClick={() => setKriterForm(true)}>
                    Kriterleri belirle
                  </button>
                )}
                {kriterler.length > 0 && (
                  <button type="button" className="btn btn-ana" onClick={() => setDonemForm(true)}>
                    Dönem aç
                  </button>
                )}
              </div>
            ) : (
              <p className="m3 text-sm">Genel yöneticinin kurulumu yapması gerekiyor.</p>
            )}
          </Bos>
        </div>
        {kriterForm && <KriterFormu mevcut={kriterler} onKapat={() => setKriterForm(false)} onKayit={async () => { setKriterForm(false); await getir(); }} />}
        {donemForm && <DonemFormu onKapat={() => setDonemForm(false)} onKayit={async (id) => { setDonemForm(false); await getir(); setDonemId(id); }} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="girdi" style={{ width: 240 }} value={donem.id} onChange={(e) => setDonemId(e.target.value)} aria-label="Dönem">
          {donemler.map((d) => (
            <option key={d.id} value={d.id}>
              {d.ad}
              {d.acik ? "" : " (kapalı)"}
            </option>
          ))}
        </select>
        <span className="m3 text-xs">
          {kisaTarih(donem.baslangic)} - {kisaTarih(donem.bitis)}
        </span>
        {!donem.acik && <Rozet ton="notr">Kapalı</Rozet>}
        {genel && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setKriterForm(true)}>
              Kriterler
            </button>
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => donemDurumu(!donem.acik)}>
              {donem.acik ? "Dönemi kapat" : "Dönemi aç"}
            </button>
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setDonemForm(true)}>
              <Ikon ad="arti" boyut={15} />
              Yeni dönem
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Tamamlanan</p>
          <p className="baslik-font sayi m1 text-2xl">
            {tamamlanan.length}/{kapsam.length}
          </p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Ortalama puan (1-5)</p>
          <p className="baslik-font sayi m1 text-2xl">{puanYaz(genelOrtalama)}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Personelin gördüğü</p>
          <p className="baslik-font sayi m1 text-2xl">
            {tamamlanan.filter((p) => donemDeg.get(p.id)?.personel_gordu).length}/{tamamlanan.length}
          </p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {kapsam.length === 0 ? (
          <Bos ikon="personel" baslik="Bu dönemde değerlendirilecek personel yok" />
        ) : (
          <ul className="liste">
            {kapsam.map((p) => {
              const d = donemDeg.get(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="m1 text-sm font-semibold">
                      {p.ad} {p.soyad}
                    </p>
                    <p className="m3 text-xs">
                      {p.subeler?.ad ?? ""}
                      {p.departman ? ` · ${p.departman}` : ""}
                      {p.unvan ? ` · ${p.unvan}` : ""}
                      {d?.degerlendiren_ad ? ` · ${d.degerlendiren_ad}` : ""}
                    </p>
                  </div>
                  {d?.durum === "Tamamlandı" ? (
                    <>
                      <Rozet ton={puanTonu(d.ortalama)}>
                        {puanYaz(d.ortalama)} · {puanAdi(d.ortalama)}
                      </Rozet>
                      {d.personel_gordu && <Rozet ton="notr">Gördü {kisaTarih(yerelTarih(d.personel_gordu))}</Rozet>}
                    </>
                  ) : d ? (
                    <Rozet ton="uyari">Taslak</Rozet>
                  ) : (
                    <Rozet ton="notr">Değerlendirilmedi</Rozet>
                  )}
                  <div className="flex gap-1">
                    {d && (
                      <button
                        type="button"
                        className="btn btn-hayalet btn-kucuk"
                        onClick={() => {
                          const h = formYazdir(firmaAd, p, donem, d);
                          if (h) bildir(h, "hata");
                        }}
                        aria-label="Yazdır"
                      >
                        <Ikon ad="rapor" boyut={15} />
                      </button>
                    )}
                    {(yazabilir && donem.acik) || d ? (
                      <button type="button" className={`btn btn-kucuk ${d ? "btn-ikincil" : "btn-ana"}`} onClick={() => setFormHedef(p)}>
                        {yazabilir && donem.acik ? (d ? "Düzenle" : "Değerlendir") : "Görüntüle"}
                      </button>
                    ) : null}
                    {yazabilir && donem.acik && d && (
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => sil(d, p)} aria-label="Sil">
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

      {formHedef && (
        <DegerlendirmeFormu
          personel={formHedef}
          donem={donem}
          kriterler={kriterler}
          mevcut={donemDeg.get(formHedef.id) ?? null}
          salt={!(yazabilir && donem.acik)}
          yazanAd={yonetici.ad}
          onKapat={() => setFormHedef(null)}
          onKayit={async () => {
            setFormHedef(null);
            await getir();
          }}
        />
      )}
      {kriterForm && <KriterFormu mevcut={kriterler} onKapat={() => setKriterForm(false)} onKayit={async () => { setKriterForm(false); await getir(); }} />}
      {donemForm && <DonemFormu onKapat={() => setDonemForm(false)} onKayit={async (id) => { setDonemForm(false); await getir(); setDonemId(id); }} />}
      <p className="m3 text-xs">
        Tamamlanan değerlendirmeyi personel telefonunda görür. Bugün: {kisaTarih(bugun)}. Dönem kapatılınca değerlendirmeler kilitlenir.
      </p>
    </div>
  );
}

function DegerlendirmeFormu({
  personel,
  donem,
  kriterler,
  mevcut,
  salt,
  yazanAd,
  onKapat,
  onKayit,
}: {
  personel: Personel;
  donem: PerformansDonemi;
  kriterler: PerformansKriteri[];
  mevcut: PerformansDegerlendirmesi | null;
  salt: boolean;
  yazanAd: string | null;
  onKapat: () => void;
  onKayit: () => Promise<void>;
}) {
  const { bildir } = useBildirim();
  // Kayıtlı değerlendirme kendi kriter kopyasıyla açılır; yeni değerlendirme güncel kriterlerle
  const [puanlar, setPuanlar] = useState<KriterPuani[]>(
    mevcut?.puanlar?.length ? mevcut.puanlar : kriterler.map((x) => ({ kriter_id: x.id, ad: x.ad, agirlik: x.agirlik, puan: 0 }))
  );
  const [guclu, setGuclu] = useState(mevcut?.guclu_yonler ?? "");
  const [gelisim, setGelisim] = useState(mevcut?.gelisim_alanlari ?? "");
  const [hedef, setHedef] = useState(mevcut?.hedefler ?? "");
  const [yorum, setYorum] = useState(mevcut?.genel_yorum ?? "");
  const [yukleniyor, setYukleniyor] = useState(false);
  const ortalama = agirlikliOrtalama(puanlar);
  const aciklamalar = new Map(kriterler.map((x) => [x.id, x.aciklama]));

  async function kaydet(durum: "Taslak" | "Tamamlandı") {
    if (durum === "Tamamlandı" && puanlar.some((p) => !p.puan)) return bildir("Tamamlamak için bütün kriterleri puanlayın.", "hata");
    setYukleniyor(true);
    const alanlar = {
      donem_id: donem.id,
      personel_id: personel.id,
      puanlar,
      ortalama,
      guclu_yonler: guclu.trim() || null,
      gelisim_alanlari: gelisim.trim() || null,
      hedefler: hedef.trim() || null,
      genel_yorum: yorum.trim() || null,
      durum,
      degerlendiren_ad: yazanAd,
    };
    const { error } = mevcut
      ? await supabase.from("performans_degerlendirmeleri").update(alanlar).eq("id", mevcut.id)
      : await supabase.from("performans_degerlendirmeleri").insert(alanlar);
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error).includes("DONEM_KAPALI") ? "Dönem kapalı; değişiklik yapılamaz." : hataYaz(error), "hata");
    bildir(durum === "Tamamlandı" ? "Değerlendirme tamamlandı; personel telefonunda görebilir." : "Taslak kaydedildi.", "basari");
    await onKayit();
  }

  const alan = (id: string, etiket: string, deger: string, set: (v: string) => void, ipucu: string) => (
    <div>
      <label className="etiket" htmlFor={id}>
        {etiket}
      </label>
      <textarea id={id} className="girdi" rows={2} maxLength={1500} placeholder={ipucu} value={deger} onChange={(e) => set(e.target.value)} disabled={salt} />
    </div>
  );

  return (
    <Modal onKapat={onKapat} baslik={`${personel.ad} ${personel.soyad} · ${donem.ad}`} genis>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          kaydet("Tamamlandı");
        }}
      >
        <ul className="panel liste overflow-hidden">
          {puanlar.map((p, i) => (
            <li key={p.kriter_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-[180px] flex-1">
                <p className="m1 text-sm font-semibold">
                  {p.ad}
                  {p.agirlik > 1 && <span className="m3 font-normal"> · ağırlık {p.agirlik}</span>}
                </p>
                {aciklamalar.get(p.kriter_id) && <p className="m3 text-xs">{aciklamalar.get(p.kriter_id)}</p>}
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={p.ad}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={p.puan === n}
                    title={PUAN_ADLARI[n]}
                    disabled={salt}
                    className={`btn btn-kucuk sayi ${p.puan === n ? "btn-ana" : "btn-hayalet"}`}
                    style={{ minWidth: 36 }}
                    onClick={() => setPuanlar((l) => l.map((x, j) => (j === i ? { ...x, puan: n } : x)))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="m2 text-sm">
          Ağırlıklı ortalama: <strong className="m1 sayi">{puanYaz(ortalama)}</strong> {ortalama != null && `· ${puanAdi(ortalama)}`}
          <span className="m3 text-xs"> (1 Yetersiz · 3 Beklentiyi karşılıyor · 5 Mükemmel)</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {alan("pGuclu", "Güçlü yönler", guclu, setGuclu, "Öne çıkan başarılar")}
          {alan("pGelisim", "Gelişim alanları", gelisim, setGelisim, "Geliştirilmesi gerekenler")}
          {alan("pHedef", "Önümüzdeki dönem hedefleri", hedef, setHedef, "Ölçülebilir hedefler")}
          {alan("pYorum", "Genel değerlendirme", yorum, setYorum, "Kısa özet")}
        </div>
        {mevcut?.durum === "Tamamlandı" && !salt && (
          <p className="m3 text-xs">Bu değerlendirme tamamlanmış. Taslağa çevirirseniz personelin telefonundan kalkar.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            {salt ? "Kapat" : "Vazgeç"}
          </button>
          {!salt && (
            <>
              <button type="button" className="btn btn-ikincil" disabled={yukleniyor} onClick={() => kaydet("Taslak")}>
                Taslak kaydet
              </button>
              <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
                {yukleniyor ? "Kaydediliyor..." : "Tamamla"}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

function DonemFormu({ onKapat, onKayit }: { onKapat: () => void; onKayit: (id: string) => Promise<void> }) {
  const { bildir } = useBildirim();
  const bugun = yerelTarih();
  const yil = Number(bugun.slice(0, 4));
  const ilkYari = Number(bugun.slice(5, 7)) <= 6;
  const [ad, setAd] = useState(`${yil} ${ilkYari ? "1" : "2"}. yarı`);
  const [bas, setBas] = useState(ilkYari ? `${yil}-01-01` : `${yil}-07-01`);
  const [bit, setBit] = useState(ilkYari ? `${yil}-06-30` : `${yil}-12-31`);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!ad.trim()) return bildir("Dönem adını yazın.", "hata");
    if (bit < bas) return bildir("Bitiş başlangıçtan önce olamaz.", "hata");
    setYukleniyor(true);
    const { data, error } = await supabase.from("performans_donemleri").insert({ ad: ad.trim(), baslangic: bas, bitis: bit }).select("id").single();
    setYukleniyor(false);
    if (error) return bildir(error.code === "23505" ? "Bu adda bir dönem zaten var." : hataYaz(error), "hata");
    bildir("Dönem açıldı.", "basari");
    await onKayit(data.id);
  }

  return (
    <Modal onKapat={onKapat} baslik="Değerlendirme dönemi aç">
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="dAd">
            Ad
          </label>
          <input id="dAd" className="girdi" required maxLength={100} value={ad} onChange={(e) => setAd(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiket" htmlFor="dBas">
              Başlangıç
            </label>
            <input id="dBas" className="girdi sayi" type="date" required value={bas} onChange={(e) => setBas(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="dBit">
              Bitiş
            </label>
            <input id="dBit" className="girdi sayi" type="date" required value={bit} onChange={(e) => setBit(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            Aç
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KriterFormu({ mevcut, onKapat, onKayit }: { mevcut: PerformansKriteri[]; onKapat: () => void; onKayit: () => Promise<void> }) {
  const { bildir } = useBildirim();
  type Satir = { id?: string; ad: string; aciklama: string; agirlik: number };
  const [satirlar, setSatirlar] = useState<Satir[]>(
    mevcut.length
      ? mevcut.map((x) => ({ id: x.id, ad: x.ad, aciklama: x.aciklama ?? "", agirlik: x.agirlik }))
      : ONERILEN_KRITERLER.map((x) => ({ ad: x.ad, aciklama: x.aciklama, agirlik: 1 }))
  );
  const [yukleniyor, setYukleniyor] = useState(false);

  function degistir(i: number, alan: Partial<Satir>) {
    setSatirlar((l) => l.map((x, j) => (j === i ? { ...x, ...alan } : x)));
  }

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const temiz = satirlar.filter((s) => s.ad.trim());
    if (!temiz.length) return bildir("En az bir kriter girin.", "hata");
    const adlar = temiz.map((s) => s.ad.trim().toLocaleLowerCase("tr"));
    if (new Set(adlar).size !== adlar.length) return bildir("Aynı adda iki kriter olamaz.", "hata");
    setYukleniyor(true);
    try {
      // Kaldırılan kriterler silinir; mevcut değerlendirmeler kendi kopyalarını tuttuğu için etkilenmez
      const kalan = new Set(temiz.filter((s) => s.id).map((s) => s.id!));
      const silinecek = mevcut.filter((x) => !kalan.has(x.id)).map((x) => x.id);
      if (silinecek.length) {
        const { error } = await supabase.from("performans_kriterleri").delete().in("id", silinecek);
        if (error) throw error;
      }
      for (const [i, s] of temiz.entries()) {
        const alanlar = { ad: s.ad.trim(), aciklama: s.aciklama.trim() || null, agirlik: s.agirlik, sira: i };
        const { error } = s.id
          ? await supabase.from("performans_kriterleri").update(alanlar).eq("id", s.id)
          : await supabase.from("performans_kriterleri").insert(alanlar);
        if (error) throw error;
      }
      bildir("Kriterler kaydedildi. Yeni değerlendirmelerde geçerli olur.", "basari");
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Değerlendirme kriterleri" genis>
      <form onSubmit={kaydet} className="space-y-3">
        <p className="m3 text-xs">
          Her kriter 1-5 arası puanlanır. Ağırlık (1-10) önemli kriterin ortalamaya etkisini artırır. Başlamış değerlendirmeler eski kriterleriyle kalır.
        </p>
        <ul className="space-y-2">
          {satirlar.map((s, i) => (
            <li key={i} className="panel flex flex-wrap items-start gap-2 p-3">
              <div className="min-w-[220px] flex-1 space-y-1">
                <input className="girdi" maxLength={100} placeholder="Kriter" value={s.ad} onChange={(e) => degistir(i, { ad: e.target.value })} aria-label="Kriter" />
                <input
                  className="girdi text-xs"
                  maxLength={300}
                  placeholder="Açıklama"
                  value={s.aciklama}
                  onChange={(e) => degistir(i, { aciklama: e.target.value })}
                  aria-label="Açıklama"
                />
              </div>
              <label className="m3 flex items-center gap-1 text-xs">
                Ağırlık
                <input
                  className="girdi sayi"
                  style={{ width: 64 }}
                  type="number"
                  min={1}
                  max={10}
                  value={s.agirlik}
                  onChange={(e) => degistir(i, { agirlik: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </label>
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setSatirlar((l) => l.filter((_, j) => j !== i))} aria-label="Kriteri sil">
                <Ikon ad="cop" boyut={15} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setSatirlar((l) => [...l, { ad: "", aciklama: "", agirlik: 1 }])}>
          <Ikon ad="arti" boyut={15} />
          Kriter ekle
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
