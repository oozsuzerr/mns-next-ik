"use client";

import { useState } from "react";
import type { GunDetay, PuantajSatiri } from "../../lib/puantaj";
import type { MesaiTalebi } from "../../lib/tipler";
import { ayAdi, saatDakika } from "../../lib/tarih";
import { Modal, Rozet, type RozetTon } from "../ui";

/** Günün onaysız fazla çalışması (dk): iş gününde plandan fazlası, tatilde bütün çalışma; o günün onaylı/bekleyen talepleri düşülür */
function onaysizDk(g: GunDetay, talepler: MesaiTalebi[], personelId: string): number {
  if (g.calismaDk <= 0 || g.cikis === "-") return 0;
  const fazla = g.gunTuru === "is" ? (g.planDk > 0 ? g.calismaDk - g.planDk : 0) : g.calismaDk;
  const talepte = talepler.filter((t) => t.personel_id === personelId && t.tarih === g.tarih && t.durum !== "REDDEDILDI").reduce((t, x) => t + x.sure_dk, 0);
  return Math.max(0, fazla - talepte);
}

const dkSaat = (dk: number) => `${String(Math.floor(dk / 60) % 24).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;

const TON: Record<GunDetay["tip"], RozetTon> = {
  calisma: "giris",
  eksik: "uyari",
  rapor: "izin",
  izin: "izin",
  devamsiz: "hata",
  tatil: "notr",
  bos: "notr",
};

export default function PuantajKarti({
  satir,
  seciliAy,
  onKapat,
  talepler = [],
  onMesaiOnayla,
}: {
  satir: PuantajSatiri;
  seciliAy: string;
  onKapat: () => void;
  /** Fazla mesai talepleri (onaysız fazla çalışmayı ayırmak için) */
  talepler?: MesaiTalebi[];
  /** "mesai" yetkisi varsa: günün onaysız fazla çalışmasını onaylı fazla mesai olarak kaydeder */
  onMesaiOnayla?: (t: { personelId: string; tarih: string; baslangic: string; bitis: string; neden: string }) => Promise<boolean>;
}) {
  const [calisan, setCalisan] = useState<string | null>(null);
  return (
    <Modal onKapat={onKapat} baslik={satir.adSoyad} genis>
      <p className="m2 -mt-1 mb-4 text-sm">
        Sicil {satir.sicil_no}, {satir.vardiyaAdi} vardiyası, {ayAdi(seciliAy)}
      </p>

      <div className="ozet-seridi mb-4">
        <div>
          <p className="m2 text-xs font-semibold">Çalışılan gün</p>
          <p className="baslik-font sayi m1 mt-0.5 text-xl">{satir.calisilanGunler}</p>
        </div>
        <div>
          <p className="m2 text-xs font-semibold">Rapor / izin</p>
          <p className="baslik-font sayi m1 mt-0.5 text-xl">{satir.raporluGunler + satir.izinliGunler}</p>
        </div>
        <div>
          <p className="m2 text-xs font-semibold">Toplam net süre (sa:dk)</p>
          <p className="baslik-font sayi m1 mt-0.5 text-xl">{saatDakika(satir.toplamCalismaDk)}</p>
        </div>
        <div>
          <p className="m2 text-xs font-semibold">Devamsız / eksik</p>
          <p className="baslik-font sayi mt-0.5 text-xl" style={{ color: satir.devamsizGunler + satir.eksikGunler > 0 ? "var(--hata)" : "var(--m1)" }}>
            {satir.devamsizGunler} / {satir.eksikGunler}
          </p>
        </div>
      </div>

      {(satir.planDisiMesaiDk > 0 || satir.resmiTatilMesaiDk > 0 || satir.haftaTatiliMesaiDk > 0 || satir.gecikmeDk > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {satir.planDisiMesaiDk > 0 && <Rozet ton="izin">Plan dışı çalışma {saatDakika(satir.planDisiMesaiDk)} (onaysız)</Rozet>}
          {satir.resmiTatilMesaiDk > 0 && <Rozet ton="notr">Resmi tatil çalışması {saatDakika(satir.resmiTatilMesaiDk)}</Rozet>}
          {satir.haftaTatiliMesaiDk > 0 && <Rozet ton="notr">Hafta tatili çalışması {saatDakika(satir.haftaTatiliMesaiDk)}</Rozet>}
          {satir.gecikmeDk > 0 && <Rozet ton="uyari">Toplam gecikme {saatDakika(satir.gecikmeDk)}</Rozet>}
        </div>
      )}

      <div className="panel-ic overflow-hidden">
        {satir.gunlukDetaylar.map((g) => (
          <div key={g.gun} className="gun-satir" data-tip={g.tip}>
            <div>
              <p className="baslik-font sayi m1 text-lg leading-none">{g.gun}</p>
              <p className="m3 mt-1 text-xs">{g.gunAdi}</p>
            </div>
            <div className="min-w-0">
              {g.giris !== "-" || g.cikis !== "-" ? (
                <p className="sayi m1 text-sm font-semibold">
                  {g.giris} - {g.cikis}
                </p>
              ) : (
                <p className="m3 text-sm">Kayıt yok</p>
              )}
              {g.not && <p className="m3 mt-0.5 text-xs">{g.not}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              {g.durum && <Rozet ton={TON[g.tip]}>{g.durum}</Rozet>}
              {g.netCalisma !== "-" && <span className="sayi m2 text-xs font-semibold">{g.netCalisma}</span>}
              {(() => {
                const dk = onaysizDk(g, talepler, satir.id);
                if (dk < 15) return null;
                const [hh, mm] = g.cikis.split(":").map(Number);
                const bitis = hh * 60 + mm;
                const neden = g.gunTuru === "resmiTatil" ? "Resmî tatil çalışması" : g.gunTuru === "is" ? "Vardiya sonrası fazla çalışma" : "Hafta tatili / çalışılmayan gün çalışması";
                return (
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    <span className="text-xs" style={{ color: "var(--uyari)" }}>
                      Onaysız {saatDakika(dk)}
                    </span>
                    {onMesaiOnayla && (
                      <button
                        type="button"
                        className="btn btn-ikincil btn-kucuk"
                        disabled={calisan === g.tarih}
                        onClick={async () => {
                          setCalisan(g.tarih);
                          await onMesaiOnayla({
                            personelId: satir.id,
                            tarih: g.tarih,
                            baslangic: dkSaat((bitis - Math.min(dk, 960) + 1440) % 1440),
                            bitis: g.cikis,
                            neden: `${neden} (puantajdan müdür onayıyla)`,
                          });
                          setCalisan(null);
                        }}
                        title="Bu süreyi müdür onaylı fazla mesai olarak kaydeder"
                      >
                        {calisan === g.tarih ? "Kaydediliyor..." : "Mesai olarak onayla"}
                      </button>
                    )}
                  </span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-ana" onClick={onKapat}>
          Kapat
        </button>
      </div>
    </Modal>
  );
}
