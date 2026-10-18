"use client";

import type { GunDetay, PuantajSatiri } from "../../lib/puantaj";
import { ayAdi, saatDakika } from "../../lib/tarih";
import { Modal, Rozet, type RozetTon } from "../ui";

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
}: {
  satir: PuantajSatiri;
  seciliAy: string;
  onKapat: () => void;
}) {
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
