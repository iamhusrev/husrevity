# 05-roadmap.md: Kademeli Geçiş Yol Haritası (Implementation Roadmap)

> **Belge Amacı:** Husrevity halihazırda üretimde ve aktif kullanımda olan bir sistem olduğu için, geçiş sürecinin sistemi hiçbir aşamada çalışmaz bırakmayacak şekilde, her biri bağımsız olarak dağıtılabilir ve geri alınabilir 4 faza bölünmüş yol haritasını belgeler.
>
> **Not:** Kardeş `shared-infra` dizini mevcut olmadığı ve 5432 portunda dinleyen PostgreSQL servisi bulunmadığı için canlı uygulama kontrolü atlanmış; tüm adımlar ve tıklama sayıları doğrudan bileşen kaynak kodları taranarak türetilmiş ve **[koddan çıkarım]** olarak işaretlenmiştir.

---

## Genel Fazlandırma, Sıra Bağımlılıkları ve Güvenlik İlkeleri

> Varsayım: Faz süreleri (Faz 0 için 1-2 gün, Faz 1 için 1-2 hafta, Faz 2 için 2-3 hafta, Faz 3 için 3-4 hafta) tek bir kıdemli geliştiricinin projeye tam zamanlı odaklandığı senaryoya dayalı bir efor tahminidir.

1. **Sıfır Kesinti İlkesi:** Hiçbir faz ara durumda sistemi kilitli veya veriye erişilemez bırakmaz. Eski ve yeni yapılar Faz 1 ve Faz 2 boyunca adaptörler üzerinden birlikte yaşar.
2. **Sıra Bağımlılığı (Order Dependencies):** Hedef modeli (Goals) ve dinamik ilerleme hesaplaması (`done / total`), görev ve etkinliklerin tekilleştiği birleşik `items` modeline dayanır. Bu sebeple **Faz 2 (Hedefler & Yaşam Ufukları), Faz 1 (Birleşik Item Modeli) tamamlanmadan devreye alınamaz.**
3. **Ayrı Onaylanan Veri Silme İlkesi:** Eski tabloların düşürülmesi (`DROP TABLE`) veya dış entegrasyonların silinmesi asla bir kod göçünün içine gizlenmez; her zaman veriler dışa aktarıldıktan sonra, ayrı bir adımda ve kullanıcı onayıyla icra edilir.
4. **Geri Alınabilirlik (Rollback Path):** Her fazın bağımsız ve belirgin bir geri alma stratejisi mevcuttur.

```
+-----------------------------------------------------------------------------------------+
| FAZ 0: HIZLI KAZANIMLAR (Quick Wins) · Süre: 1-2 Gün                                    |
| Arayüz pürüzleri, mobil hızlı yakalama (+ FAB), tıklanabilir pano satırları (Sıfır DB) |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
| FAZ 1: TEK GERÇEKLİK KAYNAĞI & İLK CLAUDE KAZANIMI · Süre: 1-2 Hafta                    |
| items adaptörleri, Today v2 (dnd-kit), change_set/undo; capture & get_life_context MCP  |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
| FAZ 2: YAŞAM UFUKLARI & BASİT TAKVİM DÖNÜŞÜMÜ · Süre: 2-3 Hafta                         |
| Hafta, Ay (Basit Takvim), Gelen Kutusu; Hedefler (Yıl), note_link; FullCalendar değişimi|
| ve ICS sonrası onaylı GCal kaldırımı; ~20 MCP yönlendirici aracı                        |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
| FAZ 3: BÜYÜK YENİDEN YAPILANMA & NİHAİ TEMİZLİK · Süre: 3-4 Hafta                       |
| Proje görevleri & hatırlatıcıların items'a tam göçü, Radix primitifleri, eski tablo silimi |
+-----------------------------------------------------------------------------------------+
```

---

## Faz 0: Hızlı Kazanımlar (Quick Wins - 1-2 Gün)

Uygulamanın veri modeline dokunmadan, mevcut kullanıcı deneyimini baltalayan açık hataları ve ölü kodları temizleme aşamasıdır.

