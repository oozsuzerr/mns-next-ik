"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabase";
import { hataYaz, type Personel, type YoneticiBilgisi } from "../../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../../lib/tarih";
import { gunEkle } from "../../../lib/vardiyaPlani";
import { k, tr, yazdir } from "../../../lib/izinBelgeleri";
import {
  EGITIM_KATEGORILERI,
  ONERILEN_TURLER,
  ayEkle,
  egitimDurumu,
  type EgitimDurumu,
  type EgitimKaydi,
  type EgitimTuru,
} from "../../../lib/egitim";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim, type RozetTon } from "../../ui";
import { kurulmamis, KurulumUyarisi } from "./ortak";

const YAKLASMA_GUN = 30;
const DURUM: Record<EgitimDurumu, { ad: string; ton: RozetTon }> = {
  gecerli: { ad: "Geçerli", ton: "giris" },
  yaklasiyor: { ad: "Yaklaşıyor", ton: "uyari" },
  doldu: { ad: "Süresi doldu", ton: "hata" },
  yok: { ad: "Almadı", ton: "hata" },
};

interface Oturum {
  id: string;
  tur: EgitimTuru | undefined;
  tarih: string;
  sure_saat: number | null;
  egitmen: string | null;
  kurum: string | null;
  kayitlar: EgitimKaydi[];
}

/** Bir eğitim oturumunun imzalı katılım formu */
function katilimFormuYazdir(firmaAd: string, o: Oturum, kisiler: Map<string, Personel>): string | null {
  const satirlar = o.kayitlar
    .map((r) => kisiler.get(r.personel_id))
    .filter((p): p is Personel => !!p)
    .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"))
    .map(
      (p, i) =>
        `<tr><td class="sag">${i + 1}</td><td>${k(`${p.ad} ${p.soyad}`)}</td><td>${k(p.tc_kimlik)}</td><td>${k([p.unvan, p.departman].filter(Boolean).join(" / "))}</td><td style="width:30%"></td></tr>`
    )
    .join("");
  const bitis = o.kayitlar[0]?.gecerlilik_bitis;
  const govde = `
    <div class="ust">
      <div><h1>Eğitim Katılım Formu</h1><div class="kucuk">${k(o.tur?.kategori ?? "")}</div></div>
      <div class="kucuk">Düzenleme tarihi: ${tr(yerelTarih())}</div>
    </div>
    <table class="bilgi">
      <tr><td>İşveren</td><td>${k(firmaAd)}</td></tr>
      <tr><td>Eğitimin adı</td><td>${k(o.tur?.ad ?? "")}</td></tr>
      <tr><td>Tarih / süre</td><td>${tr(o.tarih)}${o.sure_saat ? ` / ${String(o.sure_saat).replace(".", ",")} saat` : ""}</td></tr>
      <tr><td>Eğitimi veren / kurum</td><td>${k(o.egitmen ?? "-")} / ${k(o.kurum ?? "-")}</td></tr>
      ${bitis ? `<tr><td>Geçerlilik</td><td>${tr(bitis)} tarihine kadar</td></tr>` : ""}
    </table>
    <h2>Katılımcılar</h2>
    <table>
      <tr><th class="sag">#</th><th>Ad soyad</th><th>T.C. kimlik no</th><th>Görev / departman</th><th>İmza</th></tr>
      ${satirlar}
    </table>
    <p class="beyan">Yukarıda adı geçen çalışanlar belirtilen tarihte eğitime katılmıştır.</p>
    <div class="imzalar">
      <div>Eğitimi veren<br /><span class="kucuk">${k(o.egitmen ?? "")}</span></div>
      <div>İşveren / işveren vekili</div>
    </div>`;
  return yazdir(`Eğitim katılım formu - ${o.tur?.ad ?? ""} ${o.tarih}`, govde);
}

