// İK modüllerinin ortak parçaları

import { hataYaz } from "../../../lib/tipler";
import { Ikon } from "../../ui";

/** Modülün tablosu veritabanında henüz yok mu (SQL dosyası çalıştırılmamış) */
export function kurulmamis(err: unknown, tablo: string): boolean {
  const metin = hataYaz(err);
  return new RegExp(tablo, "i").test(metin) && /could not find|does not exist|schema cache/i.test(metin);
}

export function KurulumUyarisi({ dosya }: { dosya: string }) {
  return (
    <div className="panel flex items-start gap-3 px-5 py-4" style={{ borderColor: "var(--uyari)" }}>
      <Ikon ad="uyari" boyut={18} className="mt-0.5 flex-none" />
      <p className="m1 text-sm">
        Bu bölüm veritabanında henüz kurulmamış. Sistem yöneticisi <code className="sayi">{dosya}</code> dosyasını Supabase SQL
        Editor&apos;de çalıştırmalı.
      </p>
    </div>
  );
}
