# 03-screens.md: Ekranlar ve Arayüz Tasarımları (Wireframes)

> **Belge Amacı:** Yeniden tasarlanan Husrevity sisteminin ana ekranlarını, ASCII tabanlı tel çerçeve (wireframe) çizimlerini, kullanıcı etkileşimlerini, uç durumlarını (boş/yükleme/hata), mobil uyarlamalarını, klavye kısayollarını ve gereken API veri sözleşmelerini tanımlar.
>
> **Not:** Kardeş `shared-infra` dizini mevcut olmadığı ve 5432 portunda dinleyen PostgreSQL servisi bulunmadığı için canlı uygulama kontrolü atlanmış; tüm adımlar ve tıklama sayıları doğrudan bileşen kaynak kodları taranarak türetilmiş ve **[koddan çıkarım]** olarak işaretlenmiştir.

---

## 1. Genel Bilgi Mimarisi ve Gezinme Çerçevesi (Navigation Overview)

Tüm ekranlar, yeni Yaşam Ufukları mimarisini yansıtan iki ana gezinme ekseni (Masaüstü Kenar Çubuğu ve Mobil Alt Bar) üzerinden birbirine bağlanır.

### 1.1 Masaüstü Kenar Çubuğu (Desktop Sidebar)
```
+------------------------------------+
| [Logo] HUSREVITY                   |
| [ ⌘K : Komut Paleti & Arama      ] |
+------------------------------------+
| ZAMAN UFUKLARI                     |
| [•] Bugün            (/today)      |
| [ ] Hafta            (/week)       |
| [ ] Ay (Basit Takvim)(/month)      |
| [ ] Yıl (Hedefler)   (/goals)      |
| [ ] Gelen Kutusu     (/inbox)  (6) |
| [ ] Projeler         (/projects)   |
+------------------------------------+
| YAŞAM DEPOLARI                     |
| [ ] Notlar           (/notes)      |
| [ ] Öğrenme          (/learning)   |
| [ ] Spor             (/sport)      |
| [ ] Evkat Şablonu    (/evkat)      |
| [ ] Kasa             (/vault)  🔒  |
| [ ] Ayarlar          (/settings)   |
+------------------------------------+
| [+ Hızlı Ekle (N)]                 |
| (AH) Ahmet Husrev     [Oturumu Kapat|
+------------------------------------+
```

### 1.2 Mobil Gezinme ve Yakalama (Mobile Bottom Bar & FAB)
- **Sabit Alt Menü (5 Sekme):** `[Bugün] [Hafta] [Ay] [Gelen Kutusu] [Daha Fazla ☰]`
- **Daha Fazla Çekmecesi:** Projeler, Yıl/Hedefler, Notlar, Öğrenme, Spor, Evkat Şablonu, Kasa (FaceID kilitli), Ayarlar.
- **Sabit FAB (+ Butonu):** Sağ altta sabit asılı kalan yeşil/kehribar FAB butonu. Tek dokunuşla hızlı sesli/yazılı yakalama modalını açar (`capture`).

---

## 2. Bugün Ekranı (`/today` - Varsayılan Ana Sayfa)

### 2.1 Ne Gösterir ve Neden?
Kullanıcının sabah kalktığında gününü yöneteceği tek merkezdir. Sol/orta alanda dikey zaman ekseni (Evkat rutin şeritleri, zamanlanmış bloklar ve bağlı hedef rozetleri) yer alır. Sağ alanda ise henüz saate bağlanmamış ama bugün bitmesi gereken veya sırada bekleyen işler havuzu (Backlog) bulunur. En üstte Claude'un son planlama eylemini özetleyen sakin bir Etkinlik Şeridi (Activity Strip) yer alır.

### 2.2 ASCII Wireframe (Masaüstü)

