"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type Sube, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelSaat, yerelTarih } from "../../../lib/tarih";
import { olayBildir } from "../../../lib/bildirim";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

interface Duyuru {
  id: string;
  sube_id: string | null;
  baslik: string;
  metin: string;
  onemli: boolean;
  bitis_tarihi: string | null;
  yazan_ad: string | null;
  created_at: string;
}

interface Okuma {
  duyuru_id: string;
  personel_id: string;
  okundu: string;
}

/** Duyurunun hedeflediği, bugün çalışan personel */
function hedefPersonel(d: Pick<Duyuru, "sube_id">, personeller: Personel[]): Personel[] {
  const bugun = yerelTarih();
  return personeller.filter(
    (p) => p.aktif && (!p.cikis_tarihi || p.cikis_tarihi >= bugun) && (!d.sube_id || p.varsayilan_sube_id === d.sube_id)
  );
}

export default function DuyurularSekmesi({
  personeller,
  subeler,
  yonetici,
}: {
  personeller: Personel[];
  subeler: Sube[];
  yonetici: YoneticiBilgisi;
}) {
  const { bildir, onayla } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]);
  const [okumalar, setOkumalar] = useState<Okuma[]>([]);
  const [form, setForm] = useState<Duyuru | "yeni" | null>(null);
  const [detay, setDetay] = useState<Duyuru | null>(null);

  // Şube müdürü yalnızca kendi şubelerine duyuru yazar
  const yazilabilirSubeler = genel ? subeler : subeler.filter((s) => yonetici.subeler.includes(s.id));
  const subeAdi = useMemo(() => new Map(subeler.map((s) => [s.id, s.ad])), [subeler]);

  const getir = useCallback(
    () =>
      Promise.all([
        supabase.from("duyurular").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("duyuru_okumalar").select("duyuru_id, personel_id, okundu"),
      ]).then(([d, o]) => {
        const hata = d.error ?? o.error;
        if (hata) {
          setDurum(kurulmamis(hata, "duyuru") ? "kurulmamis" : "hazir");
          if (!kurulmamis(hata, "duyuru")) bildir(hataYaz(hata), "hata");
          return;
        }
        setDuyurular((d.data ?? []) as Duyuru[]);
        setOkumalar((o.data ?? []) as Okuma[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  const okuyanlar = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const o of okumalar) {
      if (!m.has(o.duyuru_id)) m.set(o.duyuru_id, new Map());
      m.get(o.duyuru_id)!.set(o.personel_id, o.okundu);
    }
    return m;
  }, [okumalar]);

  function duzenlenebilir(d: Duyuru) {
    return genel || (!!d.sube_id && yonetici.subeler.includes(d.sube_id));
  }

  async function sil(d: Duyuru) {
    const tamam = await onayla({
      baslik: `"${d.baslik}" silinsin mi?`,
      metin: "Duyuru personelin telefonundan da kalkar; okuma kayıtları silinir.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("duyurular").delete().eq("id", d.id);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Duyuru silindi.", "basari");
    setDetay(null);
    await getir();
  }

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-17_duyurular.sql" />;

  const bugun = yerelTarih();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m2 max-w-xl text-sm">
          Duyurular personelin telefonunda en üstte görünür; personel &quot;Okudum&quot; dediğinde burada işaretlenir.
        </p>
        {yazilabilirSubeler.length + (genel ? 1 : 0) > 0 && (
          <button type="button" className="btn btn-ana" onClick={() => setForm("yeni")}>
            <Ikon ad="arti" boyut={16} />
            Yeni duyuru
          </button>
        )}
      </div>

      <div className="panel overflow-hidden">
        {durum === "yukleniyor" ? (
          <div className="space-y-3 p-5">
            <Iskelet genislik="60%" />
            <Iskelet genislik="80%" />
            <Iskelet genislik="40%" />
          </div>
        ) : duyurular.length === 0 ? (
          <Bos ikon="bilgi" baslik="Henüz duyuru yok" metin="Toplantı, maaş günü, kural değişikliği gibi haberleri buradan bütün personele iletin." />
        ) : (
          <ul className="liste">
            {duyurular.map((d) => {
              const hedef = hedefPersonel(d, personeller);
              const okuyan = hedef.filter((p) => okuyanlar.get(d.id)?.has(p.id)).length;
              const bitti = !!d.bitis_tarihi && d.bitis_tarihi < bugun;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left"
                    onClick={() => setDetay(d)}
                  >
                    <span className="min-w-[220px] flex-1">
                      <span className="m1 block font-semibold">{d.baslik}</span>
                      <span className="m3 block text-xs">
                        {kisaTarih(yerelTarih(d.created_at))} {yerelSaat(d.created_at)}
                        {d.yazan_ad ? ` · ${d.yazan_ad}` : ""}
                        {d.bitis_tarihi ? ` · ${kisaTarih(d.bitis_tarihi)} tarihine kadar` : ""}
                      </span>
                    </span>
                    {d.onemli && <Rozet ton="hata">Önemli</Rozet>}
                    {bitti && <Rozet ton="notr">Süresi doldu</Rozet>}
                    <Rozet ton="izin">{d.sube_id ? subeAdi.get(d.sube_id) ?? "Şube" : "Tüm firma"}</Rozet>
                    <span className="sayi m2 w-24 text-right text-sm">
                      {okuyan}/{hedef.length} okudu
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detay && (
        <DuyuruDetay
          duyuru={detay}
          hedef={hedefPersonel(detay, personeller)}
          okuyanlar={okuyanlar.get(detay.id) ?? new Map()}
          subeAd={detay.sube_id ? subeAdi.get(detay.sube_id) ?? "Şube" : "Tüm firma"}
          duzenlenebilir={duzenlenebilir(detay)}
          onKapat={() => setDetay(null)}
          onDuzenle={() => {
            setForm(detay);
            setDetay(null);
          }}
          onSil={() => sil(detay)}
        />
      )}

      {form && (
        <DuyuruFormu
          duyuru={form === "yeni" ? null : form}
          genel={genel}
          subeler={yazilabilirSubeler}
          yazanAd={yonetici.ad}
          onKapat={() => setForm(null)}
          onKayit={async () => {
            setForm(null);
            await getir();
          }}
        />
      )}
    </div>
  );
}

function DuyuruDetay({
  duyuru: d,
  hedef,
  okuyanlar,
  subeAd,
  duzenlenebilir,
  onKapat,
  onDuzenle,
  onSil,
}: {
  duyuru: Duyuru;
  hedef: Personel[];
  okuyanlar: Map<string, string>;
  subeAd: string;
  duzenlenebilir: boolean;
  onKapat: () => void;
  onDuzenle: () => void;
  onSil: () => void;
}) {
  const okuyan = hedef.filter((p) => okuyanlar.has(p.id)).sort((a, b) => okuyanlar.get(a.id)!.localeCompare(okuyanlar.get(b.id)!));
  const okumayan = hedef.filter((p) => !okuyanlar.has(p.id)).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return (
    <Modal onKapat={onKapat} baslik={d.baslik} genis>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {d.onemli && <Rozet ton="hata">Önemli</Rozet>}
          <Rozet ton="izin">{subeAd}</Rozet>
          <Rozet>
            {kisaTarih(yerelTarih(d.created_at))} {yerelSaat(d.created_at)}
          </Rozet>
          {d.bitis_tarihi && <Rozet>{kisaTarih(d.bitis_tarihi)} tarihine kadar</Rozet>}
        </div>
        <p className="m1 whitespace-pre-wrap text-sm leading-relaxed">{d.metin}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="etiket">Okuyanlar ({okuyan.length})</p>
            <ul className="space-y-1 text-sm">
              {okuyan.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="m1">
                    {p.ad} {p.soyad}
                  </span>
                  <span className="m3 sayi text-xs">
                    {kisaTarih(yerelTarih(okuyanlar.get(p.id)!))} {yerelSaat(okuyanlar.get(p.id)!)}
                  </span>
                </li>
              ))}
              {okuyan.length === 0 && <li className="m3">Henüz okuyan yok.</li>}
            </ul>
          </div>
          <div>
            <p className="etiket">Okumayanlar ({okumayan.length})</p>
            <ul className="space-y-1 text-sm">
              {okumayan.map((p) => (
                <li key={p.id} className="m2">
                  {p.ad} {p.soyad}
                </li>
              ))}
              {okumayan.length === 0 && <li className="m3">Herkes okudu.</li>}
            </ul>
          </div>
        </div>

        {duzenlenebilir && (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-hayalet" onClick={onSil}>
              <Ikon ad="cop" boyut={15} />
              Sil
            </button>
            <button type="button" className="btn btn-ikincil" onClick={onDuzenle}>
              <Ikon ad="kalem" boyut={15} />
              Düzenle
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DuyuruFormu({
  duyuru,
  genel,
  subeler,
  yazanAd,
  onKapat,
  onKayit,
}: {
  duyuru: Duyuru | null;
  genel: boolean;
  subeler: Sube[];
  yazanAd: string | null;
  onKapat: () => void;
  onKayit: () => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [baslik, setBaslik] = useState(duyuru?.baslik ?? "");
  const [metin, setMetin] = useState(duyuru?.metin ?? "");
  const [subeId, setSubeId] = useState(duyuru ? duyuru.sube_id ?? "" : genel ? "" : subeler[0]?.id ?? "");
  const [onemli, setOnemli] = useState(duyuru?.onemli ?? false);
  const [bitis, setBitis] = useState(duyuru?.bitis_tarihi ?? "");
  const [bildirimGonder, setBildirimGonder] = useState(!duyuru);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!baslik.trim() || !metin.trim()) return bildir("Başlık ve metin boş olamaz.", "hata");
    if (!genel && !subeId) return bildir("Şube seçin.", "hata");
    if (bitis && bitis < yerelTarih()) return bildir("Bitiş tarihi geçmişte olamaz.", "hata");
    setYukleniyor(true);
    try {
      const alanlar = {
        baslik: baslik.trim(),
        metin: metin.trim(),
        sube_id: subeId || null,
        onemli,
        bitis_tarihi: bitis || null,
      };
      if (duyuru) {
        const { error } = await supabase.from("duyurular").update(alanlar).eq("id", duyuru.id);
        if (error) throw error;
        bildir("Duyuru güncellendi.", "basari");
      } else {
        const { data, error } = await supabase
          .from("duyurular")
          .insert({ ...alanlar, yazan_ad: yazanAd })
          .select("id")
          .single();
        if (error) throw error;
        if (bildirimGonder) {
          const { data: o } = await supabase.auth.getSession();
          olayBildir({ olay: "duyuru", duyuru_id: data.id }, o.session?.access_token);
        }
        bildir("Duyuru yayınlandı.", "basari");
      }
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={duyuru ? "Duyuruyu düzenle" : "Yeni duyuru"}>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="duyuruBaslik">
            Başlık
          </label>
          <input
            id="duyuruBaslik"
            className="girdi"
            required
            maxLength={150}
            placeholder="ör. Maaşlar 5'inde yatacak"
            value={baslik}
            onChange={(e) => setBaslik(e.target.value)}
          />
        </div>
        <div>
          <label className="etiket" htmlFor="duyuruMetin">
            Metin
          </label>
          <textarea
            id="duyuruMetin"
            className="girdi"
            required
            rows={6}
            maxLength={4000}
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket" htmlFor="duyuruSube">
              Kime
            </label>
            <select id="duyuruSube" className="girdi" value={subeId} onChange={(e) => setSubeId(e.target.value)}>
              {genel && <option value="">Tüm firma</option>}
              {subeler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad} şubesi
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiket" htmlFor="duyuruBitis">
              Yayın bitişi (isteğe bağlı)
            </label>
            <input id="duyuruBitis" className="girdi sayi" type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
          </div>
        </div>
        <label className="m1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onemli} onChange={(e) => setOnemli(e.target.checked)} />
          Önemli (telefonda en üstte, kırmızı)
        </label>
        {!duyuru && (
          <label className="m1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bildirimGonder} onChange={(e) => setBildirimGonder(e.target.checked)} />
            Bildirimi açık telefonlara anlık bildirim gönder
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : duyuru ? "Kaydet" : "Yayınla"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
