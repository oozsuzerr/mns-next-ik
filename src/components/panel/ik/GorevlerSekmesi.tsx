"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelSaat, yerelTarih } from "../../../lib/tarih";
import { olayBildir } from "../../../lib/bildirim";
import { ACIK_DURUMLAR, DURUM_TONU, ONCELIKLER, ONCELIK_TONU, type Gorev, type GorevDurumu, type Oncelik } from "../../../lib/gorev";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

export default function GorevlerSekmesi({ personeller, yonetici }: { personeller: Personel[]; yonetici: YoneticiBilgisi }) {
  const { bildir } = useBildirim();
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [gorevler, setGorevler] = useState<Gorev[]>([]);
  const [filtre, setFiltre] = useState<"acik" | "biten" | "hepsi">("acik");
  const [kisi, setKisi] = useState("");
  const [form, setForm] = useState<Gorev | "yeni" | null>(null);
  const [detay, setDetay] = useState<string | null>(null);

  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.from("gorevler").select("*").order("created_at", { ascending: false }).limit(1000)).then(({ data, error }) => {
        if (error) {
          setDurum(kurulmamis(error, "gorevler") ? "kurulmamis" : "hazir");
          if (!kurulmamis(error, "gorevler")) bildir(hataYaz(error), "hata");
          return;
        }
        setGorevler((data ?? []) as Gorev[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-18_gorevler.sql" />;

  const bugun = yerelTarih();
  const gorulen = gorevler.filter((g) => kisiler.has(g.personel_id));
  const acik = gorulen.filter((g) => ACIK_DURUMLAR.includes(g.durum));
  const geciken = acik.filter((g) => g.son_tarih && g.son_tarih < bugun);
  const ayBasi = `${bugun.slice(0, 7)}-01`;
  const buAyBiten = gorulen.filter((g) => g.durum === "Tamamlandı" && g.tamamlanma && yerelTarih(g.tamamlanma) >= ayBasi);
  const gorunen = gorulen
    .filter((g) => (filtre === "acik" ? ACIK_DURUMLAR.includes(g.durum) : filtre === "biten" ? !ACIK_DURUMLAR.includes(g.durum) : true))
    .filter((g) => !kisi || g.personel_id === kisi)
    .sort((a, b) => {
      if (filtre !== "acik") return 0;
      // Açık görevler: geciken ve acil önce, sonra son tarihe göre
      const puan = (g: Gorev) => (g.son_tarih && g.son_tarih < bugun ? 0 : 1) * 10 + (3 - ONCELIKLER.indexOf(g.oncelik));
      return puan(a) - puan(b) || (a.son_tarih ?? "9999").localeCompare(b.son_tarih ?? "9999");
    });
  const secili = detay ? gorulen.find((g) => g.id === detay) ?? null : null;
  const aktifPersonel = personeller
    .filter((p) => p.aktif && (!p.cikis_tarihi || p.cikis_tarihi >= bugun))
    .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Açık görev</p>
          <p className="baslik-font sayi m1 text-2xl">{acik.length}</p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Süresi geçen</p>
          <p className="baslik-font sayi text-2xl" style={{ color: geciken.length ? "var(--hata)" : undefined }}>
            {geciken.length}
          </p>
        </div>
        <div className="panel px-5 py-4">
          <p className="m3 text-xs">Bu ay tamamlanan</p>
          <p className="baslik-font sayi m1 text-2xl">{buAyBiten.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="segment segment-3" style={{ width: 330, maxWidth: "100%" }} role="tablist" aria-label="Görev görünümü">
          {(
            [
              ["acik", "Açık"],
              ["biten", "Kapanan"],
              ["hepsi", "Hepsi"],
            ] as const
          ).map(([id, ad]) => (
            <button key={id} type="button" role="tab" aria-selected={filtre === id} data-aktif={filtre === id} onClick={() => setFiltre(id)}>
              {ad}
            </button>
          ))}
        </div>
        <select className="girdi" style={{ width: 220 }} value={kisi} onChange={(e) => setKisi(e.target.value)} aria-label="Personel">
          <option value="">Bütün personel</option>
          {aktifPersonel.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ad} {p.soyad}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ana ml-auto" onClick={() => setForm("yeni")}>
          <Ikon ad="arti" boyut={16} />
          Görev ver
        </button>
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
            baslik={filtre === "acik" ? "Açık görev yok" : "Görev yok"}
            metin="Personele görev verin; telefonuna bildirim gider, tamamlayınca notuyla birlikte size haber verir."
          />
        ) : (
          <ul className="liste">
            {gorunen.map((g) => {
              const p = kisiler.get(g.personel_id);
              const gecti = ACIK_DURUMLAR.includes(g.durum) && g.son_tarih && g.son_tarih < bugun;
              return (
                <li key={g.id}>
                  <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left" onClick={() => setDetay(g.id)}>
                    <span className="min-w-[200px] flex-1">
                      <span className="m1 block text-sm font-semibold">{g.baslik}</span>
                      <span className="m3 block text-xs">
                        {p?.ad} {p?.soyad} · {kisaTarih(yerelTarih(g.created_at))} verildi
                        {g.atayan_ad ? ` · ${g.atayan_ad}` : ""}
                        {ACIK_DURUMLAR.includes(g.durum) && !g.goruldu ? " · henüz görmedi" : ""}
                      </span>
                      {g.personel_notu && <span className="m2 block truncate text-xs">Not: {g.personel_notu}</span>}
                    </span>
                    {g.oncelik !== "Normal" && <Rozet ton={ONCELIK_TONU[g.oncelik]}>{g.oncelik}</Rozet>}
                    {g.son_tarih && (
                      <Rozet ton={gecti ? "hata" : "notr"}>
                        {gecti ? "Gecikti · " : ""}
                        {kisaTarih(g.son_tarih)}
                      </Rozet>
                    )}
                    <Rozet ton={DURUM_TONU[g.durum]}>{g.durum}</Rozet>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <GorevFormu
          gorev={form === "yeni" ? null : form}
          personeller={aktifPersonel}
          yazanAd={yonetici.ad}
          onKapat={() => setForm(null)}
          onKayit={async () => {
            setForm(null);
            await getir();
          }}
        />
      )}
      {secili && (
        <GorevDetay
          gorev={secili}
          personel={kisiler.get(secili.personel_id)}
          onKapat={() => setDetay(null)}
          onDuzenle={() => {
            setForm(secili);
            setDetay(null);
          }}
          onDegisti={getir}
        />
      )}
    </div>
  );
}

function GorevFormu({
  gorev,
  personeller,
  yazanAd,
  onKapat,
  onKayit,
}: {
  gorev: Gorev | null;
  personeller: Personel[];
  yazanAd: string | null;
  onKapat: () => void;
  onKayit: () => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [secili, setSecili] = useState<Set<string>>(new Set(gorev ? [gorev.personel_id] : []));
  const [baslik, setBaslik] = useState(gorev?.baslik ?? "");
  const [aciklama, setAciklama] = useState(gorev?.aciklama ?? "");
  const [oncelik, setOncelik] = useState<Oncelik>(gorev?.oncelik ?? "Normal");
  const [sonTarih, setSonTarih] = useState(gorev?.son_tarih ?? "");
  const [arama, setArama] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const aranan = arama.trim().toLocaleLowerCase("tr");
  const gorunen = personeller.filter((p) => !aranan || `${p.ad} ${p.soyad} ${p.subeler?.ad ?? ""}`.toLocaleLowerCase("tr").includes(aranan));

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!baslik.trim()) return bildir("Görevi kısaca yazın.", "hata");
    if (!gorev && !secili.size) return bildir("En az bir personel seçin.", "hata");
    if (!gorev && sonTarih && sonTarih < yerelTarih()) return bildir("Son tarih geçmişte olamaz.", "hata");
    setYukleniyor(true);
    const alanlar = { baslik: baslik.trim(), aciklama: aciklama.trim() || null, oncelik, son_tarih: sonTarih || null };
    try {
      if (gorev) {
        const { error } = await supabase.from("gorevler").update(alanlar).eq("id", gorev.id);
        if (error) throw error;
        bildir("Görev güncellendi.", "basari");
      } else {
        // Aynı görev seçilen her personele ayrı ayrı verilir (her biri kendi tamamlar)
        const { data, error } = await supabase
          .from("gorevler")
          .insert([...secili].map((pid) => ({ ...alanlar, personel_id: pid, atayan_ad: yazanAd })))
          .select("id");
        if (error) throw error;
        const { data: o } = await supabase.auth.getSession();
        olayBildir({ olay: "gorev", gorev_idler: (data ?? []).map((x) => x.id) }, o.session?.access_token);
        bildir(secili.size > 1 ? `${secili.size} personele görev verildi.` : "Görev verildi.", "basari");
      }
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={gorev ? "Görevi düzenle" : "Görev ver"} genis={!gorev}>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="gBaslik">
            Görev
          </label>
          <input id="gBaslik" className="girdi" required maxLength={150} placeholder="ör. Depo sayımını yap" value={baslik} onChange={(e) => setBaslik(e.target.value)} />
        </div>
        <div>
          <label className="etiket" htmlFor="gAciklama">
            Açıklama
          </label>
          <textarea id="gAciklama" className="girdi" rows={3} maxLength={2000} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="etiket">Öncelik</p>
            <div className="segment" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }} role="radiogroup" aria-label="Öncelik">
              {ONCELIKLER.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={oncelik === o} data-aktif={oncelik === o} onClick={() => setOncelik(o)}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="etiket" htmlFor="gSon">
              Son tarih (isteğe bağlı)
            </label>
            <input id="gSon" className="girdi sayi" type="date" value={sonTarih} onChange={(e) => setSonTarih(e.target.value)} />
          </div>
        </div>
        {!gorev && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="etiket mb-0">Kime ({secili.size})</p>
              <input
                className="girdi ml-auto"
                style={{ maxWidth: 220, padding: "4px 8px" }}
                type="search"
                placeholder="Ara"
                aria-label="Personel ara"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
              />
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setSecili(new Set([...secili, ...gorunen.map((p) => p.id)]))}>
                Tümünü seç
              </button>
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setSecili(new Set())}>
                Temizle
              </button>
            </div>
            <ul className="panel grid max-h-56 gap-x-4 overflow-y-auto p-3 sm:grid-cols-2">
              {gorunen.map((p) => (
                <li key={p.id}>
                  <label className="m1 flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={secili.has(p.id)}
                      onChange={(e) => {
                        const s = new Set(secili);
                        if (e.target.checked) s.add(p.id);
                        else s.delete(p.id);
                        setSecili(s);
                      }}
                    />
                    {p.ad} {p.soyad}
                    <span className="m3 text-xs">{p.subeler?.ad ?? ""}</span>
                  </label>
                </li>
              ))}
              {gorunen.length === 0 && <li className="m3 text-sm">Personel bulunamadı.</li>}
            </ul>
            <p className="m3 mt-1 text-xs">Birden fazla kişi seçerseniz görev her birine ayrı verilir; telefonlarına bildirim gider.</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : gorev ? "Kaydet" : "Görevi ver"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GorevDetay({
  gorev: g,
  personel,
  onKapat,
  onDuzenle,
  onDegisti,
}: {
  gorev: Gorev;
  personel: Personel | undefined;
  onKapat: () => void;
  onDuzenle: () => void;
  onDegisti: () => Promise<void>;
}) {
  const { bildir, onayla } = useBildirim();
  const acik = ACIK_DURUMLAR.includes(g.durum);

  async function durumYap(durum: GorevDurumu) {
    if (durum === "İptal") {
      const tamam = await onayla({ baslik: "Görev iptal edilsin mi?", metin: "Personelin listesinden kalkar; kayıt geçmişte kalır.", onayEtiketi: "İptal et", tehlikeli: true });
      if (!tamam) return;
    }
    const { error } = await supabase.from("gorevler").update({ durum }).eq("id", g.id);
    if (error) return bildir(hataYaz(error), "hata");
    bildir(durum === "İptal" ? "Görev iptal edildi." : durum === "Tamamlandı" ? "Tamamlandı olarak işaretlendi." : "Görev yeniden açıldı.", "basari");
    await onDegisti();
  }

  async function sil() {
    const tamam = await onayla({ baslik: `"${g.baslik}" silinsin mi?`, metin: "Görev ve personelin notu kalıcı olarak silinir.", onayEtiketi: "Sil", tehlikeli: true });
    if (!tamam) return;
    const { error } = await supabase.from("gorevler").delete().eq("id", g.id);
    if (error) return bildir(hataYaz(error), "hata");
    onKapat();
    await onDegisti();
  }

  return (
    <Modal onKapat={onKapat} baslik={g.baslik}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Rozet ton={DURUM_TONU[g.durum]}>{g.durum}</Rozet>
          <Rozet ton={ONCELIK_TONU[g.oncelik]}>{g.oncelik}</Rozet>
          {g.son_tarih && <Rozet>Son tarih {kisaTarih(g.son_tarih)}</Rozet>}
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="m3">Personel</dt>
          <dd className="m1">
            {personel?.ad} {personel?.soyad}
            {personel?.subeler?.ad ? ` · ${personel.subeler.ad}` : ""}
          </dd>
          <dt className="m3">Veren</dt>
          <dd className="m1">
            {g.atayan_ad ?? "-"} · {kisaTarih(yerelTarih(g.created_at))} {yerelSaat(g.created_at)}
          </dd>
          <dt className="m3">Görüldü</dt>
          <dd className="m1">{g.goruldu ? `${kisaTarih(yerelTarih(g.goruldu))} ${yerelSaat(g.goruldu)}` : "Henüz görmedi"}</dd>
          {g.tamamlanma && (
            <>
              <dt className="m3">Tamamlandı</dt>
              <dd className="m1">
                {kisaTarih(yerelTarih(g.tamamlanma))} {yerelSaat(g.tamamlanma)}
                {g.tamamlayan === "yonetici" ? " (yönetici işaretledi)" : ""}
              </dd>
            </>
          )}
        </dl>
        {g.aciklama && <p className="m2 whitespace-pre-wrap text-sm">{g.aciklama}</p>}
        <div>
          <p className="etiket">Personelin notu</p>
          <p className={`whitespace-pre-wrap text-sm ${g.personel_notu ? "m1" : "m3"}`}>{g.personel_notu ?? "Not yok."}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-hayalet mr-auto" onClick={sil}>
            <Ikon ad="cop" boyut={15} />
            Sil
          </button>
          {acik ? (
            <>
              <button type="button" className="btn btn-hayalet" onClick={() => durumYap("İptal")}>
                İptal et
              </button>
              <button type="button" className="btn btn-ikincil" onClick={onDuzenle}>
                <Ikon ad="kalem" boyut={15} />
                Düzenle
              </button>
              <button type="button" className="btn btn-ana" onClick={() => durumYap("Tamamlandı")}>
                Tamamlandı
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ikincil" onClick={() => durumYap("Bekliyor")}>
              Yeniden aç
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
