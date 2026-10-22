"use client";

import { useState } from "react";
import { GUN_ADLARI, ayAdi, haftaGunu, kisaTarih, yerelTarih } from "../../lib/tarih";
import { gunEkle, gunAraligi, netSureDk, type GunPlani, type PlanVardiya } from "../../lib/vardiyaPlani";
import { Ikon, Modal } from "../ui";

/** mobil_ozet planı bugünden bu kadar gün sonrasına kadar gönderir */
const PLAN_ILERI_GUN = 31;

// Renk, vardiyanın başladığı saate göre: gece, sabah, öğleden sonra/akşam
function ton(v: PlanVardiya): string {
  const saat = Number(v.baslangic_saat.slice(0, 2));
  if (saat < 6) return "izin";
  if (saat < 13) return "giris";
  return "cikis";
}

function saatAraligi(v: PlanVardiya): string {
  return `${v.baslangic_saat.slice(0, 5)}-${v.bitis_saat.slice(0, 5)}`;
}

function GunOzeti({ etiket, gp }: { etiket: string; gp: GunPlani }) {
  return (
    <div className="panel-ic flex-1 p-3">
      <p className="m3 text-xs font-semibold">{etiket}</p>
      {gp.tatil ? (
        <p className="m1 mt-1 font-semibold">Hafta tatili</p>
      ) : gp.vardiyalar.length === 0 ? (
        <p className="m2 mt-1 text-sm">Vardiya yok</p>
      ) : (
        gp.vardiyalar.map((v) => (
          <p key={v.id} className="mt-1">
            <span className="m1 font-semibold">{v.ad}</span>{" "}
            <span className="m2 sayi text-sm">{saatAraligi(v)}</span>
          </p>
        ))
      )}
    </div>
  );
}

/** Bugün ve yarın; gomulu ise aylık takvim altında açık durur, değilse düğmeyle pencerede açılır */
export function VardiyamKarti({ gunPlaniBul, gomulu = false }: { gunPlaniBul: (tarih: string) => GunPlani; gomulu?: boolean }) {
  const [takvimAcik, setTakvimAcik] = useState(false);
  const bugun = yerelTarih();

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="baslik-font m1 text-lg">Vardiyam</h2>
        {!gomulu && (
          <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setTakvimAcik(true)}>
            <Ikon ad="takvim" boyut={15} />
            Aylık takvim
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <GunOzeti etiket="Bugün" gp={gunPlaniBul(bugun)} />
        <GunOzeti etiket="Yarın" gp={gunPlaniBul(gunEkle(bugun, 1))} />
      </div>
      {gomulu ? (
        <div className="panel mt-3 p-4">
          <VardiyaTakvimi gunPlaniBul={gunPlaniBul} />
        </div>
      ) : (
        takvimAcik && <VardiyaTakvimi gunPlaniBul={gunPlaniBul} onKapat={() => setTakvimAcik(false)} />
      )}
    </section>
  );
}