export default function EgitimSekmesi({ personeller, yonetici }: { personeller: Personel[]; yonetici: YoneticiBilgisi }) {
  const { bildir, onayla } = useBildirim();
  const genel = yonetici.rol === "GENEL";
  const yazabilir = genel || yonetici.yetkiler.includes("personel");
  const firmaAd = yonetici.firma?.ad ?? "";
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [turler, setTurler] = useState<EgitimTuru[]>([]);
  const [kayitlar, setKayitlar] = useState<EgitimKaydi[]>([]);
  const [gorunum, setGorunum] = useState<"durum" | "kayitlar" | "turler">("durum");
  const [kayitAcik, setKayitAcik] = useState(false);
  const [turForm, setTurForm] = useState<EgitimTuru | "yeni" | null>(null);

  const kisiler = useMemo(() => new Map(personeller.map((p) => [p.id, p])), [personeller]);
  const turHaritasi = useMemo(() => new Map(turler.map((t) => [t.id, t])), [turler]);

  const getir = useCallback(
    () =>
      Promise.all([
        supabase.from("egitim_turleri").select("*").order("ad"),
        supabase.from("egitim_kayitlari").select("*").order("tarih", { ascending: false }),
      ]).then(([t, r]) => {
        const hata = t.error ?? r.error;
        if (hata) {
          setDurum(kurulmamis(hata, "egitim_") ? "kurulmamis" : "hazir");
          if (!kurulmamis(hata, "egitim_")) bildir(hataYaz(hata), "hata");
          return;
        }
        setTurler((t.data ?? []) as EgitimTuru[]);
        setKayitlar((r.data ?? []) as EgitimKaydi[]);
        setDurum("hazir");
      }),
    [bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (durum === "kurulmamis") return <KurulumUyarisi dosya="supabase/2026-10-17_egitim.sql" />;

  const bugun = yerelTarih();
  const yaklasma = gunEkle(bugun, YAKLASMA_GUN);
  const aktifler = personeller
    .filter((p) => p.aktif && (!p.cikis_tarihi || p.cikis_tarihi >= bugun))
    .sort((a, b) => `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`, "tr"));
  const zorunlular = turler.filter((t) => t.zorunlu);
  const gorulenKayitlar = kayitlar.filter((r) => kisiler.has(r.personel_id));

  // Personel + tür başına en son kayıt (kayıtlar tarihe göre azalan geliyor)
  const sonKayit = new Map<string, EgitimKaydi>();
  for (const r of gorulenKayitlar) {
    const anahtar = `${r.personel_id}|${r.tur_id}`;
    if (!sonKayit.has(anahtar)) sonKayit.set(anahtar, r);
  }
  const sayac: Record<EgitimDurumu, number> = { gecerli: 0, yaklasiyor: 0, doldu: 0, yok: 0 };
  for (const p of aktifler) for (const t of zorunlular) sayac[egitimDurumu(sonKayit.get(`${p.id}|${t.id}`), bugun, yaklasma)]++;
  // Zorunlu olmayan eğitimlerde de süresi dolan/yaklaşanlar
  const dolanlar = [...sonKayit.values()].filter((r) => {
    const p = kisiler.get(r.personel_id);
    return p && aktifler.includes(p) && !turHaritasi.get(r.tur_id)?.zorunlu && ["doldu", "yaklasiyor"].includes(egitimDurumu(r, bugun, yaklasma));
  });

  const oturumlar: Oturum[] = [];
  const oturumHaritasi = new Map<string, Oturum>();
  for (const r of gorulenKayitlar) {
    let o = oturumHaritasi.get(r.oturum_id);
    if (!o) {
      o = { id: r.oturum_id, tur: turHaritasi.get(r.tur_id), tarih: r.tarih, sure_saat: r.sure_saat, egitmen: r.egitmen, kurum: r.kurum, kayitlar: [] };
      oturumHaritasi.set(r.oturum_id, o);
      oturumlar.push(o);
    }
    o.kayitlar.push(r);
  }

  async function oturumSil(o: Oturum) {
    const tamam = await onayla({
      baslik: `${o.tur?.ad ?? "Eğitim"} (${kisaTarih(o.tarih)}) silinsin mi?`,
      metin: `${o.kayitlar.length} personelin bu eğitim kaydı silinir.`,
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("egitim_kayitlari").delete().eq("oturum_id", o.id);
    if (error) return bildir(hataYaz(error), "hata");
    bildir("Kayıt silindi.", "basari");
    await getir();
  }

  async function turSil(t: EgitimTuru) {
    if (kayitlar.some((r) => r.tur_id === t.id)) return bildir("Bu türde eğitim kaydı var; önce kayıtları silin.", "hata");
    const tamam = await onayla({ baslik: `"${t.ad}" silinsin mi?`, metin: "Eğitim türü listeden kaldırılır.", onayEtiketi: "Sil", tehlikeli: true });
    if (!tamam) return;
    const { error } = await supabase.from("egitim_turleri").delete().eq("id", t.id);
    if (error) return bildir(hataYaz(error), "hata");
    await getir();
  }

  async function onerilenleriEkle() {
    const var_ = new Set(turler.map((t) => t.ad.toLocaleLowerCase("tr")));
    const eklenecek = ONERILEN_TURLER.filter((t) => !var_.has(t.ad.toLocaleLowerCase("tr")));
    if (!eklenecek.length) return bildir("Önerilen türlerin hepsi zaten var.", "bilgi");
    const { error } = await supabase.from("egitim_turleri").insert(eklenecek);
    if (error) return bildir(hataYaz(error), "hata");
    bildir(`${eklenecek.length} eğitim türü eklendi. Temel İSG süresini tehlike sınıfınıza göre kontrol edin.`, "basari");
    await getir();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {(["gecerli", "yaklasiyor", "doldu", "yok"] as const).map((d) => (
          <div key={d} className="panel px-5 py-4">
            <p className="m3 text-xs">{d === "yok" ? "Zorunlu eğitimi almamış" : `Zorunlu eğitim: ${DURUM[d].ad.toLocaleLowerCase("tr")}`}</p>
            <p className="baslik-font sayi m1 text-2xl">{sayac[d]}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="segment segment-3" style={{ width: 360, maxWidth: "100%" }} role="tablist" aria-label="Eğitim görünümü">
          {(
            [
              ["durum", "Durum"],
              ["kayitlar", "Kayıtlar"],
              ["turler", "Eğitim türleri"],
            ] as const
          ).map(([id, ad]) => (
            <button key={id} type="button" role="tab" aria-selected={gorunum === id} data-aktif={gorunum === id} onClick={() => setGorunum(id)}>
              {ad}
            </button>
          ))}
        </div>
        {yazabilir && turler.length > 0 && (
          <button type="button" className="btn btn-ana ml-auto" onClick={() => setKayitAcik(true)}>
            <Ikon ad="arti" boyut={16} />
            Eğitim kaydı ekle
          </button>
        )}
      </div>

      {durum === "yukleniyor" ? (
        <div className="panel space-y-3 p-5">
          <Iskelet genislik="60%" />
          <Iskelet genislik="80%" />
        </div>
      ) : turler.length === 0 ? (
        <div className="panel">
          <Bos ikon="rapor" baslik="Henüz eğitim türü yok" metin="Önce eğitim türlerini tanımlayın; zorunlu olanlar her personel için takip edilir.">
            {genel && (
              <button type="button" className="btn btn-ana" onClick={onerilenleriEkle}>
                Önerilen türleri ekle (İSG, yangın, ilk yardım...)
              </button>
            )}
          </Bos>
        </div>
      ) : gorunum === "durum" ? (
        <div className="space-y-4">
          {zorunlular.length === 0 ? (
            <div className="panel px-5 py-4 text-sm">
              <p className="m1">Zorunlu işaretli eğitim türü yok. Eğitim türleri bölümünden takip edilecek eğitimleri &quot;zorunlu&quot; yapın.</p>
            </div>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="m2 px-4 py-3 text-left text-xs font-semibold">Personel</th>
                    {zorunlular.map((t) => (
                      <th key={t.id} className="m2 px-4 py-3 text-left text-xs font-semibold">
                        {t.ad}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aktifler.map((p) => (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }}>
                      <td className="m1 px-4 py-2 whitespace-nowrap">
                        {p.ad} {p.soyad}
                      </td>
                      {zorunlular.map((t) => {
                        const r = sonKayit.get(`${p.id}|${t.id}`);
                        const d = egitimDurumu(r, bugun, yaklasma);
                        return (
                          <td key={t.id} className="px-4 py-2 whitespace-nowrap">
                            <Rozet ton={DURUM[d].ton}>{DURUM[d].ad}</Rozet>
                            {r && (
                              <span className="m3 ml-2 text-xs">
                                {kisaTarih(r.tarih)}
                                {r.gecerlilik_bitis ? ` → ${kisaTarih(r.gecerlilik_bitis)}` : ""}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dolanlar.length > 0 && (
            <div className="panel overflow-hidden">
              <p className="m1 px-5 pt-4 text-sm font-semibold">Diğer eğitimlerde süresi dolan / yaklaşan</p>
              <ul className="liste">
                {dolanlar.map((r) => {
                  const p = kisiler.get(r.personel_id);
                  const d = egitimDurumu(r, bugun, yaklasma);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2 text-sm">
                      <span className="m1 flex-1">
                        {p?.ad} {p?.soyad} · {turHaritasi.get(r.tur_id)?.ad}
                      </span>
                      <Rozet ton={DURUM[d].ton}>
                        {DURUM[d].ad} · {kisaTarih(r.gecerlilik_bitis!)}
                      </Rozet>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : gorunum === "kayitlar" ? (
        <div className="panel overflow-hidden">
          {oturumlar.length === 0 ? (
            <Bos ikon="rapor" baslik="Henüz eğitim kaydı yok" metin="Bir eğitime katılan personeli tek seferde kaydedin, katılım formunu yazdırın." />
          ) : (
            <ul className="liste">
              {oturumlar.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="m1 text-sm font-semibold">{o.tur?.ad}</p>
                    <p className="m3 text-xs">
                      {kisaTarih(o.tarih)}
                      {o.sure_saat ? ` · ${String(o.sure_saat).replace(".", ",")} saat` : ""}
                      {o.egitmen ? ` · ${o.egitmen}` : ""}
                      {o.kurum ? ` (${o.kurum})` : ""}
                    </p>
                    <p className="m2 text-xs">
                      {o.kayitlar
                        .map((r) => kisiler.get(r.personel_id))
                        .map((p) => `${p?.ad} ${p?.soyad}`)
                        .join(", ")}
                    </p>
                  </div>
                  <Rozet ton="izin">{o.kayitlar.length} kişi</Rozet>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-hayalet btn-kucuk"
                      onClick={() => {
                        const h = katilimFormuYazdir(firmaAd, o, kisiler);
                        if (h) bildir(h, "hata");
                      }}
                    >
                      <Ikon ad="rapor" boyut={15} />
                      Katılım formu
                    </button>
                    {yazabilir && (
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => oturumSil(o)} aria-label="Sil">
                        <Ikon ad="cop" boyut={15} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {genel && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setTurForm("yeni")}>
                <Ikon ad="arti" boyut={15} />
                Tür ekle
              </button>
              <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onerilenleriEkle}>
                Önerilen türleri ekle
              </button>
            </div>
          )}
          <div className="panel overflow-hidden">
            <ul className="liste">
              {turler.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="m1 text-sm font-semibold">{t.ad}</p>
                    <p className="m3 text-xs">
                      {t.kategori}
                      {t.sure_saat ? ` · ${String(t.sure_saat).replace(".", ",")} saat` : ""}
                      {t.gecerlilik_ay ? ` · ${t.gecerlilik_ay % 12 === 0 ? `${t.gecerlilik_ay / 12} yılda bir` : `${t.gecerlilik_ay} ayda bir`}` : " · süresiz"}
                    </p>
                    {t.aciklama && <p className="m2 text-xs">{t.aciklama}</p>}
                  </div>
                  {t.zorunlu && <Rozet ton="uyari">Zorunlu</Rozet>}
                  {genel && (
                    <div className="flex gap-1">
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setTurForm(t)} aria-label={`${t.ad} düzenle`}>
                        <Ikon ad="kalem" boyut={15} />
                      </button>
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => turSil(t)} aria-label={`${t.ad} sil`}>
                        <Ikon ad="cop" boyut={15} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {kayitAcik && (
        <KayitFormu
          turler={turler}
          personeller={aktifler}
          onKapat={() => setKayitAcik(false)}
          onKayit={async (liste) => {
            setKayitAcik(false);
            await getir();
            setGorunum("kayitlar");
            const tamam = await onayla({
              baslik: "Katılım formu yazdırılsın mı?",
              metin: "Katılımcıların imzalayacağı form açılır; imzalandıktan sonra özlük dosyasına konur.",
              onayEtiketi: "Yazdır",
            });
            // Pencere onay tıklamasıyla hemen açılır (araya istek girerse tarayıcı engelleyebilir)
            if (!tamam || !liste.length) return;
            const h = katilimFormuYazdir(
              firmaAd,
              { id: liste[0].oturum_id, tur: turHaritasi.get(liste[0].tur_id), tarih: liste[0].tarih, sure_saat: liste[0].sure_saat, egitmen: liste[0].egitmen, kurum: liste[0].kurum, kayitlar: liste },
              kisiler
            );
            if (h) bildir(h, "hata");
          }}
        />
      )}
      {turForm && (
        <TurFormu
          tur={turForm === "yeni" ? null : turForm}
          onKapat={() => setTurForm(null)}
          onKayit={async () => {
            setTurForm(null);
            await getir();
          }}
        />
      )}
    </div>
  );
}

function KayitFormu({
  turler,
  personeller,
  onKapat,
  onKayit,
}: {
  turler: EgitimTuru[];
  personeller: Personel[];
  onKapat: () => void;
  onKayit: (kayitlar: EgitimKaydi[]) => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [turId, setTurId] = useState((turler.find((t) => t.zorunlu) ?? turler[0])?.id ?? "");
  const tur = turler.find((t) => t.id === turId);
  const [tarih, setTarih] = useState(yerelTarih());
  const [sure, setSure] = useState<string | null>(null);
  const [bitis, setBitis] = useState<string | null>(null);
  const [egitmen, setEgitmen] = useState("");
  const [kurum, setKurum] = useState("");
  const [notlar, setNotlar] = useState("");
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [arama, setArama] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  // Süre ve bitiş türden gelir; kullanıcı değiştirirse onun değeri kullanılır
  const gecerliSure = sure ?? (tur?.sure_saat != null ? String(tur.sure_saat).replace(".", ",") : "");
  const gecerliBitis = bitis ?? (tur?.gecerlilik_ay ? ayEkle(tarih, tur.gecerlilik_ay) : "");
  const aranan = arama.trim().toLocaleLowerCase("tr");
  const gorunen = personeller.filter((p) => !aranan || `${p.ad} ${p.soyad} ${p.sicil_no}`.toLocaleLowerCase("tr").includes(aranan));

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!tur) return bildir("Eğitim türünü seçin.", "hata");
    if (!secili.size) return bildir("En az bir katılımcı seçin.", "hata");
    const sureSayi = gecerliSure.trim() ? Number(gecerliSure.replace(",", ".")) : null;
    if (sureSayi != null && (!Number.isFinite(sureSayi) || sureSayi <= 0)) return bildir("Süre geçerli bir saat olmalı.", "hata");
    if (gecerliBitis && gecerliBitis <= tarih) return bildir("Geçerlilik bitişi eğitim tarihinden sonra olmalı.", "hata");
    setYukleniyor(true);
    const oturumId = crypto.randomUUID();
    const { data, error } = await supabase.from("egitim_kayitlari").insert(
      [...secili].map((pid) => ({
        personel_id: pid,
        tur_id: tur.id,
        oturum_id: oturumId,
        tarih,
        sure_saat: sureSayi,
        egitmen: egitmen.trim() || null,
        kurum: kurum.trim() || null,
        gecerlilik_bitis: gecerliBitis || null,
        notlar: notlar.trim() || null,
      }))
    ).select("*");
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir(`${secili.size} personelin eğitimi kaydedildi.`, "basari");
    await onKayit((data ?? []) as EgitimKaydi[]);
  }

  return (
    <Modal onKapat={onKapat} baslik="Eğitim kaydı ekle" genis>
      <form onSubmit={kaydet} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket" htmlFor="eTur">
              Eğitim
            </label>
            <select
              id="eTur"
              className="girdi"
              value={turId}
              onChange={(e) => {
                setTurId(e.target.value);
                setSure(null);
                setBitis(null);
              }}
            >
              {turler.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ad}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiket" htmlFor="eTarih">
              Tarih
            </label>
            <input
              id="eTarih"
              className="girdi sayi"
              type="date"
              required
              max={yerelTarih()}
              value={tarih}
              onChange={(e) => {
                setTarih(e.target.value);
                setBitis(null);
              }}
            />
          </div>
          <div>
            <label className="etiket" htmlFor="eSure">
              Süre (saat)
            </label>
            <input id="eSure" className="girdi sayi" inputMode="decimal" value={gecerliSure} onChange={(e) => setSure(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="eBitis">
              Geçerlilik bitişi {tur?.gecerlilik_ay ? "" : "(süresizse boş)"}
            </label>
            <input id="eBitis" className="girdi sayi" type="date" value={gecerliBitis} onChange={(e) => setBitis(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="eEgitmen">
              Eğitimi veren
            </label>
            <input id="eEgitmen" className="girdi" maxLength={150} placeholder="ör. İş güvenliği uzmanı adı" value={egitmen} onChange={(e) => setEgitmen(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="eKurum">
              Kurum
            </label>
            <input id="eKurum" className="girdi" maxLength={150} placeholder="ör. OSGB adı" value={kurum} onChange={(e) => setKurum(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="eNot">
            Not
          </label>
          <input id="eNot" className="girdi" maxLength={500} value={notlar} onChange={(e) => setNotlar(e.target.value)} />
        </div>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="etiket mb-0">Katılımcılar ({secili.size})</p>
            <input
              className="girdi ml-auto"
              style={{ maxWidth: 220, padding: "4px 8px" }}
              type="search"
              placeholder="Ara"
              aria-label="Katılımcı ara"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
            />
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setSecili(new Set([...secili, ...gorunen.map((p) => p.id)]))}>
              Tümünü seç
            </button>
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => setSecili(new Set())}>
              Temizle
            </button>
          </div>
          <ul className="panel grid max-h-60 gap-x-4 overflow-y-auto p-3 sm:grid-cols-2">
            {gorunen.map((p) => (
              <li key={p.id}>
                <label className="m1 flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={secili.has(p.id)}
                    onChange={(e) => {
                      const s = new Set(secili);
                      if (e.target.checked) s.add(p.id);
                      else s.delete(p.id);
                      setSecili(s);
                    }}
                  />
                  {p.ad} {p.soyad}
                  <span className="m3 text-xs">{p.subeler?.ad ?? ""}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TurFormu({ tur, onKapat, onKayit }: { tur: EgitimTuru | null; onKapat: () => void; onKayit: () => Promise<void> }) {
  const { bildir } = useBildirim();
  const [ad, setAd] = useState(tur?.ad ?? "");
  const [kategori, setKategori] = useState<EgitimTuru["kategori"]>(tur?.kategori ?? "İSG");
  const [sure, setSure] = useState(tur?.sure_saat != null ? String(tur.sure_saat).replace(".", ",") : "");
  const [ay, setAy] = useState(tur?.gecerlilik_ay != null ? String(tur.gecerlilik_ay) : "");
  const [zorunlu, setZorunlu] = useState(tur?.zorunlu ?? false);
  const [aciklama, setAciklama] = useState(tur?.aciklama ?? "");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!ad.trim()) return bildir("Eğitim adını yazın.", "hata");
    const sureSayi = sure.trim() ? Number(sure.replace(",", ".")) : null;
    const aySayi = ay.trim() ? Number(ay) : null;
    if (sureSayi != null && (!Number.isFinite(sureSayi) || sureSayi <= 0)) return bildir("Süre geçerli bir saat olmalı.", "hata");
    if (aySayi != null && (!Number.isInteger(aySayi) || aySayi < 1 || aySayi > 120)) return bildir("Yenileme 1-120 ay arasında olmalı.", "hata");
    setYukleniyor(true);
    const alanlar = { ad: ad.trim(), kategori, sure_saat: sureSayi, gecerlilik_ay: aySayi, zorunlu, aciklama: aciklama.trim() || null };
    const { error } = tur
      ? await supabase.from("egitim_turleri").update(alanlar).eq("id", tur.id)
      : await supabase.from("egitim_turleri").insert(alanlar);
    setYukleniyor(false);
    if (error) return bildir(error.code === "23505" ? "Bu adda bir eğitim türü zaten var." : hataYaz(error), "hata");
    bildir("Eğitim türü kaydedildi.", "basari");
    await onKayit();
  }

  return (
    <Modal onKapat={onKapat} baslik={tur ? "Eğitim türünü düzenle" : "Eğitim türü ekle"}>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="tAd">
            Ad
          </label>
          <input id="tAd" className="girdi" required maxLength={150} value={ad} onChange={(e) => setAd(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="etiket" htmlFor="tKategori">
              Kategori
            </label>
            <select id="tKategori" className="girdi" value={kategori} onChange={(e) => setKategori(e.target.value as EgitimTuru["kategori"])}>
              {EGITIM_KATEGORILERI.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiket" htmlFor="tSure">
              Süre (saat)
            </label>
            <input id="tSure" className="girdi sayi" inputMode="decimal" value={sure} onChange={(e) => setSure(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="tAy">
              Yenileme (ay)
            </label>
            <input id="tAy" className="girdi sayi" type="number" min={1} max={120} placeholder="süresiz" value={ay} onChange={(e) => setAy(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiket" htmlFor="tAciklama">
            Açıklama
          </label>
          <input id="tAciklama" className="girdi" maxLength={500} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
        </div>
        <label className="m1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={zorunlu} onChange={(e) => setZorunlu(e.target.checked)} />
          Zorunlu (bütün personelde takip edilir)
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-hayalet" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
