// KVKK (6698 sayılı Kanun) çalışan aydınlatma metni: firma kendi metnini yazmazsa bu varsayılan kullanılır.
// Genel bir şablondur; firmanın hukuk danışmanınca gözden geçirilmesi önerilir.

export function varsayilanKvkkMetni(firma: string): string {
  const f = firma.trim() || "İşveren";
  return `ÇALIŞAN KİŞİSEL VERİLERİNİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ

Veri sorumlusu: ${f}

6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, iş ilişkimiz kapsamında kişisel verileriniz aşağıda açıklanan şekilde işlenmektedir.

1. İşlenen kişisel veriler
• Kimlik: ad, soyad, T.C. kimlik numarası, sicil numarası, doğum tarihi.
• İletişim: telefon, e-posta, adres (girildiyse).
• Özlük ve mesleki: departman, ünvan, işe giriş/çıkış tarihi, vardiya, izin, rapor ve fazla mesai kayıtları, ücret ve banka (IBAN) bilgisi.
• İşyeri giriş-çıkış (PDKS): giriş ve çıkış zamanları, işlemi yaptığınız şube.
• Konum: yalnızca uygulama açıkken ve giriş/çıkış işlemi sırasında, işyerinde olup olmadığınızı doğrulamak için cihazınızın konumu ve işyerine uzaklığı. Arka planda ya da mesai dışında konum takibi yapılmaz.
• Cihaz: giriş için eşleştirilen telefonun tanımlayıcısı ve tarayıcı bilgisi.
• Sağlık (yalnızca sağlık raporu sunduğunuzda): rapor türü ve tarihleri; yasal yükümlülük kapsamında ve gerekli güvenlik önlemleriyle işlenir.

2. İşleme amaçları
İş sözleşmesinin kurulması ve ifası; çalışma sürelerinin, fazla mesainin, izinlerin ve devamın takibi; ücret ve bordro işlemleri; SGK ve vergi mevzuatından doğan yükümlülüklerin yerine getirilmesi; iş sağlığı ve güvenliği; işyeri güvenliği ve yetkisiz girişlerin önlenmesi; olası uyuşmazlıklarda hakların korunması.

3. Hukuki sebepler (KVKK m.5 ve m.6)
Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (m.5/2-c); veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi (m.5/2-ç; 4857 sayılı İş Kanunu, 5510 sayılı Kanun ve ilgili mevzuat); bir hakkın tesisi, kullanılması veya korunması (m.5/2-e); temel hak ve özgürlüklerinize zarar vermemek kaydıyla veri sorumlusunun meşru menfaati (m.5/2-f). Sağlık verileri m.6 kapsamındaki şartlara uygun işlenir.

4. Aktarım
Kişisel verileriniz yalnızca yukarıdaki amaçlarla ve gerektiği ölçüde; yetkili kamu kurum ve kuruluşlarına (SGK, Gelir İdaresi, yargı mercileri vb.), bordro ve muhasebe hizmeti alınan mali müşavire, bankalara (maaş ödemesi) ve sistemin barındırıldığı bilgi teknolojileri hizmet sağlayıcılarına aktarılabilir. Hizmet sağlayıcıların sunucuları yurt dışında bulunabilir; bu durumda aktarım KVKK m.9'a uygun yapılır.

5. Saklama süresi
Veriler, iş ilişkisi süresince ve sona ermesinden sonra ilgili mevzuatta öngörülen süreler (genel olarak 10 yıl) boyunca saklanır; süre dolunca silinir, yok edilir veya anonim hâle getirilir.

6. Haklarınız (KVKK m.11)
Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan kişilere bildirilmesini isteme, otomatik sistemlerle analiz sonucu aleyhinize bir sonuca itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.

Başvurularınızı ${f} insan kaynakları birimine yazılı olarak iletebilirsiniz. Başvurular en geç 30 gün içinde sonuçlandırılır.

Bu metni okuyup anladığınızı onaylamanız, giriş-çıkış uygulamasını kullanabilmeniz için gereklidir.`;
}