```
+----------------------------------------------------------------------------------------------------+
| [Logo] Husrevity   [⌘K Komut / Arama]                    [+ Hızlı Ekle (N)] [TR/EN] [Koyu] [Profil]|
+----------------------------------------------------------------------------------------------------+
| 🤖 CLAUDE ETKİNLİK ŞERİDİ: Bugün 08:30'da günün planlandı (5 görev yerleşti, 1 ertelendi).          |
|    [Değişiklikleri İncele]  [Tümünü Geri Al (Undo)]                                              [X]|
+----------------------------------------------------------------------------------------------------+
|  BUGÜN · 12 Ekim Pazartesi                                         | BEKLEYEN İŞLER & TESLİMLER    |
|  [< Dün] [Bugün] [Yarın >]    Hedef: 6.5s Planlanan                | (+ Görev Ekle) [Filtre: Hepsi]|
+--------------------------------------------------------------------+-------------------------------+
| SAAT | ZAMAN EKSENİ & EVKAT RUTİN ŞERİTLERİ                        | [!] GECİKENLER (Overdue)      |
|------+-------------------------------------------------------------| [ ] Fatura öde (Dün)          |
| 07:00| [== Evkat: Sabah Rutini ==================================] |                               |
| 07:30|   [✓ 07:30 - 08:00 | Meditasyon & Nefes (30dk)           ]  | [ ] BUGÜN BİTMESİ GEREKENLER  |
| 08:00| [== Evkat: Kahvaltı & Hazırlık ===========================] | [ ] Sunum taslağını bitir     |
| 08:30|   [  08:30 - 09:00 | Günlük Haberler & Çay (30dk)        ]  |     🏷️ [Hedef: Q4 Lansman]     |
| 09:00| [== Evkat: Derin Odak Çalışma ============================] | [ ] Doktordan randevu al      |
|      |   +-------------------------------------------------------+ |                               |
| 09:30|   | ■ [İş] Q3 Rapor Analizi (90dk)                        | | [ ] HAVUZ (Zamanlanmamış)     |
| 10:00|   |   🏷️ [Hedef: Finansal Büyüme] · Not: Gelir tablosu     | | [ ] Kitap bölümü oku          |
| 10:30|   +-------------------------------------------------------+ | [ ] Lastik basıncını ölç    |
| 11:00|   [-- Boş Aralık: 60dk serbest zaman ---------------------] | [ ] Almanca kelime tekrarı    |
| 12:00| [== Evkat: Öğle Arası & Yürüyüş ==========================] |     🏷️ [Hedef: Almanca B1]     |
| 13:00|   [  12:30 - 13:30 | Yemek & 20dk Yürüyüş                 ] |                               |
| 14:00| [== Evkat: İletişim & Toplantı ===========================] | <-- Bir görevi tutup          |
|      |   +-------------------------------------------------------+ |     sol taraftaki boş         |
| 14:30|   | ● [Toplantı] Haftalık Ürün Senkronu (Google Meet)      | |     zaman aralığına           |
| 15:00|   +-------------------------------------------------------+ |     sürükle (Drag & Drop)     |
| 16:00| [== Evkat: İkincil Odak & Kapanış ========================] |                               |
| 17:00|   [  17:00 - 18:00 | E-posta & Slack temizliği            ] |                               |
+----------------------------------------------------------------------------------------------------+
```

### 2.3 Birincil Eylemler ve Etkileşimler
1. **Sürükle-Bırak ile Saat Atama:** Sağdaki listeden bir görev tutulup sol eksendeki boş bir saat aralığına bırakılır. Bu hareket anında göreve `scheduled_at` ve `duration_min` yazar.
> Varsayım: dnd-kit kütüphanesinin TouchSensor ve PointerSensor yapılandırmalarıyla mobil dokunmatik ekranlarda ve masaüstünde pürüzsüz sürükle-bırak deneyimi sunacağı varsayılmıştır.
2. **Tek Tıkla Tamamlama:** Zaman eksenindeki veya sağ paneldeki görev kutucuğuna tıklandığında görev `done` statüsüne geçer, üstü çizilir.
3. **Claude Planını Tek Tıkla Geri Alma:** En üstteki aktivite şeridinden "Tümünü Geri Al" tıklandığında Claude'un yaptığı son toplu düzenleme eski haline döner.
4. **Hedef Bağlantısını Görme:** Görevlerin altındaki hedef rozetine (`[Hedef: ...]`) tıklandığında ilgili hedefin Yıl/Ufuk görünümü açılır.

### 2.4 Durum Yönetimi (Empty / Loading / Error)
- **Boş Durum (Empty State):** Gün için hiçbir görev veya etkinlik yoksa: *"Bugün için planlanmış bir akış yok. Sağ taraftan iş ekleyebilir veya Claude'dan gününü planlamasını isteyebilirsin."* Buton: `[Günü Planla]`.
- **Yükleme (Loading):** Zaman ekseninde 4 adet saydam blok iskeleti (Skeleton). Sağ panelde 5 satırlık hafif parlayan liste iskeleti.
- **Hata (Error):** *"Günün akışı yüklenemedi. [Yeniden Dene]"* uyarısı.

### 2.5 Mobil Karşılığı (`/today`)
- Tek sütunlu akış: Üstte yatay gün kaydırıcı (`< Pzt 12 >`).
- Hemen altında "Zaman Çizelgesi" ve "Yapılacaklar" arasında geçiş yapan 2'li Segmentli Kontrol (Segmented Control: `[Ajanda (5) | Görevler (7)]`).
- Sağ altta sabit yüzen eylem butonu (Floating Action Button - FAB `+`). Dokunulduğunda mobil Hızlı Ekleme modalı açılır.
- Mobilde sürükle-bırak yerine, göreve dokunulduğunda açılan alt çekmeceden (Bottom Sheet) "Saat Belirle" (15dk, 30dk, 1s) seçeneği sunulur.

### 2.6 Klavye Kısayolları
- `J` / `K`: Zaman ekseninde veya listede aşağı/yukarı seçim hareketi.
- `Space`: Seçili görevi tamamla / geri al.
- `E`: Seçili görevin süresini veya saatini düzenleme moduna geç.
- `Delete` / `Backspace`: Seçili görevi iptal et veya sil.
- `T`: Bugünün tarihine odaklan.

