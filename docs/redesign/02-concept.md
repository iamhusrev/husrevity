# 02-concept.md: Kavramsal Model ve Bilgi Mimarisi

> **Belge Amacı:** Husrevity'nin çift gerçeklik modelini sonlandıran, parçalanmış kavramları tek bir çekirdek nesne (`Item`) etrafında birleştiren ve Claude ile MCP üzerinden işbirliğini merkeze alan yeni kavramsal modelini ve bilgi mimarisini tanımlar.

---

## 1. Temel Felsefe: "Sadelik ve Eylem Odaklılık"

Mevcut denetim (`01-audit.md`), sistemdeki zihinsel yükün temel sebebinin **kavram enflasyonu** olduğunu ortaya koymuştur. Kullanıcı bir niyetini kaydetmek istediğinde dört farklı kapı arasında karar vermek zorunda kalmaktadır: Görev mi, hatırlatıcı mı, takvim etkinliği mi, yoksa zaman bloğu mu?

Yeni tasarımın ana ilkesi şudur:
> **"Bir insan gününü planlarken varlık tipleriyle değil, zaman ve niyetlerle düşünür."**

Eğer bir özellik varlığını haklı çıkaramıyorsa veya kullanıcıya "bunu nereye koymalıyım?" sorusunu sorduruyorsa elenmeli ya da tekilleştirilmelidir. Husrevity bir genel amaçlı ERP veya karmaşık proje yönetim aracı değildir; **kullanıcının gününü ve haftasını Claude ile birlikte en pürüzsüz şekilde planlamasını sağlayan kişisel bir kokpittir.**

---

## 2. Birleşik Kavramsal Model: Yaşam Ufukları ve Tek Çekirdek Varlık `Item`

Tüm zaman, hedef ve eylem yönetimi, birbiriyle konuşan hiyerarşik **zaman ufukları (horizon layers)** ve tek çekirdek eylem nesnesi (`Item`) üzerine inşa edilir:

```
[ZAMAN VE YAŞAM UFKU MODELİ]

+-------------------------------------------------------------+
| 1. HEDEF (Goal: Yıl → Çeyrek → Ay)                          |
|    title, horizon (year|quarter|month), period, parent_goal |
|    İlerleme: Bağlı item'lardan otomatik hesaplanır (% done) |
+------------------------------+------------------------------+
                               | (1-N bağ / opsiyonel)
                               v
+-------------------------------------------------------------+
| 2. PROJE / ALAN (Project / Area)                            |
|    id, title, color, project_member (işbirliği & erişim)    |
+------------------------------+------------------------------+
                               | (1-N bağ / opsiyonel)
                               v
+-------------------------------------------------------------+
| 3. ITEM (Çekirdek Eylem ve Zaman Nesnesi)                   |
|    kind: 'task' | 'event' | 'log'                           |
|    scheduled_at, duration_min, due_at, status, context      |
+------------------------------+------------------------------+
                               | (1-N bağ via note_link)
                               v
+-------------------------------------------------------------+
| 4. NOT (Note: Serbest Metin / Markdown Deposu)              |
|    note_link (note_id, target_type, target_id)              |
+-------------------------------------------------------------+

[MODEL DIŞI VE ÖZEL KATMANLAR]
- EVKAT: Tarihsiz haftalık şablon (routine_segment/activity); ajanda arkasında yarı saydam arka plan bandı.
- KASA (Vault): Modelin TAMAMEN DIŞINDA. MCP'nin TAMAMEN DIŞINDA. AES-GCM şifreli, UI-only.
```

### 2.1 Hayat Alanı → Model Nesnesi Eşleme Tablosu

