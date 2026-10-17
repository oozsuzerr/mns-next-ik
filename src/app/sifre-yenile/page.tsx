"use client";

// "Şifremi unuttum" e-postasındaki bağlantı buraya gelir. Supabase istemcisi adresteki
// kurtarma oturumunu kendisi okur (detectSessionInUrl); kullanıcı yeni şifresini belirler.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz } from "../../lib/tipler";
import { Marka, useBildirim } from "../../components/ui";

export default function SifreYenile() {
  const { bildir } = useBildirim();
  const [durum, setDurum] = useState<"bekleniyor" | "hazir" | "gecersiz" | "tamam">("bekleniyor");
  const [sifre, setSifre] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    const { data: abone } = supabase.auth.onAuthStateChange((olay, oturum) => {
      if (olay === "PASSWORD_RECOVERY" || (olay === "SIGNED_IN" && oturum)) setDurum("hazir");
    });
    // Bağlantı hatalı ya da süresi dolmuşsa Supabase adrese hata ekler
    const hataVar = /error_description|error_code/.test(window.location.hash + window.location.search);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setDurum("hazir");
      else if (hataVar) setDurum("gecersiz");
      else setTimeout(() => setDurum((d) => (d === "bekleniyor" ? "gecersiz" : d)), 3000);
    });
    return () => abone.subscription.unsubscribe();
  }, []);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (sifre.length < 8 || sifre.length > 72) return bildir("Şifre 8-72 karakter olmalı.", "hata");
    if (sifre !== tekrar) return bildir("Şifreler birbirini tutmuyor.", "hata");
    setYukleniyor(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: sifre });
      if (error) throw error;
      // Adresteki anahtarları temizle
      window.history.replaceState(null, "", "/sifre-yenile");
      setDurum("tamam");
    } catch (err) {
      const metin = hataYaz(err);
      bildir(/should be different|same_password/i.test(metin) ? "Yeni şifre eskisiyle aynı olamaz." : metin, "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-3">
        <Marka boyut={40} />
        <span className="baslik-font m1 text-xl">MNS Next IK</span>
      </div>

      {durum === "bekleniyor" && <p className="m2 text-sm">Bağlantı kontrol ediliyor...</p>}

      {durum === "gecersiz" && (
        <div className="space-y-4">
          <h1 className="baslik-font m1 text-2xl">Bağlantı geçersiz</h1>
          <p className="m2 text-sm">
            Şifre yenileme bağlantısının süresi dolmuş ya da daha önce kullanılmış. Giriş ekranından &quot;Şifremi unuttum&quot;
            ile yeni bağlantı isteyin.
          </p>
          <Link href="/" className="btn btn-ana w-full">
            Giriş ekranına dön
          </Link>
        </div>
      )}

      {durum === "hazir" && (
        <form onSubmit={kaydet} className="space-y-4">
          <h1 className="baslik-font m1 text-2xl">Yeni şifre belirleyin</h1>
          <div>
            <label className="etiket" htmlFor="sifre">
              Yeni şifre
            </label>
            <input
              id="sifre"
              className="girdi"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              autoFocus
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
            />
            <p className="ipucu">En az 8 karakter.</p>
          </div>
          <div>
            <label className="etiket" htmlFor="tekrar">
              Yeni şifre (tekrar)
            </label>
            <input
              id="tekrar"
              className="girdi"
              type="password"
              required
              autoComplete="new-password"
              value={tekrar}
              onChange={(e) => setTekrar(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-ana btn-buyuk w-full" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "Şifreyi kaydet"}
          </button>
        </form>
      )}

      {durum === "tamam" && (
        <div className="space-y-4">
          <h1 className="baslik-font m1 text-2xl">Şifreniz değiştirildi</h1>
          <p className="m2 text-sm">Yeni şifrenizle oturumunuz açık; panele geçebilirsiniz.</p>
          <Link href="/" className="btn btn-ana w-full">
            Panele git
          </Link>
        </div>
      )}
    </div>
  );
}
