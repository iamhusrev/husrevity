# 01-audit.md: Mevcut Durum Teşhisi ve UI/UX Denetimi

> **Belge Amacı:** Husrevity platformunun mevcut kullanıcı arayüzü (UI), kullanıcı deneyimi (UX), bilgi mimarisi ve veri modeli entegrasyonunun kapsamlı denetim raporudur. Kod tabanındaki somut bulgulara dayanır, "kod vs. doküman" çelişkilerini netleştirir ve iyileştirme için zemin hazırlar.

---

## 1. Yönetici Özeti (Executive Summary)

Husrevity, özünde **kullanıcının gününü ve haftasını Claude ile MCP (Model Context Protocol) üzerinden birlikte planlamasını hedefleyen** kişisel bir üretkenlik platformudur. Ancak sistemin mevcut durumunda, mimari açıdan **"çift gerçeklik kaynağı" (dual source of truth)** ve arayüz tarafında **"şablon kalıntıları ile parçalanmış UX"** sorunları mevcuttur.

- **Veri Modeli Yarığı:** Arka uçta `Item` modeli (`items` ve `item_occurrences` tabloları) tanımlanmış ve eski tablolardan tek seferlik geriye dönük doldurulmuştur (`BackfillItemsFromLegacyTables`). Ancak web arayüzündeki temel CRUD sayfaları (`/reminders`, `/calendar`, `/projects/[id]`, `/evkat`) ve Gemini AI öneri servisi yalnızca eski tablolara (`reminder`, `calendar_event`, `task`, `routine_*`) yazıp okumaktadır. Yeni `items` modelini okuyanlar `TodayService`, MCP araçları, `SyncService` ve web Dashboard'u (`useToday`); yazanlar ise MCP araçları, `QuickAddDialog` (`useCreateItem`), Telegram/Slack işleyicileri (`chat-quick-add.ts`) ve Google Calendar entegrasyonudur (`source: 'gcal'`). Sonuç olarak: Web CRUD sayfalarında bir hatırlatıcı veya takvim etkinliği oluşturan kullanıcı bunu Bugün panosunda görememekte; hızlı ekleme ile `items` tablosuna eklenen kayıtlar ise web'in ilgili alt sayfalarında hiç görünmemektedir.
- **MCP İşbirliği Eksikliği:** Claude ile planlama vaadi varken, MCP planlama aracı (`plan_week`) salt okunurdur, toplu yazma (batch write), serbest zaman aralığı hesaplama, işlem geri alma (undo) ve Claude'un yaptığı değişiklikleri izleme mekanizması yoktur.
- **Arayüz Parçalanması:** Web arayüzü Next.js 15 App Router üzerinde koşmasına rağmen, birbiriyle çakışan kısayollar (iki ayrı `⌘K` dinleyicisi), ölü arama kutuları, tıklanamayan ve tamamlanamayan gösterge paneli (Dashboard) kartları, mobilde 2 tık derine gömülmüş temel modüller ve 24 farklı dosyada (`src/{views,components,layout}`) elle yazılmış focus trap (odak yakalama) içermeyen modal ve overlay pencereler içermektedir.

---

## 2. Genel UI/UX Eleştirisi: On Ayrı Uygulama

Mevcut Husrevity kod tabanı incelendiğinde, sistemin tek bir bütüncül "hayat asistanı" (Life OS) gibi değil; aynı çatı altına toplanmış ancak birbiriyle konuşmayan **on farklı mikro uygulama** gibi çalıştığı görülmektedir. Bu parçalanmışlık, hem kullanıcı arayüzünde (UI) hem de kullanıcı deneyiminde (UX) ciddi bir bilişsel yük yaratmaktadır:

1. **"Şimdi ne yapmalıyım?" Sorusuna Yanıt Veren Bir Merkez (Home) Yok:**
   - **Kanıt:** `apps/web/src/app/(app)/dashboard/page.tsx`
   - **Etki:** Pano ekranı salt okunur istatistik kartları ve tıklanamayan görev listelerinden ibarettir (bkz. F-08). Kullanıcı sisteme girdiğinde günün mevcut anında hangi odak bloğunda olduğunu, sıradaki eylemin ne olduğunu ve günün kalanında nasıl bir zaman baskısı altında olduğunu gösteren interaktif bir yürütme ekseni (execution timeline) bulamaz. Pano bir eylem merkezi değil, pasif bir seyir terasıdır.

2. **Her Modülün Kendi Ekleme Akışı ve Dünyası Var ("Bunu nereye yazmalıyım?" İkilemi):**
   - **Kanıt:** `/reminders` (`apps/web/src/views/reminders/`), `/calendar` (`apps/web/src/views/calendar/`), `/evkat` (`apps/web/src/views/routine/`), `/learning` (`apps/web/src/views/learning/`).
   - **Etki:** Hatırlatıcılar Apple Reminders arayüzünü taklit eden listelerle çalışır; Takvim FullCalendar üzerinde bağımsız randevu açar; Evkat haftalık zaman blokları tasarlar; Öğrenme kendi konu ağacında yaşar. Her birinin kendi modalı, formu ve veri saklama noktası vardır. Kullanıcı zihnindeki bir düşünceyi kaydetmek istediğinde "Bu bir hatırlatıcı mı, görev mi, takvim etkinliği mi, yoksa öğrenme maddesi mi?" sorusunu cevaplamak zorundadır.

3. **Hiçbir Şey Birbirine Bağlanamaz (Silo Mimarisi):**
   - **Kanıt:** `apps/api/src/note/note.entity.ts#L31-L37`, `apps/api/src/learning/learning-item.entity.ts`, `apps/api/src/sport/entities/sport-profile.entity.ts`.
   - **Etki:** Notlar (`Note`) yalnızca etiketlere (`NoteTag`) bağlanabilir; bir projeye, göreve (`Item`) veya hedefe bağlanamaz. Öğrenme maddeleri (`learning_item`) ve konuları izoledir; tekrar tarihi (`review_at`) gelse bile Bugün panosuna otomatik akmaz. Spor seansları bağımsızdır, takvime veya göreve raptedilemez. Sistem adalar halinde yaşar.