| Hayat Alanı | Model Nesnesi | Rolü ve Davranışı |
| :--- | :--- | :--- |
| **Hedefler (Goals)** | `Goal` (`goal` tablosu) | Yıl → Çeyrek → Ay ufku. İlerleme bağlı item'ların tamamlanma oranından (`done / total`) otomatik hesaplanır; elle girilen metrik yoktur. Projeler ve item'lar `goal_id` ile bağlanır. |
| **Projeler (Projects)** | `Project` (`project` tablosu) | Paylaşımlı veya kişisel çalışma alanı (`project_id`). Üyeler, davetiyeler. İsteğe bağlı olarak bir üst hedefe (`goal_id`) bağlanabilir. |
| **Görevler (Tasks)** | `Item (kind: 'task')` | Yapılacak iş / niyet. Teslim tarihi (`due_at`), öncelik (`priority`), bağlam (`context`), proje bağı (`projectId`). Zamanlandığında zaman bloğuna dönüşür. |
| **Hatırlatıcılar (Reminders)** | `Item (kind: 'task')` | Bildirim zamanı (`notify_minutes_before`) ve teslim tarihi (`due_at`) olan görevlerdir. Listeler `#market`, `#ev` bağlam etiketleriyle (`context`) yönetilir. |
| **Takvim & Randevular** | `Item (kind: 'event')` | Sabit saatli etkinlikler (`scheduled_at`, `duration_min`). Harici Google Calendar senkronizasyonu kaldırılmıştır; basit Hafta ve Ay takvim görünümlerinde akar. |
| **Evkat (Haftalık Rutin)** | `routine_segment` / `routine_activity` | Tarihsiz haftalık ideal gün şablonudur. Bugün ve Hafta ekranlarında takvim ızgarasının arkasında **yarı saydam renkli şeritler (background bands)** olarak akar. |
| **Spor (Sport)** | `SportProfile` & `SportProgram` | Kendi modülünde yaşar. Planlanan seanslar `Item (kind: 'event')`, tamamlanan antrenmanlar `Item (kind: 'log')` olarak ana zaman akışına yansır. |
| **Öğrenme (Learning)** | `LearningTopic` & `LearningItem` | Kendi ağacında yaşar. Tekrar tarihi gelen maddeler (`review_at`) Bugün ekranına `Item (kind: 'task')` olarak akar. |
| **Notlar (Notes)** | `Note` (`note` tablosu) | Markdown deposu. Generic `note_link` tablosu üzerinden projelere, item'lara veya hedeflere bağlanabilir. |
| **Parolalar & Kasa (Vault)** | `VaultItem` (`vault_item` tablosu) | **Kavramsal modelin ve MCP'nin tamamen dışındadır.** AES-GCM ile şifrelenir. Yalnızca web/mobil arayüzde çözülür; Claude veya MCP asla erişemez. |

### 2.2 Zaman Bloğu (Time Block) Nedir?
**Zaman bloğu ayrı bir veritabanı tablosu veya bağımsız bir nesne DEĞİLDİR.**
Bir zaman bloğu; herhangi bir `Item`'ın (genellikle `task` veya `event`) bir başlangıç zamanı (`scheduled_at`) ve süre (`duration_min`) almasıyla ortaya çıkan **bir arayüz projeksiyonudur (görünümüdür).**
- Görev Bugün ekranındaki 14:00 saat aralığına sürüklendiğinde, `scheduled_at = '14:00'` ve `duration_min = 45` güncellenir.
- Görev zaman ekseninde artık bir "zaman bloğu" olarak boyanır. İş tamamlandığında üstü çizilir.

### 2.3 Hatırlatıcılar ve Listeler (Reminders & Lists)
- **Hatırlatıcı:** Bildirim zamanı (`notify_minutes_before`) ve teslim tarihi (`due_at`) olan bir `kind: 'task'` nesnesidir.
- **Hatırlatıcı Listeleri:** Ayrı bir `reminder_list` tablosu yerine `Item` üzerindeki `context` (bağlam/etiket) alanına indirgenir (örn: `#market`, `#faturalar`, `#ev`).

