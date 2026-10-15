"use client";

import type { Izin } from "../../lib/tipler";
import { gunFarki, kisaTarih } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Rozet, type RozetTon } from "../ui";

function turTon(tur: string): RozetTon {
  if (tur.includes("Rapor")) return "uyari";
  if (tur.includes("Yıllık")) return "izin";
  return "notr";
}

function TalepSatiri({
  iz,
  onDurum,
  onSil,
}: {
  iz: Izin;
  onDurum?: (id: string, durum: "ONAYLANDI" | "REDDEDILDI") => void;
  onSil?: (id: string) => void;
}) {
  const ad = iz.personeller?.ad ?? "?";
  const soyad = iz.personeller?.soyad ?? "";
  const gun = gunFarki(iz.baslangic_tarihi, iz.bitis_tarihi);
  const aralik =
    iz.baslangic_tarihi === iz.bitis_tarihi
      ? kisaTarih(iz.baslangic_tarihi)
      : `${kisaTarih(iz.baslangic_tarihi)} - ${kisaTarih(iz.bitis_tarihi)}`;
  const bekliyor = iz.durum === "BEKLEMEDE";

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar ad={ad} soyad={soyad} boyut={40} />
        <div className="min-w-0">
          <p className="m1 font-semibold">
            {ad} {soyad} <span className="m3 text-xs font-normal">{iz.personeller?.sicil_no}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Rozet ton={turTon(iz.izin_turu)}>{iz.izin_turu}</Rozet>
            <span className="m2 sayi text-sm">
              {aralik} ({gun} gün)
            </span>
          </div>
          {iz.aciklama && <p className="m2 mt-1.5 text-sm">{iz.aciklama}</p>}
          {iz.sgk_kodu && <p className="m3 mt-0.5 text-xs">SGK: {iz.sgk_kodu}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {bekliyor ? (
          onDurum ? (
            <>
              {/* Telefonda başparmakla rahat basılacak geniş düğmeler */}
              <button
                type="button"
                className="btn btn-tehlike-hafif flex-1 sm:flex-none"
                onClick={() => onDurum(iz.id, "REDDEDILDI")}
              >
                <Ikon ad="kapat" boyut={15} />
                Reddet
              </button>
              <button
                type="button"
                className="btn btn-giris flex-1 sm:flex-none"
                onClick={() => onDurum(iz.id, "ONAYLANDI")}
              >
                <Ikon ad="tik" boyut={15} />
                Onayla
              </button>
            </>
          ) : (
            <Rozet ton="uyari">Onay bekliyor</Rozet>
          )
        ) : (
          <>
            {iz.durum === "REDDEDILDI" ? <Rozet ton="hata">Reddedildi</Rozet> : <Rozet ton="giris">Onaylandı</Rozet>}
            {onSil && (
              <button
                type="button"
                className="btn btn-hayalet btn-kucuk btn-ikon"
                onClick={() => onSil(iz.id)}
                aria-label="Kaydı sil"
              >
                <Ikon ad="cop" boyut={15} />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export default function TaleplerSekmesi({
  izinler,
  onDurum,
  onSil,
  onYeni,
}: {
  izinler: Izin[];
  /** Verilmezse (izin yetkisi yok) talepler salt okunur gösterilir */
  onDurum?: (id: string, durum: "ONAYLANDI" | "REDDEDILDI") => void;
  onSil?: (id: string) => void;
  onYeni?: () => void;
}) {
  const bekleyen = izinler.filter((iz) => iz.durum === "BEKLEMEDE");
  const gecmis = izinler.filter((iz) => iz.durum !== "BEKLEMEDE");

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="baslik-font m1 flex items-center gap-2 text-lg">
            Onay bekleyenler
            {bekleyen.length > 0 && <Rozet ton="uyari">{bekleyen.length}</Rozet>}
          </h3>
          {onYeni && (
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={onYeni}>
              <Ikon ad="arti" boyut={14} />
              İzin veya rapor ekle
            </button>
          )}
        </div>
        <div className="panel overflow-hidden">
          {bekleyen.length === 0 ? (
            <Bos ikon="tik" baslik="Bekleyen talep yok" metin="Personelin mobilden gönderdiği talepler burada onayınızı bekler." />
          ) : (
            <ul className="liste">
              {bekleyen.map((iz) => (
                <TalepSatiri key={iz.id} iz={iz} onDurum={onDurum} onSil={onSil} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h3 className="baslik-font m1 mb-3 text-lg">Geçmiş kayıtlar</h3>
        <div className="panel overflow-hidden">
          {gecmis.length === 0 ? (
            <Bos ikon="takvim" baslik="Henüz kayıt yok" />
          ) : (
            <ul className="liste">
              {gecmis.map((iz) => (
                <TalepSatiri key={iz.id} iz={iz} onDurum={onDurum} onSil={onSil} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
