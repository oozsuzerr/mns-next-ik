"use client";

// Mobil: KVKK aydınlatma metni onayı. Onaylanmadan giriş/çıkış ve konum izni istenmez.
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { varsayilanKvkkMetni } from "../../lib/kvkk";

export default function KvkkOnay({
  token,
  firma,
  surum,
  metin,
  onOnay,
  onCikis,
}: {
  token: string;
  firma: string;
  surum: number;
  metin: string | null;
  onOnay: () => void;
  onCikis: () => void;
}) {
  const [okudum, setOkudum] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function onayla() {
    setYukleniyor(true);
    setHata(null);
    const { error } = await supabase.rpc("mobil_kvkk_onayla", { p_token: token, p_surum: surum, p_cihaz: navigator.userAgent.slice(0, 300) });
    setYukleniyor(false);
    if (error) {
      setHata(error.message.includes("SURUM_DEGISTI") ? "Metin güncellendi; sayfayı yenileyip yeni metni okuyun." : "Onay kaydedilemedi. İnternet bağlantınızı kontrol edin.");
      return;
    }
    onOnay();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 pb-8 pt-6">
      <div>
        <p className="m3 text-xs font-semibold">KVKK</p>
        <h1 className="baslik-font m1 text-xl">Kişisel verilerinizin işlenmesi</h1>
        <p className="m2 mt-1 text-sm">Uygulamayı kullanmadan önce aşağıdaki aydınlatma metnini okuyup onaylayın.</p>
      </div>
      <div className="panel m1 flex-1 overflow-y-auto whitespace-pre-line p-4 text-sm leading-relaxed" style={{ maxHeight: "58vh" }}>
        {metin?.trim() || varsayilanKvkkMetni(firma)}
      </div>
      <label className="m1 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={okudum} onChange={(e) => setOkudum(e.target.checked)} />
        Aydınlatma metnini okudum ve anladım.
      </label>
      {hata && (
        <p className="text-sm" style={{ color: "var(--hata)" }}>
          {hata}
        </p>
      )}
      <button type="button" className="btn btn-ana w-full" disabled={!okudum || yukleniyor} onClick={onayla}>
        {yukleniyor ? "Kaydediliyor..." : "Onaylıyorum"}
      </button>
      <button type="button" className="btn btn-hayalet w-full" onClick={onCikis}>
        Çıkış yap
      </button>
    </div>
  );
}
