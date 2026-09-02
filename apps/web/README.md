# husrevity

> Sakin, sıcak bir kişisel verimlilik panosu. Notlarım, anımsatıcılarım, görevlerim, takvimim, Gmail'im ve şifrelerim — hepsi tek bir yerde.

Next.js 15 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4 üzerine kurulu, kendi Java Spring Boot API'mle konuşan bir admin dashboard. **Husrev** adını verdiğim sıcak tasarım dilini (cream, sand, ink, amber, ember, moss + Outfit / Instrument Serif / JetBrains Mono triology'si + warm card shadow + paper-grain doku) bütüne yansıtır.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Ekran görüntüleri](#ekran-görüntüleri)
- [Tasarım dili](#tasarım-dili)
- [Teknoloji yığını](#teknoloji-yığını)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [Proje yapısı](#proje-yapısı)
- [Backend](#backend)
- [Yol haritası](#yol-haritası)

---

## Özellikler

| Modül             | Ne yapar                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Dashboard**     | KPI kartları, bugünün ajandası, yaklaşan/geciken anımsatıcılar, görev durum dağılımı, son notlar  |
| **Notlar**        | Markdown gövde, etiketler, sabitleme (pin), sürükle-bırak sıralama, modal düzenleme               |
| **Anımsatıcılar** | Liste bazlı anımsatıcılar, öncelik + zaman damgası, geciken/bugün/bu hafta gruplaması             |
| **Projeler**      | Kanban + List görünümü, durum/öncelik etiketleri, sürükle-bırak görev taşıma, alt görev sayaçları |
| **Takvim**        | FullCalendar (day / week / month / list), bugünün hücresi amber vurguluk, mono gün başlıkları     |
| **Gmail**         | Bağlı Gmail hesapları, thread listesi, sand-ring satır hover                                      |
| **Vault**         | AES-256-GCM at-rest şifreli kimlik bilgisi yöneticisi (.env import/export), kopyalama maskeleme   |
| **Ayarlar**       | Profil, tema (warm-light / warm-dark), dil (TR/EN)                                                |

Tüm modüller TanStack Query v5 ile cachelenir; mutation'lar optimistic + invalidation ile çalışır. Form'lar React Hook Form + Zod resolver; doğrulama mesajları Türkçe.

---

## Ekran görüntüleri

> Ekran görüntülerini `docs/screenshots/` klasörüne ekleyince burada otomatik gözükür.

| Light                                                    | Dark                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| ![Dashboard light](docs/screenshots/dashboard-light.png) | ![Dashboard dark](docs/screenshots/dashboard-dark.png) |
| ![Notes light](docs/screenshots/notes-light.png)         | ![Notes dark](docs/screenshots/notes-dark.png)         |
| ![Vault light](docs/screenshots/vault-light.png)         | ![Vault dark](docs/screenshots/vault-dark.png)         |

---

## Tasarım dili

**Husrev**, Anthropic tarzı admin tasarım sisteminin üzerine oturan sıcak / "kâğıt hissi" veren bir katman:

- **Renkler**: `cream #f6f3ec`, `sand #ebe5d6`, `ink #1a1814`, `shadow #2b2823`, `amber #c8732e`, `ember #a14d18`, `moss #5a6b3a`. Brand rampası (eski mavi) tamamen sıcak ember/amber'a remap edildi; primary CTA'lar artık `bg-brand-500` (ember) renginde.
- **Tipografi**: gövde için **Outfit** (300–700), display vurgusu için **Instrument Serif** italik tek-iki kelimede ("İyi _akşamlar_", "henüz bir şey _yok_"), sayaç/breadcrumb/kısayollar için **JetBrains Mono**.
- **Yüzeyler**: tüm kartlarda `shadow-card-warm` (içe doğru beyaz vurgu + dış sıcak gölge) + `ring-1 ring-husrev-sand/90`. Sayfa zemininde `.grain` paper-texture katmanı (light'ta multiply, dark'ta screen blend).
- **Vurgu**: serif italic kelime altında `linear-gradient` ile %35 amber alt-çizgi, sidebar AI öneri kartı, mono ⌘K chip.
- **Semantik renkler**: yıkıcı için `red`, başarı için `success` (yeşil), bilgi için `blue-light` (cyan) — bu üçü evrensel anlamları için aynen korundu.

Tasarım handoff referansı: ileride paylaşılır.

---

## Teknoloji yığını

| Katman          | Paket                                                        |
| --------------- | ------------------------------------------------------------ |
| Framework       | Next.js 15 (App Router), React 19, TypeScript 5              |
| Styling         | Tailwind CSS 4 (`@theme` token'ları, `@custom-variant dark`) |
| Server state    | TanStack Query 5 (+ Devtools)                                |
| Tablolar        | TanStack Table 8                                             |
| Form'lar        | React Hook Form 7 + Zod 4                                    |
| HTTP            | Axios + JWT Bearer + auto-refresh interceptor                |
| Yerel state     | Zustand (alert store)                                        |
| i18n            | i18next + react-i18next + http-backend (TR/EN)               |
| UI yardımcıları | react-icons, react-dnd (HTML5 backend), simplebar-react      |
| Takvim          | FullCalendar (daygrid + timegrid + list + interaction)       |
| Grafikler       | ApexCharts                                                   |
| Form girdileri  | flatpickr (date), react-dropzone (file)                      |
| Haritalar       | react-leaflet, @react-jvectormap                             |

---

## Hızlı başlangıç

```bash
npm install
cp .env.example .env.local       # NEXT_PUBLIC_API_URL'i kontrol et
npm run dev                       # http://localhost:3090
```

Build / lint:

```bash
npm run build
npm run lint
```

Docker imajı çıkarmak istersen `dockerfile` repo kökünde mevcut.

---

## Ortam değişkenleri

`.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8762/husrevity/dev
```

Backend Spring Cloud Gateway'in arkasında çalışır; bu URL gateway'e işaret eder.

---

## Proje yapısı

```
src/
├── app/
│   ├── (auth)/                  # /login, /register
│   ├── (app)/                   # auth-gated dashboard alanı
│   │   ├── layout.tsx           # auth check + sidebar/header chrome
│   │   ├── dashboard/
│   │   ├── notes/
│   │   ├── reminders/
│   │   ├── projects/[code]/
│   │   ├── calendar/
│   │   ├── gmail/
│   │   ├── vault/
│   │   └── settings/profile/
│   ├── error-404/, error-500/, error-503/
│   ├── coming-soon/, maintenance/, success/
│   ├── layout.tsx               # root: provider stack + font wiring
│   ├── globals.css              # Tailwind v4 @theme, husrev tokens, keyframes, .grain
│   └── page.tsx                 # /  →  redirect /login
│
├── components/                  # Button, Card, Modal, FormField*, Badge, Avatar, DataTable, ...
│   ├── dashboard/StatCard.tsx
│   ├── form/FormFieldText.tsx, FormFieldTextarea.tsx, FormFieldCheckbox.tsx, ...
│   ├── header/                  # search, theme toggle, language, clock, notifications
│   └── modal/                   # Modal + DeleteConfirmModal
│
├── views/                       # sayfa-seviyesi bileşik component'ler
│   ├── notes/, vault/, projects/, calendar/, gmail/, reminders/, settings/, auth/
│
├── hooks/                       # useNotes, useVault, useProjects,
│                                # useCalendarEvents, useGmail, useReminders, useModal, useGoBack
│
├── services/                    # api-client.ts, http-service.ts, ve domain servisleri
├── providers/                   # Auth, Theme, Sidebar, ReactQuery, I18n
├── stores/                      # Zustand alert-store
├── layout/                      # AppSidebar, AppHeader, Backdrop
├── icons/                       # ~64 inline SVG icon component
├── messages/                    # i18n JSON: tr.json, en.json
├── utils/                       # api-endpoints, constants-url, handleError, ...
└── types/                       # TS arayüzleri (note, vault, project, ...)
```

---

## Backend

Bu UI, kişisel **issue-tracker-microservices** Spring Boot projemle konuşur (multi-tenant, JWT auth). Tüm istekler:

- `Authorization: Bearer <jwt>` header'ı ile gider (`api-client.ts` interceptor).
- 401 alınırsa otomatik refresh token ile yeniden denenir.
- Cevap formatı: `ApiResponse<T> = { success, message, result, meta?, errors? }`.

Backend'i lokal çalıştırmak için ayrı projedeki Docker Compose veya `mvn spring-boot:run` kullan.

---

## Yol haritası

- [ ] `/board` — Husrev tasarım handoff'undaki Kanban screen (dnd-kit + ghost rotate + amber drop indicator pulse)
- [ ] Quick capture (⌘K) komut paleti
- [ ] Görev detay drawer'ı (sağdan slide-in 480px)
- [ ] Vault — auto-clear clipboard + idle auto-mask (handoff §4.3)
- [ ] Self-hosted fontlar (`next/font/local`) — Google Fonts dependency'sini kaldır
- [ ] Mobile bottom nav

---

Kişisel proje — kendi günlük araç setim. PR / issue alırım ama public roadmap niyetim yok.
