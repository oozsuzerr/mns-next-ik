"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { Ikon } from "../ui";

interface MobilDuyuru {
  id: string;
  baslik: string;
  metin: string;
  onemli: boolean;
  created_at: string;
  yazan_ad: string | null;
  sube_ad: string | null;
  okundu: boolean;
}

/**
 * Personelin telefonundaki duyurular: okunmamışlar açık durur ve "Okudum" ister,
 * okunanlar başlık olarak kalır. Veritabanında duyuru bölümü kurulu değilse hiçbir şey göstermez.
 */
export default function MobilDuyurular({ token }: { token: string }) {
  const [duyurular, setDuyurular] = useState<MobilDuyuru[] | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [hepsi, setHepsi] = useState(false);
  const [isleniyor, setIsleniyor] = useState<string | null>(null);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.rpc("mobil_duyurular", { p_token: token })).then(({ data, error }) => {
        if (!error) setDuyurular((data ?? []) as MobilDuyuru[]);
      }),
    [token]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  async function okudum(id: string) {
    setIsleniyor(id);
    const { error } = await supabase.rpc("duyuru_okundu", { p_token: token, p_duyuru_id: id });
    setIsleniyor(null);
    if (!error) setDuyurular((l) => l?.map((d) => (d.id === id ? { ...d, okundu: true } : d)) ?? l);
  }

  if (!duyurular || duyurular.length === 0) return null;

  const okunmamis = duyurular.filter((d) => !d.okundu);
  const okunan = duyurular.filter((d) => d.okundu);
  const gorunenOkunan = hepsi ? okunan : okunan.slice(0, 3);

  return (
    <section>
      <h2 className="baslik-font m1 mb-2 flex items-center gap-2 px-1 text-lg">
        Duyurular
        {okunmamis.length > 0 && <span className="rozet rozet-hata">{okunmamis.length} yeni</span>}
      </h2>
      <div className="space-y-3">
        {okunmamis.map((d) => (
          <article
            key={d.id}
            className="panel p-4"
            style={d.onemli ? { borderColor: "var(--hata)", background: "var(--hata-acik)" } : undefined}
          >
            <p className="m1 flex items-start gap-2 font-semibold">
              {d.onemli && <Ikon ad="uyari" boyut={18} className="mt-0.5 flex-none" />}
              <span>{d.baslik}</span>
            </p>
            <p className="m1 mt-2 whitespace-pre-wrap text-sm leading-relaxed">{d.metin}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="m3 text-xs">
                {kisaTarih(yerelTarih(d.created_at))}
                {d.yazan_ad ? ` · ${d.yazan_ad}` : ""}
              </span>
              <button type="button" className="btn btn-ana btn-kucuk" disabled={isleniyor === d.id} onClick={() => okudum(d.id)}>
                <Ikon ad="tik" boyut={15} />
                Okudum
              </button>
            </div>
          </article>
        ))}

        {gorunenOkunan.length > 0 && (
          <ul className="panel liste overflow-hidden">
            {gorunenOkunan.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={acik === d.id}
                  onClick={() => setAcik(acik === d.id ? null : d.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="m1 block truncate text-sm font-semibold">{d.baslik}</span>
                    <span className="m3 block text-xs">{kisaTarih(yerelTarih(d.created_at))}</span>
                  </span>
                  <Ikon ad={acik === d.id ? "asagi" : "sag"} boyut={16} />
                </button>
                {acik === d.id && <p className="m2 whitespace-pre-wrap px-4 pb-3 text-sm leading-relaxed">{d.metin}</p>}
              </li>
            ))}
          </ul>
        )}
        {okunan.length > 3 && (
          <button type="button" className="btn btn-hayalet btn-kucuk w-full" onClick={() => setHepsi(!hepsi)}>
            {hepsi ? "Daha az göster" : `Eski duyurular (${okunan.length - 3})`}
          </button>
        )}
      </div>
    </section>
  );
}
