"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { olayBildir } from "../../lib/bildirim";
import { ONCELIK_TONU, type GorevDurumu, type Oncelik } from "../../lib/gorev";
import { Ikon, Modal, useBildirim } from "../ui";

interface MobilGorev {
  id: string;
  baslik: string;
  aciklama: string | null;
  oncelik: Oncelik;
  son_tarih: string | null;
  durum: GorevDurumu;
  atayan_ad: string | null;
  personel_notu: string | null;
  tamamlanma: string | null;
  created_at: string;
  yeni: boolean;
  acik: boolean;
}

const HATALAR: Record<string, string> = {
  GOREV_KAPALI: "Bu görev kapatılmış; yöneticiniz iptal etmiş ya da tamamlanmış olabilir.",
  GOREV_YOK: "Görev bulunamadı.",
};

/** Personelin görevleri: açık olanlar başta; "Başladım" ve notla "Tamamladım". Görev yoksa hiçbir şey göstermez. */
export default function MobilGorevler({ token }: { token: string }) {
  const { bildir } = useBildirim();
  const [liste, setListe] = useState<MobilGorev[] | null>(null);
  const [acikGorev, setAcikGorev] = useState<string | null>(null);
  const [tamamla, setTamamla] = useState<MobilGorev | null>(null);
  const [kapananlar, setKapananlar] = useState(false);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.rpc("mobil_gorevler", { p_token: token })).then(({ data, error }) => {
        if (!error) setListe((data ?? []) as MobilGorev[]);
      }),
    [token]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  async function guncelle(g: MobilGorev, durum: "Devam ediyor" | "Tamamlandı", not?: string) {
    const { data, error } = await supabase.rpc("gorev_guncelle", { p_token: token, p_id: g.id, p_durum: durum, p_not: not ?? null });
    if (error || !data?.ok) {
      bildir(HATALAR[data?.hata] ?? "Kaydedilemedi. İnternet bağlantınızı kontrol edin.", "hata");
      await getir();
      return false;
    }
    olayBildir({ olay: "gorev_sonuc", token, gorev_id: g.id });
    bildir(durum === "Tamamlandı" ? "Görev tamamlandı, yöneticinize bildirildi." : "Göreve başladınız.", "basari");
    await getir();
    return true;
  }

  if (!liste || liste.length === 0) return null;
  const bugun = yerelTarih();
  const aciklar = liste.filter((g) => g.acik);
  const kapali = liste.filter((g) => !g.acik);

  return (
    <section>
      <h2 className="baslik-font m1 mb-2 flex items-center gap-2 px-1 text-lg">
        Görevlerim
        {aciklar.length > 0 && <span className="rozet rozet-izin">{aciklar.length} açık</span>}
        {liste.some((g) => g.yeni) && <span className="rozet rozet-hata">yeni</span>}
      </h2>
      {aciklar.length === 0 ? (
        <p className="panel m2 px-4 py-3 text-sm">Açık göreviniz yok.</p>
      ) : (
        <ul className="space-y-3">
          {aciklar.map((g) => {
            const gecti = g.son_tarih && g.son_tarih < bugun;
            const goster = acikGorev === g.id;
            return (
              <li key={g.id} className="panel p-4" style={gecti ? { borderColor: "var(--hata)" } : undefined}>
                <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setAcikGorev(goster ? null : g.id)} aria-expanded={goster}>
                  <span className="min-w-0 flex-1">
                    <span className="m1 block font-semibold">{g.baslik}</span>
                    <span className="m3 mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {g.oncelik !== "Normal" && <span className={`rozet rozet-${ONCELIK_TONU[g.oncelik]}`}>{g.oncelik}</span>}
                      {g.son_tarih && (
                        <span style={gecti ? { color: "var(--hata)", fontWeight: 600 } : undefined}>
                          {gecti ? "Süresi geçti: " : "Son tarih: "}
                          {kisaTarih(g.son_tarih)}
                        </span>
                      )}
                      {g.durum === "Devam ediyor" && <span className="rozet rozet-izin">Devam ediyor</span>}
                    </span>
                  </span>
                  {(g.aciklama || g.personel_notu) && <Ikon ad={goster ? "asagi" : "sag"} boyut={16} className="mt-1" />}
                </button>
                {goster && (
                  <div className="mt-2 space-y-2 text-sm">
                    {g.aciklama && <p className="m1 whitespace-pre-wrap">{g.aciklama}</p>}
                    {g.personel_notu && <p className="m2 whitespace-pre-wrap text-xs">Notunuz: {g.personel_notu}</p>}
                    <p className="m3 text-xs">
                      {g.atayan_ad ?? ""} · {kisaTarih(yerelTarih(g.created_at))}
                    </p>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {g.durum === "Bekliyor" && (
                    <button type="button" className="btn btn-ikincil btn-kucuk flex-1" onClick={() => guncelle(g, "Devam ediyor")}>
                      Başladım
                    </button>
                  )}
                  <button type="button" className="btn btn-ana btn-kucuk flex-1" onClick={() => setTamamla(g)}>
                    <Ikon ad="tik" boyut={15} />
                    Tamamladım
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {kapali.length > 0 && (
        <>
          <button type="button" className="btn btn-hayalet btn-kucuk mt-2 w-full" onClick={() => setKapananlar(!kapananlar)}>
            {kapananlar ? "Kapanan görevleri gizle" : `Kapanan görevler (${kapali.length})`}
          </button>
          {kapananlar && (
            <ul className="panel liste mt-2 overflow-hidden">
              {kapali.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="m1 block truncate text-sm font-semibold">{g.baslik}</span>
                    <span className="m3 block truncate text-xs">
                      {g.tamamlanma ? kisaTarih(yerelTarih(g.tamamlanma)) : ""}
                      {g.personel_notu ? ` · ${g.personel_notu}` : ""}
                    </span>
                  </span>
                  <span className={`rozet ${g.durum === "Tamamlandı" ? "rozet-giris" : "rozet-hata"}`}>{g.durum}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tamamla && (
        <TamamlaFormu
          gorev={tamamla}
          onKapat={() => setTamamla(null)}
          onTamamla={async (not) => {
            if (await guncelle(tamamla, "Tamamlandı", not)) setTamamla(null);
          }}
        />
      )}
    </section>
  );
}

function TamamlaFormu({ gorev, onKapat, onTamamla }: { gorev: MobilGorev; onKapat: () => void; onTamamla: (not: string) => Promise<void> }) {
  const [not, setNot] = useState(gorev.personel_notu ?? "");
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(e: FormEvent) {
    e.preventDefault();
    setGonderiliyor(true);
    await onTamamla(not.trim());
    setGonderiliyor(false);
  }

  return (
    <Modal onKapat={onKapat} baslik="Görevi tamamla">
      <form onSubmit={gonder} className="space-y-4">
        <p className="m1 font-semibold">{gorev.baslik}</p>
        <div>
          <label className="etiket" htmlFor="gNot">
            Açıklama / not (isteğe bağlı)
          </label>
          <textarea
            id="gNot"
            className="girdi"
            rows={4}
            maxLength={1000}
            placeholder="Örn: Sayım bitti, 3 koli eksik çıktı."
            value={not}
            onChange={(e) => setNot(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn btn-ikincil flex-1" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana flex-1" disabled={gonderiliyor}>
            {gonderiliyor ? "Gönderiliyor..." : "Tamamladım"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
