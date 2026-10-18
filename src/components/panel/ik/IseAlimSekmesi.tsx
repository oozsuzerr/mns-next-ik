"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type Sube, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelSaat, yerelTarih } from "../../../lib/tarih";
import { gunEkle } from "../../../lib/vardiyaPlani";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim, type RozetTon } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

const ASAMALAR = ["Başvuru", "Ön görüşme", "Mülakat", "Teklif", "İşe alındı", "Reddedildi", "Vazgeçti"] as const;
type Asama = (typeof ASAMALAR)[number];
const ACIK_ASAMALAR: Asama[] = ["Başvuru", "Ön görüşme", "Mülakat", "Teklif"];
const KAYNAKLAR = ["Kariyer sitesi", "İŞKUR", "Tavsiye", "Sosyal medya", "Doğrudan başvuru", "Diğer"] as const;
const ASAMA_TONU: Record<Asama, RozetTon> = {
  Başvuru: "notr",
  "Ön görüşme": "izin",
  Mülakat: "izin",
  Teklif: "uyari",
  "İşe alındı": "giris",
  Reddedildi: "hata",
  Vazgeçti: "hata",
};
const CV_KOVASI = "aday-cv";
const CV_TURLERI: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
/** Sonuçlanmış adayların verisi bu kadar ay sonra silinmesi önerilir (KVKK: amaçla sınırlı saklama) */
const SAKLAMA_AY = 6;

interface Ilan {
  id: string;
  sube_id: string | null;
  baslik: string;
  departman: string | null;
  aciklama: string | null;
  kadro: number;
  durum: "Açık" | "Beklemede" | "Kapandı";
  acilis: string;
  kapanis: string | null;
}

interface Aday {
  id: string;
  ilan_id: string;
  ad: string;
  soyad: string;
  telefon: string | null;
  eposta: string | null;
  kaynak: string | null;
  asama: Asama;
  puan: number | null;
  notlar: string | null;
  cv_yolu: string | null;
  kvkk_onay: boolean;
  basvuru: string;
  personel_id: string | null;
  guncelleme: string;
}

interface Gorusme {
  id: string;
  aday_id: string;
  tarih: string;
  tur: "Telefon" | "Yüz yüze" | "Online";
  gorusmeci: string | null;
  puan: number | null;
  notlar: string | null;
}

