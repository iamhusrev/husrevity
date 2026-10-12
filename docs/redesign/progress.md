# Uygulama ilerleme günlüğü

Gözetimsiz uygulamanın dilim bazlı kaydı. Hiçbir şey commit edilmedi; çalışma ağacındaki tüm değişiklikler ürün sahibinin onayını bekler. Migration'lar yazıldı, **çalıştırılmadı**. Bu ortamda veritabanı yok; tüm testler mock'ludur.

Baseline (Faz 0 sonrası): API 74 suite / 574 test, web 10 dosya / 37 test, iki tsc temiz, web build geçiyor.

## Faz 0: tamamlandı
Web: ⌘K çakışması, ölü arama kutusu, mobil hızlı ekleme, tıklanabilir dashboard, dil kalıcılığı + eksik i18n anahtarları, sidebar prefix eşleşmesi, ölü rota ve bileşen temizliği, port 3090, AI öneri önbelleği. MCP: `zod/v3` düzeltmesi.

## S1: change_set altyapısı (Faz 1, ADR 6): geçti
- **Eklenen:** `apps/api/src/change-set/**`, migration `1715000036000-CreateChangeSets.ts`, MCP `list_change_sets` ve `undo_change_set`, `ItemService`'e opsiyonel `EntityManager` parametreli yardımcılar. REST: `GET /api/change-sets`, `GET /api/change-sets/:id`, `POST /api/change-sets/:id/undo`.
- **Sonuç:** API 79 suite / 649 test, tsc temiz, web 37 test / build geçiyor.
- **İnceleme:** bağımsız reviewer ile 3 tur (ilk geçiş 11 bulgu, düzeltme 1, düzeltme 2, son geçiş). Kapanan: undo atomikliği, eşzamanlılık kilidi, kısmi undo'nun yakınsaması, etiket taşması, tamamlama geri alma, `not_owner`, `/complete` yanıt şekli, sayısal id doğrulaması (bigint üst sınırı dahil).
- **Bilinen kalanlar (LOW, kabul edildi):**
  - Ortak proje item'larında undo çalışmaz (`not_owner`). Karar gereği: yetkilendirme `ProjectAccessService` ile ayrıca ele alınmalı (D-3).
  - Occurrence kayıtlarında `after.updatedAt` yok; occurrence çakışma tespiti çalışmaz.
  - `before` snapshot'ı satır kilidi olmadan okunuyor (eşzamanlı düzenlemede bayat olabilir).
  - `rrule` yalnızca boşluktan oluşuyorsa araç ile servis farklı karar veriyor.
  - Kısmen geri alınmış bir sette ikinci denemede aynı item için sahte "değişti" çakışması çıkabilir.
  - Erişim hatası ayrımı `ApiException` durum koduna değil mesaj içeriğine bakıyor.
  - Post-commit yan etkilerinde yutulan hatalar loglanmıyor.
  - Rollback testi manager'ı atlayan bir yazımı tek başına yakalamaz (manager casusu testi bunu ayrıca kapsar).
  - `get_item`, `update_item`, `complete_item` ve `projectId` girdileri sayısal doğrulanmıyor (S1 öncesinden var; hata Postgres 22P02 olarak döner).
- **Doğrulanamayanlar (gerçek DB gerekir):** gerçek transaction rollback'i, `FOR UPDATE` davranışı, `updatedAt` milisaniye hassasiyeti, `softRemove`'un `updated_at`'i değiştirip değiştirmediği.
- **Çalıştırılacak migration:** `1715000036000-CreateChangeSets`.
- **Önerilen commit:** `feat(api): add change_set tracking, undo engine and MCP write recording`

## S2: dual-write aynası (Faz 1): uygulandı, düzeltme turu bekliyor (agy kotası doldu)
- **Eklenen:** `apps/api/src/item-mirror/**`, `task`/`reminder`/`calendar`/`time-block` servislerine ayna çağrıları, migration `1715000037000-ReconcileItemsFromLegacyTables.ts` (yalnızca INSERT, idempotent, `down` boş), `GET /api/admin/item-mirror/drift` (yalnızca sayaç).
- **Ölçüm:** API 85 suite / 708 test, tsc temiz, web 37 test / build geçiyor.
- **İnceleme:** bağımsız reviewer: 0 HIGH, 2 MEDIUM, 5 LOW. Transaction zehirlenmesi yok, eşleme backfill ile aynı, tenant izolasyonu sağlam.
- **AÇIK (MEDIUM, düzeltilmedi):**
  - M1: aynalanan bir item doğrudan düzenlenirse (`PATCH /items/:id` veya MCP) hem eski hem `item` türünde bildirim gider (çift bildirim). Backfill'li satırlarda zaten vardı; ayna kapsamı genişletiyor.
  - M2: ayna kapalıyken/hata anında oluşan kayıt silinip geri alınırsa item hiç oluşmuyor (drift raporu "eksik" der).
- **AÇIK (LOW):** `project-member.service.ts` ham `UPDATE task SET assignee_id = NULL` aynayı atlıyor; aynalanan satırın `createdAt/createdById` değeri backfill'den farklı; drift `missingInItems` net fark hesaplıyor; `@Roles('ROLE_ADMIN','admin')` tutarsız; `ITEM_MIRROR_ENABLED` yalnızca küçük harf `false`/`0` tanıyor; bildirim güvenlik testi anlamsız.
- **Düzeltme briefi hazır:** scratchpad `s2-fix1.md` (M1, M2, L1–L5 ve test boşlukları).
- **Durdu:** agy düzeltme turunda `RESOURCE_EXHAUSTED` verdi; çalışma ağacı değişmedi.
- **ÖNEMLİ:** S2 şu hâliyle **commit/deploy edilmemeli** (M1 çift bildirim üretir). Çalıştırılacak migration: `1715000037000` (yalnızca S2 düzeltmesi geçtikten sonra).

### S2 güncellemesi: MEDIUM'lar kapatıldı (kota kesintisinden sonra)
- agy düzeltme turunda kota hatası verdi (`RESOURCE_EXHAUSTED`); hata anına kadar yaptığı kısmi düzenleme çalışma ağacında kalmıştı (ilk raporumda "değişmedi" demiştim, bu yanlıştı: `git status` zaten `M` olan dosyalardaki yeni düzenlemeleri göstermez). Tutarlı bir noktadaydı: M1 ve M2 uygulanmıştı.
- Kalanı bu oturumda elle tamamlandı (testler önce, kırmızı doğrulandı): L3 drift anti-join sayımı, L4 `@Roles('admin')`, L5 `ITEM_MIRROR_ENABLED` ayrıştırma matrisi.
- **Ölçüm:** API 85 suite / 739 test, tsc temiz.
- M1 (çift bildirim) ve M2 (restore iyileştirme) kapandı, bağımsız doğrulama için reviewer'a verildi.
- L1 ve L2 `ertelenen-adimlar.md`'ye yazıldı (kabul edilen).

