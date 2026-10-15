"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, tumunuGetir, type Personel, type Vardiya } from "../../lib/tipler";
import { GUN_ADLARI, ayAdi, haftaGunu, kisaTarih, yerelTarih } from "../../lib/tarih";
import {
  gunAraligi,
  gunEkle,
  gunPlani,
  haftaBasi,
  planHaritasi,
  planUyarilari,
  type PlanSatiri,
  type PlanUyarisi,
} from "../../lib/vardiyaPlani";
import { Avatar, Bos, Ikon, Iskelet, Modal, useBildirim } from "../ui";

type Gorunum = "hafta" | "ay";

// Her vardiyaya sırasına göre bir renk tonu verilir
const TONLAR = ["izin", "giris", "cikis", "uyari"] as const;

function ayinSonGunu(ay: string): string {
  const [y, m] = ay.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function aralikBul(gorunum: Gorunum, baslangic: string): { bas: string; son: string } {
  if (gorunum === "hafta") return { bas: baslangic, son: gunEkle(baslangic, 6) };
  return { bas: baslangic, son: ayinSonGunu(baslangic.slice(0, 7)) };
}

function kisaAd(ad: string): string {
  return ad.length <= 4 ? ad : ad.slice(0, 3);
}

/** Supabase'e çok uzun adres göndermemek için listeyi parçalar */
function parcala<T>(liste: T[], boyut: number): T[][] {
  const sonuc: T[][] = [];
  for (let i = 0; i < liste.length; i += boyut) sonuc.push(liste.slice(i, i + boyut));
  return sonuc;
}

/**
 * Seçili personel ve günlerin planını siler, yerine yenilerini yazar.
 * yeni = null ise yalnızca siler (varsayılana döner).
 */
async function planYaz(
  personeller: Personel[],
  tarihler: string[],
  yeni: { tatil: boolean; vardiyaIdleri: string[] } | null
): Promise<void> {
  if (personeller.length === 0 || tarihler.length === 0) return;
  for (const grup of parcala(personeller, 40)) {
    const { error } = await supabase
      .from("vardiya_plani")
      .delete()
      .in(
        "personel_id",
        grup.map((p) => p.id)
      )
      .in("tarih", tarihler);
    if (error) throw error;
  }
  if (!yeni) return;

  const satirlar: Omit<PlanSatiri, "id">[] = personeller.flatMap((p) =>
    tarihler.flatMap((tarih): Omit<PlanSatiri, "id">[] =>
      yeni.tatil
        ? [{ personel_id: p.id, tarih, tur: "TATIL", vardiya_id: null, sube_id: p.varsayilan_sube_id }]
        : yeni.vardiyaIdleri.map((vardiya_id) => ({
            personel_id: p.id,
            tarih,
            tur: "VARDIYA",
            vardiya_id,
            sube_id: p.varsayilan_sube_id,
          }))
    )
  );
  for (const grup of parcala(satirlar, 500)) {
    const { error } = await supabase.from("vardiya_plani").insert(grup);
    if (error) throw error;
  }
}

function planHatasi(err: unknown): string {
  const metin = hataYaz(err);
  if (/vardiya_plani/.test(metin) && /(does not exist|could not find|schema cache)/i.test(metin)) {
    return "Vardiya planı tablosu henüz oluşturulmamış. supabase/2026-10-15_vardiya_plani.sql dosyasını Supabase SQL Editor'de çalıştırın.";
  }
  if (metin.includes("PLAN_CAKISMA")) return "Aynı gün hem hafta tatili hem vardiya olamaz.";
  return metin;
}

// =====================================================================
// Ana bileşen
// =====================================================================
export default function VardiyaPlani({
  personeller,
  vardiyalar,
  subeFiltre,
}: {
  personeller: Personel[];
  vardiyalar: Vardiya[];
  subeFiltre: string;
}) {
  const { bildir, onayla } = useBildirim();
  const bugun = yerelTarih();

  const [gorunum, setGorunum] = useState<Gorunum>("hafta");
  const [baslangic, setBaslangic] = useState(() => haftaBasi(bugun));
  const [planlar, setPlanlar] = useState<PlanSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [ara, setAra] = useState("");
  const [hucre, setHucre] = useState<{ personel: Personel; tarih: string } | null>(null);
  const [topluAcik, setTopluAcik] = useState(false);

  const { bas, son } = aralikBul(gorunum, baslangic);
  const gunler = useMemo(() => gunAraligi(bas, son), [bas, son]);

  // Uyarılarda aralık kenarındaki dinlenme sürelerini görebilmek için bir gün öncesi/sonrası da alınır
  const getir = useCallback(
    () =>
      tumunuGetir<PlanSatiri>((a, b) =>
        supabase
          .from("vardiya_plani")
          .select("id, personel_id, tarih, tur, vardiya_id, sube_id")
          .gte("tarih", gunEkle(bas, -1))
          .lte("tarih", gunEkle(son, 1))
          .order("tarih")
          .order("id")
          .range(a, b)
      )
        .then((v) => {
          setPlanlar(v);
          setHata(null);
        })
        .catch((err) => setHata(planHatasi(err)))
        .finally(() => setYukleniyor(false)),
    [bas, son, setPlanlar, setHata, setYukleniyor]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  function aralikDegistir(yeniGorunum: Gorunum, yeniBaslangic: string) {
    if (yeniGorunum === gorunum && yeniBaslangic === baslangic) return;
    setYukleniyor(true);
    setGorunum(yeniGorunum);
    setBaslangic(yeniBaslangic);
  }

  function kaydir(yon: 1 | -1) {
    if (gorunum === "hafta") aralikDegistir("hafta", gunEkle(baslangic, 7 * yon));
    else {
      const [y, m] = baslangic.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + yon, 1));
      aralikDegistir("ay", d.toISOString().slice(0, 10));
    }
  }

  function bugune() {
    aralikDegistir(gorunum, gorunum === "hafta" ? haftaBasi(bugun) : `${bugun.slice(0, 7)}-01`);
  }

  function gorunumSec(g: Gorunum) {
    // Haftadan aya geçerken o haftanın ayı, aydan haftaya geçerken (bugün o aydaysa) bu hafta açılır
    if (g === "ay") aralikDegistir("ay", `${baslangic.slice(0, 7)}-01`);
    else aralikDegistir("hafta", bugun.startsWith(baslangic.slice(0, 7)) ? haftaBasi(bugun) : haftaBasi(baslangic));
  }

  const vardiyaHaritasi = useMemo(() => new Map(vardiyalar.map((v) => [v.id, v])), [vardiyalar]);
  const vardiyaBul = useCallback((id: string) => vardiyaHaritasi.get(id), [vardiyaHaritasi]);
  const tonBul = useCallback(
    (id: string) => TONLAR[Math.max(0, vardiyalar.findIndex((v) => v.id === id)) % TONLAR.length],
    [vardiyalar]
  );

  const gorunenPersonel = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr-TR");
    return personeller.filter(
      (p) =>
        p.aktif &&
        (subeFiltre === "TUMU" || p.varsayilan_sube_id === subeFiltre) &&
        (!q || `${p.ad} ${p.soyad} ${p.sicil_no}`.toLocaleLowerCase("tr-TR").includes(q))
    );
  }, [personeller, subeFiltre, ara]);

  const harita = useMemo(() => planHaritasi(planlar), [planlar]);

  const uyarilar = useMemo(() => {
    const idler = new Set(gorunenPersonel.map((p) => p.id));
    return planUyarilari(
      planlar.filter((p) => idler.has(p.personel_id)),
      vardiyaBul
    ).filter((u) => u.tur === "haftalik" || (u.tarih >= bas && u.tarih <= son));
  }, [planlar, gorunenPersonel, vardiyaBul, bas, son]);

  const hucreUyarilari = useMemo(() => {
    const m = new Map<string, PlanUyarisi[]>();
    for (const u of uyarilar) {
      if (u.tur === "haftalik") continue;
      const k = `${u.personel_id}|${u.tarih}`;
      m.set(k, [...(m.get(k) ?? []), u]);
    }
    return m;
  }, [uyarilar]);

  const kisiAdi = useCallback(
    (id: string) => {
      const p = personeller.find((x) => x.id === id);
      return p ? `${p.ad} ${p.soyad}` : "Personel";
    },
    [personeller]
  );

  async function gecenHaftayiKopyala() {
    const oncekiBas = gunEkle(bas, -7);
    const tamam = await onayla({
      baslik: "Geçen hafta bu haftaya kopyalansın mı?",
      metin: `${kisaTarih(oncekiBas)} haftasının planı, listedeki ${gorunenPersonel.length} personel için bu haftanın planının yerine yazılacak. Geçen hafta planı olmayan personelin bu haftası varsayılana döner.`,
      onayEtiketi: "Kopyala",
    });
    if (!tamam) return;
    setYukleniyor(true);
    try {
      const onceki = await tumunuGetir<PlanSatiri>((a, b) =>
        supabase
          .from("vardiya_plani")
          .select("id, personel_id, tarih, tur, vardiya_id, sube_id")
          .gte("tarih", oncekiBas)
          .lte("tarih", gunEkle(oncekiBas, 6))
          .in(
            "personel_id",
            gorunenPersonel.map((p) => p.id)
          )
          .order("id")
          .range(a, b)
      );
      await planYaz(gorunenPersonel, gunler, null);
      const yeni = onceki.map((p) => ({
        personel_id: p.personel_id,
        tarih: gunEkle(p.tarih, 7),
        tur: p.tur,
        vardiya_id: p.vardiya_id,
        sube_id: p.sube_id,
      }));
      for (const grup of parcala(yeni, 500)) {
        const { error } = await supabase.from("vardiya_plani").insert(grup);
        if (error) throw error;
      }
      bildir(`Geçen haftanın planı kopyalandı (${yeni.length} kayıt).`, "basari");
    } catch (err) {
      bildir(planHatasi(err), "hata");
    } finally {
      getir();
    }
  }

  const baslik =
    gorunum === "hafta" ? `${kisaTarih(bas)} - ${kisaTarih(son)} ${son.slice(0, 4)}` : ayAdi(baslangic.slice(0, 7));

  return (
    <div className="space-y-4">
      {/* Araç çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="segment" style={{ width: 180 }} role="tablist" aria-label="Görünüm">
          <button type="button" role="tab" aria-selected={gorunum === "hafta"} data-aktif={gorunum === "hafta"} onClick={() => gorunumSec("hafta")}>
            Haftalık
          </button>
          <button type="button" role="tab" aria-selected={gorunum === "ay"} data-aktif={gorunum === "ay"} onClick={() => gorunumSec("ay")}>
            Aylık
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-hayalet btn-ikon btn-kucuk" onClick={() => kaydir(-1)} aria-label="Önceki">
            <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
              <Ikon ad="sag" boyut={16} />
            </span>
          </button>
          <p className="baslik-font m1 min-w-[150px] text-center text-base">{baslik}</p>
          <button type="button" className="btn btn-hayalet btn-ikon btn-kucuk" onClick={() => kaydir(1)} aria-label="Sonraki">
            <Ikon ad="sag" boyut={16} />
          </button>
          <button type="button" className="btn btn-hayalet btn-kucuk" onClick={bugune}>
            Bugün
          </button>
        </div>
        <div className="arama-kutu min-w-[160px] flex-1 sm:max-w-xs">
          <Ikon ad="ara" boyut={16} />
          <input className="girdi girdi-sik" placeholder="İsim veya sicil ara" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Personel ara" />
        </div>
        <div className="flex gap-2">
          {gorunum === "hafta" && (
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={gecenHaftayiKopyala} disabled={yukleniyor || !!hata}>
              Geçen haftayı kopyala
            </button>
          )}
          <button type="button" className="btn btn-ana btn-kucuk" onClick={() => setTopluAcik(true)} disabled={!!hata}>
            <Ikon ad="arti" boyut={14} />
            Toplu atama
          </button>
        </div>
      </div>

      {/* Açıklama */}
      <div className="m2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {vardiyalar.map((v) => (
          <span key={v.id} className="flex items-center gap-1.5">
            <span className={`plan-cip plan-cip-${tonBul(v.id)}`}>{kisaAd(v.ad)}</span>
            {v.ad} {v.baslangic_saat.slice(0, 5)}-{v.bitis_saat.slice(0, 5)}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="plan-cip plan-cip-tatil">Tatil</span>
          Hafta tatili
        </span>
        <span className="flex items-center gap-1.5">
          <span className="plan-cip plan-cip-varsayilan">Sab</span>
          Soluk: plan yok, varsayılan geçerli
        </span>
        <span className="m3">Vardiya, başladığı günün sütununa yazılır (ör. 00:00 gece vardiyası o günün başında başlar).</span>
      </div>

      {hata && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--hata-acik)", color: "var(--hata)" }} role="alert">
          {hata}
        </div>
      )}

      {/* Uyarılar */}
      {uyarilar.length > 0 && (
        <details className="panel-ic px-4 py-3 text-sm" style={{ borderColor: "var(--uyari)" }}>
          <summary className="cursor-pointer font-semibold" style={{ color: "var(--uyari)" }}>
            {uyarilar.length} plan uyarısı (kaydı engellemez, kontrol edin)
          </summary>
          <ul className="m2 mt-2 space-y-1">
            {uyarilar.map((u, i) => (
              <li key={i}>
                <strong className="m1">{kisiAdi(u.personel_id)}</strong>
                {u.tur !== "haftalik" && `, ${kisaTarih(u.tarih)}`}: {u.mesaj}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Plan tablosu */}
      <div className="panel overflow-hidden">
        {yukleniyor && planlar.length === 0 && !hata ? (
          <div className="space-y-3 p-5">
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
          </div>
        ) : gorunenPersonel.length === 0 ? (
          <Bos ikon="vardiya" baslik="Personel yok" metin="Bu şubede aktif personel yok ya da arama sonucu boş." />
        ) : vardiyalar.length === 0 ? (
          <Bos ikon="vardiya" baslik="Önce vardiya tanımlayın" metin="Plan yapabilmek için Tanımlar bölümünden vardiya ekleyin." />
        ) : (
          <div className="overflow-x-auto" style={{ opacity: yukleniyor ? 0.6 : 1, transition: "opacity 0.15s" }}>
            <table className={`plan-tablo ${gorunum === "ay" ? "plan-tablo-ay" : ""}`}>
              <thead>
                <tr>
                  <th className="plan-kisi">Personel</th>
                  {gunler.map((t) => {
                    const hg = haftaGunu(t);
                    return (
                      <th key={t} data-bugun={t === bugun} data-pazar={hg === 0}>
                        <span className="block">{GUN_ADLARI[hg]}</span>
                        <span className="sayi block text-[13px]">{Number(t.slice(8))}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {gorunenPersonel.map((p) => (
                  <tr key={p.id}>
                    <td className="plan-kisi">
                      <div className="flex items-center gap-2">
                        {gorunum === "hafta" && <Avatar ad={p.ad} soyad={p.soyad} boyut={28} />}
                        <div className="min-w-0">
                          <p className="m1 truncate text-sm font-semibold">
                            {p.ad} {p.soyad}
                          </p>
                          {gorunum === "hafta" && <p className="m3 truncate text-xs">{p.subeler?.ad || "Şube yok"}</p>}
                        </div>
                      </div>
                    </td>
                    {gunler.map((t) => {
                      const anahtar = `${p.id}|${t}`;
                      // Puantajla aynı: vardiyası atanmamış personel için ilk tanımlı vardiya varsayılandır
                      const gp = gunPlani(harita.get(anahtar), t, p.vardiyalar ?? vardiyalar[0] ?? null, vardiyaBul);
                      const uy = hucreUyarilari.get(anahtar);
                      const soluk = gp.kaynak === "varsayilan" ? " plan-cip-varsayilan" : "";
                      return (
                        <td key={t} data-bugun={t === bugun}>
                          <button
                            type="button"
                            className="plan-hucre"
                            data-uyari={!!uy}
                            title={uy?.map((u) => u.mesaj).join("\n")}
                            onClick={() => setHucre({ personel: p, tarih: t })}
                            aria-label={`${p.ad} ${p.soyad}, ${kisaTarih(t)} planını düzenle`}
                          >
                            {gp.tatil ? (
                              <span className={`plan-cip plan-cip-tatil${soluk}`}>Tatil</span>
                            ) : gp.vardiyalar.length === 0 ? (
                              <span className="m3">-</span>
                            ) : (
                              gp.vardiyalar.map((v) => (
                                <span key={v.id} className={`plan-cip plan-cip-${tonBul(v.id)}${soluk}`}>
                                  {gorunum === "hafta" ? v.ad : kisaAd(v.ad)}
                                </span>
                              ))
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hucre && (
        <HucreFormu
          personel={hucre.personel}
          tarih={hucre.tarih}
          satirlar={harita.get(`${hucre.personel.id}|${hucre.tarih}`) ?? []}
          vardiyalar={vardiyalar}
          onKapat={() => setHucre(null)}
          onKayit={getir}
        />
      )}
      {topluAcik && (
        <TopluAtamaFormu
          personeller={gorunenPersonel}
          vardiyalar={vardiyalar}
          varsayilanBas={bas}
          varsayilanSon={son}
          onKapat={() => setTopluAcik(false)}
          onKayit={getir}
        />
      )}
    </div>
  );
}

// =====================================================================
// Vardiya seçici (tek gün ve toplu atamada ortak)
// =====================================================================
function VardiyaSecici({
  vardiyalar,
  tatil,
  secili,
  onTatil,
  onSecili,
}: {
  vardiyalar: Vardiya[];
  tatil: boolean;
  secili: string[];
  onTatil: (t: boolean) => void;
  onSecili: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {vardiyalar.map((v) => {
        const isaretli = !tatil && secili.includes(v.id);
        return (
          <label key={v.id} className="panel-ic flex cursor-pointer items-center gap-3 px-3 py-2.5" data-aktif={isaretli}>
            <input
              type="checkbox"
              checked={isaretli}
              onChange={(e) => {
                onTatil(false);
                onSecili(e.target.checked ? [...secili, v.id] : secili.filter((x) => x !== v.id));
              }}
            />
            <span className="m1 flex-1 text-sm font-semibold">{v.ad}</span>
            <span className="m2 sayi text-sm">
              {v.baslangic_saat.slice(0, 5)}-{v.bitis_saat.slice(0, 5)}
            </span>
          </label>
        );
      })}
      <label className="panel-ic flex cursor-pointer items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={tatil}
          onChange={(e) => {
            onTatil(e.target.checked);
            if (e.target.checked) onSecili([]);
          }}
        />
        <span className="m1 flex-1 text-sm font-semibold">Hafta tatili</span>
      </label>
      <p className="ipucu">Sabah ve akşam gibi bölünmüş çalışmada iki vardiyayı birden seçin.</p>
    </div>
  );
}

// =====================================================================
// Tek gün düzenleme
// =====================================================================
function HucreFormu({
  personel,
  tarih,
  satirlar,
  vardiyalar,
  onKapat,
  onKayit,
}: {
  personel: Personel;
  tarih: string;
  satirlar: PlanSatiri[];
  vardiyalar: Vardiya[];
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir } = useBildirim();
  const planVar = satirlar.length > 0;
  const varsayilan = personel.vardiyalar ?? vardiyalar[0] ?? null;
  const [tatil, setTatil] = useState(planVar ? satirlar.some((s) => s.tur === "TATIL") : haftaGunu(tarih) === 0);
  const [secili, setSecili] = useState<string[]>(
    planVar
      ? satirlar.filter((s) => s.vardiya_id).map((s) => s.vardiya_id as string)
      : haftaGunu(tarih) === 0 || !varsayilan
      ? []
      : [varsayilan.id]
  );
  const [yukleniyor, setYukleniyor] = useState(false);

  async function yaz(yeni: { tatil: boolean; vardiyaIdleri: string[] } | null) {
    setYukleniyor(true);
    try {
      await planYaz([personel], [tarih], yeni);
      bildir(yeni ? "Plan kaydedildi." : "Plan temizlendi, varsayılan vardiya geçerli.", "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(planHatasi(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!tatil && secili.length === 0) {
      bildir("Bir vardiya ya da hafta tatili seçin. Planı kaldırmak için 'Varsayılana dön' deyin.", "hata");
      return;
    }
    yaz({ tatil, vardiyaIdleri: tatil ? [] : secili });
  }

  const gunAdi = GUN_ADLARI[haftaGunu(tarih)];
  return (
    <Modal onKapat={onKapat} baslik={`${personel.ad} ${personel.soyad}`}>
      <form onSubmit={kaydet} className="space-y-4">
        <p className="m2 text-sm">
          {kisaTarih(tarih)} {gunAdi}
          {planVar ? "" : `, şu an plan yok (varsayılan: ${varsayilan?.ad ?? "vardiya yok"})`}
        </p>
        <VardiyaSecici vardiyalar={vardiyalar} tatil={tatil} secili={secili} onTatil={setTatil} onSecili={setSecili} />
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button type="button" className="btn btn-hayalet" disabled={yukleniyor || !planVar} onClick={() => yaz(null)}>
            Varsayılana dön
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ikincil" onClick={onKapat} disabled={yukleniyor}>
              Vazgeç
            </button>
            <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
              {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================================
// Toplu atama (haftalık / aylık planlar için)
// =====================================================================
const HAFTA_SIRASI = [1, 2, 3, 4, 5, 6, 0];

function TopluAtamaFormu({
  personeller,
  vardiyalar,
  varsayilanBas,
  varsayilanSon,
  onKapat,
  onKayit,
}: {
  personeller: Personel[];
  vardiyalar: Vardiya[];
  varsayilanBas: string;
  varsayilanSon: string;
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir, onayla } = useBildirim();
  const [seciliKisiler, setSeciliKisiler] = useState<string[]>([]);
  const [bas, setBas] = useState(varsayilanBas);
  const [son, setSon] = useState(varsayilanSon);
  const [gunler, setGunler] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [islem, setIslem] = useState<"ata" | "temizle">("ata");
  const [tatil, setTatil] = useState(false);
  const [secili, setSecili] = useState<string[]>(vardiyalar[0] ? [vardiyalar[0].id] : []);
  const [yukleniyor, setYukleniyor] = useState(false);

  const tarihler = useMemo(
    () => (bas && son && bas <= son ? gunAraligi(bas, son).filter((t) => gunler.includes(haftaGunu(t))) : []),
    [bas, son, gunler]
  );
  const hepsiSecili = seciliKisiler.length === personeller.length && personeller.length > 0;

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const kisiler = personeller.filter((p) => seciliKisiler.includes(p.id));
    if (kisiler.length === 0) return bildir("En az bir personel seçin.", "hata");
    if (tarihler.length === 0) return bildir("Tarih aralığı ve günleri kontrol edin.", "hata");
    if (tarihler.length > 62) return bildir("Tek seferde en fazla 62 gün planlanabilir.", "hata");
    if (islem === "ata" && !tatil && secili.length === 0) return bildir("Bir vardiya ya da hafta tatili seçin.", "hata");

    const tamam = await onayla({
      baslik: islem === "temizle" ? "Plan temizlensin mi?" : "Toplu atama yapılsın mı?",
      metin: `${kisiler.length} personelin ${tarihler.length} günlük planı ${
        islem === "temizle" ? "silinecek ve varsayılan vardiyaya dönecek" : "seçtiğiniz şekilde yeniden yazılacak"
      }. Bu günlerdeki mevcut plan değişir.`,
      onayEtiketi: islem === "temizle" ? "Temizle" : "Uygula",
      tehlikeli: islem === "temizle",
    });
    if (!tamam) return;

    setYukleniyor(true);
    try {
      await planYaz(kisiler, tarihler, islem === "temizle" ? null : { tatil, vardiyaIdleri: tatil ? [] : secili });
      bildir(`${kisiler.length} personel, ${tarihler.length} gün için plan güncellendi.`, "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(planHatasi(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Toplu vardiya ataması" genis>
      <form onSubmit={kaydet} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="etiket">Personel ({seciliKisiler.length} seçili)</label>
            <button
              type="button"
              className="btn btn-hayalet btn-kucuk"
              onClick={() => setSeciliKisiler(hepsiSecili ? [] : personeller.map((p) => p.id))}
            >
              {hepsiSecili ? "Hiçbiri" : "Tümünü seç"}
            </button>
          </div>
          <div className="panel-ic max-h-72 overflow-y-auto">
            {personeller.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={seciliKisiler.includes(p.id)}
                  onChange={(e) =>
                    setSeciliKisiler(e.target.checked ? [...seciliKisiler, p.id] : seciliKisiler.filter((x) => x !== p.id))
                  }
                />
                <span className="m1 flex-1 truncate text-sm">
                  {p.ad} {p.soyad}
                </span>
                <span className="m3 truncate text-xs">{p.vardiyalar?.ad ?? ""}</span>
              </label>
            ))}
          </div>
          <p className="ipucu">Liste, ekrandaki şube filtresine ve aramaya göre gelir.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="etiket">Başlangıç</label>
              <input className="girdi sayi" type="date" required value={bas} onChange={(e) => setBas(e.target.value)} />
            </div>
            <div>
              <label className="etiket">Bitiş</label>
              <input className="girdi sayi" type="date" required value={son} onChange={(e) => setSon(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="etiket">Günler</label>
            <div className="flex flex-wrap gap-1.5">
              {HAFTA_SIRASI.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`btn btn-kucuk ${gunler.includes(g) ? "btn-ana" : "btn-ikincil"}`}
                  aria-pressed={gunler.includes(g)}
                  onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}
                >
                  {GUN_ADLARI[g]}
                </button>
              ))}
            </div>
            <p className="ipucu">{tarihler.length} gün etkilenecek.</p>
          </div>
          <div className="segment" role="tablist" aria-label="İşlem">
            <button type="button" role="tab" aria-selected={islem === "ata"} data-aktif={islem === "ata"} onClick={() => setIslem("ata")}>
              Vardiya ata
            </button>
            <button type="button" role="tab" aria-selected={islem === "temizle"} data-aktif={islem === "temizle"} onClick={() => setIslem("temizle")}>
              Planı temizle
            </button>
          </div>
          {islem === "ata" ? (
            <VardiyaSecici vardiyalar={vardiyalar} tatil={tatil} secili={secili} onTatil={setTatil} onSecili={setSecili} />
          ) : (
            <p className="m2 text-sm">Seçilen günlerin planı silinir; personel varsayılan vardiyasına döner.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn btn-ikincil" onClick={onKapat} disabled={yukleniyor}>
            Vazgeç
          </button>
          <button type="submit" className={`btn ${islem === "temizle" ? "btn-tehlike" : "btn-ana"}`} disabled={yukleniyor}>
            {yukleniyor ? "Uygulanıyor..." : islem === "temizle" ? "Planı temizle" : "Uygula"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
