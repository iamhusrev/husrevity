# 04-decisions.md: Mimari Karar Kayıtları (ADR'ler)

> **Belge Amacı:** Husrevity yeniden tasarım sürecinde alınan 14 temel mimari kararı (ADR), karar gerekçelerini, reddedilen alternatifleri, veri modeli/API etkilerini, güvenlik ve erişim kontrolü yansımalarını ve iOS hedefine etkilerini belgeler.

---

## Mimari Kararlar Dizini (ADR Index)

1. **ADR 1:** `items` Tablosunun Tek Gerçeklik Kaynağı Olması `[VERİ MODELİ]` `[API]`
2. **ADR 2:** Zaman Bloğunun Bir Varlık Değil, Görünüm Olması `[VERİ MODELİ]` `[API]`
3. **ADR 3:** Google Calendar Entegrasyonu ve FullCalendar'ın Kaldırılması, Basit Takvimin Korunması `[VERİ MODELİ]` `[API]` *(Revize)*
4. **ADR 4:** Hatırlatıcıların `Item` Modeline Göç Edilmesi `[VERİ MODELİ]` `[API]`
5. **ADR 5:** Proje Görevlerinin `Item` Modeline Göçü ve Erişim Kontrolü `[VERİ MODELİ]` `[API]`
6. **ADR 6:** Claude MCP Yazımlarının `change_set` İle Kaydı ve Geri Alma `[VERİ MODELİ]` `[API]`
7. **ADR 7:** MCP Yönlendirici (Router) Modeli ve Sadeleştirilmiş Araç Sözleşmesi `[API]` *(Revize)*
8. **ADR 8:** Arayüz Primitifleri (Radix, cmdk, dnd-kit) ve FullCalendar Temizliği
9. **ADR 9:** Tasarım Belirteçleri (Design Tokens) ve Tek Renk Katmanı
10. **ADR 10:** Kullanıcı Bazlı Zaman Dilimi ve Planlama Tercihleri `[VERİ MODELİ]` `[API]`
11. **ADR 11:** iOS Hazırlığı: `/sync` Sözleşmesi ve SwiftUI Uyumu `[API]`
12. **ADR 12:** Hafif Hedef Modeli (Light Goals) `[VERİ MODELİ]` `[API]`
13. **ADR 13:** Kasa (Vault) MCP Dışında Kalır `[API]`
14. **ADR 14:** Not Bağlantıları (Generic `note_link` Mimarisi) `[VERİ MODELİ]`

---

## Tip Tanımları ve Kod Örnekleri (Code Samples)

### Önerilen `Item` Şekli (Proposed Item Shape)

```typescript
// English TypeScript model for the unified Item entity
export type ItemKind = 'task' | 'event' | 'log';
export type ItemStatus = 'open' | 'done' | 'cancelled';
export type ItemPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ItemPayload {
  list?: string;                // e.g. "groceries", "work" (replaces reminder_list)
  priority?: ItemPriority;
  location?: string;
  meetingUrl?: string;
  color?: string;
  externalId?: string;          // e.g. for ICS import or legacy tracking
  assigneeId?: string;          // for project collaboration
  tags?: string[];
  [key: string]: unknown;
}

export interface ItemEntity {
  id: string;
  ownerId: string;              // multi-tenancy gate (service-layer filtering)
  projectId: string | null;     // null = personal item, string = project-scoped
  goalId: string | null;        // null = unlinked, string = linked to Goal (ADR 12)
  blockId: string | null;       // parent item link (routine segment or parent task)
  kind: ItemKind;
  title: string;
  notes: string | null;
  context: string | null;       // context tag, e.g. "@desk", "#focus"
  scheduledAt: Date | null;     // when it starts (Europe/Istanbul or user tz)
  durationMin: number | null;   // duration in minutes (creates the time block projection)
  dueAt: Date | null;           // deadline for tasks
  notifyMinutesBefore: number | null;
  rrule: string | null;         // RFC5545 recurrence rule
  status: ItemStatus;
  completedAt: Date | null;
  payload: ItemPayload;
  source: 'web' | 'ios' | 'mcp' | 'telegram' | 'slack';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### Önerilen `Goal` Şekli (Proposed Goal Shape - ADR 12)

```typescript
// English TypeScript model for the light Goal entity
export type GoalHorizon = 'year' | 'quarter' | 'month';
export type GoalStatus = 'active' | 'done' | 'dropped';