### S2 kapanış: geçti
- Bağımsız doğrulama: M1, M2, L3, L4, L5 düzeldi; HIGH/MEDIUM yok. Kalan LOW'lar da kapatıldı: mapper hatası artık `ItemMirrorService` içinde yutuluyor ("asla fırlatmaz" sözleşmesi kendi içinde), takvim ve zaman bloğu servislerindeki sessiz `catch {}` log atıyor, `learning_item` giriş yorumu eklendi.
- **Ölçüm:** API 85 suite / 740 test, tsc temiz, web 37 test / build geçiyor.
- **Bilinen kalan (LOW):** `restoreMirror` üretimde çağrılmıyor (yalnızca testte); mirror'ın "bildirime dokunmaz" testinin ilk dalı yapıcı bağımlılıkları değil özellik adlarını kontrol ediyor (ikinci dal gerçek `ReminderService` ile doğrulanıyor).
- **Çalıştırılacak migration'lar (sırayla):** `1715000036000-CreateChangeSets`, `1715000037000-ReconcileItemsFromLegacyTables`.
- **Önerilen commit:** `feat(api): mirror legacy task, reminder, calendar and time block writes into items`

## S3: Bugün v2 panosu + Claude etkinlik şeridi (Faz 1): geçti
- **Eklenen (web):** `views/today/TodayBoard.tsx` (24 saatlik eksen, Evkat arka plan şeritleri, çakışma yerleşimi, sürükle-bırak ve "Zamanla" penceresi), `useTimelineDrop`, `components/dashboard/ClaudeActivityStrip.tsx` (son 5 değişiklik + tek tıkla geri al, çakışma uyarısı), `utils/today-board.ts`, `useChangeSets`/`useUndoChangeSet`/`useScheduleItem`, `change-set-service`, i18n anahtarları. Yeni bağımlılık yok.
- **API değişikliği (eklemeli, yalnızca `today/`):** `timeline` artık bugüne zamanlanmış açık, tekrarlamayan görevleri de içerir (`kind: 'task'`); `ItemSummary`'ye `isRecurring` ve `durationMin` eklendi. MCP `get_today` aynı zaman çizelgesini döner, yani görevler orada da görünür.
- **Ölçüm:** API 85 suite / 740 test, web 16 dosya / 135 test, iki tsc temiz, web build geçiyor.
- **İnceleme:** bağımsız reviewer ile 4 tur. İlk geçişte 4 HIGH + 5 MEDIUM: görev zamanlanınca eksende görünmüyordu, geçersiz `calc()` ile çakışmalar üst üste biniyordu, bayat `useDrop` kapanışı yanlış güne yazıyordu (00:00–03:00 arası), tarayıcı saat dilimi eksen/şimdi çizgisini kaydırıyordu, tekrarlayan görevin çapa tarihi bozulabiliyordu. Hepsi kapandı; test dikişi üretim kodundan kaldırıldı, saat dilimi testleri UTC/İstanbul/Los Angeles için bileşen düzeyinde (`pool: "forks"`).
- **Bilinen kalan (LOW):**
  - "Zamanla" penceresi süresiz item için 30 dakika gösterir ve 30 gönderir; sürükle-bırak yolu süreyi hiç göndermez (iki yol tutarsız, veri kaybı yok).
  - Pencerede odak tuzağı yok (`aria-modal` var); arka plana tıklama kapatma, metin seçimi sürüklemesinde yanlışlıkla kapatabilir.
  - Önizleme çizgisi `canDrop` kapalıyken de görünebilir; sürükleme iptalinde önizleme dakikası temizlenmez.
  - `EvkatPage.tsx` varsayılan gün seçiminde hâlâ yerel saat dilimi kullanıyor (S3 kapsamı dışı).
  - `TodayService` her çağrıda sahibinin tüm item satırlarını belleğe alıyor (öncesinden var).
  - Yıl/ay gibi diğer ekranlar için hedef etiketi yok (S5).
- **Görsel kontrol sende (tarayıcıda göremedim):** eksen ölçeği ve açılışta kaydırma, açık/koyu temada Evkat şerit renkleri, çakışan kayıtların yan yana yerleşimi, `xl` altında yığılma ve "Zamanla" düğmesinin erişilebilirliği, sürükle-bırak gerçek HTML5 backend'iyle.
- **Önerilen commit:** `feat(web): add Today board with drag-to-schedule and Claude activity strip`

## S4: MCP planlama araçları (Faz 1, ADR 7): geçti
- **Eklenen:** `capture` (hızlı tekil ekleme, change_set ile sarmalı), `get_life_context` (bugün, yaklaşan, geciken, aktif projeler, son değişiklikler ve sayaçlar tek çağrıda), `apply_plan` (tek transaction ve change_set içinde atomik çoklu yazma, `dryRun` desteği, çakışma uyarıları), `plan_day` ve `plan_week` prompt'ları.
- **Güvenlik & Yardımcılar:** `secret-guard.ts` buluşsal kuralı (katı gizli anahtar kelimeleri ile transit/bilet bağlamındaki "token" ayrımı, Türkçe ekler ve bilinen anahtar kalıpları), `plan-input.ts` ortak alan doğrulaması, `plan-overlap.ts` İstanbul saat dilimi çakışma tespiti. Kasa (vault) değişmezi korundu.
- **Fabrika Kaydı:** `McpServerFactory` içine tüm araçlar ve prompt'lar kaydedildi; mevcut 79 araca dokunulmadı (eklemeli).
- **Ölçüm:** API 91 suite / 894 test (+78 test), tsc temiz; web 16 dosya / 135 test, build geçiyor.
- **Çalıştırılacak migration:** Yok (veri modeli değişikliği gerekmedi).
- **Önerilen commit:** `feat(api): add MCP planning tools (capture, get_life_context, apply_plan) and planning prompts`

