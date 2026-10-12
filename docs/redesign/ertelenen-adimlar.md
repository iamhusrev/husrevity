# Ertelenen adımlar (gözetimsiz uygulamada bilerek yapılmayanlar)

Bu dosya, `docs/redesign/05-roadmap.md` içindeki bazı adımların neden gözetimsiz çalışmada **uygulanmadığını** listeler. Hiçbiri unutulmuş değildir; her biri ya kalıcı veri kaybı içerir, ya yetkilendirme modelini değiştirir, ya da gerçek bir PostgreSQL ile entegrasyon testi gerektirir (bu ortamda yok). Her adım için açık onay ve önkoşullar yazılıdır.

> Varsayım: Üretim veritabanına bu ortamdan hiçbir bağlantı kurulmaz. Aşağıdaki "önkoşul" maddeleri ürün sahibi tarafından, kendi ortamında yerine getirilir.

## D-1. Eski tabloların fiziksel olarak silinmesi (`DROP TABLE`)
- **Kapsam:** `task`, `reminder`, `reminder_list`, `calendar_event`, `time_block`, `routine_segment`, `routine_activity` (ve gerekirse `learning_*`, `sport_*` aynaları).
- **Neden ertelendi:** Kalıcı veri kaybı; geri dönüş yalnızca yedekten.
- **Önkoşullar:** (1) Dual-write aynası en az bir hafta üretimde çalışmış ve mutabakat sorgusu sıfır fark göstermiş olmalı; (2) tüm okumalar `items`'a taşınmış olmalı (D-3); (3) tam `pg_dump` alınmış ve geri yükleme denenmiş olmalı; (4) açık, kapsamı yazılı onay; (5) when a legacy table is dropped, notification ownership of its items must move to `ItemService` (the skip rule from S2 must be removed for that table in the same change).
- **Geri dönüş:** `pg_dump` yedeği.

## D-2. Google Calendar entegrasyonunun kaldırılması (Adım B)
- **Kapsam:** `apps/api/src/integrations/google-calendar/`, webhook uç noktası (`POST /hooks/gcal`), senkron job'ı, `items.source = 'gcal'` satırlarının akıbeti, `external_link` ve `integration_account` içindeki `google_calendar` satırları.
- **Neden ertelendi:** Dış toplantıların içeri akışını keser ve veri siler; roadmap'in kendisi "ayrı onaylı silme" der.
- **Önkoşullar:** ICS dışa aktarım (Faz 2 / S7) canlıda denenmiş ve indirilen dosya kontrol edilmiş olmalı; webhook kanalı Google tarafında kapatılmalı.
- **Geri dönüş:** ICS dosyası + `integration_account` satırlarının yedeği.

## D-3. `task` / `reminder` / `routine_*` okumalarının `items`'a taşınması
- **Neden ertelendi:** (a) Proje görevleri için yetkilendirme modeli değişir (`ProjectAccessService` artık `items` üzerinde çalışmalı): güvenliğe duyarlı, gözetimsiz agy'ye verilmez; (b) gerçek PostgreSQL ile entegrasyon testi olmadan doğrulanamaz; (c) 1295 satırlık `RemindersPage` ve `EvkatPage` yeniden bağlanmalı.
- **Önkoşullar:** Dual-write aynasının üretimde doğrulanması; `ProjectAccessService` için `items` üzerinde yetki testleri (OWNER/EDITOR/VIEWER, kişisel görev = yalnızca sahibi); gerçek DB'li entegrasyon testi (testcontainers).

## D-4. `@fullcalendar/*` paketlerinin kaldırılması
- **Neden ertelendi:** `package.json` ve kilit dosyasını değiştirir; ağ erişimi gerektirir.
- **Önkoşul:** `/calendar` rotası `/month`'a yönlendirilmiş ve hiçbir yer paketi import etmiyor olmalı (S6 sonunda doğrulanır). Sonra `bun remove @fullcalendar/...`.

## D-5. Yeni bağımlılıklar: Radix UI, cmdk, dnd-kit
- **Neden ertelendi:** Gözetimsiz ağ erişimi ve tedarik zinciri riski; Faz 1 sürükle-bırak mevcut `react-dnd` ile, Faz 3 overlay birleştirmesi bağımlılıksız ortak modal ile yapıldı.
- **Önkoşul:** Sürümler sabitlenir (en az iki haftalık, tam sürüm numarası) ve kullanıcı kurar.