4. **Gün/Hafta Ötesinde Zaman Ufku ve Hedef Kavramı Yok:**
   - **Kanıt:** Rota haritasında yalnızca gün/hafta bazlı görünümler mevcuttur; ay (`/month`) veya yıl (`/goals`, `/year`) rotası yoktur.
   - **Etki:** Kod tabanında hedefleri (Goal) temsil eden bir veri modeli yoktur; tek istisna `sport_profile` içindeki serbest metin `goals` sütunudur (`apps/api/src/sport/entities/sport-profile.entity.ts#L25`). Kullanıcı yıl, çeyrek ve ay hedefleri belirleyemez; projelerin veya günlük işlerin hangi büyük amaca hizmet ettiğini takip edemez.

5. **Yakalama (Capture) Sürtünmesi:**
   - **Kanıt:** `apps/web/src/app/(app)/layout.tsx#L30` vs `apps/web/src/layout/MobileBottomNav.tsx`.
   - **Etki:** Hızlı ekleme yalnızca masaüstünde `⌘K` ile açılabilmektedir (bkz. F-06). Mobilde Hızlı Ekleme butonu hiç yoktur (bkz. F-11). Dahası, hızlı ekleme ile `items` tablosuna yazılan kayıtlar web'in ilgili alt sayfalarında (`/reminders`, `/projects`, `/calendar`) hiçbir yerde görünmemektedir.

6. **Arayüz Borcu (UI Debt) Özeti:**
   - <!-- Verified code counts: globals.css vars: 146; husrev- classes: 1664; gray- classes: 973; brand- classes: 106; custom modal files: 24; Button: 6 in 4 files, husrev-btn: 114 in 36 files, raw button: 264 in 57 files -->
   - `globals.css` içinde 146 CSS değişkeni (`grep -E '^\s*--[a-zA-Z0-9_-]+:' apps/web/src/app/globals.css | wc -l`), 179 `--` satırı mevcuttur.
   - 24 farklı dosyada (`src/{views,components,layout}`) focus trap içermeyen, ARIA rolleri eksik elle yazılmış modal/overlay bulunmaktadır (`grep -rl "fixed inset-0" apps/web/src | wc -l`, bkz. F-13).
   - Buton bileşeni parçalanmıştır: 4 dosyada 6 adet `<Button`, 36 dosyada 114 adet `.husrev-btn`, 57 dosyada 264 adet ham `<button>` etiketi (`grep` ile doğrulanmıştır, bkz. F-14).

7. **Parçalanmış Görsel Dil (İki Palet Çatışması):**
   - **Kanıt:** 1664 adet `husrev-`, 973 adet `gray-[0-9]` ve 106 adet `brand-[0-9]` sınıfı (`apps/web/src/` taranarak doğrulanmıştır, bkz. F-12).
   - **Etki:** Özel marka paleti ile şablondan kalan Tailwind sınıfları çatışmakta, arayüzde renk tutarsızlığına yol açmaktadır.

### 2.1 Hayatın Alanları vs. Mevcut Yapı Kapsama Matrisi

| Hayat Alanı (Domain) | Kod Tabanındaki Durum | Güncel MCP Kapsamı (79 Araç) | Boşluk / Eksiklik |
| :--- | :--- | :--- | :--- |
| **Notlar (Notes)** | `Note` tablosu (`apps/api/src/note/note.entity.ts`), yalnızca etiket (`NoteTag`) ilişkisi var. `/notes` sayfası. | 6 araç (`note-tools.ts`: listeleme, detay, oluşturma, güncelleme, arama; silme aracı **yoktur**). | Proje, görev veya hedeflere bağlanamaz; silo halinde izoledir. |
| **Hatırlatıcılar (Reminders)** | `reminder`, `reminder_list` tabloları (`apps/api/src/reminder/`), `/reminders` sayfası (Apple Reminders klonu). | 12 araç (`reminder-tools.ts`: liste ve hatırlatıcı tam CRUD). | `items` modeliyle çift gerçeklik oluşturur; tekrarlama (`rrule`) ve proje bağı yoktur. |
| **Evkat (Günlük/Haftalık Rutin)** | `routine_segment`, `routine_activity` tabloları (`apps/api/src/routine/`), `/evkat` sayfası. Tarihsiz haftalık şablon. | 5 araç (`routine-tools.ts`: segment/aktivite listeleme ve ekleme; silme aracı **yoktur**). | Bugün panosu ve zaman ekseniyle bağlantısız; arka plan bandı olarak akmıyor. |
| **Spor (Sport)** | `sport_profile`, `sport_program`, `sport_session`, `sport_log` tabloları (`apps/api/src/sport/`), `/sport` sayfaları. | 12 araç (`sport-tools.ts`: profil, program, seans, log; silme aracı **yoktur**). | Planlanan antrenmanlar ajandaya (`items`) ve Bugün panosuna otomatik düşmüyor. |
| **Takvim (Calendar)** | `calendar_event` tablosu (`apps/api/src/calendar/`), FullCalendar kütüphanesi (`/calendar`), Google Calendar senkronizasyonu. | 6 araç (`calendar-tools.ts`: etkinlik CRUD). | Görev ve hatırlatıcıları göstermez; Google Calendar senkronizasyonu sürtünme yaratır; ayrı ağır modüldür. |
| **Projeler (Projects)** | `project`, `project_member`, `task` tabloları (`apps/api/src/project/`, `apps/api/src/task/`), `/projects/[id]` (Kanban/Liste). | 6 proje aracı (`project-tools.ts`) + 7 görev aracı (`task-tools.ts`). | Görevler `items` dışındadır; projesiz kişisel görevler (`projectId = null`) arayüzsüz kalır. |
| **Parolalar / Kasa (Passwords / Vault)** | `vault_item` tablosu (`apps/api/src/vault/`), AES-GCM şifreleme (`CryptoService`), `/vault` sayfası. | **0 araç.** Kod tabanında `mcp-tools-safety.spec.ts#L72-L94` güvenlik testiyle kasaya erişim katı biçimde engellenmiştir. | **Boşluk yok — bilerek MCP dışında, karar: öyle kalır.** Claude asla erişemez. |
| **Öğrenme (Learning)** | `learning_topic`, `learning_subtopic`, `learning_item` tabloları (`apps/api/src/learning/`), `/learning` sayfası. | 7 araç (`learning-tools.ts`; `zod` import uyumsuzluğu var, silme aracı **yoktur**). | Konular başka nesnelere bağlanamaz; tekrar tarihi (`review_at`) Bugün akışına düşmez. |
| **Hedefler (Goals)** | **Kodda hedef modeli YOKTUR.** Tek istisna `sport_profile.goals` serbest metin alanıdır (`apps/api/src/sport/entities/sport-profile.entity.ts#L25`). | **0 araç.** | Yıl, çeyrek, ay hedef hiyerarşisi yoktur; projeler ve işler bir hedefe raptedilemez. |

