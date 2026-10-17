// İşe başlama ve ayrılış kontrol listeleri: firma kendi listesini girmediyse kullanılan varsayılanlar.
// "gun": son tarihin, listenin başlangıç tarihine (işe giriş / işten çıkış) göre kaç gün sonra olduğu.

export type KontrolTuru = "Giriş" | "Çıkış";

export interface SablonMaddesi {
  baslik: string;
  aciklama: string | null;
  gun: number | null;
}

export const VARSAYILAN_MADDELER: Record<KontrolTuru, SablonMaddesi[]> = {
  Giriş: [
    { baslik: "SGK işe giriş bildirgesi verildi", aciklama: "En geç işe başlamadan bir gün önce (e-Bildirge).", gun: -1 },
    { baslik: "İş sözleşmesi imzalandı", aciklama: "İki nüsha; bir nüsha personele verilir.", gun: 0 },
    { baslik: "KVKK aydınlatma metni imzalatıldı", aciklama: "Konum ve kimlik verisi işlendiği belirtilir.", gun: 0 },
    { baslik: "Kimlik, ikametgâh ve diploma alındı", aciklama: "Özlük > Belgeler bölümüne yükleyin.", gun: 3 },
    { baslik: "İşe giriş sağlık raporu alındı", aciklama: "İşyeri hekimi muayenesi (İSG Kanunu md. 15).", gun: 0 },
    { baslik: "Temel İSG eğitimi verildi", aciklama: "İşe başlamadan önce; eğitim belgesi imzalatılır.", gun: 0 },
    { baslik: "Banka / IBAN bilgisi alındı", aciklama: "Özlük bilgilerine girin.", gun: 7 },
    { baslik: "PIN verildi, mobil giriş kuruldu", aciklama: "Personel telefonundan ilk girişi yapar.", gun: 1 },
    { baslik: "Vardiya ve şube atandı", aciklama: null, gun: 1 },
    { baslik: "Zimmetli eşyalar teslim edildi", aciklama: "İK işlemleri > Zimmet; tutanak imzalatılır.", gun: 3 },
  ],
  Çıkış: [
    { baslik: "SGK işten çıkış bildirgesi verildi", aciklama: "Çıkıştan itibaren 10 gün içinde, doğru çıkış koduyla.", gun: 10 },
    { baslik: "Zimmetli eşyalar iade alındı", aciklama: "İK işlemleri > Zimmet'te iadeyi kaydedin.", gun: 0 },
    { baslik: "Açık avans ve masraflar kapatıldı", aciklama: "Avans son maaştan düşülür, masraf ödenir.", gun: 0 },
    { baslik: "Kullanılmayan yıllık izin ücreti hesaplandı", aciklama: "İş Kanunu md. 59.", gun: 0 },
    { baslik: "Kıdem / ihbar tazminatı hesaplandı", aciklama: "Hak kazanılmışsa; mali müşavirle kontrol edin.", gun: 0 },
    { baslik: "Son ücret ve tazminatlar ödendi", aciklama: null, gun: 5 },
    { baslik: "İbraname / ödeme belgesi imzalandı", aciklama: "İbraname son ödemeden en az 1 ay sonra düzenlenebilir.", gun: 30 },
    { baslik: "Çalışma belgesi verildi", aciklama: "İş Kanunu md. 28: istek hâlinde.", gun: 5 },
    { baslik: "Panel erişimi ve mobil cihaz kaydı kapatıldı", aciklama: "Personeli pasife alın; panel kullanıcısıysa kaldırın.", gun: 0 },
  ],
};