### 2.4 Projeler (Projects)
- Projeler, işbirliği yapılabilen ve birden fazla `Item`'ı çatısı altında toplayan kapsayıcılardır (`project_id`).
- Projeye bağlı görevler (`kind: 'task', project_id: '123'`), mevcut `ProjectAccessService` kontrolü ile üyelere (OWNER, EDITOR, VIEWER) açılır.
- Kişisel görevler ise `project_id: null` olan kayıtlardır ve kullanıcının kişisel Gelen Kutusu'nda (Inbox) yaşar.

### 2.5 Evkat (Haftalık Rutin Şablonu)
- Kullanıcının "sabah rutini", "odak çalışma bloğu", "spor saati", "akşam dinlenmesi" gibi haftalık ideal gün haritasıdır.
- Evkat blokları, tarihsiz haftalık tekrarlayan şablonlardır (`rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE...'`).
- **Görsel Rolü:** Bugün ve Hafta ekranlarında takvim ızgarasının arkasında **yarı saydam renkli şeritler (background bands)** olarak akar. Kullanıcı görevlerini bu şeritlerin üzerine sürükleyerek "Evkat ritmine uygun" planlama yapar.

### 2.6 Not Bağlantıları (Generic `note_link` Mimarisi)
Notların projelere, görevlere (`Item`) veya hedeflere bağlanabilmesi için **generic bağlantı tablosu (`note_link`)** mimarisi benimsenmiştir:
- `note_link`: `id`, `note_id`, `target_type` enum (`'item'` | `'project'` | `'goal'`), `target_id`, `created_at`.
- İndeksler: `(target_type, target_id)` ve `(note_id)`.
- **Tavsiye Gerekçesi ve Trade-off:**
  - *Generic `note_link` (Seçilen):* `Note` varlığını temiz tutar. Yarın yeni bir hedef, spor seansı veya öğrenme konusu bağlamak istendiğinde `note` şemasına yeni sütunlar eklemek gerekmez. Trade-off olarak veritabanı yabancı anahtar (FK constraint) seviyesinde değil, servis katmanında yetim (orphan) kayıt temizliği gerektirir.
  - *Her tip için ayrı foreign key (`note.project_id`, `note.item_id`, `note.goal_id`):* Veritabanında katı cascade sağlar ancak her yeni varlıkta şema göçü gerektirir, seyrek (sparse) ve NULL dolu sütunlar yaratır.
  - **Net Tavsiye:** Sadelik ve esneklik için tek generic `note_link` tablosu.

---

## 3. Değerlendirilen ve Reddedilen Alternatifler

```
+------------------------------------+-----------------------------------------------------+
| Sebebiyle Reddedilen Alternatif    | Neden Reddedildi? (Gerekçe & Trade-off)             |
+------------------------------------+-----------------------------------------------------+
| 1. Her Tip İçin Ayrı Tablo         | Mevcut miras yapı budur. Görev, hatırlatıcı ve     |
|    (task, reminder, event, block)  | takvim arasında veri senkronizasyonu imkansızdır.    |
|                                    | Ortak sorgulama yapılamaz, bellek taşması üretir.   |
+------------------------------------+-----------------------------------------------------+
| 2. Zaman Bloğunu Ayrı Varlık Yapma | Bir görevi saate yerleştirmek için iki ayrı tablo   |
|    (time_block tablosunu koruma)   | arasında foreign-key ilişkisi kurmak gerekir. Görev |
|                                    | silindiğinde yetim bloklar kalır. Çift iş yüküdür.  |
+------------------------------------+-----------------------------------------------------+
| 3. Her Şey Bir Sayfadır            | Notion/Craft tarzı blok modeli mobil performansını  |
|    (Notion / Block-based Model)    | düşürür, ilişkisel sorguları (haftalık yük, filtre) |
|                                    | imkansız kılar, Claude MCP entegrasyonunu zorlaştırır.|
+------------------------------------+-----------------------------------------------------+
| 4. Ölçülebilir Karmaşık Hedefler   | Sayısal hedef değerleri, birimler ve manuel yüzdeler|
|    (Manual KPI / OKR Key Results)  | kullanıcıyı sürekli veri girmeye zorlar. Husrevity  |
|                                    | basit kalmalıdır; ilerleme bağlı işlerden üretilir. |
+------------------------------------+-----------------------------------------------------+
| 5. Hedefleri Yalnızca Etiket Yapma | Hedefleri salt #etiket olarak yönetmek; hiyerarşik  |
|    (Goals as Tags Only)            | zaman ufkunu (yıl → çeyrek → ay) ve otomatik        |
|                                    | ilerleme hesaplamasını imkansız kılar.             |
+------------------------------------+-----------------------------------------------------+
```