function VardiyaTakvimi({
  gunPlaniBul,
  onKapat,
}: {
  gunPlaniBul: (tarih: string) => GunPlani;
  /** Verilmezse takvim pencere yerine sayfa içinde gösterilir */
  onKapat?: () => void;
}) {
  const bugun = yerelTarih();
  const sonBilinen = gunEkle(bugun, PLAN_ILERI_GUN);
  const buAy = bugun.slice(0, 7);
  const gelecekAy = gunEkle(`${buAy}-28`, 7).slice(0, 7);
  const [ay, setAy] = useState(buAy);
  const [secili, setSecili] = useState(bugun);

  const ilkGun = `${ay}-01`;
  const sonGun = gunEkle(`${gunEkle(`${ay}-28`, 7).slice(0, 7)}-01`, -1);
  const gunler = gunAraligi(ilkGun, sonGun);
  const bosluk = (haftaGunu(ilkGun) + 6) % 7; // pazartesiden başlayan ızgarada ilk günden önceki boş hücreler

  // Ay özeti: bilinen günlerdeki planlı çalışma
  let calismaGunu = 0;
  let toplamDk = 0;
  for (const t of gunler) {
    if (t > sonBilinen) continue;
    const gp = gunPlaniBul(t);
    if (!gp.tatil && gp.vardiyalar.length > 0) {
      calismaGunu++;
      toplamDk += gp.vardiyalar.reduce((top, v) => top + netSureDk(v), 0);
    }
  }

  const seciliPlan = secili <= sonBilinen ? gunPlaniBul(secili) : null;

  const icerik = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="btn btn-hayalet btn-ikon btn-kucuk"
          onClick={() => setAy(buAy)}
          disabled={ay === buAy}
          aria-label="Önceki ay"
        >
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <Ikon ad="sag" boyut={16} />
          </span>
        </button>
        <p className="baslik-font m1 text-base">{ayAdi(ay)}</p>
        <button
          type="button"
          className="btn btn-hayalet btn-ikon btn-kucuk"
          onClick={() => setAy(gelecekAy)}
          disabled={ay === gelecekAy}
          aria-label="Sonraki ay"
        >
          <Ikon ad="sag" boyut={16} />
        </button>
      </div>

      <div className="takvim-izgara" role="grid" aria-label={`${ayAdi(ay)} vardiya takvimi`}>
        {[1, 2, 3, 4, 5, 6, 0].map((g) => (
          <div key={g} className="takvim-baslik" data-pazar={g === 0}>
            {GUN_ADLARI[g]}
          </div>
        ))}
        {Array.from({ length: bosluk }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {gunler.map((t) => {
          const bilinmiyor = t > sonBilinen;
          const gp = bilinmiyor ? null : gunPlaniBul(t);
          return (
            <button
              key={t}
              type="button"
              className="takvim-gun"
              data-bugun={t === bugun}
              data-secili={t === secili}
              data-gecmis={t < bugun}
              onClick={() => setSecili(t)}
              aria-label={kisaTarih(t)}
            >
              <span className="sayi takvim-sayi">{Number(t.slice(8))}</span>
              {!gp ? (
                <span className="m3 text-[10px]">-</span>
              ) : gp.tatil ? (
                <span className="plan-cip plan-cip-tatil takvim-cip">Tatil</span>
              ) : (
                gp.vardiyalar.map((v) => (
                  <span key={v.id} className={`plan-cip plan-cip-${ton(v)} takvim-cip`}>
                    {v.ad.slice(0, 3)}
                  </span>
                ))
              )}
            </button>
          );
        })}
      </div>

      <div className="panel-ic mt-4 p-3 text-sm">
        <p className="m3 text-xs font-semibold">
          {kisaTarih(secili)} {GUN_ADLARI[haftaGunu(secili)]}
          {secili === bugun ? " (bugün)" : ""}
        </p>
        {!seciliPlan ? (
          <p className="m2 mt-1">Bu gün için plan henüz yayınlanmadı.</p>
        ) : seciliPlan.tatil ? (
          <p className="m1 mt-1 font-semibold">Hafta tatili</p>
        ) : seciliPlan.vardiyalar.length === 0 ? (
          <p className="m2 mt-1">Vardiya yok</p>
        ) : (
          seciliPlan.vardiyalar.map((v) => (
            <p key={v.id} className="mt-1">
              <span className="m1 font-semibold">{v.ad}</span>{" "}
              <span className="m2 sayi">{saatAraligi(v)}</span>
              {v.mola_dakika ? <span className="m3">, {v.mola_dakika} dk mola</span> : null}
            </p>
          ))
        )}
      </div>

      <p className="m2 mt-3 text-sm">
        Bu ay planlı: <strong className="m1">{calismaGunu} gün</strong>, net{" "}
        <strong className="m1">{Math.round(toplamDk / 60)} saat</strong>
        {gunler.some((t) => t > sonBilinen) ? " (yayınlanan günler)" : ""}
      </p>
      <p className="ipucu">Vardiyanız değişirse yöneticiniz planı günceller; uygulamayı açtığınızda en güncel hali görünür.</p>
    </>
  );
  return onKapat ? (
    <Modal onKapat={onKapat} baslik="Vardiya takvimi">
      {icerik}
    </Modal>
  ) : (
    icerik
  );
}