### 2.7 Gereken API Verisi
- `GET /api/today` -> `{ timeline: Item[], dueToday: Item[], backlog: Item[], currentBlock: Item, activeChangeSet: ChangeSetSummary | null }`

---

## 3. Hafta Ekranı (`/week` - 7 Günlük Görünüm ve Değerlendirme)

### 3.1 Ne Gösterir ve Neden?
Kullanıcının haftalık iş yükünü bir bakışta görmesini, aşırı yüklenmiş günleri tespit etmesini ve haftanın sonunda "Haftalık Değerlendirme" (Weekly Review) yapmasını sağlar.

### 3.2 ASCII Wireframe (Masaüstü)

```
+----------------------------------------------------------------------------------------------------+
|  HAFTA · 12 - 18 Ekim 2026                 [Haftalık Değerlendirme Modu]  [Claude: Haftayı Planla] |
|  [< Önceki Hafta] [Bu Hafta] [Sonraki Hafta >]                             Toplam Planlanan: 34.5s |
+----------------------------------------------------------------------------------------------------+
| PAZARTESİ     | SALI          | ÇARŞAMBA      | PERŞEMBE      | CUMA          | CMT     | PAZ      |
| 12 Eki        | 13 Eki        | 14 Eki        | 15 Eki        | 16 Eki        | 17 Eki  | 18 Eki   |
| [Yük: 6.5s]   | [Yük: 8.5s !] | [Yük: 5.0s]   | [Yük: 7.0s]   | [Yük: 4.5s]   | [1.5s]  | [0.0s]   |
| (Normal)      | (AŞIRI YÜK)   | (Dengeli)     | (Normal)      | (Hafif)       |         |          |
+---------------+---------------+---------------+---------------+---------------+---------+----------+
| 08:30 Rutin   | 08:30 Rutin   | 08:30 Rutin   | 08:30 Rutin   | 08:30 Rutin   | Dinlen- | Dinlen-  |
| 09:30 Q3 Rapor| 09:30 Q3 Rapor| 09:30 Kod İnc.| 09:30 Tasarım | 09:30 Retro   | me      | me       |
| 11:30 Toplantı| 11:00 Müşteri | 11:00 Mimari  | 11:30 Toplantı| 11:00 Haftalık|         |          |
| 14:00 Senkron | 14:00 Strateji| 14:00 Yazılım | 14:30 1-on-1  |       Kapanış |         |          |
| 17:00 Kapanış | 16:30 Sunum   | 17:00 Kapanış | 17:00 Kapanış | 16:00 Spor    |         |          |
|               | 18:30 Ek Mesai|               |               |               |         |          |
+----------------------------------------------------------------------------------------------------+
| [ HAFTALIK DEĞERLENDİRME PANELİ (Review Mode Açıkken) ]                                             |
| Tamamlananlar: 24 İş (%82)  ·  Sarkan/Ertelenen: 4 İş  ·  Haftalık Odak Başarısı: %88               |
| 💡 Claude Değerlendirmesi: "Salı günkü aşırı yüklenme perşembeye sarkmalara yol açtı. Önümüzdeki   |
|   hafta Salı günü için maksimum 6 saat odak planlamanızı öneririm."                               |
| [Sarkan İşleri Gelecek Haftaya Aktar]  [Değerlendirmeyi Arşivle]                                  |
+----------------------------------------------------------------------------------------------------+
```

### 3.3 Birincil Eylemler ve Etkileşimler
1. **Yük Çubuğu Uyarıları:** Bir günün toplam planlanan süresi kullanıcının çalışma kapasitesini (varsayılan: 7 saat / 420 dakika) aştığında sütun başlığı uyarı verir.
> Varsayım: Günlük varsayılan odak çalışma kapasitesi 7 saat (420 dakika) olarak kabul edilmiştir (ADR 10 ile tutarlı); bu değer kullanıcının çalışma temposuna dair bir varsayımdır ve kodda doğrulanmış sabit bir kural yoktur.
2. **Haftalar Arası Görev Taşıma:** Görev kutucuğu bir günden diğerine sürüklenerek ertelenebilir.
3. **Haftalık Değerlendirme Modu:** Hafta bittiğinde buton ile açılır; tamamlanan ve ertelenen işleri gruplar, haftalık içgörü üretir.

### 3.4 Durum Yönetimi
- **Boş Durum:** *"Bu hafta için henüz hiçbir gün planlanmadı. [Claude ile Haftayı Planla]"* butonu.
- **Yükleme:** 7 sütunlu takvim ızgarası iskeleti.

### 3.5 Mobil Karşılığı
- Mobilde 7 sütun yan yana sığmaz. 7 günlük yatay kaydırılabilir takvim çubuğu (`Pzt · Sal · Çar...`) ve seçili günün dikey gündem görünümü sunulur.

### 3.6 Klavye Kısayolları
- `W`: Hafta görünümünü tazele.
- `R`: Haftalık Değerlendirme panelini aç/kapat.
- `Alt + Sol/Sağ`: Önceki/sonraki haftaya geç.