> **Seçilen Yaklaşım Gerekçesi:** `Item` ve `Goal` modeli; SQL ilişkisel gücünü korurken, JSONB payload esnekliği sunar. Tek sorguda bir günün veya bir hedefin tüm unsurları çekilebilir.
> Varsayım: Ürün sahibinin "basit bir takvim olsa yeterli" yönlendirmesi doğrultusunda, karmaşık Google Calendar OAuth senkronizasyonu ve ayrı calendar_event tablosu kaldırılırken; items tablosu üzerindeki kind: 'event' ve 'task' kayıtlarını gösteren hafif Ay ve Hafta takvim görünümlerinin korunduğu kabul edilmiştir.

---

## 4. Yeni Bilgi Mimarisi ve Ekran Haritası

Sistem, birbiriyle konuşmayan bağımsız modüller yerine **aynı `Item` ve `Goal` havuzuna bakan farklı zaman zumlama seviyeleri (zoom levels)** etrafında kurgulanmıştır:

```
+---------------------------------------------------------------------------------------------------------------+
| GLOBAL GİRİŞ NOKTALARI                                                                                         |
| [ ⌘K / Ctrl+K : Tekil Komut Paleti & Arama ]      [ 'N' : Hızlı Ekleme ]      [ Mobil FAB: Hızlı Ekle / Yakala ]|
+---------------------------------------------------------------------------------------------------------------+
                                                       |
        +----------------------------------------------+----------------------------------------------+
        |                                                                                             |
[ ZAMAN UFKU VE EYLEM GÖRÜNÜMLERİ ]                                                        [ YAŞAM DEPOLARI ]
(Aynı Item ve Goal verisinin farklı zum seviyeleri)                                        (Özel Zengin Ekranlar)
        |                                                                                             |
  +-----+-----+-----+-----+-----+-----+                                                 +-----+-----+-----+-----+
  |     |     |     |     |     |     |                                                 |     |     |     |     |
[BUGÜN] [HAFTA] [ AY ] [ YIL ] [GELEN] [PROJELER]                                     [NOTLAR] [ÖĞRENME][SPOR] [EVKAT]
(Home)  (7 Gün) (Basit (Hedef  KUTUSU  (İşbirliği)                                    (Markdown (Konular (Program (Şablon)
                Takvim) Ağacı) (Inbox)                                                 Defteri) & Tekrar) & Log)
                                                                                                                |
                                                                                                         [ KASA (VAULT) ]
                                                                                                         (UI-Only / Gizli)
```

### 4.1 Birincil Gezinme ve Eylem Ekranları (Navigation & IA)
1. **Bugün (`/today` - Varsayılan Giriş Ekranı / Home):**
   - Sabah ilk açılan kokpit. Günün mevcut anında "Şimdi ne yapmalıyım?" sorusunun yanıtı.
   - Sol/Orta: 24 saatlik dikey zaman ekseni, Evkat arka plan şeritleri, zamanlanmış bloklar ve bağlı hedef rozetleri (`[Hedef: Almanca B1]`).
   - Sağ/Alt: Bugün teslim edilecekler ve sırada bekleyen işler havuzu.
   - Üst: Claude MCP Değişiklik Şeridi (Son planlama özeti ve "Geri Al" butonu).