## D-6. Tasarım belirteçlerine geçiş (`brand-*`/`gray-*` paletlerinin silinmesi)
- **Neden ertelendi:** Yaklaşık 1.000+ kullanım yeri; görsel doğrulama olmadan gözetimsiz yapılamaz.
- **Önkoşul:** Tarayıcıda görsel kontrol (açık/koyu tema) ve ekran görüntüsü karşılaştırması.

## D-7. MCP araç setinin 79'dan ~20'ye indirilmesi
- **Neden ertelendi:** Mevcut Claude kullanımını kırar. Yeni yönlendirici araçlar (`capture`, `get_life_context`, `apply_plan`, `undo_change_set`, hedef araçları) eklemeli olarak eklendi; eski araçlar yerinde.
- **Önkoşul:** Yeni araçlar birkaç hafta gerçek kullanımda denendikten sonra, hangi eski araçların gerçekten kullanılmadığına bakılarak budanır.

## D-8. Kullanıcı bazlı saat dilimi ve planlama tercihleri (ADR 10)
- **Neden ertelendi:** Faz 1–2'nin kritik yolunda değil; `Europe/Istanbul` sabit kalır.
- **Önkoşul:** `user_preference` tablosu ve `TodayService`'in saat dilimi parametrelenmesi.

## D-9. Üretimde çalıştırılacak migration'lar
Gözetimsiz çalışmada yazılan **tüm migration dosyaları** `apps/api/src/db/migrations/` altına eklemeli (additive) olarak bırakılır ve **çalıştırılmaz**. Çalıştırmak ürün sahibinin adımıdır (`bun run migration:run`); önce `migration:show` ile bekleyenlere bakılır. Dilim dilim eklenenler `progress.md` içinde listelenir.

---

## Gözetimsiz çalışma sırasında eklenenler
(Aşağıya her dilim, kendi ertelediği ek adımları ekler.)

- Undo of changes on shared-project items needs ProjectAccessService-based authorization (prerequisite: D-3).
- Runtime mirror for routine (`routine_segment`/`routine_activity`), learning (`learning_item`), and sport (`sport_session`/`sport_log`) is deferred to their respective redesign slices (Faz 2/3/4); S2 runtime mirror covers `task`, `reminder`, `calendar_event`, and `time_block`, while `ReconcileItemsFromLegacyTables1715000037000` provides historical/catch-up coverage for all 9 tables.
- DateTimePicker mobile sheet still lacks dialog semantics; needs a visual check before migrating to Dialog.

### S2 sonrası eklenenler
- **D-1 ek önkoşul: bildirim sahipliği.** S2 ile, `legacy_table` değeri bilinen bir eski tabloya işaret eden item'lar için bildirimi eski servis planlar; `ItemService.syncNotification` bu item'lar için `'item'` türünde bildirim üretmez (çift bildirimi önlemek için). Bir eski tablo düşürülürken, o tablonun item'ları için bildirim sahipliği aynı değişiklikte `ItemService`'e geçmeli ve `LEGACY_TABLE_NOTIFICATION_KINDS` içindeki ilgili giriş kaldırılmalıdır. Aksi hâlde bu item'lar hiç bildirim almaz.
- **L1: üye çıkarma aynayı atlıyor.** `apps/api/src/project/project-member.service.ts` üye çıkarılınca/ayrılınca ham `UPDATE task SET assignee_id = NULL` çalıştırır; aynalanan item'ın `payload.assigneeId` değeri bayat kalır. Yetkilendirme davranışına dokunulmadığı için bırakıldı. Önkoşul: D-3 (okumalar `items`'a taşınırken atama `items` üzerinden yönetilmeli).
- **L2: sağlayıcı alanları.** Çalışma zamanında aynalanan satırın `created_at`/`created_by_id` değeri backfill'dekinden farklıdır (`now()` ve istek bağlamındaki kullanıcı; bot/job yazımlarında kullanıcı boş). Yalnızca görüntüleme/denetim etkisi vardır; veri bütünlüğünü etkilemez.
- **Eski taraf yetkili olduğu için kayıp:** item tarafında yapılan bir düzenleme (örn. görevi item'dan tamamlama), eski satır sonraki kez düzenlendiğinde ezilir. D-3 tamamlanana kadar kabul edilmiş davranıştır.

### S6a sonrası eklenenler
- Legacy CalendarPage still has recurrence/colour/all-day editing that the new month view does not; remove only after parity is accepted (decision D-4).