### 3.7 Gereken API Verisi
- `GET /api/items/week?start=2026-10-12&end=2026-10-18` -> `{ days: DayPlanDto[], totalDurationMin: number, reviewSummary: WeekReviewDto }`

---

## 4. Ay Ekranı (`/month` - Basit Takvim ve Yoğunluk Görünümü)

### 4.1 Ne Gösterir ve Neden?
Ürün sahibinin netleştirdiği **basit takvim** ihtiyacını karşılar. Ayrı bir takvim tablosu (`calendar_event`), ağır `@fullcalendar` kütüphanesi veya harici Google Calendar senkronizasyonu YOKTUR. `items` tablosundaki `scheduled_at` (randevular) ve `due_at` (teslimler) kayıtlarını 30/31 günlük ızgarada birleştirir. Her hücrede günün yoğunluğu (density noktaları ve planlanan saat) gösterilir; bir güne tıklamak o günün `/today` görünümünü açar; bir görev başka bir güne sürüklenerek ertelenebilir.

### 4.2 ASCII Wireframe (Masaüstü)

```
+----------------------------------------------------------------------------------------------------+
| [Logo] Husrevity   [⌘K Komut / Arama]                    [+ Hızlı Ekle (N)] [TR/EN] [Koyu] [Profil]|
+----------------------------------------------------------------------------------------------------+
|  AY · Ekim 2026                            [< Önceki Ay] [Bu Ay] [Sonraki Ay >]    [+ Etkinlik/İş] |
|  Toplam Planlanan: 138 Saat · 84 İş Tamamlandı                                                     |
+----------------------------------------------------------------------------------------------------+
| PAZARTESİ     | SALI          | ÇARŞAMBA      | PERŞEMBE      | CUMA          | CMT     | PAZ      |
+---------------+---------------+---------------+---------------+---------------+---------+----------+
| 28 Eyl        | 29 Eyl        | 30 Eyl        | 1 Eki         | 2 Eki         | 3 Eki   | 4 Eki    |
| [●● 3.5s]     | [●●● 6.0s]    | [● 2.0s]      | [●● 4.5s]     | [●●● 7.0s]    | [1.0s]  | [-]      |
| Q3 Değerlen.  | Ekip Senkronu | Müşteri Call  | Bütçe Plan    | Lansman Canlı | Doğa Y. | Dinlenme |
+---------------+---------------+---------------+---------------+---------------+---------+----------+
| 5 Eki         | 6 Eki         | 7 Eki         | 8 Eki         | 9 Eki         | 10 Eki  | 11 Eki   |
| [●● 5.0s]     | [●●● 8.0s !]  | [●● 5.5s]     | [●●● 6.5s]    | [● 3.5s]      | [2.0s]  | [-]      |
| Sprint Plan   | Tasarım Rev.  | Backend API   | Güvenlik Aud. | Haftalık Ret. | Koşu 10k| Aile     |
+---------------+---------------+---------------+---------------+---------------+---------+----------+
| 12 Eki [BUGÜN]| 13 Eki        | 14 Eki        | 15 Eki        | 16 Eki        | 17 Eki  | 18 Eki   |
| [●●● 6.5s]    | [●●● 8.5s !]  | [●● 5.0s]     | [●●● 7.0s]    | [●● 4.5s]     | [1.5s]  | [-]      |
| Meditasyon    | Strateji      | Kod İnceleme  | Tasarım Sync  | Retro & Kapan.| Dinlenme| Dinlenme |
| Q3 Raporu     | Müşteri Sunum | Mimari Analiz | 1-on-1 Görüşme| Spor Seansı   |         |          |
| Ürün Senkronu | Ek Mesai      | Yazılım       | Rapor Teslim  |               |         |          |
+---------------+---------------+---------------+---------------+---------------+---------+----------+
| 19 Eki        | 20 Eki        | 21 Eki        | 22 Eki        | 23 Eki        | 24 Eki  | 25 Eki   |
| [●● 5.5s]     | [●● 6.0s]     | [●● 5.0s]     | [●●● 7.5s]    | [●● 4.0s]     | [-]     | [-]      |
+---------------+---------------+---------------+---------------+---------------+---------+----------+
| 26 Eki        | 27 Eki        | 28 Eki        | 29 Eki        | 30 Eki        | 31 Eki  | 1 Kas    |
| [●● 4.5s]     | [●●● 6.5s]    | [●● 5.0s]     | [Tatil / -]   | [● 3.0s]      | [-]     | [-]      |
+----------------------------------------------------------------------------------------------------+
```

### 4.3 Birincil Eylemler ve Etkileşimler
1. **Güne Tıklayarak Odaklanma:** Herhangi bir gün hücresine tıklandığında o tarihin `/today` ekranı anında açılır.
2. **Sürükle-Bırak ile Tarih Kaydırma:** Bir görev veya etkinlik tutulup başka bir gün hücresine bırakıldığında `scheduled_at` veya `due_at` yeni güne taşınır.
3. **Hızlı Etkinlik/İş Ekleme:** Gün hücresinin köşesindeki `+` ikonuna basıldığında o gün önseçili olarak Hızlı Ekleme modalı açılır.

