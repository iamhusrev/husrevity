# CLAUDE.md

App-level guidance for `apps/web`. The root `CLAUDE.md` covers the monorepo —
read that first. This file only documents what's specific to the web app.

## About

husrevity-web is the Next.js 15 frontend for the NestJS API in `apps/api`.
Stack: Next.js 15 App Router + React 19 + TypeScript 5 (strict) + Tailwind CSS 4
+ TanStack Query v5 + react-hook-form + zod.

## Commands

```bash
bun install          # from repo root, workspaces install everything
bun run dev          # from repo root, runs api+web together
bun run dev:web      # web only — http://localhost:3090
bun run lint         # from apps/web/, next lint (eslint v9)
bun run build        # next build
```

No test runner is configured yet.

## Environment

`apps/web/.env.local` (copy from `.env.example`):

```env
NEXT_PUBLIC_API_URL=http://localhost:4090/api
```

The API runs on port **4090** with global prefix `/api`. That's the only env
the web app needs. (No default 3000/4000 in this project — owner policy.)

## Architecture

### Route Groups (App Router)

- `src/app/(landing)/` — public marketing pages
- `src/app/(auth)/` — login page
- `src/app/(app)/` — protected app pages; `(app)/layout.tsx` redirects
  unauthenticated users to `/login`. Domain pages: `dashboard`, `notes`,
  `lists`, `projects`, `tasks`, `plans`, `calendar`, `reminders`,
  `vault`, `finance`, `settings`, `admin`.

### Provider Stack (root `layout.tsx`)

`I18nProvider` → `ReactQueryProvider` → `AuthProvider` → `ThemeProvider` →
`SidebarProvider`.

### Authentication Flow

- `AuthProvider` (`src/providers/AuthProvider.tsx`) stores JWT in
  `localStorage` and exposes `useAuth()`.
- `services/auth-service.ts` handles login/refresh/logout + `getMe()`.
- `services/api-client.ts` (axios) injects the Bearer token and auto-refreshes
  on 401/403 (skipping `/auth/*` to avoid loops).
- `services/auth-events.ts` is the pub/sub bridge for forced logout from
  inside the interceptor.

### Data Fetching Pattern

Per-domain hooks in `src/hooks/` wrap TanStack Query, each calling a
matching service in `src/services/`. Each hook file exports the full CRUD set
(`useX`, `useCreateX`, `useUpdateX`, `useDeleteX`). Existing examples:
`useNotes`, `useLists`, `useProjects`, `usePlans`, `useCalendarEvents`,
`useReminders`, `useVault`, `useAi` (suggestions only), `useFinance`, `useTimeBlocks`,
`useNotifications`, `useAdmin`. Follow this pattern for new domains.

### Backend Contract

API responses use the NestJS envelope: `{ success, message, code, data }`.
When the web and API disagree, the API is the source of truth — fix the web.
Endpoint strings live in `src/utils/api-endpoints.ts`.

### State Management

- Auth: `AuthProvider` (Context)
- Sidebar: `SidebarContext`
- Theme: `ThemeContext`
- Server state: TanStack Query v5
- A `stores/` folder exists for Zustand if needed (not heavily used yet)

### i18n

`react-i18next` + `i18next-http-backend` + browser language detector. Messages
in `src/messages/{en,tr}.json`. `<html lang>` is set dynamically from
`i18n.language`.

### SVG Imports

SVGs become React components via `@svgr/webpack` (`next.config.ts`).

### Key Conventions

- `"use client"` only when truly needed (hooks, browser APIs); default is
  Server Component
- Path alias `@/` → `src/`
- TypeScript strict — no `any`, use `unknown` + narrowing
- Tailwind CSS 4: `@theme` directive + CSS variables
- Forms: react-hook-form + zod
- Commit messages: no AI attribution — see root `~/.claude/CLAUDE.md`
  HARD CONSTRAINT #1.
