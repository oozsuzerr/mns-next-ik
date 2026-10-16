# Çok firmalı yapı (multi-tenant) uygulama planı

Durum: Öneriler onaylandı (16.10.2026). Mevcut firma: MNS (kod: mns). Adım 0 şema dökümü alındı. Adım 1 tamam (16.10.2026): "deneme" Supabase projesi `supabase/deneme/*.sql` ile kuruldu, yerel `next dev` `.env.development.local` üzerinden ona bağlı ve panel örnek veriyle doğrulandı. Adım 2 deneme projesinde çalıştırıldı ve doğrulandı (bütün satırlar MNS'de, `firma_doldur` personelli ve personelsiz eklemede doğru). Canlıya henüz uygulanmadı. Adım 3 hazır (commit edilmedi): `supabase/2026-10-16_firma_2_sinir.sql`, bildirim/cron/mobil/panel kod değişiklikleri ve deneme için `supabase/deneme/5_ikinci_firma.sql`. Adım 3 deneme projesinde iki firmayla test edildi (16.10.2026): panel ayrımı (MNS / Deneme B) ve aynı T.C. ile iki firmada mobil giriş çalıştı. Canlıya henüz hiçbir şey uygulanmadı. Kod, canlıda en az Adım 2 çalışmadan push edilmemeli (bildirim sunucusu `firma_id` okuyor). Adım 2-3 yerelde commit edildi (9f506be). Adım 4 (`supabase/2026-10-16_firma_3_sistem.sql`, `/sistem` sayfası, `/api/sistem/firma`) deneme projesinde test edildi: sistem yöneticisi, formdan yeni firma ve ilk yönetici (Deneme C), pasife alma/açma. Canlıya geçiş: C1 (Adım 2) canlı projede (antikkapı-pdks, qfkqqtlnzirwqwektwsz) çalıştırılmış durumda; 16.10.2026 canlı şema dökümüyle doğrulandı. Adım 3 için geri alma dosyası bu dökümden üretildi: `supabase/2026-10-16_firma_2_geri_al.sql`. C0-b: canlı verinin salt okunur JSON yedeği alındı (16.10.2026 21:30, `C:\Users\ozkan\antikkapi-ik-yedek\2026-10-16`, repo dışında; bütün satırlar MNS'de). C2: b6cedcd push edildi, canlıda doğrulandı. C3: Adım 3 SQL'i canlıda çalıştırıldı (16.10.2026); `firma_adi('mns')` = "MNS", firma kodsuz/yanlış kodlu mobil giriş `FIRMA_YOK`, anon tablo okuyamıyor. C4: Adım 4 SQL'i canlıda çalıştırıldı, sistem yöneticisi `oozsuzer@gmail.com` (16.10.2026). **Canlıya geçiş tamamlandı.** Ek: Panelde Personel → Şubeler bölümü (konum alma, koordinat/Google Haritalar bağlantısı, harita önizleme, sınır, güvenli silme; SQL gerekmez), deneme projesinde Deneme C ile uçtan uca test edildi. Açık işler: canlı service_role anahtarının yenilenmesi (sohbette paylaşıldı); bütün telefonlar firma kodlu sürüme geçince eski 3 parametreli `personel_giris` / 4 parametreli `cihaz_talebi_olustur` sarmalayıcılarının kaldırılması. Canlı veritabanına hiçbir şey uygulanmadı.
Tarih: 16.10.2026

## 1. Hedef

Tek kod, tek Vercel projesi ve tek Supabase veritabanı olacak. Her firma kendi personelini, şubelerini,
vardiyalarını, ayarlarını, yöneticilerini ve müdürlerini görür. Bir firmanın verisi başka bir firmaya hiçbir yoldan
görünmez: panel, mobil, dışa aktarma, bildirim ya da günlük görev üzerinden de görünmez. Bugünkü firma "Firma 1"
olarak taşınır ve kullanımı değişmez.

## 2. Bugünkü durum (koddan çıkan envanter)