### 4.4 Durum Yönetimi (Empty / Loading / Error)
- **Boş Durum:** Ay boyunca hiç kayıt yoksa temiz takvim ızgarası, altta *"Bu ay için planlanmış bir akış yok"* mesajı.
- **Yükleme:** 35 hücrelik hafif parlayan ızgara iskeleti.
- **Hata:** *"Aylık ajanda yüklenemedi. [Yeniden Dene]"*.

### 4.5 Mobil Karşılığı
- Mobilde 7 sütun yan yana sığmayacağı için üstte kompakt mini ay seçici takvim, altta seçili günün dikey ajanda listesi (Agenda list view) sunulur.

### 4.6 Klavye Kısayolları
- `M`: Ay görünümünü tazele.
- `Alt + Sol / Sağ`: Önceki / sonraki aya geç.
- `T`: Mevcut aya dön.

### 4.7 Gereken API Verisi
- `GET /api/items/month?year=2026&month=10` -> `{ year: 2026, month: 10, days: Array<{ date: string; loadMin: number; density: number; items: Array<Pick<ItemEntity, 'id'|'title'|'kind'|'scheduledAt'|'dueAt'|'status'>> }> }`

---

## 5. Yıl / Hedefler Ekranı (`/goals` - Ufuk Ağacı ve Otomatik İlerleme)

### 5.1 Ne Gösterir ve Neden?
Kullanıcının hayatını organize ettiği en üst ufuk katmanıdır. Yıl → Çeyrek → Ay hiyerarşisinde hedef ağacı sunar. Her hedefin altında bağlı projeler ve görevler (`items`) listelenir. İlerleme bağlı işlerin tamamlanma yüzdesinden (`done / total`) otomatik hesaplanır; elle sayı veya metrik girilmez, karmaşık OKR yapıları yoktur.

### 5.2 ASCII Wireframe (Masaüstü)

```
+----------------------------------------------------------------------------------------------------+
| [Logo] Husrevity   [⌘K Komut / Arama]                    [+ Hızlı Ekle (N)] [TR/EN] [Koyu] [Profil]|
+----------------------------------------------------------------------------------------------------+
|  YIL VE HEDEFLER · 2026 YAŞAM UFKU                             [+ Yeni Hedef] [Ufuk: Tümü v]       |
|  Genel Tamamlanma: [██████████░░░░░░░░░░] %52 (64/122 İş)                                          |
+----------------------------------------------------------------------------------------------------+
| ▼ 🎯 2026 YILLIK HEDEF: Almanca B1 Sertifikası Alma             [İlerleme: ████████████░░░░ %62]   |
|   Dönem: 01 Oca 2026 - 31 Ara 2026  ·  Durum: AKTİF            [Düzenle] [+ Alt Hedef] [Tamamla]   |
|   |                                                                                                |
|   ├── ▼ 🎯 Q4 ÇEYREK HEDEFİ: Telc B1 Sınav Hazırlığı            [İlerleme: ██████████████░░ %70]   |
|   |   Dönem: 01 Eki 2026 - 31 Ara 2026  ·  Bağlı Proje: Almanca Çalışma Grubu                      |
|   |   |                                                                                            |
|   |   └── ▼ 🎯 EKİM AYI HEDEFİ: B1 Kelime Listesi & Gramer Tekrarı [İlerleme: ████████████████ %80]|
|   |       Dönem: 01 Eki 2026 - 31 Eki 2026                                                         |
|   |       Bağlı İşler:                                                                             |
|   |       [✓] B1 Seviyesi 300 fiil çekimi tekrarı (Tamamlandı)                                     |
|   |       [✓] Telc Model Test 1 çözümü (Tamamlandı)                                                |
|   |       [✓] Haftalık 2 saat Almanca konuşma pratiği (Tamamlandı)                                 |
|   |       [ ] Kelime kartları haftalık tekrarı (Teslim: 28 Eki)                                    |
|   |       [ ] Mektup yazma alıştırması 3 adet (Teslim: 30 Eki)                                     |
|   |                                                                                                |
| ▼ 🎯 2026 YILLIK HEDEF: Finansal Sağlık ve Portföy Büyümesi     [İlerleme: ████████░░░░░░░░ %42]   |
|   Dönem: 01 Oca 2026 - 31 Ara 2026  ·  Durum: AKTİF            [Düzenle] [+ Alt Hedef] [Tamamla]   |
|   ├── ▶ Q3 ÇEYREK HEDEFİ: Acil Durum Fonu Tamamlama (Tamamlandı: %100)                             |
|   └── ▼ Q4 ÇEYREK HEDEFİ: Yatırım Portföyü Revizyonu            [İlerleme: ████░░░░░░░░░░░░ %25]   |
|       Bağlı Proje: 2026 Portföy Yönetimi (4 Açık Görev)                                            |
+----------------------------------------------------------------------------------------------------+
```