2. **Hafta (`/week`):**
   - 7 günlük dikey sütunlu zaman ızgarası.
   - Günlük yük çubukları (Overload göstergesi: >7 saat ise uyarı).
   - Haftalık Değerlendirme Modu (Weekly Review): Bitenler, sarkanlar, Claude analizi.
3. **Ay (`/month` - Basit Takvim):**
   - Ürün sahibinin istediği **basit takvim** görünümüdür. Ayrı bir takvim tablosu YOKTUR; `items` modelindeki `scheduled_at` ve `due_at` kayıtlarını 30/31 günlük ızgarada gösterir.
   - Günlük yoğunluk noktaları, bir güne tıklayarak o günün Bugün görünümünü açma, gün arası sürükle-bırak erteleme.
4. **Yıl / Hedefler (`/goals`):**
   - Yıl → Çeyrek → Ay hedef ağacı (Ufuk Görünümü).
   - Bağlı projeler ve görevler. Bağlı işlerin tamamlanma yüzdesinden otomatik hesaplanan dinamik ilerleme çubukları (`done / total`).
5. **Gelen Kutusu (`/inbox`):**
   - Tarihsiz, hedefsiz veya bağlamsız yakalanan tüm ham işler havuzu.
   - Hızlı ayıklama (Triage): Tek tıkla Bugün'e atama, projeye gönderme, hedefe bağlama.
6. **Projeler (`/projects`, `/projects/[id]`):**
   - Paylaşımlı ve kişisel projelerin portföyü ve Kanban/Liste detay görünümü.

### 4.2 Özel Yaşam Depoları ve Araçlar
- **Notlar (`/notes`):** Sade, etiketli markdown defteri; `note_link` ile proje/item/hedeflere iliştirilebilir.
- **Öğrenme (`/learning`):** Konu ve alt başlık ağacı, spaced repetition durumları.
- **Spor (`/sport`):** Haftalık program şablonları, egzersiz kütüphanesi, ağırlık günlüğü.
- **Evkat Şablonu (`/evkat`):** Haftalık ideal saat dağılımını tasarlama aracı (yalnızca şablon düzenlemede girilir; günlük akış Bugün ekranında arka plan bandı olarak yaşar).
- **Kasa (`/vault`):** Şifreli parola listesi (**MCP ve Claude erişimi kesinlikle yoktur**; hareketsizlikte otomatik kilitlenir).
- **Ayarlar (`/settings`):** Profil, bildirimler, kullanıcı saat dilimi, planlama kapasitesi ve PAT yönetimi.

---

## 5. Claude MCP: Akıllı Yönlendirici (Router) Modeli

Kullanıcı Claude ile sohbet ederken *"bunu Husrevity'ye ekle"*, *"bu haftayı planla"* veya *"şu hedefi aya böl"* dediğinde Claude bir veritabanı operatörü gibi değil; kullanıcının **yaşam yönlendiricisi (Life Router)** olarak çalışır.

### 5.1 Çekirdek Eylem Fiilleri (Core MCP Verbs)
79 parçalı mikro araç yerine sistem **az sayıda güçlü, amaca yönelik fiil** etrafında toplanır (hedef: ~20 araç):

1. `capture`:
   - Serbest metin alır (`text: string`).
   - Claude metnin anlamsal içeriğini analiz eder: Bu bir görev mi, takvim randevusu mu, hatırlatıcı mı, hızlı not mu, yoksa hedef mi?
   - Karar verdiği varlığı oluşturur ve kullanıcıya ne yaptığını açıklar (*"Toplantı etkinliği olarak algılandı ve yarın 14:00'e 45 dakika olarak ajandaya eklendi."*).
2. `get_life_context`:
   - Tek bir çağrıda kullanıcının bütüncül yaşam resmini çeker: Bugünün ajandası, bu haftanın yükü, aktif yıl/çeyrek hedefleri, açık projeler ve geciken işler.
   - Claude'un planlama yaparken ek bağlam sorguları ile vakit kaybetmesini önler.
