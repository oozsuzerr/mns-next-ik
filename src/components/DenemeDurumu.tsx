"use client";

// Deneme firmaları için panel uyarıları: kalan gün şeridi ve süresi dolunca giriş ekranındaki mesaj.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { kalanGun } from "../lib/deneme";
import { Ikon } from "./ui";

export const ILETISIM_ADRESI = "https://www.mnsnext.com.tr/#demo";

type FirmaDurumu = { aktif: boolean; deneme_bitis: string | null; ad: string };

export function useFirmaDurumu(): FirmaDurumu | null | undefined {
  // undefined: yükleniyor, null: bilgi yok (fonksiyon kurulmamış ya da firma yok)
  const [durum, setDurum] = useState<FirmaDurumu | null | undefined>(undefined);
  useEffect(() => {
    supabase.rpc("firma_durumu").then(({ data, error }) => setDurum(error || !data ? null : (data as FirmaDurumu)));
  }, []);
  return durum;
}

/** Panelin üstünde: "Deneme sürümü · X gün kaldı" */
export function DenemeSeridi() {
  const d = useFirmaDurumu();
  if (!d?.deneme_bitis || !d.aktif) return null;
  const kalan = kalanGun(d.deneme_bitis);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold"
      style={{ background: kalan <= 3 ? "var(--uyari-acik)" : "var(--izin-acik)", color: kalan <= 3 ? "var(--uyari)" : "var(--izin)" }}
      role="status"
    >
      <span className="flex items-center gap-2">
        <Ikon ad="takvim" boyut={16} />
        Ücretsiz deneme · {kalan <= 1 ? "bugün son gün" : `${kalan} gün kaldı`} (en fazla 10 aktif personel)
      </span>
      <a href={ILETISIM_ADRESI} target="_blank" rel="noreferrer" className="underline">
        Kalıcı hesaba geçin
      </a>
    </div>
  );
}

/** Panel kullanıcısının firması kapalıysa nedenini anlatan metin; bilinmiyorsa null */
export function kapaliFirmaMesaji(d: FirmaDurumu | null | undefined): { baslik: string; metin: string } | null {
  if (!d || d.aktif) return null;
  if (d.deneme_bitis) {
    return {
      baslik: "Deneme süreniz doldu",
      metin: `${d.ad} için ücretsiz deneme süresi sona erdi. Verileriniz silinmedi; kalıcı hesaba geçmek için bizimle iletişime geçin.`,
    };
  }
  return { baslik: "Firma hesabı kapalı", metin: `${d.ad} hesabı şu an kapalı. Ayrıntı için bizimle iletişime geçin.` };
}