### 1. Kapsam (Scope)
- **Mobil Hızlı Ekleme / Yakalama Girişi:** `MobileBottomNav.tsx` içine veya mobil başlığa tek dokunuşla çalışan görünür bir Hızlı Ekleme butonu (`+` FAB) eklenir (`01-audit.md` F-11).
- **Tıklanabilir ve Tamamlanabilir Dashboard Satırları:** `DashboardPage.tsx` içindeki "Bugün teslim" listesinde görevlerin başına aktif checkbox/tamamlama butonu eklenir; tıklandığında görevi anında tamamlar (`F-08`).
- **Çakışan `⌘K` Düzeltmesi:** `AppHeader.tsx` içindeki `⌘K` dinleyicisi kaldırılır. `layout.tsx` içindeki tek dinleyici korunur ve yalnızca `QuickAddDialog` açar (`F-06`).
- **Ölü Arama Kutusunun Kaldırılması:** `AppHeader.tsx` içindeki işlevsiz `<input ref={inputRef}>` arama çubuğu kaldırılır; yerine temiz bir logo/başlık yerleşimi yapılır (`F-07`).
- **Dil Kalıcılığı ve Eksik Anahtarlar:** `configs/i18n.ts` içine `localStorage` tabanlı dil okuma/yazma desteği eklenir. Kodda kullanılan ancak JSON'larda eksik olan ~41 anahtar `tr.json` ve `en.json` dosyalarına eklenir (`F-15`, 382 satır içi fallback mevcuttur).
- **Kenar Çubuğu Aktif Durum Düzeltmesi:** `AppSidebar.tsx` içindeki `path === pathname` katı eşleşmesi, `pathname.startsWith(path)` (prefix-based) ile değiştirilir; böylece alt sayfalarda (`/projects/12`) aktif menü vurgusu kaybolmaz (`F-10`).
- **Ölü Rotalar ve Bileşenlerin Temizliği:**
  - Silinecek Rotalar: `apps/web/src/app/<ad>/page.tsx` altındaki açık/genel sayfalar (`/coming-soon`, `/maintenance`, `/success`, `/error-404`, `/error-500`, `/error-503`).
  - Silinecek Klasör: `apps/web/src/views/misc/*`.
  - Silinecek Bileşenler: `StatCard.tsx`, `RoutineNowCard.tsx`, `ModalPortal.tsx`.
- **Web Geliştirici Portu:** `apps/web/package.json` içindeki `dev` script'i `next dev -p 3090` olarak güncellenir (`F-18`).
- **MCP `zod` İçe Aktarma Düzeltmesi:** `learning-tools.ts` ve `notification-tools.ts` dosyalarındaki `import { z } from 'zod'` ifadeleri, diğer modüllerdeki gibi `import { z } from 'zod/v3'` olarak düzeltilir (`F-16`).
- **AI Öneri Tetikleme Optimizasyonu:** `TodaySuggestionsCard.tsx` içindeki her mount'ta kontrolsüz mutasyon tetikleme kaldırılır; manuel yenileme veya oturum bazlı önbellek eklenir (`F-09`).

### 2. Neden Bağımsız Dağıtılabilir?
Veritabanı şeması veya API sözleşmesi değişmez. Tamamen ön yüz ve MCP tip düzeltmeleridir. Canlıdaki hiçbir işlev bozulmaz.

### 3. Geri Alma Yolu (Rollback Path)
Git üzerinde ilgili PR/commit geri alınabilir (`git revert`). Sıfır veri riski.

### 4. Risk Seviyesi: Düşük

### 5. iOS Etkisi: Yok

---

## Faz 1: Tek Gerçeklik Kaynağı ve İlk Claude Planlama Kazanımı (1-2 Hafta)

Veri tabanındaki çift başlılığı çözen, Today ekranını sürükle-bırak ile güçlendiren ve Claude'a güvenli geri alma altyapısı kurarak ilk görünür yaşam asistanlığı kazanımını sunan aşamadır.

### 1. Kapsam (Scope)
- **Eski Uç Noktaların Adaptöre Dönüştürülmesi:**
  - `POST/PUT /api/reminders` ve `POST/PUT /api/tasks` endpoint'leri, doğrudan eski tablolara yazmak yerine arkada `ItemService` çağırarak `items` tablosuna yazar.
  - Okuma endpoint'leri geriye dönük uyumluluk için çalışmaya devam eder.
- **Delta Mutabakat Migration'ı:**
  - Faz 1 öncesi eski tablolarda olup `items` tablosuna yansımamış son kayıtları mutabık kılan idempotent bir SQL/TypeORM göç script'i koşulur.
- **Today v2 Arayüzü:**
  - `apps/web/src/views/today/` (veya yenilenen `DashboardPage`): Sol tarafta 24 saatlik dikey zaman ekseni, Evkat şeritleri ve zaman blokları; sağ tarafta bekleyen işler listesi.
  - `dnd-kit` entegrasyonu: Sağdaki listeden sürükleyip sol eksene bırakarak `scheduled_at` ve `duration_min` atama.