### 5.3 Birincil Eylemler ve Etkileşimler
1. **Yeni Hedef Açma (`+ Yeni Hedef`):** Başlık, ufuk (`year` | `quarter` | `month`), başlangıç/bitiş tarihleri ve opsiyonel üst hedef (`parent_goal_id`) seçilir.
2. **Projeyi veya Görevi Hedefe Raptetme:** Proje veya görev detayında `goal_id` atanır; anında ilgili hedefin ağacında belirir ve tamamlandıkça hedefin ilerleme çubuğunu otomatik yükseltir.
3. **Hedef Statüsü Güncelleme:** `active`, `done` veya `dropped` seçilir.

### 5.4 Durum Yönetimi
- **Boş Durum:** *"Henüz bir hedef belirlemediniz. Claude'dan yıl hedeflerinizi yapılandırmasını isteyebilirsiniz."* Buton: `[Hedef Oluştur]`.
- **Yükleme:** 3 seviyeli ağaç iskeleti.
- **Hata:** *"Hedefler yüklenemedi. [Yeniden Dene]"*.

### 5.5 Mobil Karşılığı
- Mobilde üstte ufuk sekmeleri (`[Yıl (2) | Çeyrek (4) | Ay (6)]`), altta akordeon kartlar.

### 5.6 Klavye Kısayolları
- `G`: Hedefler görünümüne git.
- `Tab` / `Ok tuşları`: Hedefler arasında gezin.
- `Space`: Akordeon ağacını aç / kapat.

### 5.7 Gereken API Verisi
- `GET /api/goals` -> `GoalTreeDto[]` (her hedefte `id, title, horizon, periodStart, periodEnd, status, progressPercent, linkedProjects: Project[], linkedItems: ItemEntity[]`)

---

## 6. Gelen Kutusu Ekranı (`/inbox` - Hızlı Ayıklama ve Triage)

### 6.1 Ne Gösterir ve Neden?
Claude üzerinden veya hızlı ekleme ile tarihi (`scheduled_at`, `due_at`) ve hedefi (`goal_id`) belirlenmeden yakalanmış tüm ham iş ve niyetlerin toplandığı havuzdur. Kullanıcının zihnini boşalttıktan sonra haftalık veya günlük periyotlarla "Hızlı Ayıklama" (Triage / Inbox Zero) yapmasını sağlar.

### 6.2 ASCII Wireframe (Masaüstü)

```
+----------------------------------------------------------------------------------------------------+
| [Logo] Husrevity   [⌘K Komut / Arama]                    [+ Hızlı Ekle (N)] [TR/EN] [Koyu] [Profil]|
+----------------------------------------------------------------------------------------------------+
|  GELEN KUTUSU (Inbox) · 5 Ayıklanmamış Kayıt              [Tümünü Seç] [Hızlı Ayıklama Modu (T)]   |
|  💡 Claude İpucu: "Bu 5 işten 2'si Almanca hedefinize bağlanabilir, 1'i için bugün 45dk boşluğunuz var."|
+----------------------------------------------------------------------------------------------------+
| SEÇ | KAYIT BAŞLIĞI VE İÇERİK            | EKLENME     | HIZLI EYLEMLER (TRIAGE)                    |
|-----+------------------------------------+-------------+--------------------------------------------|
| [ ] | Diş hekiminden kontrol randevusu al| Bugün 10:14 | [Bugün'e At] [Yarın'a At] [Hedef v] [Sil]  |
|     | Not: Dr. Ayşe Hanım aranacak       |             |                                            |
| [ ] | Kışlık lastik değişim randevusu al | Dün 19:40   | [Bugün'e At] [Yarın'a At] [Hedef v] [Sil]  |
| [ ] | Der Spiegel makalesini oku         | 2 gün önce  | [Bugün'e At] [Projeye v] [Hedef: B1] [Sil] |
|     | Context: #almanca @okuma           |             |                                            |
| [ ] | Pasaport yenileme harcını yatır    | 3 gün önce  | [Bugün'e At] [Yarın'a At] [Hedef v] [Sil]  |
| [ ] | Sunum için infografik araçları bak | 4 gün önce  | [Projeye v] [Hedef: Q4 Lans] [Yarın] [Sil] |
+----------------------------------------------------------------------------------------------------+
| TOPLU EYLEMLER (1 Seçili): [Bugün 14:00'e Planla] [Projeye Ata...] [Hedefe Bağla...] [Arşivle/Sil] |
+----------------------------------------------------------------------------------------------------+
```

### 6.3 Birincil Eylemler ve Etkileşimler
1. **Tek Tıkla Zamanlama:** Satırdaki `[Bugün'e At]` tıklandığında iş Bugünün yapılacaklar listesine eklenir; `[Yarın'a At]` yarının tarihini verir.
2. **Hedefe / Projeye Bağlama:** Açılır menüden hedef veya proje seçilerek iş kutudan çıkarılır ve organize edilir.
3. **Toplu Ayıklama:** Klavye ile hızlı ayıklama modu (`T`).

