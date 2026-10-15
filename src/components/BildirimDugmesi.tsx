"use client";

import { useEffect, useState } from "react";
import { abonelikBirak, abonelikOlustur, bildirimDurumu, type BildirimDurumu } from "../lib/bildirim";
import { hataYaz } from "../lib/tipler";
import { Ikon, useBildirim } from "./ui";

/**
 * Bu cihazda telefon bildirimlerini açıp kapatan kart. Abonelik bilgisinin sunucuya
 * kaydı (panel ya da personel) çağıran tarafından yapılır.
 */
export default function BildirimDugmesi({
  aciklama,
  kaydet,
  birak,
}: {
  aciklama: string;
  kaydet: (a: { endpoint: string; p256dh: string; auth: string }) => Promise<void>;
  birak: (endpoint: string) => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [durum, setDurum] = useState<BildirimDurumu | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    bildirimDurumu()
      .then(setDurum)
      .catch(() => setDurum("desteklenmiyor"));
  }, []);

  async function ac() {
    setYukleniyor(true);
    try {
      await kaydet(await abonelikOlustur());
      setDurum("acik");
      bildir("Bildirimler açıldı.", "basari");
    } catch (err) {
      bildir(hataYaz(err), "hata");
      setDurum(await bildirimDurumu().catch(() => "desteklenmiyor" as const));
    } finally {
      setYukleniyor(false);
    }
  }

  async function kapat() {
    setYukleniyor(true);
    try {
      const endpoint = await abonelikBirak();
      if (endpoint) await birak(endpoint);
      setDurum("kapali");
      bildir("Bu cihazda bildirimler kapatıldı.", "basari");
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  if (durum === null || durum === "desteklenmiyor") return null;

  return (
    <div className="panel-ic flex items-center gap-3 p-3 text-sm">
      <span className="bos-ikon flex h-9 w-9 flex-none items-center justify-center rounded-full">
        <Ikon ad="bilgi" boyut={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m1 font-semibold">Telefon bildirimleri {durum === "acik" ? "açık" : "kapalı"}</p>
        <p className="m3 text-xs">
          {durum === "ana-ekran-gerekli"
            ? "iPhone'da bildirim almak için önce Safari'de Paylaş > Ana Ekrana Ekle ile uygulamayı ekleyin, sonra oradan açın."
            : durum === "engelli"
            ? "Bildirim izni engellenmiş. Tarayıcı veya telefon ayarlarından bu site için izin verin."
            : aciklama}
        </p>
      </div>
      {durum === "kapali" && (
        <button type="button" className="btn btn-ana btn-kucuk" onClick={ac} disabled={yukleniyor}>
          Aç
        </button>
      )}
      {durum === "acik" && (
        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={kapat} disabled={yukleniyor}>
          Kapat
        </button>
      )}
    </div>
  );
}