- **MCP `change_set` Altyapısı ve Tek Tıkla Geri Alma:**
  - `change_set` ve `change_entry` entity'leri ve migration'ı oluşturulur.
  - `POST /api/mcp/undo/:changeSetId` API uç noktası yazılır.
  - Today ekranının tepesine Claude Etkinlik Şeridi (Activity Strip) eklenir.
- **İlk Görünür Claude Planlama Kazanımı (`capture` & `get_life_context`):**
  - Tekelleşen `items` modeli üzerinde ilk birleşik MCP araçları canlıya alınır:
    - `capture`: Doğal dil serbest metin alır; Claude niyetin türünü (görev, etkinlik, hatırlatıcı) belirleyip `items`'a yazar.
    - `get_life_context`: Bugünün ajandasını ve bekleyen işlerini tek çağrıda döner.
    - `apply_plan`: Atomik plan uygular ve `change_set` döner.
  - Kullanıcı sohbet ederken *"bunu Husrevity'ye ekle"* dediğinde anında canlı Bugün akışına yansır.

### 2. Neden Bağımsız Dağıtılabilir?
Eski sayfalar (`/reminders`, `/projects`) adaptör üzerinden çalıştığı için kullanıcı eski ekranları kullanmaya devam etse bile tüm veriler `items`'a akar ve yeni Today ekranında anında görünür hale gelir.

### 3. Geri Alma Yolu (Rollback Path)
Adaptör katmanı devre dışı bırakılıp eski servis metotlarına dönülebilir. `items` üzerindeki yeni alanlar eski tabloları bozmaz.

### 4. Risk Seviyesi: Orta
- *Risk:* Eski tablolara dışarıdan (Telegram/Slack botları) gelen kayıtların adaptör üzerinden geçtiğinden emin olunmalıdır.

### 5. iOS Etkisi
iOS istemcisi için ilk `Item` prototipi geliştirilmeye başlanabilir.

---

## Faz 2: Yaşam Ufukları, Basit Takvim ve Sadeleştirilmiş MCP (2-3 Hafta)

Yeni Hafta, Ay (Basit Takvim), Gelen Kutusu ve Yıl (Hedefler) ekranlarının devreye girdiği, FullCalendar'ın hafif takvimle yer değiştirdiği ve Google Calendar karmaşasının arındırıldığı aşamadır.

### 1. Kapsam (Scope)
- **Hafta Ekranı (`/week`):**
  - 7 sütunlu haftalık ajanda, saat yükü göstergesi (overload bar), haftalar arası sürükleme ve Haftalık Değerlendirme (Review) paneli devreye alınır.
- **Ay Ekranı (`/month` - Basit Takvim):**
  - Ürün sahibinin netleştirdiği **basit takvim** görünümüdür. Ayrı takvim tablosu YOKTUR; `items` modelindeki randevuları ve teslimleri 30/31 günlük ızgarada gösterir. Günlük yoğunluk noktaları ve gün arası sürükle-bırak erteleme desteklenir.
- **Gelen Kutusu Ekranı (`/inbox`):**
  - Tarihsiz, hedefsiz yakalanmış tüm işlerin toplandığı hızlı ayıklama (Triage) ekranı.
- **Hafif Hedef Modeli ve Yıl Ekranı (`/goals` - ADR 12):**
  - `goal` tablosu (title, horizon: year|quarter|month, period_start, period_end, parent_goal_id, status: active|done|dropped) migration'ı oluşturulur.
  - `items` ve `project` tablolarına nullable `goal_id` eklenir.
  - Yıl → Çeyrek → Ay hiyerarşik hedef ağacı ekranı kurulur; bağlı işlerden dinamik ilerleme çubuğu otomatik hesaplanır (`done / total`).
- **Not Bağlantıları (`note_link` - ADR 14):**
  - Generic `note_link` tablosu (note_id, target_type: item|project|goal, target_id) oluşturulur; notlar projelere ve hedeflere bağlanabilir hale gelir.
- **FullCalendar'ın Değişimi (Replaced, not deleted):**
  - Eski `/calendar` sayfası ve ağır `@fullcalendar/*` paketleri kaldırılır; yerini doğrudan `items` tabanlı hafif **Ay (`/month`) ve Hafta (`/week`)** basit takvim görünümleri alır.
- **Google Calendar Senkronizasyonunun Kaldırılması:**
  - **Adım A (ICS Dışa Aktarma):** Kullanıcının mevcut takvim kayıtlarını ICS formatında indirebileceği servis sunulur.
  - **Adım B (Ayrı Onaylı Silme):** Kullanıcı onayı alındıktan sonra Google Calendar webhook/entegrasyon kodları (`integrations/google-calendar/`) temizlenir (`integration_account` ve `external_link` şemaları gelecekteki olası sağlayıcılar için korunur).
