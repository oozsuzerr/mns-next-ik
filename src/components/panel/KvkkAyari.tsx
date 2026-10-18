"use client";

// KVKK aydınlatma metni (genel yönetici) ve personelin onay durumu
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, type Personel } from "../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { varsayilanKvkkMetni } from "../../lib/kvkk";
import { Ikon, Rozet, useBildirim } from "../ui";

interface Bilgi {
  metin: string | null;
  surum: number;
  firma: string;
}

export default function KvkkAyari({ personeller }: { personeller: Personel[] }) {
  const { bildir, onayla } = useBildirim();
  const [bilgi, setBilgi] = useState<Bilgi | null>(null);
  const [kurulmamis, setKurulmamis] = useState(false);
  const [onaylar, setOnaylar] = useState<Map<string, { surum: number; zaman: string }>>(new Map());
  const [metin, setMetin] = useState("");
  const [acik, setAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const yukle = useCallback(
    () =>
      Promise.all([supabase.rpc("kvkk_bilgisi"), supabase.from("kvkk_onaylari").select("personel_id, surum, onay_zamani")]).then(([b, o]) => {
        if (b.error) {
          setKurulmamis(true);
          return;
        }
        const v = b.data as Bilgi;
        setBilgi(v);
        setMetin(v.metin ?? "");
        const m = new Map<string, { surum: number; zaman: string }>();
        for (const r of (o.data ?? []) as { personel_id: string; surum: number; onay_zamani: string }[]) {
          const once = m.get(r.personel_id);
          if (!once || r.surum > once.surum) m.set(r.personel_id, { surum: r.surum, zaman: r.onay_zamani });
        }
        setOnaylar(m);
      }),
    []
  );

  useEffect(() => {
    yukle();
  }, [yukle]);

  if (kurulmamis) return null;
  if (!bilgi) return null;

  const aktifler = personeller.filter((p) => p.aktif);
  const guncel = aktifler.filter((p) => onaylar.get(p.id)?.surum === bilgi.surum);
  const eksik = aktifler.filter((p) => onaylar.get(p.id)?.surum !== bilgi.surum);
  const degisti = (metin.trim() || "") !== (bilgi.metin ?? "");

  async function kaydet() {
    const tamam = await onayla({
      baslik: "Aydınlatma metni değiştirilsin mi?",
      metin: "Metin değişince sürüm artar ve bütün personel mobil uygulamada yeni metni yeniden onaylamadan giriş/çıkış yapamaz.",
      onayEtiketi: "Kaydet",
    });
    if (!tamam) return;
    setKaydediliyor(true);
    const { error } = await supabase.rpc("kvkk_metni_kaydet", { p_metin: metin });
    setKaydediliyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Aydınlatma metni kaydedildi; personelden yeniden onay istenecek.", "basari");
    await yukle();
  }

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="baslik-font m1 flex items-center gap-2 text-lg">
          <Ikon ad="kilit" boyut={18} />
          KVKK aydınlatma metni
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Rozet ton="notr">Sürüm {bilgi.surum}</Rozet>
          <Rozet ton={eksik.length ? "uyari" : "giris"}>
            {guncel.length} / {aktifler.length} personel onayladı
          </Rozet>
        </div>
      </div>
      <p className="m2 text-sm">
        Personel mobil uygulamayı ilk açışında bu metni okuyup onaylamadan giriş/çıkış yapamaz; konum izni de onaydan sonra istenir. Kendi metninizi
        yazmazsanız uygulamanın varsayılan metni kullanılır. Metni değiştirdiğinizde herkesten yeniden onay istenir. Metni hukuk danışmanınıza kontrol
        ettirmeniz önerilir.
      </p>
      <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setAcik(!acik)} aria-expanded={acik}>
        {acik ? "Metni gizle" : bilgi.metin ? "Firma metnini göster / düzenle" : "Varsayılan metni göster / kendi metnini yaz"}
      </button>
      {acik && (
        <div className="space-y-2">
          <textarea
            className="girdi text-sm"
            rows={14}
            maxLength={20000}
            placeholder={varsayilanKvkkMetni(bilgi.firma)}
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            aria-label="Aydınlatma metni"
          />
          <p className="ipucu">Boş bırakırsanız gri görünen varsayılan metin kullanılır.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {!metin && (
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setMetin(varsayilanKvkkMetni(bilgi.firma))}>
                Varsayılan metinden başla
              </button>
            )}
            <button type="button" className="btn btn-ana btn-kucuk" disabled={!degisti || kaydediliyor} onClick={kaydet}>
              {kaydediliyor ? "Kaydediliyor..." : "Kaydet (yeni sürüm)"}
            </button>
          </div>
        </div>
      )}
      {eksik.length > 0 && (
        <details>
          <summary className="m2 cursor-pointer text-sm">Henüz onaylamayan {eksik.length} personel</summary>
          <ul className="m2 mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {eksik.map((p) => {
              const o = onaylar.get(p.id);
              return (
                <li key={p.id}>
                  {p.ad} {p.soyad} <span className="m3 text-xs">{o ? `(sürüm ${o.surum}, ${kisaTarih(yerelTarih(o.zaman))})` : "(hiç onaylamadı)"}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