3. `plan` / `apply_plan`:
   - Claude'un önerdiği haftalık/günlük planı tek bir veritabanı transaction'ında atomik olarak uygular.
   - Bir `change_set` kaydı üretir (önceki ve sonraki durumlar JSONB olarak saklanır).
4. `find`:
   - Başlık, içerik, bağlam veya tarihe göre tüm `items`, `notes`, `goals` ve `projects` içinde birleşik arama yapar.
5. `update`:
   - Belirli bir varlığın saatini, durumunu veya içeriğini günceller.
6. `undo_change_set`:
   - Claude'un yaptığı son toplu planlama oturumunu tek hamlede tersine işletir (`before_state` geri yüklenir).

### 5.2 Hazır MCP İstemleri (Prompts)
- `plan_day`: Bugünün önceliklerini, Evkat rutin şeritlerini ve bekleyen işlerini analiz ederek optimal gün çizelgesi önerir.
- `plan_week`: 7 günlük iş yükünü dengeler, aşırı yüklenmiş günlerdeki görevleri boş günlere dağıtır.
- `review_month`: Ay boyunca hedeflere bağlı tamamlanan işleri raporlar, sarkan projeleri analiz eder.
- `set_goal`: Yıllık bir hedefi çeyreklere ve aylık projelere/eylemlere böler.

### 5.3 Örnek Claude MCP Sohbet Akışları (Turkish Conversations)

#### Senaryo 1: Hızlı Yakalama ("Bunu Husrevity'ye ekle")
> **Kullanıcı:** "Bunu Husrevity'ye ekle: Yarın saat 15:00'te Diş Hekimi Muayenesi 45 dakika."
>
> **Claude MCP Çağrısı:**
> ```json
> capture({
>   "text": "Yarın saat 15:00'te Diş Hekimi Muayenesi 45 dakika"
> })
> ```
> *Arka planda Claude niyetin `kind: 'event'` olduğunu belirler, yarının tarihini hesaplar ve `scheduled_at`, `duration_min` set ederek kaydeder.*
>
> **Claude Yanıtı:** "Diş Hekimi Muayenesi yarın saat 15:00'e 45 dakikalık bir takvim etkinliği olarak ajandanıza eklendi."

#### Senaryo 2: Haftalık Planlama ("Bu haftayı planla")
> **Kullanıcı:** "Bu haftamı planla, Salı günüm çok dolu görünüyor."
>
> **Claude MCP Çağrıları:**
> 1. `get_life_context()` -> *Haftalık yükü, Evkat odak bloklarını ve bekleyen 8 görevi tekte okur.*
> 2. `apply_plan({ ... })` -> *Salı günündeki 2 görevi Çarşamba ve Perşembe'deki boş odak bloklarına kaydırır.*
>
> **Claude Yanıtı:** "Haftanız planlandı! Salı günkü 8.5 saatlik aşırı yüklenme dengelendi: 'API Tasarım İncelemesi' Çarşamba 10:00'a, 'Rapor Yazımı' Perşembe 14:00'e kaydırıldı. Toplam 6 işlem tek bir değişiklik kümesi (`change_set_1042`) olarak uygulandı. Bugün ekranından tek tıkla geri alabilirsiniz."

#### Senaryo 3: Hedefi Aya Bölme ("Şu hedefi aya böl")
> **Kullanıcı:** "2026 Q4'te Almanca B1 Sertifikası alma hedefimi bu aya böl."
>
> **Claude MCP Çağrıları:**
> 1. `get_life_context()` -> *Aktif hedefleri ve Q4 dönemini sorgular.*
> 2. `apply_plan({ ... })` -> *Hedef altına Ekim ayı için 3 alt hedef/görev (B1 Kelime Listesi 200 sözcük, Telc Deneme Sınavı 1, Haftalık 2 seans konuşma pratiği) ekler ve Almanca öğrenme konusuna bağlar.*
>
> **Claude Yanıtı:** "Almanca B1 hedefiniz için Ekim ayı alt planı oluşturuldu: 3 eylem maddesi eklendi ve haftalık rutinlerinize yerleştirildi."

