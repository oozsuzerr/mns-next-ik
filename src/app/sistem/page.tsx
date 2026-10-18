"use client";

// Sistem yöneticisi ekranı: firmaları listeler, yeni firma ve ilk yöneticisini açar, firmayı aktif/pasif yapar.
// Yalnızca sistem_yoneticileri tablosundaki kullanıcılar görür; denetim veritabanında ve sunucuda da yapılır.
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz } from "../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { Bos, Iskelet, Ikon, Marka, Modal, Rozet, useBildirim } from "../../components/ui";
import { SifreBelirleFormu } from "../../components/SifreFormlari";
import { MODULLER, TUM_MODULLER } from "../../lib/moduller";

interface FirmaSatiri {
  id: string;
  ad: string;
  kod: string;
  aktif: boolean;
  created_at: string;
  /** Paket kurulmadan önceki veritabanında gelmez */
  moduller?: string[];
  personel_limit?: number | null;
  personel: number;
  sube: number;
  yoneticiler: { eposta: string | null; rol: "GENEL" | "SUBE"; son_giris: string | null }[];
}

const KOD = /^[a-z0-9-]{3,20}$/;

const SUNUCU_HATALARI: Record<string, string> = {
  YETKISIZ: "Bu işlem için sistem yöneticisi olmalısınız.",
  KOD_GECERSIZ: "Kod 3-20 karakter olmalı; yalnızca küçük harf, rakam ve tire.",
  KOD_KULLANILIYOR: "Bu kod başka bir firmada kullanılıyor.",
  EPOSTA_GECERSIZ: "E-posta adresi geçersiz.",
  EPOSTA_KULLANILIYOR: "Bu e-postayla zaten bir hesap var. Yeni firmanın yöneticisi için başka bir e-posta kullanın.",
  SIFRE_GECERSIZ: "Şifre 8-72 karakter olmalı.",
  FIRMA_ADI_GECERSIZ: "Firma adı en az 2 karakter olmalı.",
  SUNUCU_ANAHTARI_YOK: "Sunucu ayarı eksik (SUPABASE_SERVICE_ROLE_KEY).",
  LIMIT_GECERSIZ: "Personel sınırı 1 ile 100.000 arasında bir sayı olmalı (sınırsız için boş bırakın).",
  PAKET_KAYDEDILEMEDI: "Firma açılamadı: paket kaydedilemedi. Veritabanı güncellemesi (firma_paketi) çalıştırılmamış olabilir.",
};

/** "Antik Kapı İnşaat" -> "antik-kapi-insaat" */
function kodOner(ad: string): string {
  return ad
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)
    .replace(/-+$/g, "");
}

function mobilBaglanti(kod: string): string {
  return `${window.location.origin}/mobil?f=${kod}`;
}

