"use client";

// Firmaya özel personel giriş bağlantısı (/mobil?f=kod): kopyalama ve WhatsApp ile paylaşma.
// Personel bağlantıyı bir kez açınca firma kodu telefonda hatırlanır.
import { useState } from "react";
import { Ikon, Modal, useBildirim } from "../ui";

export function mobilAdresi(firmaKod: string | null | undefined): string {
  return firmaKod ? `/mobil?f=${encodeURIComponent(firmaKod)}` : "/mobil";
}

export default function MobilBaglanti({ firmaKod, firmaAd }: { firmaKod: string; firmaAd: string }) {
  const { bildir } = useBildirim();
  const [acik, setAcik] = useState(false);
  const adres = `${window.location.origin}${mobilAdresi(firmaKod)}`;
  const mesaj = `${firmaAd} giriş-çıkış uygulaması: ${adres}\nT.C. kimlik numaranız ve size verilen PIN ile giriş yapın.`;

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(adres);
      bildir("Bağlantı kopyalandı.", "basari");
    } catch {
      bildir(adres, "bilgi");
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setAcik(true)}>
        <Ikon ad="telefon" boyut={14} />
        Giriş bağlantısı
      </button>
      {acik && (
        <Modal baslik="Personel giriş bağlantısı" onKapat={() => setAcik(false)}>
          <div className="space-y-4 text-sm">
            <p className="m2">
              Personeliniz bu bağlantıyı telefonunda açıp T.C. kimlik numarası ve PIN ile giriş yapar. Bağlantı firmanıza özeldir;
              bir kez açıldıktan sonra telefon firmanızı hatırlar.
            </p>
            <div className="panel break-all p-3 font-semibold m1">{adres}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ana" onClick={kopyala}>
                Kopyala
              </button>
              <a
                className="btn btn-ikincil"
                href={`https://wa.me/?text=${encodeURIComponent(mesaj)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp ile paylaş
              </a>
            </div>
            <p className="ipucu">İpucu: Personel bağlantıyı açtıktan sonra tarayıcı menüsünden &quot;Ana ekrana ekle&quot;yi seçerse uygulama gibi açılır.</p>
          </div>
        </Modal>
      )}
    </>
  );
}