## S4 kapanış: geçti (önceki "KISMEN" bölümünün yerini alır)
- **Eklenen:** MCP `capture`, `get_life_context`, `apply_plan` ve prompt'lar `plan_day`/`plan_week`; hepsi `mcp-server-factory.ts`'de kayıtlı. Mevcut 79 araç yerinde.
- **Doğrulama:** bağımsız reviewer ile 3 geçiş. HIGH yok. Kapanan MEDIUM'lar: `apply_plan` etiketinin şifre korumasından geçmemesi, tekrarlayan item'larla yanlış çakışma uyarıları (occursOn + İstanbul saati ile yeniden kuruluyor, yalnızca açık item'lar), `dryRun`'ın gerçek çalıştırmadan farklı sonuç vermesi (EDITOR erişimi, projectId erişimi, `occursOn` zorunluluğu, yinelenen id), `occursOn` doğrulaması, aynı plan içinde atıf sınırlamasının belgelenmesi. `secret-guard` ReDoS'a karşı doğrulandı (100k karakterde <10 ms).
- **Son turda bulunan ve düzeltilen:** `looksLikeSecretInFields` başlık + notu `": "` ile birleştirdiği için "Boarding pass" + "Gate B12" gibi sıradan metinleri reddediyordu; artık yalnızca anahtar kelimeyle biten başlık + kimlik bilgisi gibi görünen ilk not kelimesi reddedilir. Ayrıca yalnızca ilk anahtar kelime eşleşmesi değil tüm eşleşmeler kontrol ediliyor.
- **Ölçüm:** API 92 suite / 945 test, tsc temiz; web 16 dosya / 135 test.
- **Bilinen kalan (LOW, kabul edildi):**
  - `secret-guard`: alanlar arası kısa değerler (`pin` + `4821`) yakalanmaz; "Password is expiring" gibi cümleler (kasıtlı) reddedilir.
  - `apply_plan`: aynı id'yi iki kez kullanan geçerli planlar (tekrarlayan bir item'ın iki farklı günü) reddedilir; aracın açıklamasında belgeli ("bir plan başına id başına bir işlem").
  - `apply_plan`: her işlem için ayrı erişim sorgusu (50 işlemde ~100-150 sorgu), `get_life_context` `counts.activeProjects` gerçek toplam değil.
  - Gerçek geri alma (rollback) davranışı yalnızca gerçek veritabanıyla doğrulanabilir; testler sahte yönetici kullanıyor.
