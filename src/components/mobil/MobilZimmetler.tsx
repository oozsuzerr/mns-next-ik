"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih } from "../../lib/tarih";

interface MobilZimmet {
  id: string;
  kategori: string;
  ad: string;
  seri_no: string | null;
  adet: number;
  teslim_tarihi: string;
  iade_tarihi: string | null;
  iade_durumu: string | null;
}

/** Personelin üzerindeki eşyalar (ve son bir yılda iade ettikleri). Kayıt yoksa hiçbir şey göstermez. */
export default function MobilZimmetler({ token, bosMetin }: { token: string; bosMetin?: string }) {
  const [liste, setListe] = useState<MobilZimmet[] | null>(null);

  useEffect(() => {
    Promise.resolve(supabase.rpc("mobil_zimmetler", { p_token: token })).then(({ data, error }) => {
      if (!error) setListe((data ?? []) as MobilZimmet[]);
    });
  }, [token]);

  if (!liste) return null;
  if (liste.length === 0) return bosMetin ? <p className="panel m3 p-4 text-sm">{bosMetin}</p> : null;

  return (
    <section>
      <h2 className="baslik-font m1 mb-2 px-1 text-lg">Zimmetimdeki eşyalar</h2>
      <ul className="panel liste overflow-hidden">
        {liste.map((z) => (
          <li key={z.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="m1 block truncate text-sm font-semibold">
                {z.ad}
                {z.adet > 1 ? ` × ${z.adet}` : ""}
              </span>
              <span className="m3 block text-xs">
                {z.kategori}
                {z.seri_no ? ` · ${z.seri_no}` : ""} · {kisaTarih(z.teslim_tarihi)} teslim
              </span>
            </span>
            <span className={`rozet ${z.iade_tarihi ? "rozet-notr" : "rozet-izin"}`}>
              {z.iade_tarihi ? `${kisaTarih(z.iade_tarihi)} iade` : "Bende"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