| Konu | Bugün | Çok firmada sorun |
|---|---|---|
| Tablolar | personeller, subeler, vardiyalar, hareketler, izinler, resmi_tatiller, yoneticiler, yonetici_subeleri, vardiya_plani, mesai_talepleri, cihaz_talepleri, islem_gecmisi, ay_kilitleri, sirket_ayarlari, push_abonelikleri, mobil_oturumlar | Hiçbirinde firma bilgisi yok |
| Yetki | `is_admin()` = rolü GENEL olan her yönetici; RLS kuralları buna dayanıyor | Firma B'nin genel yöneticisi Firma A'nın her şeyini görür |
| `sirket_ayarlari` | Tek satır (`id boolean = true`) | Firma başına ayrı satır gerekir |
| `ay_kilitleri` | Birincil anahtar `ay` | Bir firmanın ay kapatması diğerlerini de kilitler |
| Mobil giriş | `_pin_dogrula`: `tc_kimlik = ...  limit 1` | Aynı T.C. iki firmada olursa yanlış kişiye girer |
| Cihaz kilidi | "Bu telefon başka personelde mi" kontrolü tüm tabloda | Firma bazında yapılmalı |
| Bildirim (`sunucuBildirim.sorumlular`) | Service role ile **tüm GENEL yöneticileri** alıcı yapar | **Firma A'nın izin/mesai bildirimi Firma B yöneticisine gider (isimleriyle)** |
| Günlük görev (`/api/bildirim/gunluk`) | Tüm personel, ilk vardiya ve tek ayar ile hesaplar | Firma bazında ayrı hesaplanmalı |
| Yönetici açma (`/api/panel-kullanici`) | `is_admin()` kontrolü yapılır | Yeni hesap, açan kişinin firmasına bağlanmalı |
| Repoda olmayan şema | personeller, subeler, hareketler, izinler, vardiyalar, resmi_tatiller, yoneticiler, mobil_oturumlar tabloları; `hareket_kaydet`, `oturum_personel`, `oturum_kapat` fonksiyonları ve ilk RLS kuralları | Önce canlıdan şema dökümü alınmalı (bkz. Adım 0) |

## 3. Önerilen model

### 3.1 Firma tablosu

```sql
create table public.firmalar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  kod text not null unique check (kod ~ '^[a-z0-9-]{3,20}$'),  -- mobil bağlantıda: /mobil?f=kod
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);
```

### 3.2 Her tabloya `firma_id`

Firmaya ait bütün tablolara `firma_id uuid not null references firmalar(id)` eklenir. İstisnalar:
- `resmi_tatiller`: `firma_id` boş bırakılabilir. Boşsa Türkiye geneli ortak tatildir, doluysa o firmaya özel tatildir.
- `mobil_oturumlar` ve `push_abonelikleri`: personel ya da kullanıcı üzerinden firmaya bağlıdır. Yine de sorguyu
  kolaylaştırmak için `firma_id` eklenir.

Değer elle girilmez. `firma_doldur` adlı ortak bir BEFORE INSERT tetikleyicisi şöyle çalışır:
1. Satırda `personel_id` varsa firma o personelden alınır. Mobilden gelen kayıtlar da böylece doğru firmaya düşer.
2. Yoksa panel kullanıcısının firması kullanılır (`aktif_firma_id()`).
3. Satırdaki şube, vardiya ve personel başka bir firmaya aitse kayıt reddedilir. Bu, firmalar arası çapraz bağlantıyı
   engeller.

### 3.3 Kullanıcı, firma ve roller

- `yoneticiler.firma_id` eklenir. Bir panel kullanıcısı tek bir firmaya bağlıdır; ileride gerekirse
  çok firmalı kullanıcıya genişletilebilir.
- Firma içi roller bugünkü gibi kalır: **GENEL** (firma yöneticisi), **SUBE** (şube müdürü) ve mevcut yetki listesi.
- Yeni üst rol **sistem yöneticisi** (siz) eklenir. Ayrı bir tabloda tutulur:
  `sistem_yoneticileri(user_id)`. Firma açar, pasife alır ve firmanın ilk genel yöneticisini oluşturur.
  Firmaların iç verisine dokunmaz.

### 3.4 Güvenlik (RLS): "kısıtlayıcı" firma kuralı

Bugünkü kuralların hepsine dokunmak yerine her tabloya **bir tane RESTRICTIVE kural** eklenir:

```sql
create function public.aktif_firma_id() returns uuid
  language sql stable security definer set search_path to 'public' as $$
  select firma_id from public.yoneticiler where user_id = auth.uid();
$$;

create policy firma_siniri on public.personeller as restrictive
  for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());
```

Postgres'te kısıtlayıcı kurallar mevcut izin kurallarıyla **VE** ile birleşir. Bugünkü "genel yönetici hepsini görür"
kuralı böylece kendiliğinden "kendi firmasının hepsini görür" anlamına gelir. Bu yüzden panel kodundaki sorguların
neredeyse hiçbiri değişmez.

### 3.5 RLS'i atlayan yerler (en riskli kısım, tek tek elden geçecek)

