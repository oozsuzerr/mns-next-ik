"use client";

// Ücretsiz deneme kaydı (iki adım): 1) şirket ve iletişim bilgileri, 2) e-postadaki kod ve şifre.
// Kod doğrulanınca firma ve genel yönetici hesabı açılır; kullanıcı doğrudan panele giriş yapar.
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { DENEME_GUN, DENEME_PERSONEL, PERSONEL_ARALIKLARI, denemeHataMetni, telefonTemizle } from "../../lib/deneme";
import { Ikon, Marka } from "../../components/ui";

const KVKK_ADRESI = "https://www.mnsnext.com.tr/kvkk";

type Adim = { tur: "bilgi" } | { tur: "kod"; id: string; eposta: string } | { tur: "tamam"; eposta: string; denemeBitis: string };

function tarihYaz(t: string) {
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
}

export default function Deneme() {
  const [adim, setAdim] = useState<Adim>({ tur: "bilgi" });
  const [form, setForm] = useState({ firmaAd: "", personelSayisi: "", ad: "", soyad: "", telefon: "", eposta: "", web: "" });
  const [kvkk, setKvkk] = useState(false);
  const [ticariIleti, setTicariIleti] = useState(false);
  const [kod, setKod] = useState("");
  const [sifre, setSifre] = useState("");
  const [goster, setGoster] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const alan = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });

  async function istek(yol: string, govde: object) {
    const r = await fetch(yol, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, j };
  }

  async function kodIste(e?: FormEvent) {
    e?.preventDefault();
    setHata(null);
    if (!telefonTemizle(form.telefon)) return setHata(denemeHataMetni("TELEFON_GECERSIZ"));
    if (!form.personelSayisi) return setHata(denemeHataMetni("PERSONEL_SAYISI_GECERSIZ"));
    if (!kvkk) return setHata(denemeHataMetni("KVKK_ONAYI_YOK"));
    setYukleniyor(true);
    try {
      const { ok, j } = await istek("/api/deneme/baslat", { ...form, kvkk, ticariIleti });
      if (!ok || typeof j.id !== "string") return setHata(denemeHataMetni(j.hata as string));
      setKod("");
      setAdim({ tur: "kod", id: j.id, eposta: form.eposta.trim().toLowerCase() });
    } catch {
      setHata("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setYukleniyor(false);
    }
  }

  async function hesapAc(e: FormEvent) {
    e.preventDefault();
    if (adim.tur !== "kod") return;
    setHata(null);
    if (sifre.length < 8 || sifre.length > 72) return setHata(denemeHataMetni("SIFRE_GECERSIZ"));
    setYukleniyor(true);
    try {
      const { ok, j } = await istek("/api/deneme/dogrula", { id: adim.id, kod, sifre });
      if (!ok) {
        const kalan = typeof j.kalan === "number" && j.hata === "KOD_HATALI" ? ` ${j.kalan} deneme hakkınız kaldı.` : "";
        return setHata(denemeHataMetni(j.hata as string) + kalan);
      }
      // Hesap açıldı: aynı bilgilerle oturum açılır, kullanıcı doğrudan panele geçebilir
      await supabase.auth.signInWithPassword({ email: adim.eposta, password: sifre });
      setAdim({ tur: "tamam", eposta: adim.eposta, denemeBitis: String(j.denemeBitis ?? "") });
    } catch {
      setHata("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="yan-serit hidden flex-col justify-between p-12 lg:flex">
        <a href="https://www.mnsnext.com.tr" className="flex items-center gap-3">
          <Marka boyut={40} />
          <span className="baslik-font text-xl">MNS Next IK</span>
        </a>
        <div>
          <h1 className="baslik-font text-5xl leading-[1.05]">
            {DENEME_GUN} gün ücretsiz,
            <br />
            kredi kartı yok.
          </h1>
          <ul className="mt-8 space-y-3 text-base" style={{ color: "rgba(255,255,255,0.8)" }}>
            {[
              "Hesabınız iki adımda, hemen açılır",
              "Tüm modüller açık, en fazla " + DENEME_PERSONEL + " personel",
              "Mobil giriş-çıkış, puantaj, izin ve maaş ön hesabı",
              "Süre bitince verileriniz silinmez",
            ].map((m) => (
              <li key={m} className="flex items-center gap-3">
                <Ikon ad="tik" boyut={18} />
                {m}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Zaten hesabınız var mı?{" "}
          <Link href="/" className="underline">
            Giriş yapın
          </Link>
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6 py-6">
          <a href="https://www.mnsnext.com.tr" className="flex items-center gap-3 lg:hidden">
            <Marka boyut={40} />
            <span className="baslik-font m1 text-xl">MNS Next IK</span>
          </a>

          <ol className="flex gap-2 text-xs font-bold" aria-label="Adımlar">
            {["Hesap bilgileri", "E-posta doğrulama"].map((a, i) => {
              const etkin = (adim.tur === "bilgi" ? 0 : 1) >= i;
              return (
                <li
                  key={a}
                  className="flex-1 rounded-lg px-3 py-2"
                  style={{ background: etkin ? "var(--giris-acik)" : "var(--yuzey-2)", color: etkin ? "var(--giris)" : "var(--m3)" }}
                >
                  {i + 1}. {a}
                </li>
              );
            })}
          </ol>

          {adim.tur === "bilgi" && (
            <form onSubmit={kodIste} className="space-y-4">
              <div>
                <h2 className="baslik-font m1 text-3xl">Ücretsiz deneme hesabınızı açın</h2>
                <p className="m2 mt-1 text-sm">Şirketiniz ve size ulaşabileceğimiz bilgiler.</p>
              </div>
              <div>
                <label className="etiket" htmlFor="firmaAd">
                  Şirket adı
                </label>
                <input id="firmaAd" className="girdi" required maxLength={100} autoComplete="organization" {...alan("firmaAd")} />
              </div>
              <div>
                <label className="etiket" htmlFor="personelSayisi">
                  Personel sayısı
                </label>
                <select id="personelSayisi" className="girdi" required {...alan("personelSayisi")}>
                  <option value="" disabled>
                    Seçin
                  </option>
                  {PERSONEL_ARALIKLARI.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="etiket" htmlFor="ad">
                    Adınız
                  </label>
                  <input id="ad" className="girdi" required maxLength={60} autoComplete="given-name" {...alan("ad")} />
                </div>
                <div>
                  <label className="etiket" htmlFor="soyad">
                    Soyadınız
                  </label>
                  <input id="soyad" className="girdi" required maxLength={60} autoComplete="family-name" {...alan("soyad")} />
                </div>
              </div>
              <div>
                <label className="etiket" htmlFor="telefon">
                  Cep telefonu
                </label>
                <input
                  id="telefon"
                  className="girdi"
                  type="tel"
                  required
                  inputMode="tel"
                  placeholder="5xx xxx xx xx"
                  autoComplete="tel-national"
                  {...alan("telefon")}
                />
              </div>
              <div>
                <label className="etiket" htmlFor="eposta">
                  E-posta
                </label>
                <input id="eposta" className="girdi" type="email" required maxLength={150} autoComplete="email" {...alan("eposta")} />
                <p className="ipucu">Doğrulama kodu bu adrese gelir; panele de bu adresle giriş yaparsınız.</p>
              </div>
              {/* Bot tuzağı: insanlar görmez */}
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                {...alan("web")}
              />
              <label className="m2 flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 flex-none" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
                <span>
                  <a href={KVKK_ADRESI} target="_blank" rel="noreferrer" className="underline">
                    KVKK aydınlatma metnini
                  </a>{" "}
                  okudum; deneme hesabımın açılması için bilgilerimin işlenmesini kabul ediyorum.
                </span>
              </label>
              <label className="m2 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 flex-none"
                  checked={ticariIleti}
                  onChange={(e) => setTicariIleti(e.target.checked)}
                />
                <span>Kampanya ve yeniliklerden e-posta ve SMS ile haberdar olmak istiyorum (isteğe bağlı).</span>
              </label>
              {hata && <Hata metin={hata} />}
              <button type="submit" className="btn btn-ana btn-buyuk w-full" disabled={yukleniyor}>
                {yukleniyor ? "Gönderiliyor..." : "Devam et"}
              </button>
              <p className="m2 text-center text-sm lg:hidden">
                Zaten hesabınız var mı?{" "}
                <Link href="/" className="underline">
                  Giriş yapın
                </Link>
              </p>
            </form>
          )}

          {adim.tur === "kod" && (
            <form onSubmit={hesapAc} className="space-y-4">
              <div>
                <h2 className="baslik-font m1 text-3xl">E-postanızı doğrulayın</h2>
                <p className="m2 mt-1 text-sm">
                  <b className="m1">{adim.eposta}</b> adresine 6 haneli bir kod gönderdik. Gelmediyse istenmeyen (spam) klasörüne
                  bakın.
                </p>
              </div>
              <div>
                <label className="etiket" htmlFor="kod">
                  Doğrulama kodu
                </label>
                <input
                  id="kod"
                  className="girdi text-center text-2xl tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  autoFocus
                  value={kod}
                  onChange={(e) => setKod(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <div>
                <label className="etiket" htmlFor="sifre">
                  Panel şifreniz
                </label>
                <div className="relative">
                  <input
                    id="sifre"
                    className="girdi"
                    type={goster ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    style={{ paddingRight: 44 }}
                    value={sifre}
                    onChange={(e) => setSifre(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setGoster(!goster)}
                    className="btn btn-hayalet btn-ikon btn-kucuk absolute right-1.5 top-1/2 -translate-y-1/2"
                    aria-label={goster ? "Şifreyi gizle" : "Şifreyi göster"}
                  >
                    <Ikon ad={goster ? "gozkapali" : "goz"} boyut={16} />
                  </button>
                </div>
                <p className="ipucu">En az 8 karakter. Panele bu şifreyle giriş yapacaksınız.</p>
              </div>
              {hata && <Hata metin={hata} />}
              <button type="submit" className="btn btn-ana btn-buyuk w-full" disabled={yukleniyor || kod.length !== 6}>
                {yukleniyor ? "Hesabınız açılıyor..." : "Hesabımı aç"}
              </button>
              <div className="flex justify-between text-sm">
                <button type="button" className="m2 underline" onClick={() => (setHata(null), setAdim({ tur: "bilgi" }))}>
                  Bilgileri düzelt
                </button>
                <button type="button" className="m2 underline" disabled={yukleniyor} onClick={() => kodIste()}>
                  Kodu yeniden gönder
                </button>
              </div>
            </form>
          )}

          {adim.tur === "tamam" && (
            <div className="space-y-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--giris-acik)", color: "var(--giris)" }}>
                <Ikon ad="tik" boyut={28} />
              </div>
              <div>
                <h2 className="baslik-font m1 text-3xl">Hesabınız hazır</h2>
                <p className="m2 mt-2 text-sm">
                  Deneme hesabınız {adim.denemeBitis ? `${tarihYaz(adim.denemeBitis)} tarihine kadar` : `${DENEME_GUN} gün`} açık. Panele{" "}
                  <b className="m1">{adim.eposta}</b> ve belirlediğiniz şifreyle giriş yaparsınız.
                </p>
              </div>
              <div className="panel space-y-2 p-4 text-sm">
                <p className="m1 font-bold">İlk adımlar</p>
                <ol className="m2 list-decimal space-y-1 pl-5">
                  <li>Şube ekleyin ve haritadan konumunu seçin.</li>
                  <li>Personelinizi ekleyip PIN verin.</li>
                  <li>Personel, firmanıza özel mobil bağlantıdan telefonuyla giriş yapsın.</li>
                </ol>
              </div>
              <Link href="/" className="btn btn-ana btn-buyuk w-full">
                Panele git
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Hata({ metin }: { metin: string }) {
  return (
    <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: "var(--hata)" }} role="alert">
      <span className="mt-0.5 flex-none">
        <Ikon ad="uyari" boyut={16} />
      </span>
      {metin}
    </p>
  );
}