- **Dikkat, bilerek yapılmayan:** `@Optional()` `ProjectAccessService` üzerinde duruyor (kaldırınca spec'ler sağlayıcı bulamıyor); ProjectAccessService bağlı değilse `dryRun` ön kontrolleri sessizce atlanır, yürütme sırasındaki kontroller (`ItemService`) yine korur.
- **Önerilen commit:** `feat(api): add capture, get_life_context, apply_plan and planning prompts to MCP`

## S5a: hafif hedef modeli (Faz 2, ADR 12): geçti
- **Eklenen (API):** migration `1715000038000-CreateGoals.ts` (`goal` tablosu, `items.goal_id`, `project.goal_id`; eklemeli, idempotent), `apps/api/src/goal/**`, `GET/POST/PATCH/DELETE/restore /api/goals`, ilerleme (`total/done/open/percent`, doğrudan bağlı item'lar + bağlı projelerin item'ları + yaşayan alt hedeflerin toplamı, iptaller hariç, gruplu sorgu), `goalId` item ve proje DTO'larında isteğe bağlı, change_set snapshot'ı `goalId`'yi kapsıyor.
- **Kurallar:** yıl ≤366, çeyrek ≤93, ay ≤31 gün; ebeveyn daha geniş ufukta ve dönemi kapsıyor; döngü yok; yabancı veya silinmiş `goalId` reddedilir; proje `goalId`'sini yalnızca OWNER değiştirebilir.
- **Ölçüm:** API 96 suite / 1026 test, tsc temiz; web 16 dosya / 135 test.
- **İnceleme:** bağımsız reviewer ile 3 geçiş. HIGH yok iken ikinci geçişte HIGH bulundu: `PATCH /items/:id` gövdesi `Partial<ItemRequestDto>` olarak tiplenmişti; bu tip çalışma zamanında silinir, `ValidationPipe` doğrulama ve `whitelist` uygulamıyordu (`goalId: ""` hedefi sessizce siliyordu). Artık `ItemUpdateRequestDto extends PartialType(ItemRequestDto)`; bu düzeltme PATCH'in TÜM alanları (kind, status enum'u, tipler) için doğrulamayı da ilk kez devreye aldı. Kapanan MEDIUM'lar: silinmiş hedef yüzünden geri almanın çökmesi, silinmiş ebeveyni olan hedefin düzenlenememesi, geçersiz takvim tarihi (`2026-02-30`) 500'ü, bayat `parentGoalId` yankısı.
- **Dikkat (davranış değişikliği):** `PATCH /items/:id` artık yanlış tipli veya bilinmeyen enum değerlerini 400 ile reddeder; daha önce sessizce kabul ediliyordu. Web istemcisi yalnızca DTO'daki alanları gönderiyor (kontrol edildi), ama harici bir istemci varsa etkilenebilir.
- **Bilinen kalan (LOW):** `ItemService.create`/`ProjectService.create` servis düzeyinde `""` değerini hâlâ doğrudan işler (DTO sınırı korur, MCP araçları `goalId` göndermez); `isValidNumericId` baştaki sıfırları (`"007"`) kabul eder; çok eski bir EDITOR istemcisi değişmemiş `goalId`'yi geri yollarsa 403 alır; undo, hedef silinmişse hedefi sessizce eski hâline getirmez (çakışma raporlamaz).
- **Çalıştırılacak migration:** `1715000038000-CreateGoals` (S1/S2 migration'larından sonra).
- **Önerilen commit:** `feat(api): add light goal model with progress and goal links on items and projects`

## S5b1: not bağlantıları (Faz 2, ADR 14): geçti
- **Eklenen (API):** migration `1715000039000-CreateNoteLinks.ts` (`note_link` tablosu; additive, idempotent, polymorphic target_id FK'siz, partial unique live index), `apps/api/src/note-link/**` (`NoteLink` entity, DTOs, `NoteLinkService`, `NoteLinkController`, `NoteLinkModule`), `GET /api/notes/:id/links` (sınırlı gruplu sorguyla targetTitle çözümü), `POST /api/notes/:id/links` (item, project, goal için erişim kapıları, idempotency, 50 link tavanı), `DELETE /api/notes/:id/links/:linkId` (soft-delete, owner-scoped), `GET /api/note-links?targetType=&targetId=` (hedef erişim denetimi, kullanıcının kendi notları, en yeni ilk, limit 100).
- **Ölçüm:** API 99 suite / 1070 test (+44 test), tsc temiz; web 16 dosya / 135 test, build geçiyor.
- **Tasarım kararı (not silme & modül döngüsü):** `NoteLinkModule` -> `NoteModule` tek yönlü bağımlılığını korumak ve `module-graph` döngüsü yaratmamak için, `NoteLinkService` tüm sorgularında yaşayan notları (`n.deleted_at IS NULL`) ve kullanıcıyı katı şekilde filtreler; silinen notların linkleri sorgularda döndürülmez.
- **Çalıştırılacak migration:** `1715000039000-CreateNoteLinks` (S1/S2/S5a migration'larından sonra).
- **Önerilen commit:** `feat(api): add generic note links for items, projects and goals`

## S5b1: not bağlantıları (Faz 2, ADR 14): geçti
- **Eklenen (API):** migration `1715000039000-CreateNoteLinks.ts` (`note_link`, polimorfik `item|project|goal`, CHECK, kısmi UNIQUE indeks `WHERE deleted_at IS NULL`), `apps/api/src/note-link/**`, `GET/POST /api/notes/:id/links`, `DELETE /api/notes/:id/links/:linkId`, `GET /api/note-links?targetType=&targetId=`. Kurallar: not yalnızca sahibine ait (404), hedef erişilebilir olmalı (item `ItemService` kapıları, proje VIEWER, hedef sahiplik), bağlama idempotent, not başına en fazla 50 canlı bağlantı, listeleme yalnızca çağıranın kendi notlarını döner (ortak projede bile).
- **Ölçüm:** API 99 suite / 1073 test, tsc temiz; web 16 dosya / 135 test.
- **İnceleme:** bağımsız reviewer: IDOR yok, yabancı hedef/not/link 404, kısmi indeks ve soft delete uyumlu. İki gerçek kusur bulundu ve kapatıldı (önce kırmızı testle): (1) üyeliği kaldırılan kullanıcıya proje ve item başlıkları sızıyordu (`project_member` soft delete edildiği için birleştirmede `pm.deleted_at IS NULL` yoktu), (2) aynı bağlantıyı aynı anda iki kez göndermek benzersiz indeks ihlaliyle 500 veriyordu; artık kazananın satırı döner (idempotent).
- **Bilinen kalan (LOW):** 50 sınırı eşzamanlı isteklerde aşılabilir (yalnızca sahibin kendi bağlantıları); silinmiş/erişilemeyen hedefe giden bağlantılar `GET /notes/:id/links` içinde `targetTitle: null` ile görünmeye devam eder (istemci "silinmiş" durumunu göstermeli, kullanıcı kaldırabilmeli); doğrulama controller, DTO ve serviste tekrarlanıyor; migration spec'i yalnızca kaynak metni kontrol eder.
- **Çalıştırılacak migration:** `1715000039000-CreateNoteLinks` (CreateGoals'tan sonra).
- **Önerilen commit:** `feat(api): link notes to items, projects and goals`

## S5b2: MCP hedef araçları, ay değerlendirme prompt'ları, hedef kapsamları (Faz 2, ADR 7/12): geçti
- **Eklenen (API & Web):**
  - Kapsamlar: `goals:read` ve `goals:write` üç yerde eşitlendi (`personal-access-token.entity.ts`, `pat-dtos.ts`, `integrations-service.ts`) ve drift testi `pat-scopes.spec.ts` eklendi.
  - Yeni MCP modülü: `apps/api/src/mcp/tools/goal-tools.ts` (`list_goals`, `create_goal`, `update_goal`, `link_to_goal`, `link_note`).
  - MCP Entegrasyonu & Yaşam Bağlamı: `get_life_context` içinde `goals:read` kapsamı varsa `activeGoals` (İstanbul bugününü kapsayan, dönem sonuna göre sıralı, 20 tavanlı ve `truncated.goals` bayraklı).
  - Planlama ve Yakalama: `apply_plan` ve `capture` araçlarına `goalId` desteği eklendi (`plan-input.ts`, `plan-tool.ts`, `capture-tool.ts`).
  - MCP Prompt'ları: `planning-prompts.ts` içine `review_month` ve `set_goal` prompt'ları eklendi.
  - Fabrika ve Güvenlik: `McpServerFactory` içine `GoalModule` ve `NoteLinkModule` servisleri enjekte edilerek araçlar kaydedildi; kasa (vault) değişmezi korundu.
- **Ölçüm:** API 101 suite / 1106 test (+2 suite, +33 test passing), tsc temiz; web 16 dosya / 135 test, tsc temiz, build geçiyor.
- **Çalıştırılacak migration:** Yok (veri modeli değişikliği gerekmedi; S5a ve S5b1 migration'ları üzerine kuruldu).
- **Önerilen commit:** `feat(mcp): add goal tools, month review prompts, and goal scopes`


## S5b2: MCP hedef araçları, prompt'lar, scope'lar (Faz 2): geçti
- **Eklenen:** scope'lar `goals:read`/`goals:write` (üç listede senkron, sapmayı yakalayan spec), MCP araçları `list_goals`, `create_goal`, `update_goal`, `link_to_goal`, `link_note`; prompt'lar `review_month`, `set_goal`; `get_life_context.activeGoals` (yalnızca `goals:read` ile); `capture` ve `apply_plan` isteğe bağlı `goalId` kabul eder. Mevcut araçlar yerinde.
- **Ölçüm:** API 101 suite / 1123 test, tsc temiz; web 16 dosya / 135 test.
- **İnceleme:** bağımsız reviewer + düzeltme turu. HIGH yok. Kapanan MEDIUM'lar: (1) `capture`/`apply_plan` yalnızca `items:write` isterken `goalId` kabul ediyordu: `goals:write` olmayan bir token item'ları hedeflere bağlayabiliyor, hedef id'lerini yoklayabiliyordu; artık girdide `goalId` varsa (açık `null` dahil) `goals:write` de gerekli, yazımdan önce hesaplanıyor. (2) `link_to_goal`, ortak projede EDITOR iken başkasının item'ına kendi hedefini yazıyordu; artık yalnızca kendi item'larını bağlar, diğerleri `itemsSkipped` ile raporlanır. (3) `undoable` sabit bir cümleydi; artık boolean ve `changeSetId`'ye bağlı, proje bağlantıları change set'in dışında olduğu için ayrı anlatılıyor.
- **Düzeltilen LOW:** ham hata metni sızması, `set_goal` başlığı (satır sonu/komut enjeksiyonu + şifre koruması), `review_month` ay aralığı, silinmiş hedefin `clear` ile ayrılabilmesi, `truncated.goals` bayrağı.
- **Bilinen kalan:** gerçek geri alma (rollback) davranışı gerçek veritabanıyla doğrulanamadı (sahte yönetici); proje bağlantıları geri alınamaz (tasarım gereği).
- **Önerilen commit:** `feat(api): expose goals and note links over MCP with goals scopes`

## S6a: "Ay" (month) görünümü, aralık kancası, navigasyon ve /calendar yönlendirmesi (Faz 2): geçti
- **Eklenen (web):** `apps/web/src/utils/month-grid.ts` (`buildMonthGrid`, `monthRange`, `groupItemsByDay`, `moveToDay`), `useItemsInRange` ve `useUpdateItemFields` hook'ları (`hooks/useItems.ts`), `useMonthDrop` sürükle-bırak kancası (`views/month/useMonthDrop.ts`), paylaşılan `ScheduleModal` bileşeni (`components/items/ScheduleModal.tsx`), `/month` sayfası ve görünümü (`app/(app)/month/page.tsx`, `views/month/MonthPage.tsx`), `/calendar` -> `/month` yönlendirmesi, menü rotası güncellemesi (`AppSidebar.tsx`, `MobileBottomNav.tsx`), i18n anahtarları (`tr.json`, `en.json`).
- **İnceleme & Düzeltme Turu 1:** Bağımsız inceleme bulguları kapatıldı:
  - HIGH 1: Tekrarlayan item'ların yeniden zamanlama çapa güvenliği (ScheduleModal `recurring` koruması ve panelde salt-okunur rozet).
  - HIGH 2: Gün hücresine bırakmada `scheduledAt` / `dueAt` alan ayrımı (`useUpdateItemFields` ve `moveToDay` `placedBy` desteği).
  - MEDIUM 3: Tekrarlayan satırlar için silme koruması (`occursOn` tekil silme engeli ve seri şablonu silme onayı).
  - MEDIUM 4: `ScheduleModal` başlangıç saati (`initialTime` desteği ve item saatini devralma).
  - MEDIUM 5: 5/6 haftalık ay geçişlerinde dolaşan odak (roving tabindex) taşma sıfırlaması.
  - MEDIUM 6: Katmanlı Escape olay yayılımı (capture listener) ve panel açılış/kapanış erişilebilir odak yönetimi.
  - MEDIUM 7: Grid ARIA hiyerarşisi (`role="grid"`, `role="row"`, `role="columnheader"` ve hafta bazlı satır gruplaması).
  - LOW 8-13: Çift hata uyarısı kaldırıldı, 00:00 zamansız görev etiketi gizlendi, gün içi tekrarlar için benzersiz key'ler, `keepPreviousData` ile ay geçiş yumuşatması, mobil alt sayfa (bottom sheet) ve mobil zamanlama ipucu eklendi.
  - Test boşluğu: `America/Los_Angeles` altında 23:30 İstanbul item'ının İstanbul gününe düşmesi doğrulandı.
- **Ölçüm:** Web 21 dosya / 203 test (+5 dosya, +68 test; baseline: 16 dosya / 135 test), tsc temiz, build geçiyor (25 statik sayfa); API dokunulmadı (101 suite / 1123 test, tsc temiz).
- **Önerilen commit:** `feat(web): add month view with range query hook and calendar redirect`



## S6: Ay, Hafta, Gelen Kutusu (Faz 2): geçti
- **Eklenen (web):** `/month` (Pazartesi başlangıçlı ızgara, gün paneli, sürükleyerek günü değiştirme), `/week` (7 sütun, gün yük çubuğu, özet: toplam/yapıldı/açık/kayan), `/inbox` (tarihsiz, projesiz, hedefsiz açık görevlerin triyajı); `useItemsInRange`, `useInboxItems`, `useUpdateItemFields`; ortak `ScheduleModal` (`recurring`/`initialTime`); `/calendar` → `/month` yönlendirmesi; gezinmede Hafta, Ay, Gelen Kutusu.
- **API (eklemeli):** `GET /api/items?inbox=true` (açık görevler, tarihsiz/hedefsiz/projesiz/tekrarsız, en fazla 200, deterministik sıralama); `rrule: ""` artık `NULL`'a normalleşir.
- **Ölçüm:** API 102 suite / 1140 test, web 31 dosya / 313 test, iki tsc temiz, web build 27 sayfa.
- **İnceleme:** bağımsız reviewer ile 4 geçiş (S6a ilk geçiş + düzeltme doğrulaması, S6b, birleşik düzeltme turu bağımsız ölçüm). Kapanan HIGH'lar: gün panelinden "yeniden zamanla"nın tekrarlayan item'ın tüm serisini yeniden çapalaması, yalnızca `dueAt`'i olan görevi sürüklemenin `scheduledAt` yazması. Kapanan MEDIUM'lar: tek günü silmenin tüm seriyi silmesi (onaysız), hafta özetinin sütunda görünmeyen item'ları saymas1, başarısız `dueAt` sürüklemesinin sessiz olması, odak ve Escape davranışı, geçersiz ARIA rolleri.
- **Kasıtlı davranışlar:** gün kapasitesi 8 saat (adlandırılmış sabit, varsayım); yük çubuğu yalnızca `scheduledAt`/`occursOn` olanları sayar; tam 00:00 İstanbul saatindeki item'lar saat göstermez ("tüm gün" varsayımı); gelen kutusunda "Zamanla" bugünü seçer, başka gün için "Tarih ata" `dueAt` yazar; öğe silmenin geri alma uç noktası yok, `window.confirm` kullanılır.
- **Bilinen kalan (LOW):** `MonthPage` içindeki `todayYmd` açılışta donuyor (Hafta ve Gelen Kutusu düzeltildi, Ay kaldı); `/calendar` yönlendirmesi sorgu parametrelerini atar; gün panelinde tarih seçici yok; `CalendarPage` (tekrarlama/renk/tüm gün düzenleme) hâlâ yerinde ve bağlantısız (D-4).
- **Görsel kontrol sende:** ızgara hücre boyutları ve taşma çipleri, yük çubuğunun renk eşikleri (%100/%125), mobil alt panel, sürükle-bırak gerçek HTML5 ile, açık/koyu tema.
- **Önerilen commit'ler:** `feat(web): add month, week and inbox views`, ve API değişikliği için `feat(api): add inbox filter and normalise empty rrule on items`.

## S7a: `goalId` liste filtresi, ICS dışa aktarma, `rrule` doğrulaması (Faz 2): geçti
- **Eklenen (API, eklemeli):** `GET /api/items?goalId=` (hedefin saydığı işler: doğrudan + bağlı projeler + yaşayan alt hedefler, en fazla 200, tekrarlayanlar şablon olarak); `GET /api/items/export.ics?from&to&includeTasks` (elle yazılmış RFC 5545 serileştirici: `VTIMEZONE` Europe/Istanbul, yerel saat + TZID, 75 oktet katlama, kaçışlar, VTODO, atlanan oluşumlar için `EXDATE`, 5000 bileşen ve 366 gün sınırı); `rrule` yazarken doğrulama (ayrıştırılabilir olmalı, `SECONDLY`/`MINUTELY` reddedilir).
- **Ölçüm:** API 103 suite / 1221 test, tsc temiz.
- **İnceleme:** bağımsız reviewer ile 3 geçiş. HIGH yok. Kapanan MEDIUM'lar: (1) `FREQ=SECONDLY` gibi bir kural aralık listelemeyi ve dışa aktarmayı tek iş parçacığında kilitleyebiliyordu: yazarken doğrulama + `expand()` içinde seri başına 1000 oluşum ve 100.000 tarama sınırı; (2) silinmiş bir projedeki item'lar hedef listesinde ve ilerlemede sayılıyordu; (3) geri al, anlık görüntüdeki saklı `rrule`'ı `update`'e yeniden gönderdiği için bozuk/`SECONDLY` saklı kuralı olan item'larda 400 veriyordu: değişmemiş kural artık yeniden doğrulanmaz; (4) dışa aktarma, paylaşılan projenin item'larını (sahibi proje sahibi) üyelerden gizliyordu: liste ve ilerlemeyle aynı görünürlük koşulu.
- **Bilinen kalan (LOW):** veritabanında zaten saklı `SECONDLY`/`MINUTELY` kurallar silinmez (okurken sınırlanır, dışa aktarmada atılır); 11 yıldan eski bir `HOURLY` çapa, tarama sınırı yüzünden aralıkta 0 oluşum döndürebilir; `expand()` içindeki `RRule.parseString` korumasız (tek bozuk aynalanmış kural aralıklı listeyi ve Bugün zaman çizelgesini 500 yapabilir; yalnızca dışa aktarma try/catch'li); tamamlanan oluşumlar dış takvimde hâlâ görünür (belgelendi); Z'li `UNTIL` yerel İstanbul günü sayılır (gerçek UTC bir `UNTIL` 3 saate kadar kısalabilir, belgelendi); gerçek PostgreSQL ile hiçbir SQL doğrulanmadı.
- **Önerilen commit:** `feat(api): list items by goal, export items as ICS and validate rrule on write`

## S7b: Hedefler ekranı, gelen kutusundan hedefe ekleme, not bağlantıları, ICS indirme (Faz 2, yalnızca web): geçti
- **Eklenen (web):** `/goals` (`views/goals/*`: yıl seçici, durum filtresi, `tree` rolüyle hedef ağacı, ilerleme çubuğu, form penceresi, detay paneli, silmede geri al), `utils/goal-tree.ts` ve `utils/ymd.ts` (saf yardımcılar), `goal-service`, `note-link-service`, `useGoals`, `useNoteLinks`, `useGoalItems`, `exportItemsIcs` + `utils/download.ts`, `hooks/useDialogLayer.ts` (odak, Escape katman yığını), gelen kutusunda "Hedefe ekle", not düzenleyicide `NoteLinksPanel`, entegrasyonlarda `IcsExportCard`, gezinmede "Hedefler".
- **Düzeltme:** `MonthPage` `todayYmd`'i artık `useIstanbulToday` ile alıyor; ızgara buna bağlı, gece yarısı ve ay sınırında bugün vurgusu kayıyor.
- **Davranış notları:** item yazan tüm hook'lar (`create`, `update`, `updateFields`, `delete`, `complete`) `["goals"]` önbelleğini de tazeler. Hedef silme `window.confirm` yerine 7 sn'lik geri al bildirimi kullanır (API soft delete + restore). Tekrarlayan şablon item'lar hedef detayında tamamlanamaz (hangi oluşum olduğu bilinmiyor).
- **Ölçüm:** web 46 dosya / 486 test, tsc temiz, build `/goals` dahil geçiyor; API dokunulmadı (103 suite / 1221 test, tsc temiz).

## S7b kapanış: geçti (Faz 2 tamamlandı)
- **Eklenen (web):** `/goals` (yıl → çeyrek → ay ağacı, ilerleme çubuğu, oluştur/düzenle/bitir/bırak/sil + 7 sn geri al, ayrıntı paneli: bağlı işler ve bağlı notlar), gelen kutusunda "Hedefe ekle", not editöründe "Bağlantılar" paneli (hedef ve proje), Entegrasyonlar sayfasında ICS dışa aktarma kartı, gezinmede "Hedefler", Ay görünümünde gece yarısı düzeltmesi, `useDialogLayer` (Escape yalnızca en üstteki katmanı kapatır), `utils/ymd.ts` ve `utils/goal-tree.ts`.
- **Ölçüm:** web 48 dosya / 509 test, tsc temiz, build 28 sayfa; API 103 suite / 1221 test (dokunulmadı).
- **İnceleme:** bağımsız reviewer + düzeltme turu. HIGH yok. Kapanan MEDIUM'lar: (1) bir hedefi düzenlerken ebeveyn adayları yüklenmeden Kaydet'e basılırsa PATCH `parentGoalId: null` gönderip hedefi ağaçtan sessizce koparıyordu (artık yalnızca kullanıcı dokunursa gönderilir); (2) bir Claude değişikliğini geri almak (ve proje/görev mutasyonları) hedef ilerlemesini bayat bırakıyordu.
- **Kapanan LOW'lar:** hızlı ekleme diyaloğunun Escape'inin yutulması, ICS 400'ünün sunucu mesajının kaybolması (hata gövdesi Blob), kırpılmamış not uzunluğu, ay→çeyrek dönüşümü, ölü kod, İngilizce ağ/zaman aşımı mesajları.
- **Bilinen kalan (LOW):** `parseAxiosError`'ın diğer genel yedek mesajları ("Unexpected Error", "Request Failed") hâlâ İngilizce; hedef ebeveyn adayları durum filtresiyle süzülmez (bırakılmış hedef ebeveyn olarak seçilebilir); iç içe geçmiş katman yığını yalnızca `useDialogLayer`/`useEscapeLayer` kullananları bilir (kalan eski overlay'ler S8'de); `useCompleteItem`'da hata uyarısı çağıran tarafta (hook içinde değil).
- **Önerilen commit:** `feat(web): add goals screen, note links panel and ICS export`

## S8: tek ortak Dialog (Faz 3'ün bağımlılıksız kısmı): geçti
- **Eklenen (web):** `components/ui/Dialog.tsx` (rol/aria, odak içeri ve geri, Tab tuzağı, katman yığınında Escape, yalnızca mousedown+mouseup arka plandaysa arka plan kapatma, referans sayımlı kaydırma kilidi, isteğe bağlı `portal`), `hooks/useScrollLock.ts`; ~25 overlay buna taşındı (ortak modal bileşenleri, bağımsız modallar, sayfa içi overlay'ler, Ay gün paneli, MobileBottomNav "Daha fazla" sayfası). `test/overlay-contract.test.ts`: ham `fixed inset-0` kaçışını yakalayan token tabanlı bekçi.
- **Ölçüm:** web 66 dosya / 622 test, tsc temiz, build 28 sayfa; API 103 suite / 1221 test (dokunulmadı).
- **Görsel sözleşme (mekanik doğrulama):** S8'in dokunduğu izlenen dosyalarda diff'ten kaldırılan hiçbir `className` dizesi kaybolmadı (hepsi `overlayClassName`/`panelClassName`'e taşındı), reviewer 25 overlay'in HEAD diff'inde aynı ağaç konumunu doğruladı, yeni sarmalayıcı yok. Tarayıcıda GÖRÜLMEDİ.
- **İnceleme:** bağımsız reviewer + düzeltme turu. HIGH yok. Kapanan MEDIUM: not bağlantısı ekleme diyaloğu, `husrev-settle` animasyonunun bıraktığı `transform` yüzünden `fixed` torunların içerme bloğu olup not modalının içine sıkışıyordu (jsdom göremez): `Dialog` `portal` seçeneği, ve içi satır/panel olan tüm onay pencereleri de portal'a alındı.
- **Kapanan LOW'lar:** isimsiz diyaloglar (+ geliştirmede uyarı), silme onayı `alertdialog`, `Modal` açılışta X'e odaklanıyordu (artık `data-dialog-close` atlanır), IME bileşimi sırasında Escape, `style` ezilmesi, Prettier (yalnızca dilim dosyaları), `overlay-contract` testinin atlatılabilirliği.
- **Davranış değişiklikleri (kasıtlı):** `role="dialog"` arka plan yerine panelde; açık diyalog varken sayfa kaydırması kilitli (öncesinde hiçbirinde yoktu); onay penceresinin arka planına tıklamak artık üst modalı kapatmaz (önceki hata).
- **Bilinen kalan:** `DateTimePicker`'ın mobil sayfası hâlâ diyalog semantiğinden yoksun (izin listesinde, görsel kontrol sonrası taşınmalı); `useDialogLayer.FIRST_FOCUS_SELECTOR` `data-dialog-close`'u atlamaz (yalnızca eski, `Dialog` olmayan overlay'ler kullanır); `LearningPage` içinde `ItemRow` render içinde tanımlı (her render'da yeniden monte olur, önceden var).
- **Önerilen commit:** `feat(web): route every overlay through a shared Dialog with focus trap, Escape layering and scroll lock`

---

# GENEL KAPANIŞ (Faz 0, 1, 2 ve Faz 3'ün bağımlılıksız kısmı)
Kod tarafı bitti. Ölçüm: API 103 suite / 1221 test (başlangıç 74 / 574), web 66 dosya / 622 test (başlangıç 1 test dosyası), iki tsc temiz, web build 28 sayfa. Bağımsız incelemelerde ~10 gerçek HIGH ve ~35 MEDIUM kusur yakalandı ve kapatıldı. Hiçbir şey commit edilmedi; hiçbir migration çalıştırılmadı; gerçek PostgreSQL'e hiçbir bağlantı kurulmadı; tarayıcıda hiçbir şey görülmedi.
- **Sende bekleyen (ben yapamam):** (1) commit, (2) migration'lar sırayla `1715000036000` → `037` → `038` → `039` (`migration:show` ile önce bak), (3) gerçek veritabanında deneme (undo kilitleri, ayna SQL'i, hedef ilerleme sorgusu, ICS), (4) tarayıcıda görsel kontrol: Bugün, Ay, Hafta, Gelen Kutusu, Hedefler, tüm modallar açık/koyu tema, mobil.
- **Onayını bekleyen (ertelenen-adimlar.md):** D-1 eski tabloların DROP'u, D-2 Google Calendar kaldırma (önkoşul ICS dışa aktarma hazır), D-3 okumaların items'a taşınması, D-4 FullCalendar paketi + eski CalendarPage, D-5 Radix/cmdk/dnd-kit, D-6 token geçişi, D-7 MCP araç budama, D-8 saat dilimi tercihi.

## Üretim veritabanı yedeği (2026-10-13)
- **Ne:** `husrevity_prod` (PostgreSQL 16, `iamhusrev-postgres` konteyneri, homelab) `pg_dump -Fc` ile tam yedek. Yalnızca husrevity veritabanı; aynı sunucudaki diğer projelerin veritabanlarına dokunulmadı.
- **Dosya:** `husrevity_prod-20261013-175831.dump` (523.108 bayt, veritabanı 14 MB). Homelab: `~/backups/husrevity/` (700/600), yerel kopya: `~/Backups/husrevity/` (700/600). SHA-256 `b2ff4511e42d1e680721588e987bd5c6d128dae589efb4c86bd5bdbefb955574` (iki uçta aynı). `pg_restore --list` ile 465 TOC girişi okundu.
- **Geri yükleme testi:** YAPILMADI (yalnızca içindekiler listesi doğrulandı).
- **Gizlilik:** dosya şifrelenmiş kasa değerleri, parola ve token özetleri ve e-postalar içerir; repoya veya paylaşılan bir yere konmamalı.
- **Üretim durumu (yedek anında):** uygulanmış migration sayısı 35 (en yenisi `CreateSlackLinks`), yani `036`–`039` HENÜZ uygulanmadı. Yaklaşık satır sayıları: `items` 291, `reminder` 255, `task` 23, `calendar_event` 4, `vault_item` 384, `note` 26, `project` 18, `routine_activity` 40. Üretim DB adı `husrevity_prod`, rol `husrevity`, çalışma kapsayıcıları `husrevity-prod-api` / `husrevity-prod-web`.

## Üretim verisi sıfırlandı (2026-10-14)
- **Karar:** ürün sahibi açık onayla (`evet, sil`) tüm hesapların verisini ve tüm erişim kayıtlarını sildirdi; hesaplar (`app_user`, 4) kaldı. Geri yükleme testi YAPILMADI (sahibin kararı).
- **Yapılan:** `husrevity_prod` üzerinde tek transaction'da `TRUNCATE ... RESTART IDENTITY` (36 tablo): items, item_occurrences, reminder, reminder_list, task, calendar_event, time_block, note, note_tag, note_tag_assignment, project, project_member, project_invite, learning_item/subtopic/topic, routine_segment/activity, sport_log/profile/program/session, vault_entity, vault_item, notification, outbox_events, idempotency_key, user_invite, personal_access_token, refresh_token, push_subscription, device, integration_account, external_link, telegram_link, slack_link.
- **Korunan:** `app_user` (4), `migrations` (35, şema sürümü), `pgboss.*` (iş kuyruğu altyapısı); aynı sunucudaki diğer projelerin veritabanlarına dokunulmadı.
- **Doğrulama:** silmeden önce ve sonra satır sayıları yazdırıldı; korunan tabloların sayısı değişirse transaction'ın geri alınması koşulu vardı (değişmedi).
- **Silme öncesi son yedek:** `husrevity_prod-pre-reset-20261014-062436.dump` (539.308 bayt, SHA-256 `2936eee2a80795ded454d01c0914ab6719d6bf0db7e5d4442b5a24ba94741791`, iki uçta aynı). Homelab `~/backups/husrevity/` ve yerel `~/Backups/husrevity/` (700/600). Ondan önceki ilk yedek de duruyor.
- **Sonuçlar:** herkes çıkış yaptı (giriş mevcut parolalarla); Claude MCP token'ları gitti (yenisi üretilmeli); Google/Telegram/Slack bağlantıları kopuk; kasa kayıtları yalnızca yedekte (açmak için API ortamındaki şifreleme anahtarı gerekir).
- **Dikkat:** üretimde hâlâ eski sürüm çalışıyor ve 036–039 migration'ları uygulanmadı. Dağıtım (ve `migration:run`) ürün sahibinin adımı. pgboss kuyruğunda silinen kayıtlara ait bekleyen/geçmiş işler olabilir; eski sürüm bunları işlerken hata günlüğü üretebilir (önemsiz).

## Yayın öncesi prova (2026-10-14): geçti, iki gerçek hata yakalandı ve düzeltildi
- **Ne yapıldı:** yerel, geçici bir `postgres:16` konteynerinde (`husrevity-migration-rehearsal`, yalnızca 127.0.0.1:54399, üretimle bağlantısı yok): (1) boş veritabanında Baseline → 039 zinciri, (2) silme öncesi üretim yedeği geri yüklenip (aynı zamanda yedeğin geri yükleme testi) 036–039 uygulandı, (3) API üretimdeki gibi derlenmiş JS ile (`nest build` + `node dist/main.js`) kopya veritabanına bağlı ayağa kaldırıldı ve uçtan uca duman testi yapıldı.
- **Sonuç:** boş DB'de 39 migration, 42 tablo, `exit 0`. Gerçek veride 35 → 39, `items` 291 → 315 (+24: task 1, reminder 22, calendar_event 1 satırı aynalanmamıştı, reconcile tamamladı), drift 0, ikinci çalıştırma işlem yapmıyor. Yedek geri yüklemede satır sayıları üretimle birebir tuttu. Duman testi: health UP, kayıt, `/today`, `/goals` oluştur/listele, `/items` oluştur, `/items?inbox=true`, `/items?goalId=`, `/items/export.ics` (BEGIN:VCALENDAR), `/change-sets` 200; admin olmayan için `/admin/item-mirror/drift` 403.
- **Yakalanan hata 1 (aralıklı):** `change-set/entities/change-entry.entity.ts` ve `change-set.entity.ts` birbirini import ediyor; `changeSet?: ChangeSet` alanı `emitDecoratorMetadata` yüzünden sınıf tanımlanırken doğrudan başvuruda bulunuyordu. TypeORM'in glob yükleyicisi dosyaları eşzamansız yüklediği için yükleme sırasına göre `ReferenceError: Cannot access 'ChangeSet' before initialization` veriyordu: aynı kodla bir çalıştırmada geçti, diğerinde `migration:run` patladı. Üretimde açılışta veya migration'da aralıklı çökme olurdu. Düzeltme: ilişki alanları `Relation<T>` (`import type`). Aynı sınıftan iki yer daha vardı (`integrations/external-link.entity.ts`, `note-link/note-link.entity.ts`).
- **Yakalanan hata 2 (benim düzeltmemin yan etkisi):** `Relation` TypeORM'de yalnızca tür; Jest tür silmesiyle geçti ama Bun'da `Export named 'Relation' not found`. `import type` ile giderildi. Ders: Jest yeşil ≠ Bun çalışma zamanı yeşil; prova bunu ancak gerçek çalıştırmayla gösterdi.
- **Kalıcı koruma:** `src/db/entity-relation-types.spec.ts`: bir entity'de çıplak sınıf tipli `ManyToOne/OneToOne` alanı kalırsa test kırılır.
- **Ölçüm:** API 104 suite / 1223 test, tsc temiz.
- **Geçici konteyner:** durduruldu, SİLİNMEDİ (`docker rm` için ürün sahibinin onayı gerekir).
- **Üretim:** değişmedi. Eski sürüm çalışıyor, 036–039 uygulanmadı, veritabanı boş (hesaplar duruyor).