#### Senaryo 4: Yapılanı Geri Alma ("Az önce yaptığını geri al")
> **Kullanıcı:** "Az önce yaptığın planlamayı geri al, eski haline dönsün."
>
> **Claude MCP Çağrısı:**
> ```json
> undo_change_set({
>   "changeSetId": "change_set_1042"
> })
> ```
>
> **Claude Yanıtı:** "Son planlama oturumundaki 6 işlemin tamamı geri alındı. Ajandanız Claude müdahalesinden önceki durumuna döndürüldü."

### 5.4 Kasa Güvenlik Sınırı (Vault Boundary & Credential Guard)
- **Katı Değişmez (Invariant):** `apps/api/src/mcp/tools/mcp-tools-safety.spec.ts#L72-L94` dosyasında yer alan güvenlik testi bir mimari kuraldır: MCP altındaki hiçbir araç veya kaynak dosyada `vault` kelimesi geçemez. Parolalar, gizli anahtarlar ve kasa üst verileri Claude'a kesinlikle açılmaz.
- **UI Yönlendirmesi:** Parola ve kasa soruları yalnızca web/mobil kullanıcı arayüzü (`/vault`) üzerinden yanıtlanır. Claude'a *"şifremi ver"* denildiğinde Claude bu bilgiye sahip olmadığını ve kasanın arayüzden açılması gerektiğini belirtir.
- **Giriş Koruması (Credential Guard):** `capture` aracına gelen serbest metin şifre, parola, API anahtarı veya gizli kimlik bilgisi sezgisi taşıyorsa (örn. "şifre:", "password:", API anahtarı kalıpları), Claude kaydetmeyi reddeder ve kullanıcıyı doğrudan web'deki `/vault` ekranına yönlendirir.
> Varsayım: capture aracının şifre/parola/anahtar sezgisel korumasının (credential guard) anahtar kelime eşleşmesi ve desen taraması üzerinden çalışacağı ve kullanıcıyı UI'a yönlendireceği varsayılmıştır [çıkarım].

---

## 6. iOS Uygulaması ve Yerel Ekosistem Etkileri

Ürün sahibinin nihai hedeflerinden biri uygulamanın **SwiftUI tabanlı bir iOS uygulamasına** dönüştürülmesidir. Yapılan kavramsal kararlar iOS mimarisini doğrudan optimize eder:

> Varsayım: Gelecekte geliştirilecek iOS uygulamasının yerel veri katmanında SwiftData veya CoreData kullanacağı, sistem takvimi ve bildirimleriyle EventKit ve UserNotifications üzerinden entegre olacağı varsayılmıştır.

1. **Swift Veri Modeli Uyumu:** Tek bir `Item` struct'ı (SwiftData veya CoreData) tanımlamak; 5 ayrı entity (`Task`, `Reminder`, `Event`, `TimeBlock`, `Routine`) tanımlamaktan kat kat daha az bellek harcar ve senkronizasyon çatışmalarını (conflict resolution) asgariye indirir.
2. **Yerel Takvim & Hatırlatıcılar İle Köprü:** `Item` modeli hem iOS `EventKit` (Calendar) hem de `UserNotifications` ile birebir eşleşir (`scheduled_at` -> EKEvent, `due_at` -> EKReminder).
3. **Senkronizasyon Uç Noktası (`/api/sync`):** Mevcut `GET /api/sync?since=` uç noktası (hali hazırda `SyncService.syncSince` ile `items`, `notes`, `projects` ve silinen kayıtları `tombstones` olarak döner) genişletilir. Şu an eksik olan `change_set` kayıtları ve diğer modül verileri de bu senkronizasyona dahil edilir. Böylece istemci tek bir delta sorgusu ile tüm güncel duruma erişir.
4. **Widget Desteği:** iOS kilit ekranı ve ana ekran WidgetKit bileşenleri tek bir `today.timeline` payload'ı ile anında beslenir.