- **MCP v2 Router Araç Seti (~20 Araç - ADR 7):**
  - Dağınık 79 araç yerine ~20 yönlendirici araç setine geçilir (`capture`, `get_life_context`, `apply_plan`, `find`, `update`, `undo_change_set` vb.).
  - Dört hazır prompt (`plan_day`, `plan_week`, `review_month`, `set_goal`) aktif edilir.
  - Kasa (Vault) güvenlik testiyle (`mcp-tools-safety.spec.ts`) kesin olarak MCP dışı tutulur (ADR 13).

### 2. Neden Bağımsız Dağıtılabilir?
Yeni Ay (`/month`) ve Hafta (`/week`) ekranları eski FullCalendar takviminin yerini tamamen alacak güçtedir. Kullanıcı takvimsiz kalmaz; aksine takvim etkinlikleri ve görevleri tek ekranda birleşir. Hedef modeli katkısaldır, mevcut akışı bozmaz.

### 3. Geri Alma Yolu
Takvim verileri ICS olarak dışa aktarılmış olduğundan veri kaybı riski sıfırlanır. Yeni tablolar (`goal`, `note_link`) mevcut yapılara dokunmaz.

### 4. Risk Seviyesi: Orta (Ürün Tercihi Açısından)
- *Risk:* Dış Google Calendar senkronizasyonunun kesilmesi. Kullanıcının dış toplantılarını `capture` veya hızlı ekleme ile girmesi gerekecektir.

### 5. iOS Etkisi
Uygulama `EventKit` hazır hale gelir; karmaşık Google Calendar OAuth kodları iOS'a hiç taşınmaz. `Goal` ve `Item` veri yapıları SwiftUI'a taşınabilir.

---

## Faz 3: Büyük Yeniden Yapılanma ve Nihai Temizlik (3-4 Hafta)

Kod tabanının teknik borçlardan tamamen temizlendiği, tasarım sisteminin Radix ile modernize edildiği ve eski tabloların fiziksel olarak silindiği aşamadır.

### 1. Kapsam (Scope)
- **Proje Görevlerinin ve Hatırlatıcıların `items`'a Tam Geçişi:**
  - `task` ve `reminder` tabloları tamamen terk edilir; `items.projectId` alanı üzerinden `ProjectAccessService` ile işbirliği ve yetkilendirme kusursuzlaştırılır.
- **Tasarım Sistemi ve Radix Primitifleri Göçü:**
  - 24 dosyadaki (`src/{views,components,layout}`) ham modal ve overlay pencereler Radix UI Dialog bileşenine taşınır.
  - Tek Komut Paleti (`cmdk`) devreye alınır.
  - `globals.css` temizlenir; yalnızca anlamsal belirteçler (`--surface`, `--text`, `--accent`) kalır, eski şablon renkleri (`brand-*`, `gray-*`) silinir.
- **Evkat'ın Tekrarlayan Şablon Haline Gelmesi:**
  - Rutin segmentleri ve aktiviteleri `Item (kind: 'event', rrule: 'FREQ=WEEKLY...')` olarak modellenir.
- **Eski Tabloların Düşürülmesi (Fiziksel Silme - Ayrı Onaylı):**
  - `task`, `reminder`, `reminder_list`, `calendar_event`, `time_block`, `routine_*` tabloları tam veritabanı yedeği alındıktan ve **kullanıcı açık onay verdikten sonra** `DROP TABLE` migration'ı ile veritabanından tamamen silinir.

### 2. Neden Bağımsız Dağıtılabilir?
Tüm web sayfaları ve API uç noktaları zaten Faz 1 ve Faz 2'de `items` modeline geçmiş olduğundan, eski tabloların fiziksel olarak silinmesi hiçbir aktif servisi etkilemez.

### 3. Geri Alma Yolu
Silme öncesi alınan PostgreSQL tam mantıksal yedeği (pg_dump).

### 4. Risk Seviyesi: Düşük (Kritik mantık Faz 1-2'de çözüldüğü için bu aşama saf temizliktir).

### 5. iOS Etkisi: %100 Hazır
> Varsayım: Gelecekte geliştirilecek yerel iOS uygulamasının SwiftUI ile yazılacağı, çevrimdışı senkronizasyon için SwiftData/CoreData yerel deposu kullanacağı varsayılmıştır.

Backend sözleşmesi artık tek bir temiz `Item` ve `Goal` API'sine ve `/api/sync` uç noktasına sahiptir. SwiftUI uygulaması doğrudan inşa edilebilir.

