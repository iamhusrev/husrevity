# husrevity

> A calm, warm personal productivity dashboard. My notes, reminders, tasks, calendar, Gmail, and passwords — all in one place.

An admin dashboard built on Next.js 15 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4, communicating with my own Java Spring Boot API. Reflects the warm design language named **Husrev** (cream, sand, ink, amber, ember, moss + Outfit / Instrument Serif / JetBrains Mono trilogy + warm card shadow + paper-grain texture) throughout the system.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Design Language](#design-language)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Backend](#backend)
- [Roadmap](#roadmap)

---

## Features

| Module            | What it does                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Dashboard**     | KPI cards, today's agenda, upcoming/overdue reminders, task status distribution, recent notes    |
| **Notes**         | Markdown body, tags, pinning, drag-and-drop ordering, modal editing                               |
| **Reminders**     | List-based reminders, priority + timestamp, overdue/today/this week grouping                      |
| **Projects**      | Kanban + List view, status/priority tags, drag-and-drop task moving, subtask counters            |
| **Calendar**      | FullCalendar (day / week / month / list), today's cell highlighted amber, mono day headers        |
| **Gmail**         | Connected Gmail accounts, thread list, sand-ring row hover                                        |
| **Vault**         | AES-256-GCM at-rest encrypted credential manager (.env import/export), copy masking              |
| **Settings**      | Profile, theme (warm-light / warm-dark), language (TR/EN)                                         |

All modules are cached with TanStack Query v5; mutations work via optimistic updates + invalidation. Forms use React Hook Form + Zod resolver; validation messages in Turkish.

---

## Screenshots

> Once screenshot images are added to the `docs/screenshots/` folder, they automatically appear here.

| Light                                                    | Dark                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| ![Dashboard light](docs/screenshots/dashboard-light.png) | ![Dashboard dark](docs/screenshots/dashboard-dark.png) |
| ![Notes light](docs/screenshots/notes-light.png)         | ![Notes dark](docs/screenshots/notes-dark.png)         |
| ![Vault light](docs/screenshots/vault-light.png)         | ![Vault dark](docs/screenshots/vault-dark.png)         |

---

## Design Language

**Husrev** is a layer sitting on top of an Anthropic-style admin design system, providing a warm / "paper feel":

- **Colors**: `cream #f6f3ec`, `sand #ebe5d6`, `ink #1a1814`, `shadow #2b2823`, `amber #c8732e`, `ember #a14d18`, `moss #5a6b3a`. The brand ramp (former blue) is completely remapped to warm ember/amber; primary CTAs are now in `bg-brand-500` (ember).
- **Typography**: **Outfit** (300–700) for body, **Instrument Serif** italic on key display words ("Good _evening_", "nothing _yet_"), **JetBrains Mono** for counters/breadcrumbs/shortcuts.
- **Surfaces**: `shadow-card-warm` (inner white highlight + outer warm shadow) + `ring-1 ring-husrev-sand/90` on all cards. `.grain` paper-texture layer on page background (multiply blend in light, screen blend in dark).
- **Accent**: 35% amber underline via `linear-gradient` under serif italic words, sidebar AI suggestion card, mono ⌘K chip.
- **Semantic colors**: `red` for destructive, `success` (green) for success, `blue-light` (cyan) for info — these three are preserved as-is for their universal meaning.

Design handoff reference: to be shared later.

---

## Tech Stack

| Layer           | Package                                                      |
| --------------- | ------------------------------------------------------------ |
| Framework       | Next.js 15 (App Router), React 19, TypeScript 5              |
| Styling         | Tailwind CSS 4 (`@theme` tokens, `@custom-variant dark`)    |
| Server state    | TanStack Query 5 (+ Devtools)                                |
| Tables          | TanStack Table 8                                             |
| Forms           | React Hook Form 7 + Zod 4                                    |
| HTTP            | Axios + JWT Bearer + auto-refresh interceptor                |
| Local state     | Zustand (alert store)                                        |
| i18n            | i18next + react-i18next + http-backend (TR/EN)               |
| UI helpers      | react-icons, react-dnd (HTML5 backend), simplebar-react      |
| Calendar        | FullCalendar (daygrid + timegrid + list + interaction)       |
| Charts          | ApexCharts                                                   |
| Form inputs     | flatpickr (date), react-dropzone (file)                      |
| Maps            | react-leaflet, @react-jvectormap                             |

---

## Quick Start

```bash
npm install
cp .env.example .env.local       # Check NEXT_PUBLIC_API_URL
npm run dev                       # http://localhost:3090
```

Build / lint:

```bash
npm run build
npm run lint
```

If you want to build a Docker image, `dockerfile` is available at the repository root.

---

## Environment Variables

`.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8762/husrevity/dev
```

Backend runs behind Spring Cloud Gateway; this URL points to the gateway.

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                  # /login, /register
│   ├── (app)/                   # auth-gated dashboard area
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
├── views/                       # page-level composite components
│   ├── notes/, vault/, projects/, calendar/, gmail/, reminders/, settings/, auth/
│
├── hooks/                       # useNotes, useVault, useProjects,
│                                # useCalendarEvents, useGmail, useReminders, useModal, useGoBack
│
├── services/                    # api-client.ts, http-service.ts, and domain services
├── providers/                   # Auth, Theme, Sidebar, ReactQuery, I18n
├── stores/                      # Zustand alert-store
├── layout/                      # AppSidebar, AppHeader, Backdrop
├── icons/                       # ~64 inline SVG icon components
├── messages/                    # i18n JSON: tr.json, en.json
├── utils/                       # api-endpoints, constants-url, handleError, ...
└── types/                       # TS interfaces (note, vault, project, ...)
```

---

## Backend

This UI communicates with my personal **issue-tracker-microservices** Spring Boot project (multi-tenant, JWT auth). All requests:

- Sent with `Authorization: Bearer <jwt>` header (`api-client.ts` interceptor).
- If 401 is received, automatically retried with refresh token.
- Response format: `ApiResponse<T> = { success, message, result, meta?, errors? }`.

To run the backend locally, use Docker Compose or `mvn spring-boot:run` in the separate project.

---

## Roadmap

- [ ] `/board` — Kanban screen from Husrev design handoff (dnd-kit + ghost rotate + amber drop indicator pulse)
- [ ] Quick capture (⌘K) command palette
- [ ] Task detail drawer (slide-in from right 480px)
- [ ] Vault — auto-clear clipboard + idle auto-mask (handoff §4.3)
- [ ] Self-hosted fonts (`next/font/local`) — remove Google Fonts dependency
- [ ] Mobile bottom nav

---

Personal project — my daily toolkit. I accept PRs / issues, but have no intention of a public roadmap.
