"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz } from "../../lib/tipler";
import { sureYaz } from "../../lib/tarih";
import { VARSAYILAN_AYARLAR, type Ayarlar } from "../../lib/ayarlar";
import { Ikon, useBildirim } from "../ui";

const ALANLAR: { anahtar: keyof Ayarlar; ad: string; aciklama: string; min: number; max: number }[] = [
  {
    anahtar: "gecikme_tolerans_dk",
    ad: "Gecikme toleransı",
    aciklama: "Vardiya başlangıcından bu kadar dakika sonrasına kadar gelen geç sayılmaz.",
    min: 0,
    max: 120,
  },
  {
    anahtar: "mesai_tolerans_dk",
    ad: "Fazla mesai eşiği",
    aciklama: "Vardiya bitişinden bu kadar dakika sonrası plan dışı mesai sayılır.",
    min: 0,
    max: 240,
  },
  {
    anahtar: "mola_esigi_dk",
    ad: "Mola düşme eşiği",
    aciklama: "Günlük çalışma bu süreyi aşarsa vardiya molası net süreden düşülür.",
    min: 0,
    max: 720,
  },
  {
    anahtar: "cikis_tolerans_dk",
    ad: "Eksik çıkış süresi",
    aciklama: "Çıkış basılmazsa vardiya bitişinden bu kadar sonra \"çıkış eksik\" uyarısı verilir.",
    min: 30,
    max: 720,
  },
  {
    anahtar: "erken_giris_payi_dk",
    ad: "Erken giriş payı",
    aciklama: "Vardiya başlangıcından bu kadar önce yapılan giriş o vardiyaya sayılır.",
    min: 0,
    max: 480,
  },
  {
    anahtar: "izin_gunu_dk",
    ad: "İzin günü süresi",
    aciklama: "Saatlik izinler bu süreye bölünerek yıllık izinden gün olarak düşülür (45 sa / 6 gün = 450 dk).",
    min: 60,
    max: 720,
  },
];

export default function AyarlarSekmesi({
  ayarlar,
  duzenlenebilir,
  onKayit,
}: {
  ayarlar: Ayarlar;
  /** Yalnızca genel yönetici değiştirebilir */
  duzenlenebilir: boolean;
  onKayit: () => void;
}) {
  const { bildir, onayla } = useBildirim();
  const [f, setF] = useState<Ayarlar>(ayarlar);
  const [yukleniyor, setYukleniyor] = useState(false);
  const degisti = ALANLAR.some((a) => f[a.anahtar] !== ayarlar[a.anahtar]);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    for (const a of ALANLAR) {
      const d = f[a.anahtar];
      if (!Number.isInteger(d) || d < a.min || d > a.max) {
        bildir(`${a.ad} ${a.min} ile ${a.max} dakika arasında olmalı.`, "hata");
        return;
      }
    }
    const tamam = await onayla({
      baslik: "Kurallar değiştirilsin mi?",
      metin: "Puantaj, gecikme ve eksik çıkış hesapları tüm dönemler için yeni kurallarla yeniden hesaplanır. Kapalı aylar da ekranda yeni kurala göre görünür.",
      onayEtiketi: "Kaydet",
    });
    if (!tamam) return;
    setYukleniyor(true);
    try {
      const { error } = await supabase
        .from("sirket_ayarlari")
        .update({ ...Object.fromEntries(ALANLAR.map((a) => [a.anahtar, f[a.anahtar]])), guncelleme: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
      bildir("Kurallar kaydedildi.", "basari");
      onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <form onSubmit={kaydet} className="space-y-4">
      <p className="m2 text-sm">
        Puantaj hesabının kuralları. {duzenlenebilir ? "Değişiklik işlem geçmişine kaydedilir." : "Yalnızca genel yönetici değiştirebilir."}
      </p>
      <div className="panel overflow-hidden">
        <ul className="liste">
          {ALANLAR.map((a) => (
            <li key={a.anahtar} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-[200px] flex-1">
                <p className="m1 font-semibold">{a.ad}</p>
                <p className="m3 text-xs">{a.aciklama}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="girdi sayi"
                  style={{ width: 96 }}
                  type="number"
                  inputMode="numeric"
                  min={a.min}
                  max={a.max}
                  step={1}
                  value={f[a.anahtar]}
                  disabled={!duzenlenebilir}
                  onChange={(e) => setF({ ...f, [a.anahtar]: Number(e.target.value) })}
                  aria-label={a.ad}
                />
                <span className="m2 w-20 text-sm">dk ({sureYaz(f[a.anahtar])})</span>
              </div>
              {f[a.anahtar] !== VARSAYILAN_AYARLAR[a.anahtar] && (
                <span className="m3 w-full text-xs">Varsayılan: {VARSAYILAN_AYARLAR[a.anahtar]} dk</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {duzenlenebilir && (
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ikincil" disabled={!degisti || yukleniyor} onClick={() => setF(ayarlar)}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={!degisti || yukleniyor}>
            <Ikon ad="tik" boyut={16} />
            {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      )}
    </form>
  );
}
