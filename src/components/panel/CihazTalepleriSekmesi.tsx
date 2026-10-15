"use client";

import type { CihazTalebi } from "../../lib/tipler";
import { kisaTarih, yerelSaat, yerelTarih } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Rozet } from "../ui";

/** Kilitli personelin mobilden gönderdiği "bu telefonu tanımlat" talepleri */
export default function CihazTalepleriSekmesi({
  talepler,
  subeFiltre,
  onKarar,
}: {
  talepler: CihazTalebi[];
  subeFiltre: string;
  onKarar?: (t: CihazTalebi, onay: boolean) => void;
}) {
  const bekleyen = talepler.filter(
    (t) => t.durum === "BEKLEMEDE" && (subeFiltre === "TUMU" || t.personeller?.varsayilan_sube_id === subeFiltre)
  );

  return (
    <section>
      <h3 className="baslik-font m1 mb-3 flex items-center gap-2 text-lg">
        Yeni telefon talepleri
        {bekleyen.length > 0 && <Rozet ton="uyari">{bekleyen.length}</Rozet>}
      </h3>
      <div className="panel overflow-hidden">
        {bekleyen.length === 0 ? (
          <Bos
            ikon="telefon"
            baslik="Bekleyen talep yok"
            metin="Kayıtlı telefonundan başka bir telefonla giriş yapmak isteyen personel burada onayınızı bekler."
          />
        ) : (
          <ul className="liste">
            {bekleyen.map((t) => {
              const ad = t.personeller?.ad ?? "?";
              const soyad = t.personeller?.soyad ?? "";
              return (
                <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar ad={ad} soyad={soyad} boyut={40} />
                    <div className="min-w-0">
                      <p className="m1 font-semibold">
                        {ad} {soyad} <span className="m3 text-xs font-normal">{t.personeller?.sicil_no}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Rozet ton="notr">{t.cihaz_bilgisi ?? "Bilinmeyen telefon"}</Rozet>
                        <span className="m2 sayi text-sm">
                          {kisaTarih(yerelTarih(t.created_at))} {yerelSaat(t.created_at)}
                        </span>
                      </div>
                      <p className="m3 mt-1 text-xs">
                        Onaylarsanız bu telefon kaydedilir, eski telefondaki oturum kapanır. Talebi personelin kendisinin
                        gönderdiğinden emin değilseniz reddedin.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {onKarar ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-tehlike-hafif flex-1 sm:flex-none"
                          onClick={() => onKarar(t, false)}
                        >
                          <Ikon ad="kapat" boyut={15} />
                          Reddet
                        </button>
                        <button type="button" className="btn btn-giris flex-1 sm:flex-none" onClick={() => onKarar(t, true)}>
                          <Ikon ad="tik" boyut={15} />
                          Onayla
                        </button>
                      </>
                    ) : (
                      <Rozet ton="uyari">Onay bekliyor</Rozet>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