---

## 3. Brief vs. Kod Düzeltmeleri ve Çelişkiler

Yapılan statik kod incelemesinde, projenin kök `CLAUDE.md` belgesinde ve başlangıç varsayımlarında yer alan bazı bilgilerin güncel kod ile çeliştiği tespit edilmiştir:

| Konu | Dokümandaki / Brief'teki İfade | Kod Tabanındaki Gerçek Durum | Referans Dosya |
| :--- | :--- | :--- | :--- |
| **Çok Kiracılık & Güvenlik (RLS)** | PostgreSQL RLS (Row Level Security) kullanıldığı varsayımı. | **PostgreSQL RLS YOKTUR.** Çok kiracılık ve veri izolasyonu servis katmanında `ownerId` filtresi ile, paylaşılan projelerde ise uygulama seviyesinde `ProjectAccessService` kontrolü ile sağlanır. | `apps/api/src/project/project-access.service.ts`, `apps/api/src/common/base.entity.ts` |
| **Gmail Entegrasyonu** | Eski dokümanlarda Gmail senkronizasyonu ve AI sohbet modülü geçtiği görülür. | **Gmail ve AI Chat tamamen kaldırılmıştır.** `DropGmailAndAiChat` migration'ı ile ilgili tablolar silinmiştir. `ItemSource` içinde `'gmail'` enum değeri kalsa da işlevsizdir. | `apps/api/src/db/migrations/1715000015000-DropGmailAndAiChat.ts` |
| **Rota Grupları** | Kök `CLAUDE.md` içinde `(landing)` açık rota grubu olduğu belirtilir. | Web uygulamasında `(landing)` grubu **yoktur**. Yalnızca `(auth)` ve `(app)` grupları bulunmaktadır. | `apps/web/src/app/` |
| **Migration Listesi** | Kök `CLAUDE.md` içinde `SeedAdmin`, `Phase2` ve `RemoveDefaultAdmin` migration'ları referans verilir. | `apps/api/src/db/migrations/` dizininde `SeedAdmin`, `Phase2` veya `RemoveDefaultAdmin` dosyaları **yoktur**. Gerçek migration'lar `Baseline` (1715000000000), `FinanceAssetsLoans`, `AddProjectCollaboration`, `DropGmailAndAiChat` (1715000015000), `CreateItems` (1715000022000), `CreateItemOccurrences` (1715000023000), `BackfillItemsFromLegacyTables` (1715000024000) vb. sırasıyla yer alır. | `apps/api/src/db/migrations/` |
| **Çoklu Dil (i18n) Yapısı** | Kök `CLAUDE.md`: `i18next-http-backend` ve tarayıcı dil algılayıcı (`LanguageDetector`) kullanıldığı yazar. | `i18n.ts` içinde statik JSON import edilmekte (`import tr from ...`), backend ve detector **kullanılmamaktadır**. Dil seçimi kaydedilmemekte (localStorage yok), her yenilemede `tr`'ye dönmektedir. | `apps/web/src/configs/i18n.ts` |
| **Web Dev Portu** | Proje politikası: Web `3090`, API `4090` portunda çalışmalıdır. | `apps/web/package.json` içindeki `dev` ve `dev:local` script'leri `next dev -p 3000` olarak ayarlanmıştır. Port uyumsuzluğu vardır. | `apps/web/package.json#L6-L7` |

---

## 4. Envanter (Inventory)

### 4.1 Rota Haritası (Web Routes)

#### Aktif Kullanılan Rotalar (`apps/web/src/app/`):
- `(auth)/login`, `(auth)/register`, `(auth)/invite/[token]`, `(auth)/project-invite/[token]`
- `(app)/dashboard` — Ana gösterge paneli (özet görünüm, salt okunur).
- `(app)/notes`, `(app)/notes/[id]` — Kişisel not defteri.
- `(app)/projects`, `(app)/projects/[projectId]` — İşbirliği yapılabilen proje panosu (Kanban/Liste).
- `(app)/reminders`, `(app)/reminders/[listId]` — Hatırlatıcı listeleri (Apple Reminders benzeri).
- `(app)/calendar` — FullCalendar tabanlı takvim görünümü.
- `(app)/evkat` — Haftalık şablon / rutin segmentleri ve aktiviteleri ("Evkat").
- `(app)/learning` — Öğrenme konuları, alt başlıklar ve çalışma maddeleri.
- `(app)/sport`, `(app)/sport/programs`, `(app)/sport/profile` — Spor programları listesi (`/programs`), antrenman günlüğü, profil (kodda `[programId]` alt rotası yoktur).
- `(app)/vault` — Şifreli parola/kasa yöneticisi (`CryptoService` AES-GCM).
- `(app)/settings/profile`, `(app)/settings/integrations` — Profil ayarları, Telegram/Slack bağlama, Google Calendar durumu, MCP PAT yönetimi.
- `(app)/admin/users` — Sistem yöneticisi kullanıcı ve davetiye yönetimi.

