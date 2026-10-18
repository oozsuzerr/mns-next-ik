"use client";

// Tahmini bordro ve mesai ücreti için gereken veri: firmanın bordro ayarları ve Özlük'teki ücretler.
// Ücretler yalnızca genel yöneticiye açık olduğu için "etkin" false iken hiçbir şey yüklenmez.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { bordroAyarlariniTamamla, temelUcret, type BordroAyarlari, type UcretTuru, VARSAYILAN_BORDRO_AYARLARI } from "../../../lib/bordro";

export interface PersonelUcreti {
  ucret: number;
  tur: UcretTuru;
}

export interface BordroVerisi {
  hazir: boolean;
  /** Tablo kurulmamış (SQL çalıştırılmamış) */
  kurulmamis: boolean;
  /** Firmanın kayıtlı ayarı var mı (yoksa varsayılanlar kullanılıyor) */
  kayitli: boolean;
  ayarlar: BordroAyarlari;
  ucretler: Map<string, PersonelUcreti>;
  yenile: () => Promise<void>;
}

const UCRET_TURLERI: UcretTuru[] = ["Aylık brüt", "Aylık net", "Günlük brüt", "Saatlik brüt"];

export function useBordroVerisi(etkin: boolean): BordroVerisi {
  const [durum, setDurum] = useState<Omit<BordroVerisi, "yenile">>({
    hazir: false,
    kurulmamis: false,
    kayitli: false,
    ayarlar: VARSAYILAN_BORDRO_AYARLARI,
    ucretler: new Map(),
  });

  const yenile = useCallback(
    (): Promise<void> =>
      etkin
        ? Promise.all([
            supabase.from("bordro_ayarlari").select("yasal, mesai_kalemleri").maybeSingle(),
            supabase.from("personel_ozluk").select("personel_id, ucret, ucret_turu"),
          ]).then(([a, o]) => {
            const ucretler = new Map<string, PersonelUcreti>();
            for (const r of (o.data ?? []) as { personel_id: string; ucret: number | null; ucret_turu: string | null }[]) {
              if (r.ucret != null && Number(r.ucret) > 0) {
                ucretler.set(r.personel_id, {
                  ucret: Number(r.ucret),
                  tur: (UCRET_TURLERI as string[]).includes(r.ucret_turu ?? "") ? (r.ucret_turu as UcretTuru) : "Aylık brüt",
                });
              }
            }
            setDurum({
              hazir: true,
              kurulmamis: !!a.error && /bordro_ayarlari|schema cache|does not exist/i.test(a.error.message),
              kayitli: !!a.data,
              ayarlar: bordroAyarlariniTamamla(a.data as Parameters<typeof bordroAyarlariniTamamla>[0]),
              ucretler,
            });
          })
        : Promise.resolve(),
    [etkin]
  );

  useEffect(() => {
    yenile();
  }, [yenile]);

  return { ...durum, yenile };
}

/** Bir personelin belirli fazla mesai süresinin tahmini brüt ücreti (ücret ya da çarpan yoksa null) */
export function fazlaMesaiBrut(veri: BordroVerisi, personelId: string, dk: number, ay: number): number | null {
  const u = veri.ucretler.get(personelId);
  if (!u || dk <= 0) return u ? 0 : null;
  const carpan = veri.ayarlar.mesaiKalemleri.filter((k) => k.aktif && k.kaynak === "fazla_mesai").reduce((t, k) => t + k.carpan, 0);
  if (!carpan) return null;
  const { saatlik } = temelUcret(u.ucret, u.tur, ay, veri.ayarlar.yasal);
  return Math.round((dk / 60) * saatlik * carpan * 100) / 100;
}