export default function SistemSayfasi() {
  const { bildir, onayla } = useBildirim();
  const [durum, setDurum] = useState<"yukleniyor" | "giris" | "yetkisiz" | "hazir">("yukleniyor");
  const [firmalar, setFirmalar] = useState<FirmaSatiri[]>([]);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const [sifreEposta, setSifreEposta] = useState<string | null>(null);
  const [paketFirma, setPaketFirma] = useState<FirmaSatiri | null>(null);

  const listeyiGetir = useCallback(async () => {
    setYenileniyor(true);
    const { data, error } = await supabase.rpc("sistem_firma_listesi");
    setYenileniyor(false);
    if (error) {
      if (error.message.includes("YETKISIZ")) setDurum("yetkisiz");
      else bildir(hataYaz(error), "hata");
      return;
    }
    setFirmalar((data ?? []) as FirmaSatiri[]);
    setDurum("hazir");
  }, [bildir]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return setDurum("giris");
      const { data: sistem } = await supabase.rpc("sistem_yoneticisi");
      if (sistem !== true) return setDurum("yetkisiz");
      await listeyiGetir();
    });
  }, [listeyiGetir]);

  async function durumDegistir(f: FirmaSatiri) {
    const tamam = await onayla({
      baslik: f.aktif ? `${f.ad} pasife alınsın mı?` : `${f.ad} yeniden açılsın mı?`,
      metin: f.aktif
        ? "Firmanın yöneticileri panele, personeli mobile giremez; açık mobil oturumlar kapanır. Veriler silinmez, firma yeniden açılabilir."
        : "Firmanın yöneticileri ve personeli yeniden giriş yapabilir.",
      onayEtiketi: f.aktif ? "Pasife al" : "Aç",
    });
    if (!tamam) return;
    const { error } = await supabase.rpc("sistem_firma_durum", { p_firma_id: f.id, p_aktif: !f.aktif });
    if (error) return bildir(hataYaz(error), "hata");
    bildir(f.aktif ? "Firma pasife alındı." : "Firma açıldı.", "basari");
    listeyiGetir();
  }

  async function baglantiKopyala(kod: string) {
    try {
      await navigator.clipboard.writeText(mobilBaglanti(kod));
      bildir("Personel giriş bağlantısı kopyalandı.", "basari");
    } catch {
      bildir(mobilBaglanti(kod), "bilgi");
    }
  }

  if (durum === "yukleniyor") {
    return <div className="m2 flex min-h-screen items-center justify-center text-sm">Yükleniyor...</div>;
  }
  if (durum === "giris" || durum === "yetkisiz") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Marka boyut={44} />
        <p className="m1 font-semibold">
          {durum === "giris" ? "Önce panelden giriş yapın." : "Bu sayfa yalnızca sistem yöneticisine açıktır."}
        </p>
        <Link href="/" className="btn btn-ana">
          Panele dön
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="ust-serit sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Marka boyut={32} />
            <h1 className="baslik-font m1 text-2xl leading-tight">Firmalar</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="btn btn-ikincil">
              Panele dön
            </Link>
            <button type="button" className="btn btn-ana" onClick={() => setFormAcik(true)}>
              <Ikon ad="arti" boyut={16} />
              Yeni firma
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-6 sm:px-6">
        <p className="m2 text-sm">
          Her firma kendi personelini, şubelerini, ayarlarını ve yöneticilerini görür; başka firmanın verisine erişemez.
          Personel, firmanın giriş bağlantısıyla mobil uygulamaya girer.
        </p>

        <div className="panel overflow-hidden">
          {yenileniyor && firmalar.length === 0 ? (
            <div className="space-y-3 p-5">
              <Iskelet yukseklik={20} />
              <Iskelet yukseklik={20} />
            </div>
          ) : firmalar.length === 0 ? (
            <Bos ikon="bina" baslik="Henüz firma yok" metin="Yeni firma ile ilk firmayı açın." />
          ) : (
            <ul className="liste">
              {firmalar.map((f) => {
                const genel = f.yoneticiler.filter((y) => y.rol === "GENEL");
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                    <div className="min-w-[220px] flex-1">
                      <p className="m1 flex items-center gap-2 font-semibold">
                        {f.ad}
                        {f.aktif ? <Rozet ton="giris">Aktif</Rozet> : <Rozet ton="hata">Pasif</Rozet>}
                      </p>
                      <p className="m3 mt-0.5 text-xs">
                        Kod <span className="sayi m2 font-semibold">{f.kod}</span> ·{" "}
                        <span style={f.personel_limit != null && f.personel >= f.personel_limit ? { color: "var(--hata)", fontWeight: 600 } : undefined}>
                          {f.personel}
                          {f.personel_limit != null ? `/${f.personel_limit}` : ""} personel
                        </span>{" "}
                        · {f.sube} şube ·
                        açılış {kisaTarih(yerelTarih(f.created_at))}
                      </p>
                      {f.moduller && (
                        <p className="m3 mt-0.5 text-xs">
                          Modüller:{" "}
                          {f.moduller.length
                            ? MODULLER.filter((m) => f.moduller!.includes(m.anahtar)).map((m) => m.ad).join(", ")
                            : "yok (yalnızca temel PDKS)"}
                        </p>
                      )}
                      <p className="m3 mt-0.5 truncate text-xs">
                        Genel yönetici: {genel.length ? genel.map((y) => y.eposta).join(", ") : "yok"}
                        {f.yoneticiler.length > genel.length ? ` (+${f.yoneticiler.length - genel.length} şube müdürü)` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {genel.map(
                        (y) =>
                          y.eposta && (
                            <button
                              key={y.eposta}
                              type="button"
                              className="btn btn-hayalet btn-kucuk"
                              onClick={() => setSifreEposta(y.eposta)}
                              title={`${y.eposta} için yeni şifre`}
                            >
                              <Ikon ad="anahtar" boyut={14} />
                              Şifre{genel.length > 1 ? `: ${y.eposta}` : ""}
                            </button>
                          )
                      )}
                      {f.moduller && (
                        <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setPaketFirma(f)}>
                          <Ikon ad="kalem" boyut={14} />
                          Paket
                        </button>
                      )}
                      <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => baglantiKopyala(f.kod)}>
                        <Ikon ad="telefon" boyut={14} />
                        Mobil bağlantı
                      </button>
                      <button
                        type="button"
                        className={`btn btn-kucuk ${f.aktif ? "btn-hayalet" : "btn-ikincil"}`}
                        onClick={() => durumDegistir(f)}
                      >
                        {f.aktif ? "Pasife al" : "Aç"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {sifreEposta && <SifreBelirleFormu eposta={sifreEposta} onKapat={() => setSifreEposta(null)} />}
      {paketFirma && (
        <PaketFormu
          firma={paketFirma}
          onKapat={() => setPaketFirma(null)}
          onKayit={() => {
            setPaketFirma(null);
            listeyiGetir();
          }}
        />
      )}
      {formAcik && (
        <YeniFirmaFormu
          onKapat={() => setFormAcik(false)}
          onKayit={(kod) => {
            setFormAcik(false);
            listeyiGetir();
            bildir(`Firma açıldı. Personel giriş bağlantısı: ${mobilBaglanti(kod)}`, "basari");
          }}
        />
      )}
    </div>
  );
}

function YeniFirmaFormu({ onKapat, onKayit }: { onKapat: () => void; onKayit: (kod: string) => void }) {
  const { bildir } = useBildirim();
  const [f, setF] = useState({ firmaAd: "", kod: "", yoneticiAd: "", eposta: "", sifre: "" });
  const [moduller, setModuller] = useState<string[]>([]);
  const [limit, setLimit] = useState("");
  const [kodElle, setKodElle] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!KOD.test(f.kod)) return bildir(SUNUCU_HATALARI.KOD_GECERSIZ, "hata");
    setYukleniyor(true);
    try {
      const { data } = await supabase.auth.getSession();
      const cevap = await fetch("/api/sistem/firma", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ ...f, moduller, personelLimit: limit.trim() ? Number(limit) : null }),
      });
      const sonuc = (await cevap.json().catch(() => ({}))) as { hata?: string; detay?: string };
      if (!cevap.ok) throw new Error(SUNUCU_HATALARI[sonuc.hata ?? ""] ?? sonuc.detay ?? sonuc.hata ?? "Firma açılamadı.");
      onKayit(f.kod);
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Yeni firma">
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="firmaAd">
            Firma adı
          </label>
          <input
            id="firmaAd"
            className="girdi"
            required
            value={f.firmaAd}
            onChange={(e) => setF({ ...f, firmaAd: e.target.value, kod: kodElle ? f.kod : kodOner(e.target.value) })}
          />
        </div>
        <div>
          <label className="etiket" htmlFor="kod">
            Kısa kod
          </label>
          <input
            id="kod"
            className="girdi sayi"
            required
            maxLength={20}
            value={f.kod}
            onChange={(e) => {
              setKodElle(true);
              setF({ ...f, kod: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
            }}
          />
          <p className="ipucu">Personelin giriş bağlantısında kullanılır: /mobil?f={f.kod || "kod"}. Sonradan değiştirilemez.</p>
        </div>
        <div className="kenar-ust pt-4">
          <PaketAlanlari moduller={moduller} setModuller={setModuller} limit={limit} setLimit={setLimit} />
        </div>
        <div className="kenar-ust pt-4">
          <p className="m1 mb-3 text-sm font-semibold">İlk genel yönetici</p>
          <div className="space-y-4">
            <div>
              <label className="etiket" htmlFor="yoneticiAd">
                Ad soyad
              </label>
              <input id="yoneticiAd" className="girdi" value={f.yoneticiAd} onChange={(e) => setF({ ...f, yoneticiAd: e.target.value })} />
            </div>
            <div>
              <label className="etiket" htmlFor="eposta">
                E-posta
              </label>
              <input
                id="eposta"
                className="girdi"
                type="email"
                required
                autoComplete="off"
                value={f.eposta}
                onChange={(e) => setF({ ...f, eposta: e.target.value })}
              />
            </div>
            <div>
              <label className="etiket" htmlFor="sifre">
                Geçici şifre
              </label>
              <input
                id="sifre"
                className="girdi"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={f.sifre}
                onChange={(e) => setF({ ...f, sifre: e.target.value })}
              />
              <p className="ipucu">En az 8 karakter. Yöneticiye kendiniz iletin; ilk girişten sonra değiştirmesini isteyin.</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ikincil" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Açılıyor..." : "Firmayı aç"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Firma paketi: açık İK modülleri ve aktif personel sınırı */
function PaketAlanlari({
  moduller,
  setModuller,
  limit,
  setLimit,
}: {
  moduller: string[];
  setModuller: (m: string[]) => void;
  limit: string;
  setLimit: (l: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="m1 text-sm font-semibold">Modüller</p>
          <button
            type="button"
            className="btn btn-hayalet btn-kucuk"
            onClick={() => setModuller(moduller.length === TUM_MODULLER.length ? [] : [...TUM_MODULLER])}
          >
            {moduller.length === TUM_MODULLER.length ? "Hiçbiri" : "Tümü"}
          </button>
        </div>
        <p className="ipucu mb-2">Puantaj, izin, fazla mesai, vardiya, şube ve personel her firmada açıktır.</p>
        <ul className="space-y-1">
          {MODULLER.map((m) => (
            <li key={m.anahtar}>
              <label className="m1 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={moduller.includes(m.anahtar)}
                  onChange={(e) => setModuller(e.target.checked ? [...moduller, m.anahtar] : moduller.filter((x) => x !== m.anahtar))}
                />
                <span>
                  {m.ad}
                  <span className="m3 block text-xs">{m.aciklama}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label className="etiket" htmlFor="personelLimit">
          Personel sınırı
        </label>
        <input
          id="personelLimit"
          className="girdi sayi"
          type="number"
          min={1}
          max={100000}
          placeholder="Sınırsız"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
        <p className="ipucu">
          Aktif personel sayısı. Sınır dolunca firma yeni personel ekleyemez, &quot;paketinizi yükseltin&quot; uyarısı görür. Boş bırakılırsa
          sınırsız.
        </p>
      </div>
    </div>
  );
}

function PaketFormu({ firma, onKapat, onKayit }: { firma: FirmaSatiri; onKapat: () => void; onKayit: () => void }) {
  const { bildir } = useBildirim();
  const [moduller, setModuller] = useState<string[]>(firma.moduller ?? []);
  const [limit, setLimit] = useState(firma.personel_limit != null ? String(firma.personel_limit) : "");
  const [yukleniyor, setYukleniyor] = useState(false);
  const sayi = limit.trim() ? Number(limit) : null;
  const kapanan = (firma.moduller ?? []).filter((m) => !moduller.includes(m));

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (sayi !== null && (!Number.isInteger(sayi) || sayi < 1 || sayi > 100000)) return bildir(SUNUCU_HATALARI.LIMIT_GECERSIZ, "hata");
    setYukleniyor(true);
    const { error } = await supabase.rpc("sistem_firma_paket", { p_firma_id: firma.id, p_moduller: moduller, p_personel_limit: sayi });
    setYukleniyor(false);
    if (error) return bildir(hataYaz(error), "hata");
    bildir(`${firma.ad} paketi güncellendi. Firmanın yöneticileri değişikliği sayfayı yenileyince görür.`, "basari");
    onKayit();
  }

  return (
    <Modal onKapat={onKapat} baslik={`${firma.ad} · paket`}>
      <form onSubmit={kaydet} className="space-y-4">
        <PaketAlanlari moduller={moduller} setModuller={setModuller} limit={limit} setLimit={setLimit} />
        {sayi !== null && sayi < firma.personel && (
          <p className="text-sm" style={{ color: "var(--hata)" }}>
            Firmada şu an {firma.personel} aktif personel var. Mevcutlar etkilenmez, ama aktif personel {sayi} altına inene kadar yeni personel
            eklenemez.
          </p>
        )}
        {kapanan.length > 0 && <p className="m2 text-sm">Kapatılan modüllerin verisi silinmez, yalnızca gizlenir; modül yeniden açılınca geri gelir.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ikincil" onClick={onKapat}>
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