### 6.4 Durum Yönetimi
- **Boş Durum:** *"Gelen kutusu tertemiz! (Inbox Zero 🎉). Tüm fikirler ve işler zamanlandı ya da hedeflere bağlandı."*
- **Yükleme:** 4 satırlık tablo iskeleti.
- **Hata:** *"Gelen kutusu yüklenemedi. [Yeniden Dene]"*.

### 6.5 Mobil Karşılığı
- Mobilde kart listesi. Sağa kaydırma (Swipe Right): Bugün'e ata; Sola kaydırma (Swipe Left): Arşivle/Sil.

### 6.6 Klavye Kısayolları
- `1`: Seçili işi Bugün'e ata.
- `2`: Seçili işi Yarın'a ata.
- `P`: Proje atama menüsünü aç.
- `G`: Hedef bağlama menüsünü aç.
- `D` / `Backspace`: Kaydı sil.

### 6.7 Gereken API Verisi
- `GET /api/items/inbox` -> `{ items: ItemEntity[], totalCount: number }`

---

## 7. Proje Detay Ekranı (`/projects/[projectId]`)

### 7.1 Ne Gösterir ve Neden?
Projenin mevcut ilerlemesini, paylaşılan üyelerini ve projeye bağlı görevleri liste/kanban biçiminde gösterir.

### 7.2 ASCII Wireframe

```
+----------------------------------------------------------------------------------------------------+
|  [Projeler] / Husrevity Yeniden Tasarım                                                            |
|  Ekip: (AH) (EK) (MC) [+ Üye Ekle]       Erişim: SAHİP (Owner)       [Düzenle] [Arşivle] [Sil]     |
+----------------------------------------------------------------------------------------------------+
| DURUM ÖZETİ                                                                                        |
| İlerleme: [████████████████░░░░] %72 (18/25 Tamamlandı)                                            |
| Bu Hafta Teslim: 4 Görev  ·  Geciken: 1 Görev  ·  Kalan Tahmini Süre: 14.5 Saat                    |
+----------------------------------------------------------------------------------------------------+
| Görünüm: [Liste | Kanban]                Filtre: [Tüm Üyeler v] [Öncelik v]    [+ Görev Ekle (C)]  |
+----------------------------------------------------------------------------------------------------+
| YAPILACAKLAR (4)           | DEVAM EDENLER (3)          | İNCELEMEDE (1)       | TAMAMLANANLAR (18)|
|----------------------------+----------------------------+----------------------+-------------------|
| [ ] API Migration Planı    | [ ] ADR Belgeleri Yazımı   | [ ] MCP Tools Schema | [✓] DB İncelemesi |
|     Teslim: Yarın          |     Sahip: AHZ             |     Sahip: EK        |     Sahip: AHZ    |
|     Süre: 2s · #backend    |     Süre: 4s · #mimari     |     Süre: 1s         |     Tamam: Dün    |
|                            |                            |                      |                   |
| [ ] Mobil UI Wireframe'leri| [ ] Radix Primitives Göçü  |                      | [✓] CSS Paleti    |
|     Teslim: Cuma           |     Sahip: MC              |                      |     Tamam: 2 gün  |
|     Süre: 3s · #tasarim    |     Süre: 6s · #frontend   |                      |                   |
+----------------------------------------------------------------------------------------------------+
```

### 7.3 Birincil Eylemler ve Etkileşimler
- **Kolonlar Arası Sürükleme:** Görev kartı taşındığında statü güncellenir (`open` -> `done`).
- **Hızlı Üye Atama:** Kart üzerindeki avatara tıklanarak atanan kişi değiştirilir.
- **Doğrudan Bugün'e Gönderme:** Göreve sağ tıklandığında "Bugün Saat 14:00'e Ekle" seçeneği.

### 7.4 Durum Yönetimi
- **Boş Durum:** *"Bu projede henüz görev yok. İlk görevi ekleyin veya Claude'dan iş dökümü yapmasını isteyin."*

### 7.5 Mobil Karşılığı
- Kolonlar yatay swipe yapılabilen sekmelere dönüşür (`[Yapılacaklar (4)] [Devam Edenler (3)] ...`).

### 7.6 Gereken API Verisi
- `GET /api/projects/:projectId` -> `{ project: Project, members: ProjectMember[], stats: ProjectStats }`
- `GET /api/items?projectId=:projectId` -> `Item[]`

---

## 8. Hızlı Ekleme Modalı (Quick Add Dialog - `⌘K` / `N` / Mobil FAB)

### 8.1 Ne Gösterir ve Neden?
Kullanıcının aklına bir iş geldiğinde o anki ekranından kopmadan, tek bir satırda doğal dille görevi kaydetmesini sağlar.

### 8.2 ASCII Wireframe

```
+------------------------------------------------------------------------------------+
|  [ESC ile Kapat]                                                                   |
|                                                                                    |
|  > Yarın saat 14:30'da Q3 Raporu hazırla 45dk #is @ahmet !yüksek                   |
|                                                                                    |
|  --------------------------------------------------------------------------------  |
|  CANLI ÇÖZÜMLEME ÖNİZLEMESİ:                                                       |
|  Başlık:       Q3 Raporu hazırla                                                   |
|  Zaman:        Yarın, 13 Ekim 2026 · 14:30 (45 dakika)                             |
|  Bağlam:       #is                                                                 |
|  Proje:        Husrevity Yeniden Tasarım                                           |
|  Öncelik:      Yüksek                                                              |
|                                                                                    |
|  [ Enter: Kaydet ]                     [ ⌘+Enter: Kaydet ve Başka Ekle ]           |
+------------------------------------------------------------------------------------+
```