export interface GoalEntity {
  id: string;
  ownerId: string;              // multi-tenancy gate (service-layer filtering)
  title: string;
  horizon: GoalHorizon;
  periodStart: string;          // ISO date string "YYYY-MM-DD"
  periodEnd: string;            // ISO date string "YYYY-MM-DD"
  parentGoalId: string | null;  // self-reference for hierarchy (year -> quarter -> month)
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface GoalWithProgressDto extends GoalEntity {
  progressPercent: number;      // computed from linked items: (doneItems / totalItems) * 100
  totalItems: number;
  doneItems: number;
  linkedProjectCount: number;
}
```

### Önerilen `get_life_context` Yanıt Şekli (MCP Aggregated Life Context)

```typescript
// Output of get_life_context MCP tool (single roundtrip life state)
export interface LifeContextResponse {
  today: {
    timeline: ItemEntity[];
    dueToday: ItemEntity[];
    backlog: ItemEntity[];
    currentBlock: ItemEntity | null;
  };
  week: {
    totalScheduledMin: number;
    days: Array<{ date: string; loadMin: number; count: number; isOverloaded: boolean }>;
  };
  activeGoals: GoalWithProgressDto[];
  openProjects: Array<{ id: string; title: string; openTaskCount: number; color?: string }>;
  overdueItems: ItemEntity[];
}
```

### Önerilen `apply_plan` Girdi ve Çıktı Şekli (MCP Planning Batch Contract)

```typescript
// Input to apply_plan (sent by Claude over MCP)
export interface ApplyPlanInput {
  date: string; // ISO date string "YYYY-MM-DD"
  reason: string; // e.g. "Morning schedule optimization: 5 tasks timeboxed, 1 deferred"
  operations: Array<
    | {
        op: 'create';
        item: {
          kind: ItemKind;
          title: string;
          scheduledAt?: string;
          durationMin?: number;
          dueAt?: string;
          projectId?: string;
          goalId?: string;
          context?: string;
          payload?: ItemPayload;
        };
      }
    | {
        op: 'update';
        itemId: string;
        changes: Partial<{
          title: string;
          scheduledAt: string | null;
          durationMin: number | null;
          dueAt: string | null;
          goalId: string | null;
          status: ItemStatus;
          context: string | null;
        }>;
      }
    | {
        op: 'delete';
        itemId: string;
      }
  >;
}

// Output from apply_plan (returned to Claude and recorded in change_set)
export interface ApplyPlanOutput {
  changeSetId: string;
  executedAt: string;
  totalOperations: number;
  createdItemIds: string[];
  updatedItemIds: string[];
  deletedItemIds: string[];
  summary: string;
  canUndo: boolean;
}
```

---

## ADR 1: `items` Tablosunun Tek Gerçeklik Kaynağı Olması `[VERİ MODELİ]` `[API]`

### 1. Bağlam
Mevcut mimaride iki gerçeklik kaynağı vardır (`01-audit.md` F-01). `items` tablosu mevcuttur ancak web sayfaları sadece eski tablolara (`task`, `reminder`, `calendar_event`) yazmaktadır. `TodayService` ise sadece `items` okur. Sonuç olarak web'den eklenen kayıtlar panoda çıkmaz.

### 2. Karar
`items` tablosu sistemin **tek ve mutlak gerçeklik kaynağı (single source of truth)** haline getirilir.
- Geçiş aşamasında eski endpoint'ler (`/api/tasks`, `/api/reminders`) birer adaptör servis haline getirilerek arka planda `ItemService` üzerinden `items` tablosuna yazar.
- Eski tablolar salt okunur delta mutabakatı sonrası tamamen silinir (`DROP TABLE`).
- Güvenlik: Veritabanında PostgreSQL RLS yoktur; tüm veri izolasyonu NestJS servis katmanında `ownerId` filtresi ile sağlanmaya devam eder.

### 3. Alternatifler
- *Alternatif A: Çift yazma (dual-write) mekanizması kurmak.* Reddedildi; iki tabloyu sürekli senkron tutmak dağıtık kilitlenme ve tutarsızlık riski yaratır.
- *Alternatif B: Eski tabloları koruyup bir SQL VIEW üzerinden birleştirmek.* Reddedildi; karmaşık ve yavaş sorgular üretir, TypeORM ile yönetimi zordur.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar:** Tek sorgu ile günün ve haftanın tüm akışı çekilebilir. Veri tutarsızlığı sıfırlanır.
- **Göç Riski:** Mevcut verilerin `legacy_table` ve `legacy_id` üzerinden tek seferlik son mutabakatı yapılmalıdır.
- **iOS Etkisi:** iOS istemcisi yalnızca tek bir `Item` modeli için senkronizasyon ve önbellekleme yazar.

---

## ADR 2: Zaman Bloğunun Bir Varlık Değil, Görünüm Olması `[VERİ MODELİ]` `[API]`

### 1. Bağlam
Sistemde `time_block` tablosu bulunmaktadır ancak web arayüzünde hiçbir yeri yoktur (`F-05`). Zaman blokları aslında görevlerin zaman eksenindeki izdüşümünden başka bir şey değildir.

### 2. Karar
`time_block` tablosu ve modülü tamamen kaldırılır.
Bir "Zaman Bloğu", `scheduled_at` ve `duration_min` alanları dolu olan herhangi bir `Item`'ın Bugün veya Hafta ekranındaki **görsel sunumudur (view)**. Bir görevi takvimdeki boşluğa sürüklemek, o kayda başlangıç saati ve süre atamaktan ibarettir.

### 3. Alternatifler
- *Alternatif: `time_block` tablosunu koruyup `task_id` yabancı anahtarı eklemek.* Reddedildi; gereksiz tablo karmaşası ve senkronizasyon yükü getirir.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar:** Bir görevi zamana yerleştirmek için 2 ayrı tabloyla uğraşılmaz. Tek bir `PATCH /api/items/:id` (`scheduledAt`, `durationMin`) işlemi yeterlidir.
- **iOS Etkisi:** iOS tarafında bağımsız bir TimeBlock CoreData/SwiftData modeli gereksizleşir.

---

## ADR 3: Google Calendar Entegrasyonu ve FullCalendar'ın Kaldırılması, Basit Takvimin Korunması `[VERİ MODELİ]` `[API]`

> **Revizyon Notu:** Ürün sahibinin "basit bir takvim olsa yeterli" yönlendirmesi doğrultusunda revize edilmiştir. Google Calendar senkronizasyonu ve ayrı `calendar_event` tablosu / `/calendar` FullCalendar modülü kaldırılır; `items` tablosu üzerine inşa edilen basit Hafta (`/week`) ve Ay (`/month`) takvim görünümleri korunur.

### 1. Bağlam
Önceki aşamada ürün sahibinin "takvimle ilgili her şeyi silin" ifadesi tüm takvim arayüzlerinin kaldırılması olarak yorumlanmıştı. Ancak ürün sahibi gereksinimi netleştirmiştir: Dış dünyayla çift yönlü senkronizasyon yapan karmaşık Google Calendar OAuth yapısı ve devasa FullCalendar modülü gereksizdir; ancak kullanıcının randevularını ve teslimlerini ay ve hafta bazında görebileceği **basit bir takvim** sistemde kalmalıdır.
> Varsayım: Ürün sahibinin "basit bir takvim olsa yeterli" yönlendirmesi doğrultusunda, karmaşık Google Calendar OAuth senkronizasyonu ve ayrı calendar_event tablosu kaldırılırken; items tablosu üzerindeki kind: 'event' ve 'task' kayıtlarını gösteren hafif Ay ve Hafta takvim görünümlerinin korunduğu kabul edilmiştir.

### 2. Karar
1. **Google Calendar Senkronizasyonu Kaldırılır:** `apps/api/src/integrations/google-calendar/`, webhook dinleyicileri ve OAuth akışları tamamen kaldırılır. `integration_account` ve `external_link` tablolarının generic şeması gelecekteki olası sağlayıcılar için korunur, yalnızca Google Calendar satırları temizlenir.
2. **Ayrı `calendar_event` Tablosu ve FullCalendar Silinir:** Eski `calendar_event` tablosu, `/calendar` sayfası ve `@fullcalendar/*` paketleri kaldırılır.
3. **Basit Takvim `items` Üzerinde Yaşar:** Randevular ve etkinlikler `Item (kind: 'event', scheduled_at, duration_min)` olarak saklanır. Yeni hafif **Hafta (`/week`)** ve **Ay (`/month`)** ekranları doğrudan `items` modelinden beslenerek kullanıcının basit takvim ihtiyacını karşılar.
4. **Kaçış Yolu (Escape Hatch):** Kaldırma öncesinde mevcut takvim kayıtları ICS formatında dışa aktarılabilir (Export). İleride gerekirse salt-okunur yerel ICS import eklenebilir.

### 3. Alternatifler
- *Alternatif A: Google Calendar çift yönlü senkronizasyonunu korumak.* Reddedildi; dış takvim çatışmaları, token yenileme ve webhook bakımı kişisel planlama akışını sürekli bozar ve ciddi bakım yükü getirir.
- *Alternatif B: Takvim arayüzünü tamamen kaldırıp yalnızca Bugün ekranına odaklanmak.* Reddedildi; ürün sahibi ay ve hafta ufkunu görebileceği basit bir takvimin şart olduğunu açıkça belirtmiştir.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Sonuç/Kayıp & Trade-off:** Dış iş toplantıları artık otomatik içeri çekilmeyecektir; harici toplantılar hızlı ekleme (`capture` / `⌘K`) ile manuel girilmelidir. Kaldırma öncesi ICS dışa aktarımı yapılmalıdır.
- **Kazanım:** `@fullcalendar` paketi (~150KB bundle) ve karmaşık senkronizasyon mantığı silinir. Tüm randevular ve görevler `items` altında tekilleşir.
- **iOS Etkisi:** iOS uygulamasında harici Google Calendar OAuth kodlarıyla uğraşılmaz; cihazın yerel takvimine `EventKit` üzerinden bağlanmak çok daha kolay ve güvenlidir.

---

## ADR 4: Hatırlatıcıların `Item` Modeline Göç Edilmesi `[VERİ MODELİ]` `[API]`

### 1. Bağlam
`reminder` tablosu ve `/reminders` sayfası Apple Reminders benzeri bir yapı sunmaktadır ancak görevlerle hiçbir bağı yoktur.

### 2. Karar
- `reminder` ve `reminder_list` tabloları kaldırılır.
- Her hatırlatıcı bir `Item (kind: 'task')` olarak saklanır.
- Bildirim saati `notify_minutes_before`, teslim saati `due_at` alanında tutulur.
- Listeler `payload.list` veya `context` alanı ile etiketlenir (`#market`, `#ev`).

### 3. Alternatifler
- *Alternatif: `reminder` tablosunu bağımsız tutup sadece API seviyesinde birleştirmek.* Reddedildi; çifte veri modeli sorununu sürdürür.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar:** Bir hatırlatıcı teslim tarihi geldiğinde otomatik olarak Bugün ekranındaki yapılacaklar listesinde görünür.
- **iOS Etkisi:** iOS'ta doğrudan Apple Reminders benzeri listeler tek bir `Item` sorgusu üzerinden filtrelenebilir.

---

## ADR 5: Proje Görevlerinin `Item` Modeline Göçü ve Erişim Kontrolü `[VERİ MODELİ]` `[API]`

### 1. Bağlam
Projeler işbirliğini (`project_member`) destekler. Mevcut `task` tablosu `project_id` taşır. Çok kiracılıkta PostgreSQL RLS yoktur; kontrol `ProjectAccessService` ile yapılır.

### 2. Karar
- `task` tablosu `items` tablosuna aktarılır.
- Kişisel görevler `projectId = null`, projeye bağlı görevler ise `projectId = '...'` olarak saklanır.
- **Erişim Kontrolü:** `ItemService`, eğer bir item'ın `projectId` alanı doluysa, okuma ve yazma işlemlerinde `ProjectAccessService.requireAccess(userId, projectId, minRole)` fonksiyonunu çağırır. RLS kullanılmaz; uygulama seviyesinde sıkı yetkilendirme korunur.

### 3. Alternatifler
- *Alternatif: Proje görevlerini ayrı bir tabloda tutmaya devam etmek.* Reddedildi; kullanıcının hem kişisel hem proje görevlerini tek bir günde planlamasını imkansız kılar.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Kullanıcı bugün yapacağı işler arasına hem kişisel işini ("market alışverişi") hem de ekip projesindeki işini ("API endpoint yaz") yan yana ekleyebilir. Trade-off olarak, tek bir `items` tablosunda hem paylaşılan hem kişisel görevler barındığı için servis katmanında her sorgu için koşullu yetkilendirme yürütülür.
- **Göç Riski:** Mevcut `task` tablosundaki görevlerin `project_id`, `assignee_id` ve durum bilgileriyle eksiksiz olarak `items` tablosuna aktarılması gereklidir.
- **Erişim Kontrolü Etkisi:** `projectId !== null` olan her öğe için `ProjectAccessService.requireAccess` zorunlu tutulur; böylece proje üyesi olmayan kullanıcıların görevleri görmesi kesin olarak engellenir.
- **iOS Etkisi:** iOS uygulamasında hem kişisel hem paylaşılan görevler tek bir `Item` modeliyle temsil edilir; ayrı bir proje görevi modeli yazılmasına gerek kalmaz.

---

## ADR 6: Claude MCP Yazımlarının `change_set` İle Kaydı ve Geri Alma `[VERİ MODELİ]` `[API]`

### 1. Bağlam
Claude'un MCP üzerinden yaptığı planlama yazımları doğrudan veritabanını değiştirmektedir. Kullanıcı onay adımlarıyla uğraşmak istememekte, ancak hatalı bir planlamada her şeyi tek tıkla geri alabilmek istemektedir.

### 2. Karar
Veritabanına `change_set` ve `change_entry` tabloları eklenir:
- `change_set`: `id`, `owner_id`, `created_at`, `reason`, `source: 'mcp'`, `undone_at`.
- `change_entry`: `id`, `change_set_id`, `item_id`, `action: 'create'|'update'|'delete'`, `before_state: jsonb`, `after_state: jsonb`.
- Claude'un toplu planlama aracı (`apply_plan`) tüm işlemleri tek bir transaction içinde icra eder ve bir `change_set` üretir.
- Arayüzde tek tıkla çağrılabilen `POST /api/mcp/undo/:changeSetId` endpoint'i `before_state` kayıtlarını geri yükler.

### 3. Alternatifler
- *Alternatif: Taslak (Draft/Approval) modeli kurmak.* Reddedildi; ürün sahibi doğrudan canlı veriye yazılmasını ve onay pencereleriyle vakit kaybedilmemesini talep etmiştir.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Sıfır sürtünmeli planlama (onay modalı beklemeden canlıya yazma) ve %100 geri dönülebilirlik sağlanır. Trade-off olarak veritabanında her toplu planlama için ek `change_set` ve `change_entry` satırları birikir; belirli bir süre sonra eski oturumlar için arşivleme/temizleme gerekebilir.
- **Göç Riski:** Yeni `change_set` ve `change_entry` tabloları bağımsızdır; mevcut tablolara şema riski taşımaz.
- **Erişim Kontrolü Etkisi:** `change_set` kayıtları kullanıcı bazlı (`ownerId`) izole edilir; bir kullanıcının diğer kullanıcının planlama oturumunu geri alması engellenir.
- **iOS Etkisi:** Mobilde bildirim geldiğinde kilit ekranından veya uygulama içindeki bildirim şeridinden tek dokunuşla "Planı Geri Al" işlemi tetiklenebilir.

---

## ADR 7: MCP Yönlendirici (Router) Modeli ve Sadeleştirilmiş Araç Sözleşmesi `[API]`

### 1. Bağlam
Mevcut durumda 11 dosyada 79 araç vardır (`01-audit.md` 3.4). Çoğu araç mikro düzeyde parçalıdır. `plan_week` salt okunurdur ve yalnızca `items` okur. Toplu yazma, geri alma ve bütüncül yaşam bağlamı sorgulama araçları yoktur. Ürün sahibi Claude'u tüm hayatını organize eden akıllı bir asistan olarak konumlandırmak istemektedir ("bunu Husrevity'ye ekle", "bu haftayı planla", "şu hedefi aya böl").

### 2. Karar
1. **Claude Yönlendiricidir (Router):** Claude bir veritabanı operatörü değil, gelen serbest metni anlayan ve uygun varlığı (görev, randevu, not, hatırlatıcı, hedef) oluşturan bir yaşam yönlendiricisidir.
2. **Çekirdek Fiil Seti (~20 Araç):**
   - `capture`: Serbest metin alır (`text: string`). Claude niyetin türünü (görev, etkinlik, not, hedef, hatırlatıcı) belirler, kaydeder ve kullanıcıya ne yaptığını açıklar.
   - `get_life_context`: Bugünün ajandasını, haftalık yükü, aktif hedefleri, açık projeleri ve geciken işleri tek çağrıda toplu bağlam olarak döner.
   - `plan` / `apply_plan`: Tek transaction içinde atomik toplu yazma yapar, `change_set` üretir.
   - `find`: Başlık, içerik, bağlam veya tarihe göre birleşik arama yapar.
   - `update`: Varlık durumunu, saatini veya içeriğini günceller.
   - `undo_change_set`: Yapılan değişiklik kümesini tek hamlede geri alır.
   - Çekirdek veri araçları (`list_items`, `complete_item`, `list_notes`, `save_note`, `list_projects`, `get_sport_program`, `log_workout`, `list_learning`, `review_learning_item`, `get_evkat_template` vb.) ile toplam araç sayısı ~20 seviyesinde tutulur.
3. **Dört Hazır MCP İstemi (Prompts):** `plan_day`, `plan_week`, `review_month`, `set_goal`.
4. **PAT Yetkileri (Scopes):** Tek kaynak olarak `PatScope` tipi korunur. `zod/v3` import tutarsızlığı giderilir. Kasa (Vault) kesinlikle MCP dışında tutulur (bkz. ADR 13).

### 3. Alternatifler
- *Alternatif A: 79 aracı koruyup üzerine yeni araçlar eklemek.* Reddedildi; Claude'un bağlam penceresini (context window) şişirir, araç seçme isabetini düşürür ve API maliyetini artırır.
- *Alternatif B: Yalnızca tek bir monolithic `execute_sql` veya genel API aracı vermek.* Reddedildi; güvenlik açıkları yaratır, erişim kontrolünü (`ownerId`) baypas eder ve şema güvenliğini yok eder.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Claude'un bağlam penceresi temizlenir; `get_life_context` ve `capture` ile tek çağrıda eylem kabiliyeti sağlanır; `apply_plan` ağ trafiğini ve işlem gecikmesini düşürür. Trade-off olarak harici eski istemciler varsa yeni fiil setine güncellenmelidir.
- **Göç Riski:** Yeni araçlar NestJS `McpModule` içinde tanımlanır; eski parçalı araçlar kademeli olarak yeni birleşik servislere yönlendirilir.
- **Erişim Kontrolü Etkisi:** `ownerId` izolasyonu servis seviyesinde tüm araçlarda zorunlu tutulur. PAT kapsamları (`PatScope`) `@RequireScopes` ile denetlenir.
- **iOS Etkisi:** Gelecekte iOS Siri Shortcuts veya yerel ajanlar doğrudan bu sadeleştirilmiş araç sözleşmesini veya REST karşılıklarını tüketebilir.

---

## ADR 8: Arayüz Primitifleri (Radix, cmdk, dnd-kit) ve FullCalendar Temizliği

### 1. Bağlam
Web tarafında 24 dosyada (`src/{views,components,layout}`) elle yazılmış odaksız (focus trap olmayan) modal ve overlay pencereler vardır (`F-13`). İki çakışan `⌘K` kısayolu ve ölü bir arama inputu bulunmaktadır (`F-06`, `F-07`). Mevcut sürükle-bırak (`react-dnd` HTML5) mobilde çalışmaz.
> Varsayım: dnd-kit kütüphanesinin TouchSensor ve PointerSensor yapılandırmalarıyla mobil dokunmatik ekranlarda pürüzsüz sürükle-bırak desteği sunacağı varsayılmıştır.

### 2. Karar
1. **Radix Primitives (shadcn yaklaşımı):** Dialog, DropdownMenu, Popover, Tooltip bileşenleri Radix UI primitifleri kopyalanarak projeye dahil edilir (copy-and-own). Focus trapping ve klavye erişilebilirliği garanti altına alınır.
2. **`cmdk` Kütüphanesi:** Çakışan arama kutuları ve kısayollar kaldırılarak tek bir global Komut Paleti (`⌘K`) kurulur.
3. **`dnd-kit` Geçişi:** `react-dnd` yerine hem masaüstü fareyi hem mobil dokunmatiği (touch events) destekleyen modern `dnd-kit` kullanılır.
4. **FullCalendar Kaldırılır:** Büyük ve hantal `@fullcalendar/*` bağımlılıkları projeden silinir.

### 3. Alternatifler
- *Alternatif: Mevcut el yapımı modal ve overlay'leri koruyup tek tek düzeltmek.* Reddedildi; 24 dosyada ayrı ayrı focus trap ve ARIA standartlarını sürdürmek maliyetlidir.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Modal pencerelerde focus trapping, ESC tuşu yönetimi ve ARIA erişilebilirlik standartları garantiye alınır; FullCalendar'ın silinmesiyle web bundle boyutu ~150KB hafifler. Trade-off olarak Radix primitifleri kopyalanıp (copy-and-own) Tailwind sınıflarıyla baştan stillendirilmelidir.
- **Göç Riski:** 24 farklı dosyadaki el yapımı modal pencerelerin kademeli olarak Radix Dialog'a taşınması gereklidir; geçiş esnasında görsel gerileme (visual regression) riskine karşı dikkatli test yapılmalıdır.
- **iOS Etkisi:** Bu karar salt web arayüzü primitiflerini ilgilendirir, yerel iOS kodunu doğrudan etkilemez; ancak web mobil tarayıcı deneyimini yerel dokunmatik akıcılığına yaklaştırır.

---

## ADR 9: Tasarım Belirteçleri (Design Tokens) ve Tek Renk Katmanı

### 1. Bağlam
`globals.css` içinde 146 CSS özel değişkeni bulunmakta; 1664 `husrev-`, 973 `gray-[0-9]` ve 106 `brand-[0-9]` kullanımı mevcuttur (`01-audit.md` F-12). Marka renkleri ile eski şablon renkleri birbirine karışmış durumdadır.

### 2. Karar
1. Tüm renk sistemi anlamsal (semantic) belirteçlere indirgenir:
   - `--surface-base`, `--surface-raised`, `--surface-overlay`
   - `--text-primary`, `--text-secondary`, `--text-muted`
   - `--accent-primary` (Ember/Amber), `--accent-subtle`
   - `--border-subtle`, `--border-strong`
2. Şablon artığı `brand-50`, `gray-700` gibi ham sınıflar silinir.
3. Tipografi ölçeği sadeleştirilir: Instrument Serif (başlık aksanı), Outfit (arayüz sans), JetBrains Mono (kod/zaman).
4. Dış bir devasa UI kütüphanesi kurmak yerine mevcut Tailwind 4 CSS-first yapısı korunarak semantik katman temizlenir (continue with streamlined Tailwind).

### 3. Alternatifler
- *Alternatif: MUI veya Ant Design gibi ağır bir kütüphaneye geçmek.* Reddedildi; bundle boyutunu şişirir ve marka kimliğini bozar.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Görsel tutarlılık sağlanır, açık/koyu tema (light/dark mode) geçişleri hatasız çalışır ve eski şablon karmaşası son bulur. Trade-off olarak 1600'den fazla `husrev-` ve 900'den fazla `gray-` sınıfının semantik belirteçlerle tek tek refaktör edilmesi geniş bir geliştirme emeği gerektirir.
- **Göç Riski:** Refaktör sırasında bazı alt görünümlerde stil kırılmaları yaşanabilir; görsel regresyon testleri uygulanmalıdır.
- **iOS Etkisi:** Web için tanımlanan semantik belirteçler (`surface`, `text`, `accent`), SwiftUI `Asset Catalog` içindeki dinamik renk tanımlarıyla birebir eşleşerek platformlar arası tasarım uyumu sağlar.

---

## ADR 10: Kullanıcı Bazlı Zaman Dilimi ve Planlama Tercihleri `[VERİ MODELİ]` `[API]`

### 1. Bağlam
Zaman dilimi kod içinde `Europe/Istanbul` olarak sabitlenmiştir (`F-03`). Kullanıcının günlük planlama kapasitesi (kaç saat çalışmak istediği, günün başlangıç ve bitiş saati) veritabanında saklanmamaktadır.

### 2. Karar
`user` tablosuna veya `user_preference` tablosuna şu alanlar eklenir:
- `timezone`: string (varsayılan: `'Europe/Istanbul'`).
- `work_start_minute`: integer (varsayılan: `540` -> 09:00).
- `work_end_minute`: integer (varsayılan: `1080` -> 18:00).
- `daily_capacity_minutes`: integer (varsayılan: `420` -> 7 saat).
`TodayService` ve MCP planlama servisleri bu kullanıcı tercihlerini baz alarak gün başlangıcını ve aşırı yük (overload) uyarılarını hesaplar.
> Varsayım: Kullanıcının varsayılan saat diliminin Europe/Istanbul, mesai saatlerinin 09:00 - 18:00 (540 - 1080 dk) ve günlük odak kapasitesinin 7 saat (420 dakika) olduğu varsayılmıştır; bu değerler kullanıcı tercihlerine dair varsayımlardır.

### 3. Alternatifler
- *Alternatif: Tarayıcının zaman dilimine dinamik güvenmek.* Reddedildi; MCP arka planda kullanıcı tarayıcıda değilken planlama yaparken istemci zaman dilimini bilemez.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Kullanıcı seyahat ettiğinde veya farklı zaman dilimlerinde çalıştığında ajanda kaymaları önlenir; Claude kullanıcının çalışma kapasitesine (7 saat / 420 dk) ve mesai saatlerine saygı duyarak gerçekçi planlar oluşturur. Trade-off olarak kullanıcı tercihleri için yeni veritabanı alanları eklenmeli ve her planlama isteğinde bu tercihler sorgulanmalıdır.
- **Göç Riski:** Mevcut kayıtlı kullanıcılar için varsayılan değerlerle (`Europe/Istanbul`, `540`, `1080`, `420`) geriye dönük güvenli şema göçü (migration) yapılmalıdır.
- **Erişim Kontrolü Etkisi:** Kullanıcı tercihleri yalnızca hesap sahibi (`ownerId`) tarafından okunabilir ve güncellenebilir olmalıdır; yetkisiz erişim kontrolü servis katmanında sıkıca denetlenir.
- **iOS Etkisi:** iOS istemcisi cihazın yerel saat dilimini (`TimeZone.current.identifier`) tespit ederek tek bir API çağrısıyla sunucu tercihlerini senkronize edebilir.

---

## ADR 11: iOS Hazırlığı: `/sync` Sözleşmesi ve SwiftUI Uyumu `[API]`

### 1. Bağlam
Ürün sahibi platformun ileride yerel bir iOS uygulamasına dönüştürülmesini hedeflemektedir.
> Varsayım: Gelecekte geliştirilecek yerel iOS uygulamasının SwiftUI ile yazılacağı, çevrimdışı senkronizasyon için SwiftData/CoreData yerel deposu kullanacağı varsayılmıştır.

### 2. Karar
1. **Senkronizasyon Uç Noktası (`/api/sync`):** Mevcut `GET /api/sync?since=ISO_TIMESTAMP` uç noktası (`apps/api/src/sync/sync.controller.ts`, `SyncService.syncSince` ile hali hazırda `items`, `notes`, `projects` deltalarını ve silinen kayıt kimliklerini `tombstones` olarak döner) genişletilir. Şu an eksik olan `change_set` kayıtları ve diğer modül deltaları da bu sözleşmeye dahil edilir.
2. **SwiftUI Renk Eşlemesi:** Web'deki semantik CSS token'ları (`surface`, `text`, `accent`), SwiftUI `Asset Catalog` içindeki dinamik renklerle birebir eşleşir.
3. **WidgetKit Sözleşmesi:** `GET /api/today` yanıtı, iOS Widget'larının anında tüketebileceği kompakt JSON biçimini garanti eder.
4. **Yetkilendirme:** Tek kaynak: mevcut `PatScope` tipi (`personal-access-token.entity.ts`), `pat-dtos.ts` ve web servisi bundan türetilir; iOS için üretilecek PAT'ler veya JWT oturumu aynı erişim denetiminden geçer.

### 3. Alternatifler
- *Alternatif A: Her modül için ayrı delta uç noktaları (`/api/items/sync`, `/api/notes/sync`) tanımlamak.* Reddedildi; istemcinin birden çok ağ isteği atmasına, pil ve veri tüketiminin katlanmasına yol açar.
- *Alternatif B: WebSocket tabanlı çift yönlü canlı veri akışı kurmak.* Reddedildi; kişisel bir üretkenlik aracı için aşırı karmaşık altyapı ve bağlantı yönetimi maliyeti doğurur; REST tabanlı timestamp cursor deltası (`since=`) fazlasıyla yeterlidir.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Tek bir hafif HTTP GET isteğiyle çevrimdışı önbellek güncellenir; istemci ile sunucu arasındaki ağ trafiği asgariye iner. Trade-off olarak `SyncService`'in silinen kayıtları (`tombstones`) ve `change_set` kayıtlarını performanslı biçimde indeksleyip dönmesi gerekir.
- **Göç Riski:** Mevcut `/api/sync` zaten çalıştığı için yeni alanlar geriye dönük uyumluluğu bozmadan eklenir; migration riski düşüktür.
- **Erişim Kontrolü Etkisi:** `SyncService`, kullanıcı bazlı veri izolasyonunu (`ownerId`) ve projeler için `ProjectAccessService` kontrolünü titizlikle uygulamalıdır; başka kullanıcılara ait deltalar asla sızdırılmamalıdır.
- **iOS Etkisi:** iOS uygulamasının çevrimdışı (offline-first) çalışması mümkün hale gelir; cihaz çevrimdışıyken SwiftData üzerinde çalışıp ağa bağlandığında tek bir delta senkronizasyonu ile güncellenir.

---

## ADR 12: Hafif Hedef Modeli (Light Goals) `[VERİ MODELİ]` `[API]`

### 1. Bağlam
Mevcut kod tabanında hedefleri (Goal) temsil eden bir veri modeli yoktur. Kodda "goal" ifadesinin geçtiği tek yer `SportProfile` entity'si içindeki serbest metin `goals` sütunudur (`apps/api/src/sport/entities/sport-profile.entity.ts#L25`). Kullanıcının tüm hayatını Husrevity üzerinden organize edebilmesi için yıl, çeyrek ve ay bazında yaşam niyetlerini yapılandıracağı, ancak karmaşık OKR metrikleri ve manuel sayı girişleriyle boğulmayacağı hafif bir hedefleme modeline ihtiyaç vardır.

### 2. Karar
1. **Hafif `goal` Tablosu Tanımlanır:**
   - `id`: bigint (BaseEntity standardı)
   - `owner_id`: bigint (Servis katmanı veri izolasyonu)
   - `title`: varchar(255) (Hedef başlığı)
   - `horizon`: enum (`'year'`, `'quarter'`, `'month'`)
   - `period_start`: date (Dönem başlangıcı, örn: `2026-01-01`)
   - `period_end`: date (Dönem bitişi, örn: `2026-12-31`)
   - `parent_goal_id`: bigint, nullable (Üst hedefe self-reference: Yıl → Çeyrek → Ay)
   - `status`: enum (`'active'`, `'done'`, `'dropped'`)
   - `deleted_at`: timestamptz, nullable (Mevcut BaseEntity standardında soft-delete)
2. **Nullable `goal_id` Alanları Eklenir:**
   - `items` tablosuna `goal_id` (bigint, nullable) eklenir.
   - `project` tablosuna `goal_id` (bigint, nullable) eklenir.
3. **Otomatik Hesaplanmış İlerleme (Computed Progress):**
   - Hedefin ilerlemesi, hedefe doğrudan veya hedefe bağlı projeler üzerinden bağlanan `Item` kayıtlarının tamamlanma oranından (`tamamlanan_item / toplam_item * 100`) çalışma zamanında hesaplanır.
   - **Kesin Karar:** Elle girilen sayısal hedef değerleri (KPI target/current), birimler veya OKR anahtar sonuçları (Key Results) modeli **kullanılmaz.**
4. **Erişim Kontrolü ve Paylaşılan Projeler:**
   - Veritabanında PostgreSQL RLS yoktur; tüm veri izolasyonu `GoalService` katmanında `owner_id` filtresiyle sağlanır.
   - Paylaşılan bir projeye (`Project`) bir hedef bağlandığında: Hedef projenin sahibine (`owner_id`) aittir. Proje üyeleri hedefin başlığını ve tamamlanma yüzdesini görebilir ancak hedefin kendisini düzenleyemez veya silemez.

### 3. Alternatifler
- *Alternatif A: Ölçülebilir Hedefler ve OKR Modeli (Measurable Targets / Key Results).* Reddedildi; hedef değer, mevcut değer, birim ve manuel güncelleme mantığı zihinsel sürtünme yaratır; kullanıcıyı sürekli veri girmeye zorlar. Husrevity'nin birinci kriteri sadeliktir.
- *Alternatif B: Hedefleri Yalnızca Etiket Olarak Yönetmek (Goals as Tags Only).* Reddedildi; hedefleri salt `#hedef-b1` gibi etiketlerle yönetmek, hiyerarşik zaman ufkunu (yıl → çeyrek → ay) ve bağlı işlerden otomatik ilerleme hesaplanmasını imkansız kılar.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Sıfır veri bakım yükü sağlanır; kullanıcı sadece işlerini tamamlar, hedefin ilerleme çubuğu otomatik dolar. Trade-off olarak, sayısal metrik takibi (örn. "10.000 TL biriktir" hedefinde ara tutar takibi) desteklenmez; bu tür hedefler alt görevler olarak parçalanmalıdır.
- **Göç Riski:** Yeni `goal` tablosu ve `items`/`project` üzerindeki nullable `goal_id` sütunları tamamen katkısaldır (additive). Geriye dönük backfill gerektirmez, risksizdir.
- **Erişim Kontrolü Etkisi:** `GoalService` tüm sorgularda `ownerId` filtresini koşar. Proje üyeleri yalnızca projeye bağlı hedefin özet DTO'sunu okuyabilir.
- **iOS Etkisi:** SwiftUI hiyerarşik ağaç ve akordeon görünümleri için hafif ve temiz bir `Goal` SwiftData modeli sunar.

---

## ADR 13: Kasa (Vault) MCP Dışında Kalır `[API]`

### 1. Bağlam
Husrevity kod tabanında yer alan `apps/api/src/mcp/tools/mcp-tools-safety.spec.ts#L72-L94` güvenlik testi ("no registered tool or source file under mcp/ contains the word vault") kasanın MCP araçlarından ayrı tutulduğunu doğrulamaktadır. Claude üzerinden doğal dille yaşam asistanlığı yapılırken, kullanıcının parolalarını, API anahtarlarını ve sunucu şifrelerini barındıran kasanın LLM bağlamına (context window) sızması kabul edilemez bir güvenlik riskidir.

### 2. Karar
1. **Katı Mimari Değişmez (Documented Invariant):**
   - Kasa kesinlikle ve tamamen MCP kapsamı dışında kalır.
   - `mcp-tools-safety.spec.ts` testi kalıcı bir mimari invariant olarak korunur: `apps/api/src/mcp/` altında hiçbir dosya veya araç adı `vault` kelimesini içeremez.
   - Claude'a şifreler, parolalar, API anahtarları veya kasa üst verileri asla açılmaz.
2. **Kasa Soruları Arayüzde Yanıtlanır (UI-Only):**
   - Kullanıcı Claude'a *"şifremi ver"* veya *"API anahtarım neydi?"* dediğinde Claude bu veriye erişimi olmadığını, kasanın yalnızca web ve mobil arayüz (`/vault`) üzerinden parola ile açılabileceğini bildirir.
3. **Giriş Koruması (Credential Guard Proposal):**
   - Hızlı yakalama aracı (`capture`), kendisine iletilen metinde parola, şifre, gizli anahtar veya API token sezgisi algılarsa (örn. "şifre:", "parola:", "password:", bilinen API key kalıpları), metni item veya not olarak kaydetmeyi reddeder ve kullanıcıyı doğrudan arayüzdeki `/vault` ekranına yönlendirir.
   > Varsayım: capture aracının şifre/parola/anahtar sezgisel korumasının (credential guard) anahtar kelime eşleşmesi ve desen taraması üzerinden çalışacağı ve kullanıcıyı UI'a yönlendireceği varsayılmıştır [çıkarım].

### 3. Alternatifler
- *Alternatif A: Yalnızca Üst Veri Erişimi (Metadata-Only Access).* Kasa kayıtlarının başlıklarını ve kategorilerini göstermek, parolayı maskelemek. Reddedildi; üst veri bile bilgi sızıntısı yaratabilir; prompt injection riski taşır.
- *Alternatif B: Tam MCP Erişimi (Read/Write).* Reddedildi; prompt injection ve LLM güvenlik açıkları sebebiyle kritik parolaların açığa çıkması riski kabul edilemez.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** Sıfır sızıntı riski, tam veri mahremiyeti ve güvenlik. Trade-off olarak kullanıcı Claude üzerinden şifre sorgulayamaz; şifreye ihtiyaç duyduğunda her zaman doğrudan arayüze (`/vault`) gitmelidir.
- **Göç Riski:** Sıfır. Mevcut test zaten bunu doğrulamaktadır.
- **Erişim Kontrolü Etkisi:** `VaultModule` API seviyesinde yalnızca JWT authenticated web oturumu ile çalışır; PAT veya MCP yetkileri (`PatScope`) kasayı kapsamaz.
- **iOS Etkisi:** iOS uygulamasında Kasa, iOS Keychain ve FaceID biyometrik kilidi arkasında izole bir yerel modül olarak inşa edilir.

---

## ADR 14: Not Bağlantıları (Generic `note_link` Mimarisi) `[VERİ MODELİ]`

### 1. Bağlam
Mevcut `Note` entity'si (`apps/api/src/note/note.entity.ts`), yalnızca etiketlerle (`NoteTag`) çoktan-çoğa ilişkiye sahiptir; projelere, görevlere (`Item`) veya hedeflere bağlanamaz. Kullanıcının bir toplantı etkinliğine, bir projeye veya bir hedefe zengin notlar iliştirebilmesi için notların sistemdeki diğer varlıklarla ilişkilendirilebilmesi gerekmektedir.

### 2. Karar
1. **Generic Bağlantı Tablosu (`note_link`) Eklenir:**
   - `id`: bigint
   - `note_id`: bigint (Bağlanan not)
   - `target_type`: varchar(32) (`'item'`, `'project'`, `'goal'`)
   - `target_id`: bigint (Bağlanılan varlığın ID'si)
   - `created_at`: timestamptz
2. **Bileşik İndeksler (Composite Indexes):**
   - `(target_type, target_id)` indeksi (Bir göreve veya projeye bağlı tüm notları anında getirmek için).
   - `(note_id)` indeksi (Bir notun nerelere bağlı olduğunu getirmek için).
3. **Erişim Kontrolü:**
   - PostgreSQL RLS yoktur. Not erişimi `NoteService` içinde her zaman `note.owner_id` üzerinden denetlenir. Kullanıcı yalnızca kendi sahip olduğu veya üyesi olduğu hedeflere/projelere not bağlayabilir.

### 3. Alternatifler
- *Alternatif: `note` Tablosuna Her Varlık İçin Ayrı Kolonlar Eklemek (`project_id`, `item_id`, `goal_id`).* Reddedildi; `note` tablosunu seyrekleştirir (sparse columns, çoğu kayıt NULL kalır); ileride yeni bir varlık (örn. `sport_session` veya `learning_item`) bağlanmak istendiğinde `note` şemasını tekrar migrate etmek gerekir.

### 4. Sonuçlar, Trade-off ve iOS Etkisi
- **Artılar & Trade-off:** `Note` tablosu temiz kalır; yeni bağlanabilir varlıklar sıfır şema değişikliğiyle sisteme entegre olur. Trade-off olarak, veritabanı seviyesinde katı Foreign Key cascade constraint kurulamadığından, hedef veya item silindiğinde yetim `note_link` kayıtları servis katmanında veya periyodik bir temizleme işinde silinmelidir.
- **Göç Riski:** Katkısal (additive) bağımsız yeni bir tablodur; mevcut `note` ve `note_tag_assignment` tablolarına hiçbir geriye dönük risk taşımaz.
- **Erişim Kontrolü Etkisi:** Not listeleme ve bağlama işlemlerinde kullanıcının hem nota hem de hedef nesneye erişim yetkisi servis katmanında doğrulanır.
- **iOS Etkisi:** iOS uygulamasında bir görev veya proje detay ekranı açıldığında tek bir hafif SQL sorgusuyla ilişkili notlar listelenebilir.