#### Ölü Şablon Kalıntıları (Silinmesi Gereken Rotalar ve Bileşenler):
Bu sayfalar `(app)` altında korumalı rota değil, doğrudan `apps/web/src/app/<ad>/page.tsx` konumunda yer alan genel/açık (public) sayfalardır:
- `app/coming-soon/page.tsx`
- `app/maintenance/page.tsx`
- `app/success/page.tsx`
- `app/error-404/page.tsx`, `app/error-500/page.tsx`, `app/error-503/page.tsx`
- `src/views/misc/*` altındaki tüm dosyalar (`ComingSoon.tsx`, `Error404.tsx`, `Error500.tsx`, `Error503.tsx`, `Maintenance.tsx`, `Success.tsx`).
- `src/components/dashboard/StatCard.tsx` (0 import).
- `src/components/dashboard/RoutineNowCard.tsx` (0 import).
- `src/components/modal/ModalPortal.tsx` (0 import).
- `src/hooks/useTimeBlocks.ts` ve `src/services/time-block-service.ts` (Web'de hiçbir yerde çağrılmamaktadır).

### 4.2 Modül ve Servis Haritası (API Modules)

API (`apps/api/src/app.module.ts`), 26 özel uygulama/özellik modülünden (ve ayrıca 4 altyapı modülü: `ConfigModule`, `TypeOrmModule`, `ScheduleModule`, `ThrottlerModule` ile `common` altındaki `HealthController`) oluşmaktadır:
1. `crypto/`: `CryptoModule` (AES-GCM şifreleme servisi).
2. `auth/`: `AuthModule` (JWT kimlik doğrulama, `PersonalAccessToken` / PAT yönetimi).
3. `user/`: `UserModule` (kullanıcı yönetimi ve roller: `ROLE_ADMIN`, `ROLE_USER`).
4. `note/`: `NoteModule` (notlar ve etiketler).
5. `project/`: `ProjectModule` (projeler, üyeler `project_member`, davetiyeler, `ProjectAccessService`).
6. `task/`: `TaskModule` (eski görev tablosu `task`, kanban statüleri, öncelik).
7. `calendar/`: `CalendarModule` (eski takvim tablosu `calendar_event`, rrule).
8. `reminder/`: `ReminderModule` (eski hatırlatıcı tablosu `reminder`, `reminder_list`).
9. `vault/`: `VaultModule` (kasa kayıtları `vault_item`, AES-GCM şifreleme).
10. `ai/`: `AiModule` (Gemini tabanlı günlük öneri servisi `ai-suggestion.service.ts`).
11. `notification/`: `NotificationModule` (bildirim gönderimi ve FCM).
12. `notification/` (`NotificationResyncModule`): Bildirim zamanlamalarını yeniden eşitleme servisi.
13. `time-block/`: `TimeBlockModule` (eski zaman blokları `time_block`).
14. `routine/`: `RoutineModule` (Evkat rutin segment ve aktiviteleri `routine_segment`, `routine_activity`).
15. `admin/`: `AdminModule` (sistem yöneticisi kullanıcı ve davetiye yönetimi).
16. `sport/`: `SportModule` (spor profili, programı, seansı ve logları).
17. `learning/`: `LearningModule` (öğrenme modülü: `learning_topic`, `learning_subtopic`, `learning_item`).
18. `item/`: `ItemModule` (birleşik öğe yönetimi `Item`, `ItemOccurrence`, tekrarlama motoru `ItemRecurrenceService`).
19. `today/`: `TodayModule` (günlük plan agregasyonu `TodayService`: timeline + dueToday).
20. `sync/`: `SyncModule` (delta senkronizasyonu `SyncService`, `GET /api/sync`).
21. `device/`: `DeviceModule` (istemci cihaz kayıtları `device`).
22. `jobs/`: `JobsModule` (pg-boss arka plan iş yöneticisi ve outbox olay kuyruğu `outbox_event`).
23. `mcp/`: `McpModule` (Stateless Streamable HTTP MCP endpoint `POST /api/mcp`, PAT doğrulama, 79 araç kaydı).
24. `integrations/`: `IntegrationsModule` (Google Calendar webhook ve senkronizasyon servisi; `integration_account` ve `external_link` varlıkları).
25. `telegram/`: `TelegramModule` (Telegram botu, bildirimler ve link yönetimi).
26. `slack/`: `SlackModule` (Slack botu, bildirimler ve link yönetimi).
*(Ayrıca `common/`: `HealthController`, `BaseEntity`, `ApiException`, global filtreler, interceptor'lar ve guard'lar).*

### 4.3 Veri Modeli / Varlık Özeti (Entity / ER Summary)

```
[Mevcut Durum: Çift Gerçeklik Modeli]

+--------------------+           +---------------------------------------+
|  Birleşik Model    |           |            Eski Modeller             |
|  (items tablosu)   |           |    (Web sayfaları burayı kullanır)    |
+--------------------+           +---------------------------------------+
| id, owner_id       |           | task (id, owner_id, project_id, ...)   |
| kind: task|event|log|          | reminder (id, list_id, due_at, ...)    |
| scheduled_at       |           | calendar_event (id, start, end, rrule) |
| duration_min       |           | time_block (id, start_at, end_at, ...) |
| due_at             |           | routine_segment / routine_activity     |
| rrule              |           | learning_item / sport_session / note   |
| block_id           |           +---------------------------------------+
| status: open|done  |                              ^
| payload (jsonb)    |                              |
+--------------------+                              |
          ^                                         |
          |                                         |
[Web CRUD sayfaları ve Gemini önerileri eski tabloları kullanır; Dashboard ve Hızlı Ekleme items kullanır]
```

- **Mevcut Uçurum:** Veritabanında `BackfillItemsFromLegacyTables` göçü geçmiş verileri bir kez `items` tablosuna kopyalamıştır. Ancak web arayüzünde kullanıcı bir hatırlatıcı eklediğinde (`POST /api/reminders`) veya projede görev açtığında, bu kayıt sadece eski tablolara (`reminder`, `task`) gider. `items` modelini okuyan bileşenler `TodayService`, `sync/sync.service`, MCP araçları ve web panosudur (`useToday`); `items` tablosuna yazanlar ise MCP araçları, `QuickAddDialog` (`useCreateItem`), Telegram ve Slack işleyicileri (`common/chat-quick-add.ts`) ve `integrations` altındaki Google Calendar senkronizasyonudur (`source: 'gcal'`). Ancak web CRUD sayfaları (`/reminders`, `/calendar`, `/projects/[id]`, `/evkat`) ve Gemini AI öneri servisi (`AiService`) yalnızca eski tabloları okur ve yazar; çift yazma (dual-write) yoktur.
- **İlişki / Yapı Eksiklikleri:**
  - `task`: Zaman başlangıcı ve süresi yoktur; tekrarlama (`rrule`) desteği yoktur.
  - `reminder`: Tekrarlama yoktur, proje bağlantısı yoktur.
  - `calendar_event`: Görev bağlantısı yoktur, tamamlanma durumu (`completed_at`) yoktur.
  - `time_block`: Görev bağlantısı yoktur, bağımsız bir serbest zaman kutusudur.

### 4.4 MCP Araç Grupları Envanteri (MCP Tools)

Stateless HTTP üzerinden `POST /api/mcp` endpoint'i ile sunulan 11 araç dosyasında toplam **79 araç** `registerTool` ile kayıtlıdır (`for f in apps/api/src/mcp/tools/*.ts; do echo "$f: $(grep -c "registerTool" "$f")"; done`):

| Araç Dosyası (`apps/api/src/mcp/tools/`) | Kayıtlı Araç Sayısı | Önemli Araçlar ve Eksiklik Notları |
| :--- | :--- | :--- |
| `reminder-tools.ts` | 12 | Hatırlatıcı ve liste CRUD (silme araçları mevcuttur: `delete_reminder`, `delete_reminder_list`). |
| `sport-tools.ts` | 12 | Spor profil, program ve seans işlemleri (silme aracı **yoktur**). |
| `item-tools.ts` | 10 | `list_items`, `get_item`, `create_item`, `update_item`, `get_today`, `complete_item`, `search` (kodda `search_items` değil `search` adıyla kayıtlıdır), `plan_week`, `log_workout`, `quick_add` (silme aracı **yoktur**). |
| `task-tools.ts` | 7 | Proje görevleri listeleme, ekleme, güncelleme, silme (`delete_task`). |
| `learning-tools.ts` | 7 | Konular ve çalışma maddeleri (Zod import uyumsuzluğu var; silme aracı **yoktur**). |
| `calendar-tools.ts` | 6 | Takvim etkinlik CRUD (silme aracı mevcuttur: `delete_calendar_event`). |
| `note-tools.ts` | 6 | Not CRUD işlemleri (silme aracı **yoktur**). |
| `project-tools.ts` | 6 | Proje CRUD, üye listeleme (silme aracı mevcuttur: `delete_project`). |
| `routine-tools.ts` | 5 | Evkat segment ve aktivite işlemleri (silme aracı **yoktur**). |
| `notification-tools.ts` | 4 | Bildirim gönderme ve teşhis (Zod import uyumsuzluğu var; silme aracı **yoktur**). |
| `time-block-tools.ts` | 4 | Zaman blokları işlemleri (silme aracı **yoktur**). |
| **Toplam (11 Dosya)** | **79** | **Tüm sistemde silme araçları yalnızca takvim etkinliği (`delete_calendar_event`), proje (`delete_project`), hatırlatıcı (`delete_reminder`), hatırlatıcı listesi (`delete_reminder_list`) ve görev (`delete_task`) için mevcuttur; öğrenme (learning), spor (sport), öğe (item), not (note), rutin (routine) ve zaman bloğu (time-block) için silme aracı bulunmamaktadır.** |

---

## 5. Temel Teşhis: Görev, Zaman Bloğu, Takvim Etkinliği ve Hatırlatıcı Çakışması

### "Bunu nereye yazmalıyım?" İkilemi

Mevcut sistemde bir kullanıcının zaman ve eylem yönetimi yapabilmesi için sistemde 4 farklı kavram birbirinin üzerine binmektedir:

1. **Hatırlatıcı (Reminder):** "Salı günü fatura öde" -> Hatırlatıcılar sayfasına gidip listeye yazmalı.
2. **Görev (Task):** "Rapor hazırla" -> Bir projeye bağlı olmak zorunda (kişisel görevler için proje yoksa yetim kalıyor), statüsü TODO/IN_PROGRESS/DONE, ancak başlama saati yok.
3. **Takvim Etkinliği (Calendar Event):** "14:00 Ekip toplantısı" -> Takvime girip etkinlik açmalı, ancak görev gibi tamamlandı işaretlenemez.
4. **Zaman Bloğu (Time Block):** "15:00 - 17:00 Derin çalışma" -> Kodda servisi var fakat Web'de hiç arayüzü yok! Sadece API/MCP üzerinden oluşturulabilir.

> **Sonuç:** Kullanıcı bir iş planlarken "Bu bir görev mi, takvim etkinliği mi, hatırlatıcı mı, yoksa zaman bloğu mu?" sorusunu sormak zorunda kalmaktadır. Dördü de aslında **"zaman ekseninde bir niyet"** olmasına rağmen 4 ayrı tabloda, 4 ayrı ekranda ve senkronize olmadan yaşamaktadır.

### Veri Modeli Kaynaklı Sorunlar vs. Salt UI Problemleri

Mevcut kullanıcı deneyimindeki krizin ne kadarının veri modelinden, ne kadarının ise salt arayüz tasarımından kaynaklandığı ayrıştırılmıştır:

```
+--------------------------------------------------------------------------+
|  VERİ MODELİ KAYNAKLI (%60 Ağırlık)                                      |
|  - Çift gerçeklik kaynağı (Today items okurken web'in eski tabloları okuması)|
|  - Task, Reminder, Calendar, TimeBlock kavramsal ayrımı ve veri tekilleştirilememesi |
|  - Kişisel görevlerin (projectId = null) veritabanında sahipsiz arayüzsüz kalması |
|  - Zaman diliminin sunucuda Europe/Istanbul olarak kilitlenmesi           |
|  - Claude'un MCP yazımlarının denetimsiz ve geri alınamaz olması         |
+--------------------------------------------------------------------------+
|  SALT UI / UX KAYNAKLI (%40 Ağırlık)                                     |
|  - Çakışan Cmd+K dinleyicileri ve işlevsiz arama inputu                  |
|  - Dashboard'daki görev ve takvim satırlarının tıklanamaz / tamamlanamaz olması |
|  - Mobilde Evkat ve Projelerin 2 dokunuş derine itilmesi                 |
|  - 24 dosyada (src/{views,components,layout}) focus trap olmayan modal/overlay yapıları |
|  - Tasarım sisteminde 2 farklı renk paletinin (marka vs. şablon) çatışması |
|  - Sayfa yenilendiğinde dilin sürekli Türkçe'ye sıfırlanması             |
+--------------------------------------------------------------------------+
```

---

## 6. Tespitler Tablosu (Findings Table)

| # | Kategori | Tespit (Ne?) | Nerede? (Dosya / Rota) | Neden Problem? | Etki |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | **Veri Modeli** | Çift gerçeklik kaynağı (Dual Source of Truth) | `TodayService`, `apps/web/src/views/*` | Web sayfalarındaki değişiklikler Today ve MCP'ye yansımaz; MCP/Hızlı ekleme kayıtları web alt sayfalarında kaybolur. | **Yüksek** |
| **F-02** | **Veri Modeli** | `TodayService` bellek taşması (In-memory filtering) | `apps/api/src/today/today.service.ts#L58` | Kullanıcının tüm item'ları veritabanından belleğe çekilip JS'te filtreleniyor. Kayıt arttıkça bellek ve CPU tüketimi patlar. | **Yüksek** |
| **F-03** | **Veri Modeli** | Sabit zaman dilimi (`Europe/Istanbul`) | `apps/api/src/today/today.service.ts#L9` | Kullanıcı farklı bir zaman dilimine geçtiğinde gün başlangıcı/bitişi ve ajanda hesaplamaları hatalı çalışır.<br>> Varsayım: Sistemin varsayılan zaman diliminin Europe/Istanbul olduğu ve kullanıcının Türkiye saat diliminde çalıştığı varsayılmıştır. | **Orta** |
| **F-04** | **Bilgi Mimarisi** | Kişisel görevler (Personal tasks) arayüzsüz | `apps/web/src/views/projects/*` | `task.projectId === null` olan görevlerin listelendiği hiçbir ekran yoktur. Kullanıcı projesiz görev açamaz. | **Yüksek** |
| **F-05** | **Bilgi Mimarisi** | Zaman Blokları (Time Blocks) arayüzsüz | `apps/web/src/hooks/useTimeBlocks.ts` | Zaman bloğu servisi ve hook'u var ancak web'de bunu gösteren veya düzenleyen tek bir bileşen yoktur. | **Orta** |
| **F-06** | **Klavye / UX** | Çakışan `⌘K` / `Ctrl+K` Kısayolları | `apps/web/src/app/(app)/layout.tsx#L30` vs `apps/web/src/layout/AppHeader.tsx#L30` | İki bileşen de aynı tuş kombinasyonunu yakalıyor. Birisi QuickAdd açarken diğeri işlevsiz arama inputuna odaklanıyor. | **Yüksek** |
| **F-07** | **Arama / UI** | Ölü arama kutusu (Dummy search input) | `apps/web/src/layout/AppHeader.tsx#L114-L119` | Başlıktaki arama inputunun `onChange`, `onSubmit` veya arama motoru bağlantısı yoktur. Tamamen ölü bir mock elementtir. | **Orta** |
| **F-08** | **Günlük Akış** | Dashboard satırları tamamen salt okunur | `apps/web/src/app/(app)/dashboard/page.tsx#L158-L181` | "Bugün teslim" listesindeki görevlerin onay ikonu (`BiCheckCircle`) tıklanamaz. Kullanıcı panodan iş tamamlayamaz. | **Yüksek** |
| **F-09** | **AI / Maliyet** | Today önerileri her mount'ta tetikleniyor | `apps/web/src/components/dashboard/TodaySuggestionsCard.tsx#L78` | TanStack Query `useMutation` ile her sayfa ziyaretinde önbelleksiz olarak Gemini API'ye istek atıyor; maliyet ve gecikme yaratır. | **Orta** |
| **F-10** | **Navigasyon** | Kenar çubuğu katı eşleşme (`exact path`) hatası | `apps/web/src/layout/AppSidebar.tsx#L136` | `path === pathname` kontrolü nedeniyle kullanıcı `/projects/12` veya `/notes/abc` detayındayken ana menüde aktif sekme vurgusu kaybolur. | **Düşük** |
| **F-11** | **Mobil UX** | Projeler ve Evkat 2 tık derinde; Hızlı Ekleme yok | `apps/web/src/layout/MobileBottomNav.tsx#L27-L33` | Temel planlama modülleri "Daha Fazla" sheet'i arkasında gizli. Mobilde hızlı görev ekleme butonu hiç yoktur. | **Yüksek** |
| **F-12** | **Görsel / UI** | Çift palet karmaşası (Brand vs. Template) | `apps/web/src/app/globals.css` | 146 CSS değişkeni (`grep -E '^\s*--[a-zA-Z0-9_-]+:' apps/web/src/app/globals.css \| wc -l`; toplam 179 `--` satırı); 1664 `husrev-` (`grep --include="*.tsx" -roE 'husrev-' apps/web/src \| wc -l`); 973 `gray-[0-9]` (`grep --include="*.tsx" -roE 'gray-[0-9]' apps/web/src \| wc -l`); 106 `brand-[0-9]` (`grep --include="*.tsx" -roE 'brand-[0-9]' apps/web/src \| wc -l`) eşleşmesi. Şablon kalıntısı renkler görsel tutarsızlık yaratıyor. | **Orta** |
| **F-13** | **Bileşen / Kod** | 24 dosyada elle yazılmış modal/overlay | `apps/web/src/{views,components,layout}` | `grep -rl "fixed inset-0" apps/web/src \| wc -l` ile doğrulanan 24 dosyada (sayfalar, `layout/MobileBottomNav.tsx`, `DateTimePicker`, kullanılmayan `ModalPortal.tsx` dahil) modal/overlay tanımlıdır. Çoğunda ESC dinleyicisi bulunmakta, yalnızca birkaçı (`DeleteConfirmModal.tsx`, `QuickAddDialog.tsx`) `role="dialog"` ve `aria-modal` taşımakta, hiçbirinde focus trap (odak yakalama) bulunmamaktadır. | **Yüksek** |
| **F-14** | **Bileşen / Kod** | Buton sınıfı parçalanması | `apps/web/src/` genelinde | `<Button` bileşeni 4 kullanım dosyasında 6 adet (`grep --include="*.tsx" -rn '<Button' apps/web/src \| wc -l` ile `Button.tsx` tanımı hariç 6, tanım dahil 7 satır); `.husrev-btn` sınıfı 36 dosyada 114 adet (`grep -ro 'husrev-btn' apps/web/src \| wc -l`); ham `<button>` etiketi 57 dosyada 264 adet (`grep --include="*.tsx" -ro '<button' apps/web/src \| wc -l`). Tasarım tutarsızlığı. | **Orta** |
| **F-15** | **Çoklu Dil** | Dil tercihi kaydedilmiyor ve ~41 eksik anahtar | `apps/web/src/configs/i18n.ts` | Dil değiştirilse bile `localStorage` kaydedilmediği için F5 ile Türkçe'ye sıfırlanıyor. Her iki JSON dosyasında 1017 yaprak anahtar doğrulanmış olup (`apps/web/src/messages/{tr,en}.json`), kodda geçen ~41 anahtar dosyalarda eksiktir (382 satır içi fallback mevcuttur). | **Orta** |
| **F-16** | **MCP Uyumu** | MCP modüllerinde tutarsız `zod` import'u | `apps/api/src/mcp/tools/learning-tools.ts#L1`, `notification-tools.ts#L1` | Diğer araçlar `zod/v3` kullanırken bu iki dosya `zod` import ediyor. MCP SDK ile tip ve çalışma zamanı uyumsuzluğu riski taşır [çıkarım]. | **Orta** |
| **F-17** | **MCP Planlama** | Claude yazımlarında geri alma (Undo) yok | `apps/api/src/mcp/` | Claude MCP üzerinden planlama yaptığında kayıtlar doğrudan veritabanına yazılır. Hatalı planda tek tıkla geri alma imkanı yoktur. | **Yüksek** |
| **F-18** | **Geliştirici Deneyimi**| Web port uyumsuzluğu (`3000` vs `3090`) | `apps/web/package.json#L6-L7` | Proje standardı 3090 iken script'te 3000 yazıyor. Geliştirici ortamında port çakışmalarına ve kafa karışıklığına yol açar. | **Düşük** |
| **F-19** | **Veri Modeli / Mimari** | Hedef modeli eksikliği (No goal model) | `apps/api/src/sport/entities/sport-profile.entity.ts#L25` | Kod tabanında hedefleri (Goal) temsil eden bir veri modeli yoktur (tek istisna spor profilindeki serbest metin `goals` alanıdır). Kullanıcı yıl, çeyrek ve ay hedefleri belirleyemez; projeleri ve günlük işleri bir üst amaca bağlayamaz. | **Yüksek** |
| **F-20** | **Bilgi Mimarisi / Zaman** | Ay ve yıl zaman ufku eksikliği (No month/year view) | `apps/web/src/views/calendar/`, `apps/web/src/views/today/` | Kullanıcı yalnızca gün ve hafta seviyesinde planlama yapabilir. Aylık yük dağılımını veya yıllık hedefleri izleyebileceği hiçbir ekran yoktur. | **Orta** |
| **F-21** | **Veri Modeli / Entegrasyon** | Notların hiçbir varlığa bağlanamaması | `apps/api/src/note/note.entity.ts#L31-L37` | `Note` varlığı yalnızca etiketlere (`NoteTag`) bağlıdır. Notlar projelere, görevlere (`Item`) veya hedeflere raptedilemez; serbest ve yalıtılmış bir havuzda kalır. | **Orta** |
| **F-22** | **Zaman / Entegrasyon** | Takvim görünümünün yalnızca takvim etkinliklerini göstermesi | `apps/web/src/views/calendar/CalendarPage.tsx` | FullCalendar tabanlı takvim yalnızca `calendar_event` kayıtlarını çeker; görevleri veya hatırlatıcıları göstermez (F-01 ve F-05 ile ilişkili). Zaman planlaması parçalı kalır. | **Orta** |
| **F-23** | **Kullanıcı Deneyimi / Akış** | Gösterge panelinin "Şimdi ne yapmalıyım?" sorusuna yanıt vermemesi | `apps/web/src/app/(app)/dashboard/page.tsx` | Dashboard özet kartlardan ibarettir ve satırları salt okunurdur (F-08); kullanıcının günün mevcut anında ne yapması gerektiğini gösteren interaktif bir yürütme ekseni sunmaz. | **Orta** |

---

## 7. Günlük Akışlar ve Tıklama Analizi (Flows & Click Counts)

> **Not:** Kardeş `shared-infra` dizini mevcut olmadığı ve 5432 portunda dinleyen PostgreSQL servisi bulunmadığı için canlı uygulama kontrolü atlanmış; tüm adımlar ve tıklama sayıları doğrudan bileşen kaynak kodları (`views/`, `components/`, `layout/`) taranarak adım adım türetilmiş ve **`[koddan çıkarım]`** olarak işaretlenmiştir.

> Varsayım: Tıklama sayıları bileşen kaynak kodundan sayıldı, çalışan uygulamada ölçülmedi; gerçek sayılar koşullu durumlara (boş liste, açık modal, tarayıcı otomatik doldurma) göre ±1 değişebilir.

> Varsayım: react-dnd'nin HTML5 backend'i dokunmatik cihazlarda sürüklemeyi desteklemez; bu bilgi kütüphane davranışından çıkarıldı, gerçek bir mobil cihazda denenmedi.

> Varsayım: "Kullanıcı bunu nereye yazacağını düşünüyor" tespiti (bölüm 4) kullanım alışkanlığına dayanır. Kodda yalnızca altı farklı kayıt noktası görülebilir; ürün sahibinin son 1-2 ayda Spor, Öğrenme, Evkat ve Hatırlatıcı listelerini aktif kullandığı bilgisi kendisinden alındı.

### 7.1 Akış Karşılaştırma Tablosu

| Günlük Akış | Mevcut Durum Adımları & Tıklama Sayısı `[koddan çıkarım]` | Önerilen Yeniden Tasarım Hedefi | İyileşme Oranı |
| :--- | :--- | :--- | :--- |
| **1. Sabah Planlaması** | **11 Tıklama / 4 Sayfa Gezintisi**<br>Dashboard (okuma) → Evkat (blokları anımsama) → Reminders (görevleri seçme) → Zihinsel eşleme (zaman bloğuna sürükleme yok). | **1 Tıklama / 0 Sayfa Değişimi**<br>Tek Bugün ekranı: Claude'un gece önerdiği planı incele, tek tıkla onayla veya blokları sürükleyip bırak. | **%90 azalma** |
| **2. Hızlı Görev Ekleme** | **Klavye ile 2 Tıklama / Mobilde 5+ Tıklama**<br>Masaüstünde `⌘K` → Yaz → Enter (Ancak Today'de çıkmaz!). Mobilde buton yok: Menü → Reminders → Liste seç → Input tıkla → Ekle. | **Masaüstünde `N` veya `⌘K` / Mobilde 1 Dokunuş**<br>Global FAB butonu veya kısayol → Doğal dil ile yaz ("14:00 Rapor yaz 45dk") → Enter. Tüm görünümlere anında yansır. | **Mobilde %80 azalma** |
| **3. Görevi Zaman Aralığına Yerleştirme** | **İMKANSIZ (0 Tıklama / Desteklenmiyor)**<br>Mevcut web uygulamasında bir görevi tutup takvime veya zaman bloğuna sürükleme arayüzü yoktur. Kullanıcı harici saat ayarlamak zorundadır. | **1 Sürükle-Bırak Hareketi (Drag & Drop)**<br>Bekleyen işler kutusundan bugünün zaman eksenindeki boş aralığa sürükle (`dnd-kit` ile dokunmatik destekli).<br>> Varsayım: dnd-kit kütüphanesinin PointerSensor ve TouchSensor yapılandırmalarıyla mobil tarayıcılarda dokunmatik sürükle-bırak desteği sunacağı varsayılmıştır. | **Fonksiyonel kazanım** |
| **4. Haftalık Değerlendirme (Review)** | **8 Tıklama / Parçalı Ekranlar**<br>Haftalık özet ekranı yoktur. Projeler tek tek gezilir, Takvim haftalık görünüme alınır, tamamlananlar zihinde toplanır. | **1 Tıklama**<br>Hafta sekmesine tıkla: 7 günlük yük çubuğu, tamamlananlar, kayan işler ve Claude haftalık analiz paneli. | **%85 azalma** |
| **5. Proje Durumu Kontrolü** | **4 Tıklama**<br>Kenar çubuğu → Projeler → Proje Kartı seç (kartlarda görev sayısı/ilerleme yok) → Detayda Kanban yüklenmesini bekle. | **1 Tıklama**<br>Projeler ekranında kart üzerinde doğrudan ilerleme çubuğu, bu haftaki teslimler ve gecikenler özeti. | **%75 azalma** |

### 7.2 Adım Adım Akış Analizi (Kod Tabanı Kanıtları)

#### Akış 1: Sabah Planlaması Detayı
1. Kullanıcı `/dashboard` sayfasına girer (1 tık).
2. Pano üzerindeki `TodaySuggestionsCard` Gemini'den öneri çeker, ancak bu öneriler doğrudan ajandaya işlenemez.
3. Kullanıcı hangi zaman diliminde olduğunu anlamak için kenar çubuğundan `/evkat` rotasına gider (1 tık).
4. Evkat'taki haftalık şablon saatlerine bakar (tarihsizdir, bugüne özel görev içermez).
5. Yapılacak işleri görmek için `/reminders` rotasına tıklar (1 tık).
6. İlgili hatırlatıcı listesini seçer (1 tık).
7. Görevleri aklında tutar veya kağıda yazar, çünkü hatırlatıcıyı takvime (`/calendar`) bağlayacak bir sürükleme mekanizması yoktur.
8. `/calendar` sayfasına geçer (1 tık), gün veya hafta modunu seçer (1 tık), yeni etkinlik oluşturmak için saat aralığı tıklar (1 tık), başlık yazar ve kaydeder (2 tık).
> **Toplam:** En az 11 etkileşim, 4 farklı sayfa arasında zihinsel bağ kurma yükü.

#### Akış 2: Hızlı Görev Ekleme Detayı
- **Masaüstü:** `apps/web/src/app/(app)/layout.tsx#L30` içindeki `⌘K` dinleyicisi ile `QuickAddDialog` açılır. Doğal dil parser'ı (`useQuickAddPreview`) başlığı, tarihi çözer. Enter'a basıldığında `useCreateItem` ile `items` tablosuna yazılır. **Fakat:** Kullanıcı hemen ardından `/reminders` veya `/projects` sayfasına gittiğinde bu eklediği kaydı göremez!
- **Mobil:** `layout/MobileBottomNav.tsx` içinde Hızlı Ekleme butonu yoktur. Kullanıcı sağ alttaki "Daha Fazla" sheet'ine basar (1 tık), oradan bir modül seçer veya `/reminders` sekmesine basar (1 tık), liste seçer (1 tık), "+ Yeni Hatırlatıcı" tıklar (1 tık), başlık yazar, kaydeder (1 tık).
> **Toplam:** Mobilde en az 5 tıklama.

#### Akış 3: Görevi Zaman Aralığına Yerleştirme (Timeboxing)
- `apps/web/src/views/calendar/CalendarPage.tsx` incelendiğinde `@fullcalendar/react` bileşeni kullanıldığı görülür. Takvim etkinlikleri `calendarService.listEvents()` üzerinden beslenir.
- Görevler (`task`) veya hatırlatıcılar (`reminder`) takvim kenarında listelenmez; dışarıdan takvime sürükleme (`droppable`) yapılandırması yoktur.
- `apps/web/src/views/projects/KanbanBoard.tsx` içinde `react-dnd` kullanılmıştır ancak yalnızca kolonlar arasında görev taşımaya yarar; zaman ataması yapmaz.
> **Toplam:** Mevcut mimaride web üzerinden bir görevi belirli bir saate sürükleyerek zaman bloğu oluşturmak imkansızdır.

---

## 8. Sonuç ve Yeniden Tasarım Odakları

Bu denetim raporu göstermektedir ki, Husrevity platformunun en acil ihtiyacı yeni özellikler eklemek değil; **mevcut mimariyi sadeleştirmek, veri tabanındaki çift başlılığı ortadan kaldırmak ve Claude ile planlama vaadini tek bir odaklanmış arayüzde (Bugün & Hafta) hayata geçirmektir.**

Takip eden `02-concept.md` belgesinde, bu denetimdeki bulguları kökten çözecek olan birleşik `Item` kavramsal modeli ve yeni bilgi mimarisi tanımlanacaktır.
