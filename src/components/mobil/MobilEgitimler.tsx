"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { gunEkle } from "../../lib/vardiyaPlani";
import { egitimDurumu } from "../../lib/egitim";

interface MobilEgitim {
  id: string;
  ad: string;
  kategori: string;
  tarih: string;
  sure_saat: number | null;
  gecerlilik_bitis: string | null;
}

/** Personelin aldığı eğitimler (her türün en sonu) ve geçerlilikleri. Kayıt yoksa hiçbir şey göstermez. */
export default function MobilEgitimler({ token }: { token: string }) {
  const [liste, setListe] = useState<MobilEgitim[] | null>(null);

  useEffect(() => {
    Promise.resolve(supabase.rpc("mobil_egitimler", { p_token: token })).then(({ data, error }) => {
      if (!error) setListe((data ?? []) as MobilEgitim[]);
    });
  }, [token]);

  if (!liste || liste.length === 0) return null;
  const bugun = yerelTarih();
  const yaklasma = gunEkle(bugun, 30);

  return (
    <section>
      <h2 className="baslik-font m1 mb-2 px-1 text-lg">Eğitimlerim</h2>
      <ul className="panel liste overflow-hidden">
        {liste.map((e) => {
          const d = egitimDurumu(e, bugun, yaklasma);
          return (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="m1 block truncate text-sm font-semibold">{e.ad}</span>
                <span className="m3 block text-xs">
                  {kisaTarih(e.tarih)}
                  {e.sure_saat ? ` · ${String(e.sure_saat).replace(".", ",")} saat` : ""}
                </span>
              </span>
              <span className={`rozet ${d === "doldu" ? "rozet-hata" : d === "yaklasiyor" ? "rozet-uyari" : "rozet-giris"}`}>
                {e.gecerlilik_bitis ? (d === "doldu" ? "Süresi doldu" : `Bitiş ${kisaTarih(e.gecerlilik_bitis)}`) : "Geçerli"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