### 8.3 Etkileşim Kuralı
Kullanıcı yazı yazarken `useQuickAddPreview` arka planda doğal dili ayrıştırır ve kutunun altında renkli etiketlerle canlı teyit eder. Enter'a basıldığı anda `Item` oluşturulur ve modal anında kapanır (optimistic update).

---

## 9. Şifreli Kasa Ekranı (`/vault`)

### 9.1 Ne Gösterir ve Neden?
Kritik API anahtarlarını, sunucu şifrelerini ve kişisel gizli notları AES-GCM şifrelemesiyle saklar. Güvenlik için hareketsizlikte otomatik kilitlenir. **MCP ve Claude bu ekrana veya verilerine asla erişemez.**

### 9.2 ASCII Wireframe

```
+----------------------------------------------------------------------------------------------------+
|  GİZLİ KASA (Vault)            [Korumalı Oturum: 14 dk kaldı]              [Kasayı Şimdi Kilitle 🔒]|
+----------------------------------------------------------------------------------------------------+
|  Arama: [Kayıtlarda ara...]        Kategori: [Tümü | API Keys | Parolalar | Sunucular]   [+ Yeni]   |
+----------------------------------------------------------------------------------------------------+
| BAŞLIK             | KATEGORİ    | DEĞER / ŞİFRE                  | GÜNCELLENME  | İŞLEMLER        |
|--------------------+-------------+--------------------------------+--------------+-----------------|
| Production DB URL  | Sunucular   | ******************** [Kopyala] | 2 gün önce   | [Göster] [Sil]  |
| OpenAI API Key     | API Keys    | sk-proj-************** [Kop.]  | 1 hafta önce | [Göster] [Sil]  |
| Hetzner Root Pass  | Parolalar   | ******************** [Kopyala] | 1 ay önce    | [Göster] [Sil]  |
+----------------------------------------------------------------------------------------------------+
| 🔒 Güvenlik Notu: Parolalar istemcide asla açık metin saklanmaz. Kopyala butonu değeri doğrudan    |
|    panoya kopyalar ve ekranda ifşa etmez. MCP/Claude erişimi kesinlikle engellenmiştir.           |
+----------------------------------------------------------------------------------------------------+
```

### 9.3 Birincil Eylemler
- **Doğrudan Panoya Kopyalama:** Değeri ekranda göstermeden `navigator.clipboard`'a güvenle kopyalar.
- **Otomatik Kilit (Auto-lock):** 15 dakika boyunca etkileşim olmazsa ana parola ekranına döner.

---

## 10. Claude Etkinlik ve Geri Alma Paneli (Activity & Undo Panel)

### 10.1 Ne Gösterir ve Neden?
Claude'un MCP üzerinden yaptığı planlama değişikliklerinin detaylı dökümünü verir ve istenirse tüm planlama oturumunu tek hamlede tersine çevirir.

### 10.2 ASCII Wireframe

```
+------------------------------------------------------------------------------------+
|  CLAUDE PLANLAMA ETKİNLİK GÜNLÜĞÜ                                     [Kapat X]    |
+------------------------------------------------------------------------------------+
|  Oturum: 12 Ekim 2026, 08:30:12  ·  Araç: apply_plan (MCP)                         |
|  Özet: 6 işlem gerçekleştirildi.                                                   |
|                                                                                    |
|  DEĞİŞİKLİK LİSTESİ:                                                               |
|  [+] EKLENDİ:     "Q3 Rapor Analizi" -> 09:30 - 11:00 (90dk)                       |
|  [+] EKLENDİ:     "Öğle Yemeği & Yürüyüş" -> 12:30 - 13:30 (60dk)                  |
|  [~] SAAT KAYDI:  "Haftalık Senkron" (Eski: 11:00 -> Yeni: 14:00)                  |
|  [~] ERTELENDİ:   "Doktor Randevusu" -> Yarına taşındı                             |
|  [✓] TAMAMLANDI:  "Sabah Rutini"                                                   |
|                                                                                    |
|  --------------------------------------------------------------------------------  |
|  Bu planlama oturumundaki tüm değişiklikleri geri almak istiyor musunuz?          |
|                                                                                    |
|  [ OTURUMU TÜMÜYLE GERİ AL (UNDO) ]                         [ Değişiklikleri Koru ]|
+------------------------------------------------------------------------------------+
```

### 10.3 Geri Alma Mekanizması
"Tümünü Geri Al" tıklandığında `POST /api/mcp/undo` çağrılır. Veritabanındaki `change_entry` kayıtlarındaki `before` durumları geri yüklenir ve Bugün ekranı anında güncellenir.
