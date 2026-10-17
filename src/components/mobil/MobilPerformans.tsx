"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { PUAN_ADLARI, puanAdi, puanYaz, type KriterPuani } from "../../lib/performans";
import { Ikon } from "../ui";

interface MobilDegerlendirme {
  id: string;
  donem: string;
  bitis: string;
  puanlar: KriterPuani[];
  ortalama: number | null;
  guclu_yonler: string | null;
  gelisim_alanlari: string | null;
  hedefler: string | null;
  genel_yorum: string | null;
  degerlendiren_ad: string | null;
  tamamlanma: string | null;
  personel_gordu: string | null;
}

/** Personelin tamamlanmış performans değerlendirmeleri; görülmemiş olan açık durur ve "Gördüm" ister */
export default function MobilPerformans({ token }: { token: string }) {
  const [liste, setListe] = useState<MobilDegerlendirme[] | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [isleniyor, setIsleniyor] = useState(false);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.rpc("mobil_performans", { p_token: token })).then(({ data, error }) => {
        if (!error) setListe((data ?? []) as MobilDegerlendirme[]);
      }),
    [token]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  async function gordum(id: string) {
    setIsleniyor(true);
    const { error } = await supabase.rpc("performans_goruldu", { p_token: token, p_id: id });
    setIsleniyor(false);
    if (!error) setListe((l) => l?.map((d) => (d.id === id ? { ...d, personel_gordu: new Date().toISOString() } : d)) ?? l);
  }

  if (!liste || liste.length === 0) return null;

  return (
    <section>
      <h2 className="baslik-font m1 mb-2 flex items-center gap-2 px-1 text-lg">
        Değerlendirmelerim
        {liste.some((d) => !d.personel_gordu) && <span className="rozet rozet-hata">yeni</span>}
      </h2>
      <ul className="panel liste overflow-hidden">
        {liste.map((d) => {
          const goster = acik === d.id || !d.personel_gordu;
          return (
            <li key={d.id}>
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={goster} onClick={() => setAcik(acik === d.id ? null : d.id)}>
                <span className="min-w-0 flex-1">
                  <span className="m1 block truncate text-sm font-semibold">{d.donem}</span>
                  <span className="m3 block text-xs">
                    {puanYaz(d.ortalama)} / 5 · {puanAdi(d.ortalama)}
                  </span>
                </span>
                <Ikon ad={goster ? "asagi" : "sag"} boyut={16} />
              </button>
              {goster && (
                <div className="space-y-3 px-4 pb-4 text-sm">
                  <ul className="space-y-1">
                    {d.puanlar.map((p) => (
                      <li key={p.kriter_id} className="flex justify-between gap-3">
                        <span className="m2">{p.ad}</span>
                        <span className="m1 sayi" title={PUAN_ADLARI[p.puan]}>
                          {p.puan}/5
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(
                    [
                      ["Güçlü yönleriniz", d.guclu_yonler],
                      ["Gelişim alanlarınız", d.gelisim_alanlari],
                      ["Hedefleriniz", d.hedefler],
                      ["Genel değerlendirme", d.genel_yorum],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([baslik, v]) => (
                      <div key={baslik}>
                        <p className="m3 text-xs font-semibold">{baslik}</p>
                        <p className="m1 whitespace-pre-wrap">{v}</p>
                      </div>
                    ))}
                  <div className="flex items-center justify-between gap-3">
                    <span className="m3 text-xs">
                      {d.degerlendiren_ad ?? ""}
                      {d.tamamlanma ? ` · ${kisaTarih(yerelTarih(d.tamamlanma))}` : ""}
                    </span>
                    {!d.personel_gordu ? (
                      <button type="button" className="btn btn-ana btn-kucuk" disabled={isleniyor} onClick={() => gordum(d.id)}>
                        <Ikon ad="tik" boyut={15} />
                        Gördüm
                      </button>
                    ) : (
                      <span className="m3 text-xs">Gördünüz</span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