`security definer` fonksiyonlar ve service role kullanan sunucu kodu RLS'e takılmaz. Bunların her birine açıkça
firma filtresi eklenecek:

- **Mobil:** `_pin_dogrula`, `personel_giris`, `cihaz_talebi_olustur`, `cihaz_talebi_durum`, `oturum_personel`,
  `mobil_ozet`, `hareket_kaydet`, `izin_talep_olustur`, `mesai_talep_olustur`, `push_abone_ol`,
  `push_abonelik_birak`
- **Panel:** `yonetici_bilgisi` (firma adını da döndürecek), `yonetici_listesi`, `yonetici_kaydet` (şubeler aynı
  firmadan olmalı), `yonetici_kaldir`, `personel_pin_belirle`, `cihaz_sifirla`, `cihaz_talebi_karar`,
  `izin_bakiyeleri`, `panel_push_abone_ol`
- **Yetki yardımcıları:** `is_admin`, `panel_kullanicisi`, `sube_yetkisi`, `personel_yetkisi`, `yetkisi_var`.
  Bunlar kısıtlayıcı kural sayesinde güvenli kalır, ama çapraz kontrol için firma eşitliği de eklenecek.
- **Tetikleyiciler:** `islem_gecmisi_yaz` (`firma_id` yazacak), `ay_kilidi_kontrol` (firmanın kilidine bakacak),
  `izin_gun_hesapla` ve `_yillik_izin_hesapla` (firmanın ayarlarını okuyacak), `mesai_talebi_hazirla`,
  `vardiya_plani_kontrol`
- **Sunucu (service role):**
  - `sorumlular()`: yalnızca olayın firmasındaki yöneticiler alıcı olacak (**şu anki en kritik açık**).
  - `/api/bildirim`: her olayda firma, personelden belirlenecek.
  - `/api/bildirim/gunluk`: firmalar tek tek dolaşılacak; her firma kendi ayarı ve vardiyalarıyla hesaplanacak.
  - `/api/panel-kullanici`: açılan hesap, isteği yapanın firmasına bağlanacak.

### 3.6 Tekil kısıtlar

| Bugün | Yeni |
|---|---|
| `sirket_ayarlari.id = true` | birincil anahtar `firma_id` |
| `ay_kilitleri.ay` | birincil anahtar `(firma_id, ay)` |
| T.C. ve sicil numarası (canlıda nasıl tanımlı olduğu dökümle görülecek) | `unique (firma_id, tc_kimlik)`, `unique (firma_id, sicil_no)` |
| Cihaz kilidi: telefon tek personelde | Kontrol firma içinde yapılacak |

### 3.7 Personelin mobil girişi

Önerilen yol, firmaya özel bağlantı ve telefonda hatırlama:
- Her firmanın mobil bağlantısı `mns-next-ik.vercel.app/mobil?f=firmakodu` olur. Kod ilk açılışta telefona
  kaydedilir ve giriş ekranında firma adı görünür.
- `personel_giris(p_firma_kod, p_tc, p_pin, p_cihaz)` yeni imzayla çalışır. Geçiş süresince eski 3 parametreli imza
  Firma 1 için çalışmaya devam eder. Böylece bugün telefonlarında uygulama açık olan personel etkilenmez.
- Açık mobil oturumlar (token) personele bağlı olduğu için olduğu gibi çalışmaya devam eder.

### 3.8 Arayüz değişiklikleri

- Panel yan menüsünde ve başlıkta firma adı görünecek.
- Ayarlar: `sirket_ayarlari` kaydı artık `id: true` yerine firma satırına yazılacak.
- Ay kilidi: ekleme işlemi `firma_id` ile yapılacak (tetikleyici dolduracak, kod değişikliği küçük).
- Yeni **/sistem** sayfası yalnızca sistem yöneticisine açık olacak. İçinde firma listesi, yeni firma formu (ad, kod,
  ilk yöneticinin e-postası ve şifresi), firmayı pasife alma ve firmanın mobil bağlantısını kopyalama bulunacak.
- Pasif firmanın yöneticileri panele, personeli mobile giremeyecek.
- Uygulama adı ("MNS Next IK") ürün adı olarak kalacak. Firma logosu sonraki aşamaya bırakılacak.

## 4. Veritabanı geçiş adımları

Her adım ayrı bir SQL dosyası olacak (`supabase/2026-10-xx_firma_*.sql`) ve ayrı onayla çalıştırılacak.