export default function IseAlimSekmesi({ personeller, subeler, yonetici }: { personeller: Personel[]; subeler: Sube[]; yonetici: YoneticiBilgisi }) {
  const { bildir, onayla } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const yazabilir = genel || yonetici.yetkiler.includes("personel");
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [ilanlar, setIlanlar] = useState<Ilan[]>([]);
  const [adaylar, setAdaylar] = useState<Aday[]>([]);
  const [gorusmeler, setGorusmeler] = useState<Gorusme[]>([]);
  const [ilanId, setIlanId] = useState<string | null>(null);
  const [ilanForm, setIlanForm] = useState<Ilan | "yeni" | null>(null);
  const [adayForm, setAdayForm] = useState(false);
  const [adayDetay, setAdayDetay] = useState<string | null>(null);
  const [kapalilar, setKapalilar] = useState(false);

  const subeAdi = useMemo(() => new Map(subeler.map((s) => [s.id, s.ad])), [subeler]);
  const ilanSubeleri = genel ? subeler : subeler.filter((s) => yonetici.subeler.includes(s.id));

  const getir = useCallback(
    () =>
      Promise.all([
        supabase.from("ise_alim_ilanlari").select("*").order("acilis", { ascending: false }),
        supabase.from("adaylar").select("*").order("basvuru", { ascending: false }),
        supabase.from("aday_gorusmeleri").select("*").order("tarih"),
      ]).then(([i, a, g]) => {
        const hata = i.error ?? a.error ?? g.error;
        if (hata) {
          setDurum(kurulmamis(hata, "ise_alim|aday") ? "kurulmamis" : "hazir");
          if (!kurulmamis(hata, "ise_alim|aday")) bildir(hataYaz(hata), "hata");
          return;
        }
        setIlanlar((i.data ?? []) as Ilan[]);
        setAdaylar((a.data ?? []) as Aday[]);
        setGorusmeler((g.data ?? []) as Gorusme[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-18_ise_alim.sql" />;
  if (durum === "yukleniyor") {
    return (
      <div className="panel space-y-3 p-5">
        <Iskelet genislik="60%" />
        <Iskelet genislik="80%" />
      </div>
    );
  }

  const gorunenIlanlar = ilanlar.filter((i) => kapalilar || i.durum !== "Kapandı");
  const ilan = ilanlar.find((i) => i.id === ilanId) ?? null;
  const ilanAdaylari = (id: string) => adaylar.filter((a) => a.ilan_id === id);
  const sinir = gunEkle(yerelTarih(), -SAKLAMA_AY * 30);
  const eskiAdaylar = adaylar.filter((a) => (a.asama === "Reddedildi" || a.asama === "Vazgeçti") && a.guncelleme.slice(0, 10) < sinir);

  async function eskileriSil() {
    const tamam = await onayla({
      baslik: `${eskiAdaylar.length} eski aday silinsin mi?`,
      metin: `${SAKLAMA_AY} aydan uzun süre önce reddedilen ya da vazgeçen adayların bilgileri, görüşmeleri ve CV'leri kalıcı olarak silinir (KVKK: kişisel veri amaç için gereken süre kadar saklanır).`,
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const cvler = eskiAdaylar.map((a) => a.cv_yolu).filter((x): x is string => !!x);
    const { error } = await supabase.from("adaylar").delete().in("id", eskiAdaylar.map((a) => a.id));
    if (error) return bildir(hataYaz(error), "hata");
    if (cvler.length) await supabase.storage.from(CV_KOVASI).remove(cvler);
    bildir("Eski adaylar silindi.", "basari");
    await getir();
  }

  const secili = adayDetay ? adaylar.find((a) => a.id === adayDetay) ?? null : null;

  return (
    <div className="space-y-4">
      {!ilan ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="m2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={kapalilar} onChange={(e) => setKapalilar(e.target.checked)} />
              Kapanan ilanları da göster
            </label>
            {yazabilir && eskiAdaylar.length > 0 && (
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={eskileriSil} title="KVKK: sonuçlanmış adayların verisi süresiz saklanmamalı">
                <Ikon ad="cop" boyut={15} />
                Eski adayları sil ({eskiAdaylar.length})
              </button>
            )}
            {yazabilir && (genel || ilanSubeleri.length > 0) && (
              <button type="button" className="btn btn-ana ml-auto" onClick={() => setIlanForm("yeni")}>
                <Ikon ad="arti" boyut={16} />
                Yeni ilan
              </button>
            )}
          </div>
          <div className="panel overflow-hidden">
            {gorunenIlanlar.length === 0 ? (
              <Bos ikon="personel" baslik="Açık ilan yok" metin="Açık pozisyonu ilan olarak açın, gelen adayları aşama aşama takip edin." />
            ) : (
              <ul className="liste">
                {gorunenIlanlar.map((i) => {
                  const as = ilanAdaylari(i.id);
                  const alinan = as.filter((a) => a.asama === "İşe alındı").length;
                  const surecte = as.filter((a) => ACIK_ASAMALAR.includes(a.asama)).length;
                  return (
                    <li key={i.id}>
                      <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left" onClick={() => setIlanId(i.id)}>
                        <span className="min-w-[200px] flex-1">
                          <span className="m1 block text-sm font-semibold">{i.baslik}</span>
                          <span className="m3 block text-xs">
                            {i.sube_id ? subeAdi.get(i.sube_id) ?? "Şube" : "Firma geneli"}
                            {i.departman ? ` · ${i.departman}` : ""} · {kisaTarih(i.acilis)} açıldı
                          </span>
                        </span>
                        <Rozet ton={i.durum === "Açık" ? "giris" : i.durum === "Beklemede" ? "uyari" : "notr"}>{i.durum}</Rozet>
                        <span className="m2 sayi w-48 text-right text-xs">
                          {as.length} aday · {surecte} süreçte · {alinan}/{i.kadro} alındı
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <IlanDetay
          ilan={ilan}
          subeAd={ilan.sube_id ? subeAdi.get(ilan.sube_id) ?? "Şube" : "Firma geneli"}
          adaylar={ilanAdaylari(ilan.id)}
          gorusmeler={gorusmeler}
          yazabilir={yazabilir}
          onGeri={() => setIlanId(null)}
          onDuzenle={() => setIlanForm(ilan)}
          onAdayEkle={() => setAdayForm(true)}
          onAdayAc={(id) => setAdayDetay(id)}
          onAsama={async (a, asama) => {
            const { error } = await supabase.from("adaylar").update({ asama }).eq("id", a.id);
            if (error) return bildir(hataYaz(error), "hata");
            await getir();
          }}
        />
      )}

      {ilanForm && (
        <IlanFormu
          ilan={ilanForm === "yeni" ? null : ilanForm}
          subeler={ilanSubeleri}
          genel={genel}
          onKapat={() => setIlanForm(null)}
          onKayit={async (id) => {
            setIlanForm(null);
            await getir();
            setIlanId(id);
          }}
          onSil={
            ilanForm !== "yeni"
              ? async () => {
                  const f = ilanForm;
                  const sayi = ilanAdaylari(f.id).length;
                  const tamam = await onayla({
                    baslik: `"${f.baslik}" silinsin mi?`,
                    metin: sayi ? `${sayi} aday ve görüşmeleri de silinir. İlanı kapatmak yeterliyse "Kapandı" durumunu seçin.` : "İlan silinir.",
                    onayEtiketi: "Sil",
                    tehlikeli: true,
                  });
                  if (!tamam) return;
                  const cvler = ilanAdaylari(f.id).map((a) => a.cv_yolu).filter((x): x is string => !!x);
                  const { error } = await supabase.from("ise_alim_ilanlari").delete().eq("id", f.id);
                  if (error) return bildir(hataYaz(error), "hata");
                  if (cvler.length) await supabase.storage.from(CV_KOVASI).remove(cvler);
                  setIlanForm(null);
                  setIlanId(null);
                  await getir();
                }
              : undefined
          }
        />
      )}
      {adayForm && ilan && (
        <AdayFormu
          ilan={ilan}
          firmaId={yonetici.firma?.id ?? null}
          onKapat={() => setAdayForm(false)}
          onKayit={async () => {
            setAdayForm(false);
            await getir();
          }}
        />
      )}
      {secili && (
        <AdayDetay
          aday={secili}
          firmaId={yonetici.firma?.id ?? null}
          gorusmeler={gorusmeler.filter((g) => g.aday_id === secili.id)}
          personeller={personeller}
          yazabilir={yazabilir}
          yazanAd={yonetici.ad}
          onKapat={() => setAdayDetay(null)}
          onDegisti={getir}
        />
      )}
    </div>
  );
}

function IlanDetay({
  ilan,
  subeAd,
  adaylar,
  gorusmeler,
  yazabilir,
  onGeri,
  onDuzenle,
  onAdayEkle,
  onAdayAc,
  onAsama,
}: {
  ilan: Ilan;
  subeAd: string;
  adaylar: Aday[];
  gorusmeler: Gorusme[];
  yazabilir: boolean;
  onGeri: () => void;
  onDuzenle: () => void;
  onAdayEkle: () => void;
  onAdayAc: (id: string) => void;
  onAsama: (a: Aday, asama: Asama) => Promise<void>;
}) {
  const [sonuclananlar, setSonuclananlar] = useState(false);
  const sutunlar: Asama[] = sonuclananlar ? ["İşe alındı", "Reddedildi", "Vazgeçti"] : ACIK_ASAMALAR;
  const gorusmeSayisi = (id: string) => gorusmeler.filter((g) => g.aday_id === id).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onGeri}>
          ← İlanlar
        </button>
        <div className="min-w-[200px] flex-1">
          <p className="baslik-font m1 text-lg">{ilan.baslik}</p>
          <p className="m3 text-xs">
            {subeAd}
            {ilan.departman ? ` · ${ilan.departman}` : ""} · {ilan.kadro} kişilik kadro · {kisaTarih(ilan.acilis)} açıldı
          </p>
        </div>
        <Rozet ton={ilan.durum === "Açık" ? "giris" : ilan.durum === "Beklemede" ? "uyari" : "notr"}>{ilan.durum}</Rozet>
        {yazabilir && (
          <>
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onDuzenle}>
              <Ikon ad="kalem" boyut={15} />
              İlan
            </button>
            <button type="button" className="btn btn-ana" onClick={onAdayEkle}>
              <Ikon ad="arti" boyut={16} />
              Aday ekle
            </button>
          </>
        )}
      </div>
      {ilan.aciklama && <p className="m2 whitespace-pre-wrap text-sm">{ilan.aciklama}</p>}

      <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: 320, maxWidth: "100%" }} role="tablist" aria-label="Aday görünümü">
        <button type="button" role="tab" aria-selected={!sonuclananlar} data-aktif={!sonuclananlar} onClick={() => setSonuclananlar(false)}>
          Süreçte ({adaylar.filter((a) => ACIK_ASAMALAR.includes(a.asama)).length})
        </button>
        <button type="button" role="tab" aria-selected={sonuclananlar} data-aktif={sonuclananlar} onClick={() => setSonuclananlar(true)}>
          Sonuçlanan ({adaylar.filter((a) => !ACIK_ASAMALAR.includes(a.asama)).length})
        </button>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${sutunlar.length}, minmax(220px, 1fr))` }}>
          {sutunlar.map((s) => {
            const liste = adaylar.filter((a) => a.asama === s);
            return (
              <div key={s} className="panel p-3">
                <p className="m1 mb-2 flex items-center justify-between text-sm font-semibold">
                  {s}
                  <span className="m3 sayi text-xs">{liste.length}</span>
                </p>
                <ul className="space-y-2">
                  {liste.map((a) => {
                    const i = ACIK_ASAMALAR.indexOf(a.asama);
                    return (
                      <li key={a.id} className="rounded-lg border p-2" style={{ borderColor: "var(--cizgi, #e5e7eb)" }}>
                        <button type="button" className="block w-full text-left" onClick={() => onAdayAc(a.id)}>
                          <span className="m1 block text-sm font-medium">
                            {a.ad} {a.soyad}
                          </span>
                          <span className="m3 block text-xs">
                            {kisaTarih(a.basvuru)}
                            {a.kaynak ? ` · ${a.kaynak}` : ""}
                            {a.puan ? ` · ${"★".repeat(a.puan)}` : ""}
                            {gorusmeSayisi(a.id) ? ` · ${gorusmeSayisi(a.id)} görüşme` : ""}
                            {a.cv_yolu ? " · CV" : ""}
                          </span>
                        </button>
                        {yazabilir && i >= 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {i < ACIK_ASAMALAR.length - 1 && (
                              <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => onAsama(a, ACIK_ASAMALAR[i + 1])}>
                                {ACIK_ASAMALAR[i + 1]} →
                              </button>
                            )}
                            {a.asama === "Teklif" && (
                              <button type="button" className="btn btn-ana btn-kucuk" onClick={() => onAsama(a, "İşe alındı")}>
                                İşe alındı
                              </button>
                            )}
                            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => onAsama(a, "Reddedildi")}>
                              Reddet
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {liste.length === 0 && <li className="m3 text-xs">Aday yok</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IlanFormu({
  ilan,
  subeler,
  genel,
  onKapat,
  onKayit,
  onSil,
}: {
  ilan: Ilan | null;
  subeler: Sube[];
  genel: boolean;
  onKapat: () => void;
  onKayit: (id: string) => Promise<void>;
  onSil?: () => void;
}) {
  const { bildir } = useBildirim();
  const [baslik, setBaslik] = useState(ilan?.baslik ?? "");
  const [subeId, setSubeId] = useState(ilan ? ilan.sube_id ?? "" : genel ? "" : subeler[0]?.id ?? "");
  const [departman, setDepartman] = useState(ilan?.departman ?? "");
  const [kadro, setKadro] = useState(String(ilan?.kadro ?? 1));
  const [aciklama, setAciklama] = useState(ilan?.aciklama ?? "");
  const [durum, setDurum] = useState<Ilan["durum"]>(ilan?.durum ?? "Açık");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!baslik.trim()) return bildir("Pozisyon adını yazın.", "hata");
    if (!genel && !subeId) return bildir("Şube seçin.", "hata");
    const k = Number(kadro);
    if (!Number.isInteger(k) || k < 1) return bildir("Kadro en az 1 olmalı.", "hata");
    setYukleniyor(true);
    const alanlar = {
      baslik: baslik.trim(),
      sube_id: subeId || null,
      departman: departman.trim() || null,
      kadro: k,
      aciklama: aciklama.trim() || null,
      durum,
      kapanis: durum === "Kapandı" ? ilan?.kapanis ?? yerelTarih() : null,
    };
    const sonuc = ilan
      ? await supabase.from("ise_alim_ilanlari").update(alanlar).eq("id", ilan.id).select("id").single()
      : await supabase.from("ise_alim_ilanlari").insert(alanlar).select("id").single();
    setYukleniyor(false);
    if (sonuc.error) return bildir(hataYaz(sonuc.error), "hata");
    bildir("İlan kaydedildi.", "basari");
    await onKayit(sonuc.data.id);
  }

  return (
    <Modal onKapat={onKapat} baslik={ilan ? "İlanı düzenle" : "Yeni ilan"}>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="iBaslik">
            Pozisyon
          </label>
          <input id="iBaslik" className="girdi" required maxLength={150} placeholder="ör. Satış danışmanı" value={baslik} onChange={(e) => setBaslik(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="etiket" htmlFor="iSube">
              Şube
            </label>
            <select id="iSube" className="girdi" value={subeId} onChange={(e) => setSubeId(e.target.value)}>
              {genel && <option value="">Firma geneli</option>}
              {subeler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiket" htmlFor="iDepartman">
              Departman
            </label>
            <input id="iDepartman" className="girdi" maxLength={100} value={departman} onChange={(e) => setDepartman(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="iKadro">
              Kadro
            </label>
            <input id="iKadro" className="girdi sayi" type="number" min={1} max={500} value={kadro} onChange={(e) => setKadro(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="iAciklama">
            Açıklama / aranan nitelikler
          </label>
          <textarea id="iAciklama" className="girdi" rows={4} maxLength={3000} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
        </div>
        {ilan && (
          <div>
            <label className="etiket" htmlFor="iDurum">
              Durum
            </label>
            <select id="iDurum" className="girdi" value={durum} onChange={(e) => setDurum(e.target.value as Ilan["durum"])}>
              <option>Açık</option>
              <option>Beklemede</option>
              <option>Kapandı</option>
            </select>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {onSil && (
            <button type="button" className="btn btn-hayalet mr-auto" onClick={onSil}>
              <Ikon ad="cop" boyut={15} />
              Sil
            </button>
          )}
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

/** CV'yi <firma>/<ilan>/<rastgele>.<uzantı> yoluna yükler; yolu döner */
async function cvYukle(firmaId: string | null, ilanId: string, dosya: File): Promise<string> {
  const uzanti = CV_TURLERI[dosya.type];
  if (!uzanti) throw new Error("CV yalnızca PDF, Word ya da resim olabilir.");
  if (dosya.size > 10 * 1024 * 1024) throw new Error("CV en fazla 10 MB olabilir.");
  if (!firmaId) throw new Error("Firma bilgisi okunamadı; sayfayı yenileyin.");
  const yol = `${firmaId}/${ilanId}/${crypto.randomUUID()}.${uzanti}`;
  const { error } = await supabase.storage.from(CV_KOVASI).upload(yol, dosya, { contentType: dosya.type, upsert: false });
  if (error) throw error;
  return yol;
}

function AdayFormu({ ilan, firmaId, onKapat, onKayit }: { ilan: Ilan; firmaId: string | null; onKapat: () => void; onKayit: () => Promise<void> }) {
  const { bildir } = useBildirim();
  const [ad, setAd] = useState("");
  const [soyad, setSoyad] = useState("");
  const [telefon, setTelefon] = useState("");
  const [eposta, setEposta] = useState("");
  const [kaynak, setKaynak] = useState<string>("");
  const [basvuru, setBasvuru] = useState(yerelTarih());
  const [notlar, setNotlar] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const dosyaRef = useRef<HTMLInputElement>(null);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!ad.trim() || !soyad.trim()) return bildir("Ad ve soyad gerekli.", "hata");
    if (!kvkk) return bildir("Adaydan KVKK aydınlatması yapılıp onayı alınmalı.", "hata");
    setYukleniyor(true);
    let yol: string | null = null;
    try {
      const dosya = dosyaRef.current?.files?.[0];
      if (dosya) yol = await cvYukle(firmaId, ilan.id, dosya);
      const { error } = await supabase.from("adaylar").insert({
        ilan_id: ilan.id,
        ad: ad.trim(),
        soyad: soyad.trim(),
        telefon: telefon.trim() || null,
        eposta: eposta.trim() || null,
        kaynak: kaynak || null,
        basvuru,
        notlar: notlar.trim() || null,
        kvkk_onay: true,
        cv_yolu: yol,
      });
      if (error) throw error;
      bildir("Aday eklendi.", "basari");
      await onKayit();
    } catch (err) {
      if (yol) await supabase.storage.from(CV_KOVASI).remove([yol]);
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={`Aday ekle · ${ilan.baslik}`}>
      <form onSubmit={kaydet} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiket" htmlFor="aAd">
              Ad
            </label>
            <input id="aAd" className="girdi" required maxLength={100} value={ad} onChange={(e) => setAd(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="aSoyad">
              Soyad
            </label>
            <input id="aSoyad" className="girdi" required maxLength={100} value={soyad} onChange={(e) => setSoyad(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="aTel">
              Telefon
            </label>
            <input id="aTel" className="girdi sayi" type="tel" maxLength={30} value={telefon} onChange={(e) => setTelefon(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="aEposta">
              E-posta
            </label>
            <input id="aEposta" className="girdi" type="email" maxLength={150} value={eposta} onChange={(e) => setEposta(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="aKaynak">
              Kaynak
            </label>
            <select id="aKaynak" className="girdi" value={kaynak} onChange={(e) => setKaynak(e.target.value)}>
              <option value="">Seçin</option>
              {KAYNAKLAR.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiket" htmlFor="aBasvuru">
              Başvuru tarihi
            </label>
            <input id="aBasvuru" className="girdi sayi" type="date" value={basvuru} onChange={(e) => setBasvuru(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="aCv">
            CV (PDF, Word, resim · en fazla 10 MB)
          </label>
          <input id="aCv" ref={dosyaRef} className="girdi" type="file" accept={Object.keys(CV_TURLERI).join(",")} />
        </div>
        <div>
          <label className="etiket" htmlFor="aNot">
            Not
          </label>
          <textarea id="aNot" className="girdi" rows={2} maxLength={2000} value={notlar} onChange={(e) => setNotlar(e.target.value)} />
        </div>
        <label className="m1 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
          Adaya KVKK aydınlatma metni sunuldu; kişisel verilerinin işe alım süreci için işlenmesine onay verdi.
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

function AdayDetay({
  aday: a,
  firmaId,
  gorusmeler,
  personeller,
  yazabilir,
  yazanAd,
  onKapat,
  onDegisti,
}: {
  aday: Aday;
  firmaId: string | null;
  gorusmeler: Gorusme[];
  personeller: Personel[];
  yazabilir: boolean;
  yazanAd: string | null;
  onKapat: () => void;
  onDegisti: () => Promise<void>;
}) {
  const { bildir, onayla } = useBildirim();
  const [asama, setAsama] = useState<Asama>(a.asama);
  const [puan, setPuan] = useState<number | null>(a.puan);
  const [notlar, setNotlar] = useState(a.notlar ?? "");
  const [personelId, setPersonelId] = useState(a.personel_id ?? "");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [gTarih, setGTarih] = useState(`${yerelTarih()}T10:00`);
  const [gTur, setGTur] = useState<Gorusme["tur"]>("Yüz yüze");
  const [gKisi, setGKisi] = useState(yazanAd ?? "");
  const [gPuan, setGPuan] = useState<number | null>(null);
  const [gNot, setGNot] = useState("");
  const cvRef = useRef<HTMLInputElement>(null);

  // İşe alınan aday bağlanacak personel: adı soyadı uyanlar önce
  const adayAdi = `${a.ad} ${a.soyad}`.toLocaleLowerCase("tr");
  const personelSecenek = [...personeller].sort((x, y) => {
    const xa = `${x.ad} ${x.soyad}`.toLocaleLowerCase("tr") === adayAdi ? 0 : 1;
    const ya = `${y.ad} ${y.soyad}`.toLocaleLowerCase("tr") === adayAdi ? 0 : 1;
    return xa - ya || `${x.ad} ${x.soyad}`.localeCompare(`${y.ad} ${y.soyad}`, "tr");
  });

  async function kaydet() {
    setYukleniyor(true);
    const { error } = await supabase
      .from("adaylar")
      .update({ asama, puan, notlar: notlar.trim() || null, personel_id: asama === "İşe alındı" ? personelId || null : null })
      .eq("id", a.id);
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Aday güncellendi.", "basari");
    await onDegisti();
  }

  async function gorusmeEkle(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("aday_gorusmeleri").insert({
      aday_id: a.id,
      tarih: new Date(gTarih).toISOString(),
      tur: gTur,
      gorusmeci: gKisi.trim() || null,
      puan: gPuan,
      notlar: gNot.trim() || null,
    });
    if (error) return bildir(hataYaz(error), "hata");
    setGNot("");
    setGPuan(null);
    bildir("Görüşme eklendi.", "basari");
    await onDegisti();
  }

  async function gorusmeSil(g: Gorusme) {
    const { error } = await supabase.from("aday_gorusmeleri").delete().eq("id", g.id);
    if (error) return bildir(hataYaz(error), "hata");
    await onDegisti();
  }

  async function cvAc() {
    if (!a.cv_yolu) return;
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(CV_KOVASI).createSignedUrl(a.cv_yolu, 60);
    if (error || !data) {
      pencere?.close();
      return bildir(hataYaz(error ?? "CV açılamadı."), "hata");
    }
    if (pencere) pencere.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }

  async function cvDegistir() {
    const dosya = cvRef.current?.files?.[0];
    if (!dosya) return;
    try {
      const yol = await cvYukle(firmaId, a.ilan_id, dosya);
      const { error } = await supabase.from("adaylar").update({ cv_yolu: yol }).eq("id", a.id);
      if (error) {
        await supabase.storage.from(CV_KOVASI).remove([yol]);
        throw error;
      }
      if (a.cv_yolu) await supabase.storage.from(CV_KOVASI).remove([a.cv_yolu]);
      bildir("CV yüklendi.", "basari");
      await onDegisti();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  async function sil() {
    const tamam = await onayla({
      baslik: `${a.ad} ${a.soyad} silinsin mi?`,
      metin: "Adayın bilgileri, görüşmeleri ve CV'si kalıcı olarak silinir.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("adaylar").delete().eq("id", a.id);
    if (error) return bildir(hataYaz(error), "hata");
    if (a.cv_yolu) await supabase.storage.from(CV_KOVASI).remove([a.cv_yolu]);
    onKapat();
    await onDegisti();
  }

  const yildizlar = (deger: number | null, set: (n: number | null) => void, etiket: string) => (
    <div className="flex gap-1" role="radiogroup" aria-label={etiket}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={deger === n}
          disabled={!yazabilir}
          className={`btn btn-kucuk ${deger != null && n <= deger ? "btn-ana" : "btn-hayalet"}`}
          style={{ minWidth: 32 }}
          onClick={() => set(deger === n ? null : n)}
        >
          ★
        </button>
      ))}
    </div>
  );

  return (
    <Modal onKapat={onKapat} baslik={`${a.ad} ${a.soyad}`} genis>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 text-sm">
          <Rozet ton={ASAMA_TONU[a.asama]}>{a.asama}</Rozet>
          <Rozet>{kisaTarih(a.basvuru)} başvuru</Rozet>
          {a.kaynak && <Rozet>{a.kaynak}</Rozet>}
          {a.kvkk_onay && <Rozet ton="giris">KVKK onayı var</Rozet>}
        </div>
        <div className="m2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {a.telefon && (
            <a className="m1 sayi" href={`tel:${a.telefon}`}>
              {a.telefon}
            </a>
          )}
          {a.eposta && (
            <a className="m1" href={`mailto:${a.eposta}`}>
              {a.eposta}
            </a>
          )}
          {a.cv_yolu ? (
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={cvAc}>
              <Ikon ad="goz" boyut={15} />
              CV&apos;yi aç
            </button>
          ) : (
            <span className="m3">CV yok</span>
          )}
          {yazabilir && (
            <label className="btn btn-hayalet btn-kucuk cursor-pointer">
              <Ikon ad="indir" boyut={15} />
              {a.cv_yolu ? "CV değiştir" : "CV yükle"}
              <input ref={cvRef} type="file" className="hidden" accept={Object.keys(CV_TURLERI).join(",")} onChange={cvDegistir} />
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket" htmlFor="dAsama">
              Aşama
            </label>
            <select id="dAsama" className="girdi" value={asama} disabled={!yazabilir} onChange={(e) => setAsama(e.target.value as Asama)}>
              {ASAMALAR.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="etiket">Genel puan</p>
            {yildizlar(puan, setPuan, "Genel puan")}
          </div>
          {asama === "İşe alındı" && (
            <div className="sm:col-span-2">
              <label className="etiket" htmlFor="dPersonel">
                Personel kaydı
              </label>
              <select id="dPersonel" className="girdi" value={personelId} disabled={!yazabilir} onChange={(e) => setPersonelId(e.target.value)}>
                <option value="">Henüz bağlanmadı</option>
                {personelSecenek.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ad} {p.soyad} ({p.sicil_no})
                  </option>
                ))}
              </select>
              <p className="m3 mt-1 text-xs">
                Önce Personel sekmesinden &quot;Ekle → Personel&quot; ile kaydı açın, sonra burada bağlayın. İşe başlama kontrol listesi İK → Giriş / çıkış&apos;ta önerilir.
              </p>
            </div>
          )}
        </div>
        <div>
          <label className="etiket" htmlFor="dNot">
            Notlar
          </label>
          <textarea id="dNot" className="girdi" rows={3} maxLength={2000} disabled={!yazabilir} value={notlar} onChange={(e) => setNotlar(e.target.value)} />
        </div>
        {yazabilir && (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-hayalet mr-auto" onClick={sil}>
              <Ikon ad="cop" boyut={15} />
              Adayı sil
            </button>
            <button type="button" className="btn btn-ana" disabled={yukleniyor} onClick={kaydet}>
              {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        )}

        <div>
          <p className="baslik-font m1 mb-2 text-base">Görüşmeler</p>
          <ul className="panel liste overflow-hidden">
            {gorusmeler.map((g) => (
              <li key={g.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="m1 font-medium">
                    {kisaTarih(yerelTarih(g.tarih))} {yerelSaat(g.tarih)} · {g.tur}
                    {g.gorusmeci ? ` · ${g.gorusmeci}` : ""}
                    {g.puan ? ` · ${"★".repeat(g.puan)}` : ""}
                  </p>
                  {g.notlar && <p className="m2 whitespace-pre-wrap text-xs">{g.notlar}</p>}
                </div>
                {yazabilir && (
                  <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => gorusmeSil(g)} aria-label="Görüşmeyi sil">
                    <Ikon ad="cop" boyut={14} />
                  </button>
                )}
              </li>
            ))}
            {gorusmeler.length === 0 && <li className="m3 px-4 py-3 text-sm">Henüz görüşme yok.</li>}
          </ul>
          {yazabilir && (
            <form onSubmit={gorusmeEkle} className="panel mt-3 grid gap-3 p-3 sm:grid-cols-2">
              <input className="girdi sayi" type="datetime-local" required value={gTarih} onChange={(e) => setGTarih(e.target.value)} aria-label="Görüşme zamanı" />
              <select className="girdi" value={gTur} onChange={(e) => setGTur(e.target.value as Gorusme["tur"])} aria-label="Görüşme türü">
                <option>Yüz yüze</option>
                <option>Telefon</option>
                <option>Online</option>
              </select>
              <input className="girdi" maxLength={150} placeholder="Görüşmeci" value={gKisi} onChange={(e) => setGKisi(e.target.value)} aria-label="Görüşmeci" />
              {yildizlar(gPuan, setGPuan, "Görüşme puanı")}
              <textarea className="girdi sm:col-span-2" rows={2} maxLength={2000} placeholder="Görüşme notu" value={gNot} onChange={(e) => setGNot(e.target.value)} aria-label="Görüşme notu" />
              <button type="submit" className="btn btn-ikincil btn-kucuk sm:col-span-2 justify-self-end">
                <Ikon ad="arti" boyut={15} />
                Görüşme ekle
              </button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