### Adım 0: Yedek ve şema dökümü (sizin onayınızla)
- Supabase panelinden yedek alınması ya da yedeğin doğrulanması.
- Repoda olmayan tablo, fonksiyon ve kuralların şema dökümü (`supabase db dump --schema-only` ya da
  SQL Editor'de `pg_get_functiondef` / `pg_policies` sorguları). Döküm repoya `supabase/sema_2026-10-16.sql`
  olarak eklenir. Bu adım canlı veritabanını yalnızca **okur**.

### Adım 1: Deneme ortamı
- Ayrı, ücretsiz bir Supabase projesi ("mns-ik-deneme") açılır. Adım 0'daki şema ve gerekiyorsa anonimleştirilmiş
  örnek veri yüklenir.
- Geliştirme yerelde `.env.local` deneme projesine bakarak yapılır. Ayrı dal açmaya gerek kalmaz; canlı ortam
  etkilenmez.
- Bütün SQL dosyaları önce burada çalıştırılır ve test edilir.

### Adım 2: Ekleme (canlıda davranışı değiştirmez)
`firma_1_ekleme.sql`:
1. `firmalar` tablosu oluşturulur ve mevcut firma eklenir (ad ve kod sizden alınacak).
2. Bütün tablolara **boş olabilen** `firma_id` eklenir.
3. Mevcut bütün satırlar Firma 1 ile doldurulur.
4. `not null` kısıtı, varsayılan değer, indeksler ve `firma_doldur` tetikleyicisi eklenir.

Uygulama bu adımdan sonra aynen çalışır, çünkü henüz hiçbir kural değişmedi. Geri almak kolaydır (sütunlar silinir).

### Adım 3: Firma sınırı (kod değişikliğiyle aynı anda)
`firma_2_sinir.sql`:
1. `aktif_firma_id()` ve `sistem_yoneticisi()` fonksiyonları eklenir.
2. Her tabloya `firma_siniri` kısıtlayıcı kuralı eklenir.
3. Bölüm 3.5'teki fonksiyonların firma filtreli yeni hâlleri yüklenir.
4. Tekil kısıtlar değiştirilir (`sirket_ayarlari`, `ay_kilitleri`, T.C./sicil).
5. Yeni imzalı `personel_giris` eklenir; eski imza Firma 1'e yönlenir.

Sıra şöyle olacak: önce bu SQL çalıştırılır, hemen ardından uygulama kodu canlıya alınır (push onayınızla). Mevcut
kod da bu SQL ile çalışacak şekilde tasarlanır; böylece iki adım arasındaki kısa sürede kesinti olmaz.
Geri alma için eski fonksiyon tanımları `firma_2_geri_al.sql` dosyasında hazır tutulur.

### Adım 4: Sistem yöneticisi ve ilk yeni firma
- `/sistem` sayfası ve `/api/sistem/firma` (service role ile firma ve ilk yönetici açar) eklenir.
- Deneme ortamında "Test Firma A" ve "Test Firma B" ile tam test yapılır, ardından canlıda ilk gerçek yeni firma
  açılır.

## 4.1 Şema dökümü bulguları (16.10.2026, Adım 3'te ele alınacak)

Tablo listesi taslakla birebir uyuşuyor (16 tablo ve `resmi_tatiller`). Adım 2 taslağı buna göre güncellendi.
Adım 3 için öne çıkanlar:

- **Tekil kısıtlar:**
  - `personeller` tablosunda `sicil_no` ve `tc_kimlik` tüm sistemde tekil. T.C. için iki ayrı tekil indeks var
    (`personeller_tc_kimlik_key` ve `personeller_tc_kimlik_uidx`). İkisi de kaldırılıp `(firma_id, ...)` ile
    değiştirilecek.
  - `resmi_tatiller.tarih` tekil. Ortak tatil ile firmaya özel tatil aynı tarihe denk gelebilecek şekilde
    değiştirilecek.
  - `ay_kilitleri` tablosunun birincil anahtarı `ay`, `sirket_ayarlari` tablosununki `id = true`.
- **Bütün firmalara bakan fonksiyonlar:**
  - `hareket_kaydet` en yakın şubeyi bütün şubeler arasından seçiyor, yani başka firmanın şubesine giriş
    yazılabilir. Yalnızca personelin firmasındaki şubelerden seçecek.
  - `mobil_ozet`: şube listesini, varsayılan vardiyayı (`vardiyalar` tablosunun ilk satırı) ve ayarları
    (`where a.id`) bütün sistemden okuyor.
  - `izin_gun_hesapla` ayarları `sirket_ayarlari where id` ile okuyor. `izin_gun_sayisi` bütün resmi tatillere
    bakıyor.
  - `personel_giris`, `cihaz_talebi_olustur`, `cihaz_talebi_karar`: "bu telefon başka personelde mi" kontrolü
    bütün sistemde yapılıyor.
  - `yonetici_listesi` bütün yöneticileri döndürüyor. `yonetici_kaydet` herhangi bir e-postayı, başka firmadaki
    birini bile, kendi firmasına yönetici yapabiliyor. Başka firmaya bağlı kullanıcı reddedilecek.
  - `is_admin`, `personel_yetkisi`, `sube_yetkisi`, `yetkisi_var` firma bilgisi taşımıyor. Kısıtlayıcı kural
    sayesinde güvenli kalırlar, ama `security definer` fonksiyonların içine açık firma kontrolü eklenecek.
- **Tetikleyici sırası:** Postgres aynı olaydaki tetikleyicileri ada göre sıralar. `ay_kilidi_kontrol`,
  `firma_doldur`'dan önce çalışır; yeni satırda `firma_id` o anda henüz boştur. Adım 3'te ay kilidi firmayı
  personelden kendisi bulacak. `izin_gun_hesapla` ve `mesai_talebi_hazirla` ise `firma_doldur`'dan sonra
  çalıştığı için sorun yok.
- **Boş olabilen `personel_id`:** `hareketler` ve `izinler` tablolarında `personel_id` boş olabiliyor. Bu durumda
  firma, panel kullanıcısından alınır.
- **Geri alma kaynağı:** Döküm sohbete yapıştırıldı ama elle kopyalama hatası olmasın diye repoya birebir
  yazılmadı. Adım 3'ten hemen önce `supabase/sema_dokumu_sorgusu.sql` yeniden çalıştırılacak ve geri alma dosyası
  o güncel çıktıdan üretilecek.

## 5. Test listesi (deneme ortamında, iki firma ile)

- [ ] Firma A genel yöneticisi Firma B'nin personelini, hareketini, iznini, mesaisini, vardiyasını, şubesini,
      ayarını ve işlem geçmişini hiçbir sekmede görmüyor.
- [ ] Dışa aktarma (Excel, CSV, PDF, JSON) yalnızca kendi firmasının verisini içeriyor.
- [ ] Firma A şube müdürü yalnızca kendi şubesini görüyor (bugünkü davranış korunuyor).
- [ ] Aynı T.C. iki firmada kayıtlıyken her iki firmanın mobil bağlantısından doğru kişiye giriş yapılıyor.
- [ ] Firma A'da ay kapatmak Firma B'yi etkilemiyor; ayarlar firmaya özel kalıyor.
- [ ] Bildirimler yalnızca olayın firmasındaki yöneticilere gidiyor.
- [ ] Günlük görev her firmayı kendi vardiya ve ayarlarıyla hesaplıyor.
- [ ] Firma A yöneticisi, API'yi doğrudan çağırarak (`rpc`, `from`) Firma B'nin kimliğiyle kayıt ekleyemiyor ya da
      değiştiremiyor.
- [ ] Pasif firmada panel ve mobil girişi kapalı.
- [ ] Mevcut firma (Firma 1) için bugünkü her ekran ve mobil akış aynen çalışıyor.

## 6. Karar bekleyen sorular

1. Mevcut firmanın görünen adı ve kısa kodu: **MNS**, `mns` (karar verildi).
2. Bir panel kullanıcısının (ör. muhasebeci) birden fazla firmayı görmesi gerekecek mi?
   Öneri: şimdilik hayır.
3. Personel mobil girişi firmaya özel bağlantıyla mı olsun, yoksa giriş ekranında "firma kodu" alanıyla mı?
   Öneri: bağlantı ve telefonda hatırlama.
4. Resmi tatiller ortak liste olarak kalsın ve firmaya özel ek tatil girilebilsin mi? Öneri: evet.
5. Firmaları yalnızca siz mi açacaksınız, yoksa firmalar kendi kendine kayıt olabilsin mi? Öneri: yalnızca siz.
6. Deneme ortamı için ayrı bir Supabase projesi açmayı kabul ediyor musunuz? (ücretsiz plan yeterli)

## 7. Kabaca iş büyüklüğü

- SQL: yaklaşık 700-1000 satır (ekleme, sınır ve geri alma dosyaları).
- Kod: bildirim ve cron sunucu kodu, mobil giriş, ayarlar ve ay kilidi küçük değişiklikleri, yeni `/sistem` sayfası.
- Sıra: Adım 0 ve 1 → Adım 2 (canlıda risksiz) → Adım 3 ve kod → Adım 4. Her geçişte onayınız alınır.
