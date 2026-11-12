# Buzzie Frontend — Architecture & Build Guide

> Purpose: a complete, phased blueprint for building the Buzzie frontend so it is
> production-grade and **not** a generic "chat app clone". This document covers
> architecture, data flow, state, realtime, UX, testing, deployment, and a
> phase-by-phase build plan with acceptance criteria.
>
> Scope: planning only. Nothing in `src/` is changed by this document.

---

## Table of Contents

1. [Product scope and differentiators](#1-product-scope-and-differentiators)
2. [Current frontend state](#2-current-frontend-state)
3. [Tech stack](#3-tech-stack)
4. [High-level architecture](#4-high-level-architecture)
5. [Folder structure](#5-folder-structure)
6. [Data flow and state taxonomy](#6-data-flow-and-state-taxonomy)
7. [Routing and guards](#7-routing-and-guards)
8. [API layer](#8-api-layer)
9. [Realtime / Socket.IO layer](#9-realtime--socketio-layer)
10. [Zustand stores](#10-zustand-stores)
11. [Component architecture](#11-component-architecture)
12. [Core UX flows](#12-core-ux-flows)
13. [Forms and validation](#13-forms-and-validation)
14. [Media handling](#14-media-handling)
15. [Theming, design system, accessibility](#15-theming-design-system-accessibility)
16. [Performance](#16-performance)
17. [Error handling and resilience](#17-error-handling-and-resilience)
18. [Testing strategy](#18-testing-strategy)
19. [Tooling and environment](#19-tooling-and-environment)
20. [Deployment](#20-deployment)
21. [Build phases (detailed)](#21-build-phases-detailed)
22. [Definition of done / quality gates](#22-definition-of-done--quality-gates)
23. [Backend gaps that block frontend features](#23-backend-gaps-that-block-frontend-features)
24. [Interview talking points](#24-interview-talking-points)

---

## 1. Product scope and differentiators

### 1.1 Core features (supported by the current backend)

| Feature | Backend support |
|---|---|
| Register / login / logout / session status | `POST /auth/*`, `GET /auth/status` |
| User search + pagination | `GET /users?search=&page=&limit=` |
| 1-to-1 chat create (idempotent) | `POST /chats` with `participantId` |
| Group chat create | `POST /chats` with `isGroup: true` |
| List chats (sorted by last message) | `GET /chats` |
| Get chat + latest 50 messages | `GET /chats/:id` |
| Cursor-paginated messages | `GET /messages?chatId=&cursor=&limit=` |
| Send text / media messages | `POST /messages` |
| Reply to a message | `replyToId` on send |
| Soft-delete own message | `DELETE /messages/:chatId/:messageId` |
| Mark chat read | `PATCH /messages/:chatId/read` |
| Group admin: add/remove member, rename, avatar | `PATCH /chats/:id/*` |
| Real-time messages, chat updates, presence, typing, read receipts | Socket.IO events |
| Media upload via Cloudinary | `mediaUrl` (base64 or URL) on send |

### 1.2 Differentiators (make it memorable)

Do not compete on "it has chat bubbles". Compete on **engineering and UX depth**.
Pick a coherent theme: **"keyboard-first, resilient, real-time workspace messenger."**

Non-generic pillars to implement in the frontend:

1. **Resilient realtime UX**
   - Optimistic send with temp IDs and reconciliation.
   - Offline message queue (localStorage/IndexedDB) flushed on reconnect.
   - Missed-message backfill after reconnect (`?since=` / cursor fetch).
   - Deduplication by message `_id`, stable ordering, no flicker.
2. **Keyboard-first command center**
   - `Cmd/Ctrl+K` command palette: jump to chat, search users, create group, toggle theme.
   - Shortcuts: `Cmd/Ctrl+Enter` send, `Esc` close, `↑` edit last (optional), `/` focus search.
3. **Local-first chat state**
   - Drafts persisted per chat.
   - Unread counts and "new messages" divider.
   - Scroll position restoration per chat.
4. **Search that feels instant**
   - Client-side instant filter of loaded chats + server user search (debounced).
   - Later: server-side message search (needs backend support; see §23).
5. **Polished presence and receipts**
   - Online/offline dots, last-seen formatting, typing indicators, read ticks.
6. **Accessibility + responsiveness**
   - Full keyboard nav, focus rings, ARIA labels, reduced-motion support.
   - Mobile drawer layout, not just a squeezed desktop UI.
7. **Performance proof**
   - Virtualized message list, code-split routes, measured bundle and LCP budgets.
   - Published Lighthouse/performance numbers in the README.

> Rule: every feature you add must have a clear answer to "why is this hard?"
> If it is trivial, it is not a differentiator.

---

## 2. Current frontend state

What already exists:

- Vite 8 + React 19 + TypeScript 6 scaffold.
- Tailwind 4 with shadcn tokens in `src/index.css`.
- `ThemeProvider` + `ModeToggle` (dark/light/system).
- shadcn UI primitives in `src/components/ui/` (button, input, avatar, dropdown,
  card, checkbox, popover, separator, sonner, spinner, textarea, etc.).
- `BrowserRouter` + `Toaster` mounted in `src/main.tsx`.
- Path alias `@/*` → `src/*` configured in Vite and TS.
- Empty placeholders: `App.tsx` returns `<div />`, and `src/routes/*`,
  `src/pages/auth/*` are empty files.

What is missing: everything else. This guide defines it.

---

## 3. Tech stack

### 3.1 Already installed

| Concern | Library | Version |
|---|---|---|
| UI framework | React | `^19.2.6` |
| Build | Vite | `^8.0.12` |
| Language | TypeScript | `~6.0.2` |
| Styling | Tailwind CSS | `^4.3.0` |
| Components | shadcn (`radix-mira`) + `radix-ui` | `^4.11.0` / `^1.5.0` |
| Icons | `@hugeicons/react` + core-free-icons | `^1.1.6` |
| Routing | `react-router-dom` | `^7.17.0` |
| Client state | `zustand` | `^5.0.14` |
| Validation | `zod` | `^4.4.3` |
| Toasts | `sonner` | `^2.0.7` |
| Dates | `date-fns` | `^4.4.0` |
| IDs | `uuid` | `^14.0.0` |
| Realtime | `socket.io-client` | `^4.8.3` |
| Class utils | `clsx`, `tailwind-merge`, `class-variance-authority` | installed |

### 3.2 Recommended additions

These are strongly recommended; each has a fallback if you want to avoid deps.

| Addition | Why | Fallback |
|---|---|---|
| `@tanstack/react-query` | Server-state caching, retries, invalidation, infinite queries for message pagination. | Hand-rolled `useAsync` + Zustand cache (more code, more bugs). |
| `react-hook-form` + `@hookform/resolvers` | Ergonomic forms with Zod schemas shared with backend rules. | Controlled inputs + manual validation (acceptable for 2 forms). |
| `@tanstack/react-virtual` | Virtualize long message lists and chat lists. | CSS `content-visibility` + windowing (weaker). |
| `vitest` + `@testing-library/react` + `jsdom` | Unit/component tests. | None — needed for credibility. |
| `msw` | Mock REST in tests and local dev. | Manual fetch mocks. |
| `@playwright/test` | E2E for auth + send message + reconnect. | Manual QA only (weaker). |
| `idb-keyval` or `dexie` | Offline queue and draft persistence beyond localStorage limits. | localStorage (fine for MVP). |

> Install additions only when the phase that needs them starts. Do not add all at once.

---

## 4. High-level architecture

### 4.1 Layers

```
┌─────────────────────────────────────────────────────────────┐
│  App Shell (providers, router, error boundary, toaster)      │
├─────────────────────────────────────────────────────────────┤
│  Pages (route-level screens, lazy loaded)                    │
├─────────────────────────────────────────────────────────────┤
│  Features (chat, auth, group, search) — hooks + components   │
├─────────────────────────────────────────────────────────────┤
│  Shared components (layout, ui primitives, patterns)         │
├─────────────────────────────────────────────────────────────┤
│  State: TanStack Query (server) + Zustand (client/realtime)  │
├─────────────────────────────────────────────────────────────┤
│  Transport: lib/api (REST) + lib/socket (Socket.IO)          │
├─────────────────────────────────────────────────────────────┤
│  Backend: /api/v1 + Socket.IO                                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Principles

- **Feature-first**, not type-first. A feature owns its hooks, components, and
  types; shared code lives in `components/`, `lib/`, `stores/`, `types/`.
- **Server state is not client state.** Never copy server data into Zustand
  "just in case". Use Query cache as the source of truth; use Zustand for
  realtime deltas, presence, typing, drafts, UI.
- **One socket, one source of truth.** A singleton socket connects after auth and
  dispatches into stores/query cache. Components never create sockets.
- **Types mirror the backend contract.** Define `User`, `Chat`, `Message`, and
  socket payloads once in `src/types/`, reuse everywhere.
- **Everything degrades gracefully.** Loading, empty, error, offline, and
  unauthenticated states are designed, not afterthoughts.

### 4.3 Runtime data flow

```
User action
   │
   ├─ REST mutation (lib/api) ──▶ TanStack Query mutation
   │        │                         │
   │        │                         ├─ optimistic update
   │        │                         └─ invalidate/refetch
   │        ▼
   │   Backend /api/v1
   │
   └─ Socket emit (lib/socket)
            │
            ▼
       Backend Socket.IO
            │
            ▼
   socket event handler
        ├─ update Query cache (messages, chats)
        └─ update Zustand (presence, typing, receipts)
```

---

## 5. Folder structure

```
client/
├── .env.example
├── index.html
├── vite.config.ts
├── components.json
├── src/
│   ├── main.tsx                     # providers: QueryClient, Router, Theme, Toaster
│   ├── App.tsx                      # AppRouter + ErrorBoundary + AuthBootstrap
│   ├── index.css
│   │
│   ├── app/
│   │   ├── providers.tsx            # compose all providers
│   │   ├── error-boundary.tsx
│   │   ├── query-client.ts          # QueryClient config
│   │   └── auth-bootstrap.tsx       # /auth/status on load, gate children
│   │
│   ├── routes/
│   │   ├── index.tsx                # createBrowserRouter route tree
│   │   ├── routes.tsx               # route path constants
│   │   ├── route-guard.tsx          # <ProtectedRoute>, <PublicOnlyRoute>
│   │   └── lazy.tsx                 # React.lazy wrappers + Suspense fallbacks
│   │
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── sign-in.tsx
│   │   │   └── sign-up.tsx
│   │   ├── chat/
│   │   │   ├── chat-shell.tsx       # sidebar + outlet
│   │   │   ├── chat-empty.tsx       # "select a conversation"
│   │   │   └── chat-room.tsx        # /chats/:chatId
│   │   ├── settings/
│   │   │   └── settings.tsx
│   │   └── not-found.tsx
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── api.ts               # login/register/logout/status
│   │   │   ├── hooks.ts             # useLogin, useRegister, useSession
│   │   │   ├── schemas.ts           # zod forms
│   │   │   └── components/
│   │   │       ├── sign-in-form.tsx
│   │   │       └── sign-up-form.tsx
│   │   ├── chat-list/
│   │   │   ├── api.ts               # getChats
│   │   │   ├── hooks.ts             # useChats
│   │   │   └── components/
│   │   │       ├── chat-list.tsx
│   │   │       ├── chat-list-item.tsx
│   │   │       ├── chat-list-skeleton.tsx
│   │   │       └── new-chat-dialog.tsx
│   │   ├── chat-room/
│   │   │   ├── api.ts               # getChat, getMessages, sendMessage...
│   │   │   ├── hooks.ts             # useChat, useMessages (infinite)
│   │   │   └── components/
│   │   │       ├── chat-header.tsx
│   │   │       ├── message-list.tsx
│   │   │       ├── message-item.tsx
│   │   │       ├── message-bubble.tsx
│   │   │       ├── message-composer.tsx
│   │   │       ├── message-actions.tsx
│   │   │       ├── reply-preview.tsx
│   │   │       ├── typing-indicator.tsx
│   │   │       ├── date-divider.tsx
│   │   │       └── scroll-to-bottom.tsx
│   │   ├── group/
│   │   │   ├── api.ts
│   │   │   ├── hooks.ts
│   │   │   └── components/
│   │   │       ├── create-group-dialog.tsx
│   │   │       ├── group-info-panel.tsx
│   │   │       ├── member-list.tsx
│   │   │       └── add-member-dialog.tsx
│   │   ├── users/
│   │   │   ├── api.ts               # search users
│   │   │   ├── hooks.ts             # useUserSearch (debounced)
│   │   │   └── components/user-picker.tsx
│   │   ├── presence/
│   │   │   └── hooks.ts             # usePresence, useUserOnline
│   │   └── command-palette/
│   │       └── command-palette.tsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   └── top-bar.tsx
│   │   ├── common/
│   │   │   ├── user-avatar.tsx
│   │   │   ├── online-dot.tsx
│   │   │   ├── relative-time.tsx
│   │   │   ├── empty-state.tsx
│   │   │   ├── error-state.tsx
│   │   │   ├── confirm-dialog.tsx
│   │   │   └── full-page-loader.tsx
│   │   └── ui/                      # existing shadcn primitives
│   │
│   ├── lib/
│   │   ├── api-client.ts            # fetch wrapper (credentials, errors)
│   │   ├── socket.ts                # singleton socket + typed emit/on
│   │   ├── socket-events.ts         # event names + payload types
│   │   ├── query-keys.ts            # centralized query keys
│   │   ├── env.ts                   # import.meta.env access
│   │   ├── format.ts                # dates, bytes, names
│   │   ├── storage.ts               # safe localStorage helpers
│   │   └── utils.ts                 # existing cn()
│   │
│   ├── stores/
│   │   ├── auth-store.ts
│   │   ├── presence-store.ts
│   │   ├── typing-store.ts
│   │   ├── ui-store.ts
│   │   └── draft-store.ts
│   │
│   ├── hooks/
│   │   ├── use-debounce.ts
│   │   ├── use-media-query.ts
│   │   ├── use-online-status.ts
│   │   ├── use-keyboard-shortcut.ts
│   │   └── use-intersection.ts
│   │
│   └── types/
│       ├── models.ts                # User, Chat, Message
│       ├── api.ts                   # request/response envelopes
│       └── socket.ts                # client/server event maps
```

---

## 6. Data flow and state taxonomy

### 6.1 What goes where

| State | Owner | Examples |
|---|---|---|
| Server state | TanStack Query cache | chats list, messages, current user, user search results |
| Realtime ephemeral | Zustand | online users, typing users, socket status |
| Local UI | Zustand or component | sidebar open, active dialog, command palette |
| Persisted local | Zustand `persist` / storage | theme, drafts, last active chat, offline queue |
| Auth | Zustand + Query | `currentUser`, `isAuthenticated`, bootstrap status |

### 6.2 Realtime merge rules

- Messages arrive from three sources: initial fetch, pagination, socket.
- Normalize by `chatId` → `Map<messageId, Message>` or keep arrays sorted.
- **Deduplicate by `_id`.** Optimistic temp messages use `temp-<uuid>`; on server
  response or socket echo, replace the temp message with the real one.
- **Order** by `createdAt` ascending, tie-break by `_id`.
- Never replace the whole array on a socket event; insert/update in place.

### 6.3 Query keys convention

```ts
// src/lib/query-keys.ts
export const queryKeys = {
  session: ["session"] as const,
  chats: ["chats"] as const,
  chat: (id: string) => ["chats", id] as const,
  messages: (chatId: string) => ["messages", chatId] as const,
  users: (search: string, page: number) => ["users", search, page] as const,
};
```

---

## 7. Routing and guards

### 7.1 Route tree

```
/                     → redirect to /chats (or /sign-in if unauthenticated)
/sign-in              → public only
/sign-up              → public only
/chats                → protected; ChatShell (sidebar + empty state)
/chats/:chatId        → protected; ChatShell + ChatRoom
/settings             → protected
*                     → not-found
```

Use React Router 7 `createBrowserRouter` + nested routes + `<Outlet />`.
Lazy-load pages with `React.lazy` and route-level `Suspense`.

### 7.2 Auth bootstrap

On app load:

1. `GET /auth/status` with `credentials: "include"`.
2. On 200 → set `currentUser`, mark authenticated.
3. On 401 → unauthenticated, redirect to `/sign-in` for protected routes.
4. Render a full-page loader while `status === "loading"`.
5. Never flash protected UI before the check completes.

### 7.3 Guards

- `ProtectedRoute`: if unauthenticated → `<Navigate to="/sign-in" state={{ from }} />`.
- `PublicOnlyRoute`: if authenticated → `<Navigate to="/chats" />`.
- Preserve intended destination and redirect after login.
- On logout: clear Query cache, disconnect socket, clear persisted drafts if
  desired, then navigate to `/sign-in`.

---

## 8. API layer

### 8.1 `lib/env.ts`

```ts
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1",
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? "http://localhost:8000",
};
```

Add `client/.env.example`:

```bash
VITE_API_URL=http://localhost:8000/api/v1
VITE_SOCKET_URL=http://localhost:8000
```

### 8.2 `lib/api-client.ts`

Requirements:

- Always send cookies: `credentials: "include"`.
- JSON in/out; handle `204` and empty bodies.
- Normalize errors into a typed shape matching backend:
  `{ message: string; errorCode?: string; status: number }`.
- Throw a single `ApiError` class; never let raw `fetch` errors leak into UI.
- Optional: validate responses with Zod in development only.
- Abort support via `AbortSignal` for search and pagination.

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorCode?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(
      body?.message ?? "Request failed",
      res.status,
      body?.errorCode,
    );
  }
  return body as T;
}
```

### 8.3 Endpoint map (exact backend contract)

**Auth**

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, avatar? }` | `{ message, data: SafeUser }` + cookie |
| POST | `/auth/login` | `{ email, password }` | `{ message, data: SafeUser }` + cookie |
| POST | `/auth/logout` | — | `{ message }` |
| GET | `/auth/status` | — | `{ message, data: SafeUser }` |

**Users**

| Method | Path | Query/Body | Response |
|---|---|---|---|---|
| GET | `/users` | `search?, page?, limit?` | `{ message, users, pagination }` |
| GET | `/users/presence` | `ids=<id1>,<id2>` (max 50) | `{ message, presences: [{ userId, isOnline, lastSeen }] }` |
| PATCH | `/users/me` | `{ name?, avatar? }` (at least one) | `{ message, data: SafeUser }` |

**Chats**

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/chats` | `{ participantId }` or `{ isGroup: true, participants: string[], groupName }` | `{ message, chat }` |
| GET | `/chats` | `page?, limit?` (default 20, max 50) | `{ message, chats, pagination }`; each chat has `unreadCount` |
| GET | `/chats/:id` | — | `{ message, chat, messages }` (latest 50) |
| PATCH | `/chats/:id/members/add` | `{ userId }` | `{ message, chat }` |
| PATCH | `/chats/:id/members/remove` | `{ userId }` | `{ message, chat }` |
| DELETE | `/chats/:id/members/me` | — | `{ message }` (group self-leave) |
| PATCH | `/chats/:id/group-name` | `{ groupName }` | `{ message, chat }` |
| PATCH | `/chats/:id/group-avatar` | `{ groupAvatar }` | `{ message, chat }` |

**Messages**

| Method | Path | Body/Query | Response |
|---|---|---|---|
| POST | `/messages` | `{ chatId, messageType, content?, mediaUrl?, replyToId? }` | `{ message, messageData, chat }` |
| GET | `/messages` | `chatId, cursor?, since?, limit?` | `{ message, messages, nextCursor, nextSince? }` |
| GET | `/messages/search` | `q, chatId?, page?, limit?` | `{ message, messages, pagination }` |
| GET | `/messages/pinned` | `chatId, page?, limit?` | `{ message, messages, pagination }` |
| PATCH | `/messages/:chatId/read` | — | `{ message, lastReadAt }` |
| PATCH | `/messages/:chatId/:messageId` | `{ content }` | `{ message, messageData }` (sender only, text only) |
| PATCH | `/messages/:chatId/:messageId/pin` | `{ pinned: boolean }` | `{ message, messageData }` |
| DELETE | `/messages/:chatId/:messageId` | — | `{ message }` |

**Health:** `GET /health` → `{ message, status, checks: { mongodb, redis } }`.
Returns `200` when ready and `503` when Mongo (or configured Redis) is down.
`status` is `"OK"` or `"UNAVAILABLE"`; `redis` is `"up" | "down" | "not_configured"`.

> Important backend quirks:
> - `GET /messages` takes `chatId` as a **query param**, not a path param.
> - `GET /chats/:id` returns the **latest 50** messages, newest first.
> - Message pagination uses `_id` cursors and returns newest-first arrays; the UI
>   must reverse for display.
> - `GET /chats` is paginated (`page`/`limit`) and each chat now has
>   `unreadCount`, computed from `lastReadBy` + message timestamps.
> - Read state is **chat-level** (`Chat.lastReadBy`). `Message.isRead` has been
>   removed; do not expect it in message payloads.
> - `since` returns messages **oldest-first** for reconnect backfill and is
>   mutually exclusive with `cursor`. Use `nextSince` for the next page.
> - Message edit/pin/unpin emit `message:updated`; leaving a group emits
>   `chat:removed` to the leaver.
> - Invalid request bodies return **400** with
>   `{ message, errorCode: "ERR_BAD_REQUEST", issues }` (fixed in backend P0),
>   so validation messages can be shown per field.

### 8.4 Query hooks

- `useChats()` → `GET /chats`, `staleTime: 30s`.
- `useChat(chatId)` → `GET /chats/:id`.
- `useMessages(chatId)` → `useInfiniteQuery` on `/messages` with `cursor`.
- Reconnect backfill → one-shot `GET /messages?chatId=&since=<last seen ISO>`.
- `useMessageSearch(q, chatId?)` → `GET /messages/search`.
- `usePinnedMessages(chatId)` → `GET /messages/pinned`.
- `usePresence(ids)` → `GET /users/presence`.
- `useUserSearch(term)` → debounced `GET /users`.
- Mutations: `useSendMessage`, `useCreateChat`, `useCreateGroup`, `useDeleteMessage`,
  `useEditMessage`, `usePinMessage`, `useMarkRead`, `useAddMember`,
  `useRemoveMember`, `useLeaveGroup`, `useUpdateGroup`, `useUpdateProfile`.

### 8.5 Invalidation rules

| Mutation | Invalidate |
|---|---|
| Create chat/group | `chats` |
| Send message | `messages(chatId)` (optimistic), `chats` (last message) |
| Delete message | `messages(chatId)`, `chats` if it was last |
| Mark read | `chats` (unread badge) |
| Edit/pin message | `messages(chatId)`, `pinnedMessages(chatId)`, `chats` if last |
| Group mutations | `chats`, `chat(id)` |
| Leave group | `chats`, remove `chat(id)` |
| Update profile | `auth/status`, `users`, `chats` |
| Logout | clear all |

---

## 9. Realtime / Socket.IO layer

### 9.1 Connection lifecycle

```
App boot → auth/status OK → connect socket
Logout → disconnect + remove listeners
401 during session → disconnect + redirect
```

`lib/socket.ts`:

```ts
import { io, type Socket } from "socket.io-client";
import { env } from "./env";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(env.socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
```

> The backend reads the JWT from the `Cookie` header, so the browser must send
> credentials. `withCredentials: true` is required. In dev, `localhost:5173` and
> `localhost:8000` are same-site, so cookies flow. In production, host frontend
> and backend on the same site (e.g. `app.example.com` + `api.example.com` with
> `SameSite=Lax`) or configure `SameSite=None; Secure`.

### 9.2 Event map (from backend `lib/socket.ts`)

**Client → Server**

| Event | Payload | Ack |
|---|---|---|
| `chat:join` | `chatId: string` | `(err?: string) => void` |
| `chat:leave` | `chatId: string` | — |
| `typing:start` | `chatId: string` | — |
| `typing:stop` | `chatId: string` | — |

**Server → Client**

| Event | Payload | UI effect |
|---|---|---|
| `user:online` | `{ userId }` | presence dot on |
| `user:offline` | `{ userId }` | presence dot off (refetch presence for lastSeen) |
| `chat:new` | `Chat` | add to chat list |
| `chat:update` | `{ chatId, lastMessage }` | reorder list, update preview |
| `chat:updated` | `Chat` | update group info/members |
| `chat:removed` | `{ chatId }` | remove chat from list (self-leave/removal) |
| `message:new` | `Message` | append to open chat |
| `message:updated` | `Message` | replace edited/pinned message in caches |
| `message:read` | `{ chatId, userId, lastReadAt }` | update read watermark |
| `message:deleted` | `{ chatId, messageId }` | remove/tombstone |
| `typing:start` | `{ userId, chatId }` | show typing |
| `typing:stop` | `{ userId, chatId }` | hide typing |

### 9.3 Event handling rules

- Register listeners **once** in a `SocketProvider` or `useSocketEvents` hook.
- Use `socket.off(event, handler)` on cleanup to avoid duplicate handlers
  (React 19 StrictMode double-mounts in dev).
- `message:new`:
  - Ignore if the message already exists by `_id` (echo/duplicate).
  - If it matches a pending optimistic temp message, reconcile it.
  - Update `messages(chatId)` cache and `chats` preview/order.
  - If chat is not open, increment local unread badge.
- `chat:update` only updates preview + ordering; do not refetch the world.
- `chat:removed` → drop the chat from the list/cache and leave its room.
- `message:updated` → replace by `_id` in `messages(chatId)`, pinned list, and
  chat preview if it is the last message.
- `user:online/offline` → `presenceStore`; also refresh
  `GET /users/presence` after reconnect. Presence is Redis-backed across
  instances when the backend has `REDIS_URL` configured.
- `typing:*` → `typingStore` with auto-expiry (e.g. 4s) in case `stop` is lost.
- On `reconnect`, refetch `chats` and the active chat's latest messages to fill gaps.

### 9.4 Room lifecycle

- Backend auto-joins all of a user's chats on connect.
- On opening a chat, emit `chat:join` and await the ack; on leave, `chat:leave`.
- Still keep local logic resilient if join fails (show error toast).

### 9.5 Optimistic send

```
1. Generate tempId = `temp-${uuid()}`.
2. Insert optimistic Message { _id: tempId, status: "sending", ... }.
3. POST /messages.
4. On success: replace tempId with server message (status "sent").
5. On error: mark status "failed" with retry action.
6. On socket echo: dedupe by real _id; ignore if already reconciled.
```

---

## 10. Zustand stores

### 10.1 `auth-store.ts`

```ts
type AuthState = {
  user: SafeUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setUser: (u: SafeUser | null) => void;
  setStatus: (s: AuthState["status"]) => void;
  reset: () => void;
};
```

### 10.2 `presence-store.ts`

```ts
type PresenceState = {
  online: Record<string, boolean>;
  lastSeen: Record<string, string | null>;
  setOnline: (userId: string) => void;
  setOffline: (userId: string, lastSeen?: string) => void;
};
```

### 10.3 `typing-store.ts`

```ts
type TypingState = {
  byChat: Record<string, Record<string, number>>; // chatId -> userId -> expiry
  start: (chatId: string, userId: string) => void;
  stop: (chatId: string, userId: string) => void;
  prune: () => void;
};
```

### 10.4 `ui-store.ts`

Sidebar open (mobile), active dialog, command palette open, reply target,
lightbox state.

### 10.5 `draft-store.ts` (persist)

```ts
type DraftState = {
  drafts: Record<string, string>; // chatId -> text
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
};
```

Use `persist` middleware with `partialize` so only drafts are stored.

### 10.6 Store rules

- Select narrowly: `usePresenceStore((s) => s.online[userId])`.
- Never store server entities in Zustand; use Query.
- Reset all stores on logout.

---

## 11. Component architecture

### 11.1 Layout tree

```
<App>
  <Providers>
    <AuthBootstrap>
      <AppShell>                    // only for protected routes
        <Sidebar>
          <SidebarHeader>           // current user, new chat, search
          <ChatList />
          <SidebarFooter>           // theme toggle, settings, logout
        </Sidebar>
        <main>
          <Outlet>
            <ChatRoom>
              <ChatHeader />
              <MessageList />
              <MessageComposer />
            </ChatRoom>
          </Outlet>
        </main>
      </AppShell>
    </AuthBootstrap>
  </Providers>
</App>
```

### 11.2 Key components and responsibilities

| Component | Responsibility |
|---|---|
| `AppShell` | Responsive two-pane layout; mobile drawer; global overlays. |
| `ChatList` | Render chats sorted by `lastMessageAt`, unread badges, skeletons, empty/error states. |
| `ChatListItem` | Avatar (group/user), name, last message preview, time, online dot, unread count. |
| `NewChatDialog` | User search + select → create 1:1; entry to create group. |
| `ChatHeader` | Title/avatar, presence, members, group info button, back on mobile. |
| `MessageList` | Virtualized, infinite scroll up, date dividers, typing indicator, scroll-to-bottom. |
| `MessageItem` | Own vs other alignment, sender, bubble, media, reply preview, status ticks, actions. |
| `MessageComposer` | Autosize textarea, attachments, emoji (optional), reply bar, send, shortcuts. |
| `GroupInfoPanel` | Members, admins, rename, avatar, add/remove (admin only). |
| `CommandPalette` | `Cmd/Ctrl+K`: search chats/users, actions. |
| `UserAvatar` | Image with initials fallback, size variants, online ring. |
| `RelativeTime` | `date-fns` formatting with live updates. |

### 11.3 Component conventions

- Presentational components take props; data hooks live in feature containers.
- No `fetch` inside components; only hooks.
- Use `cn()` for class merging.
- Use shadcn primitives; do not re-implement buttons/dialogs.
- Every list has `loading`, `empty`, `error` variants.
- Every async action has pending/disabled state and a toast on failure.

---

## 12. Core UX flows

### 12.1 Sign up / sign in

1. Validate with Zod client-side.
2. POST; on success store user, connect socket, redirect to `/chats`.
3. On error show inline field errors + toast for generic errors.
4. Disable submit while pending; show spinner.

### 12.2 First load

1. `GET /auth/status`.
2. If authed: connect socket, `GET /chats`, render shell.
3. If not: redirect to `/sign-in`.

### 12.3 Start a 1:1 chat

1. Open `NewChatDialog` → search users (debounced).
2. Select user → `POST /chats { participantId }`.
3. On success: upsert chat in cache, navigate to `/chats/:id`.
4. Backend also emits `chat:new` to both participants.

### 12.4 Send a message

1. Enter text, `Enter` sends (Shift+Enter newline).
2. Optimistic insert, clear draft.
3. POST; reconcile or mark failed with retry.
4. Scroll to bottom if user was near bottom; otherwise show "new messages" pill.

### 12.5 Receive a message

1. `message:new` handler dedupes and inserts.
2. If active chat: append, auto-scroll if near bottom, mark read.
3. If not active: update chat preview/order and unread badge.

### 12.6 Reply

1. Long-press/hover message → Reply.
2. Composer shows reply preview; send with `replyToId`.
3. Render quoted snippet above bubble; click to scroll to original if loaded.

### 12.7 Delete

1. Own message only; confirm.
2. `DELETE /messages/:chatId/:messageId`.
3. Optimistically remove or show "message deleted" tombstone.
4. Handle `message:deleted` from other devices.

### 12.8 Read receipts

1. When chat is open and visible, `PATCH /messages/:chatId/read` (throttled).
2. Render ticks based on `lastReadBy` from chat + `message:read` events.
3. Backend stores `lastReadAt`; unread counts need backend support (§23).

### 12.9 Presence and typing

- Presence dots from `user:online/offline` and `isOnline` in populated chats.
- Typing: emit `typing:start` on first keystroke, `typing:stop` on send/blur/idle.
- Show "X is typing…" / "X and Y are typing…".

### 12.10 Group management

- Create group: select ≥2 users + name → `POST /chats`.
- Info panel: rename, avatar, add/remove members (admin only; hide otherwise).
- Reflect `chat:updated` for all participants.

### 12.11 Logout

1. `POST /auth/logout`.
2. Disconnect socket, clear Query cache + stores, navigate to `/sign-in`.

---

## 13. Forms and validation

- Share Zod schemas that mirror backend rules:
  - name: 2–50, letters/spaces.
  - email: valid, lowercased.
  - password: 6–100.
  - group name: min 1.
  - message text: min 1.
- Use `react-hook-form` + `zodResolver`.
- Map server `message` to a toast; map field errors where possible.
- Do not duplicate validation logic between forms; put schemas in `features/*/schemas.ts`.

---

## 14. Media handling

### 14.1 Current backend contract

`POST /messages` accepts `mediaUrl` as a base64 data URI or `http(s)` URL, then uploads to
Cloudinary server-side. Body limit is **10MB JSON**.

### 14.2 MVP approach

1. User selects a file via hidden `<input type="file">` or drag-drop.
2. Validate type and size client-side (images ≤ 4MB, others ≤ 6MB).
3. Read as base64 data URL (`FileReader`).
4. Send `{ messageType, mediaUrl }`.
5. Show upload progress/pending state; optimistic preview.
6. Render by type:
   - image: `<img>` with lightbox.
   - video/audio: native players.
   - file: download card with name/size.

Server-side limits (reject with `400 ERR_BAD_REQUEST` before upload):

| Type | Max decoded size | Allowed MIME |
|---|---|---|
| image | 4 MB | jpeg, png, gif, webp |
| audio | 6 MB | mpeg, mp4, ogg, wav, webm |
| video | 6 MB | mp4, webm, quicktime |
| file | 6 MB | pdf, text, zip, Word, Excel, octet-stream |

The whole JSON body is capped at 10 MB, so validate client-side before sending.

### 14.3 Later improvement (recommended)

Direct-to-Cloudinary signed upload to avoid 10MB JSON and server memory pressure.
This requires a backend endpoint to sign upload params.

---

## 15. Theming, design system, accessibility

- Tokens already defined in `src/index.css`; use semantic classes
  (`bg-background`, `text-muted-foreground`, `border-border`), never raw hex.
- Dark mode via `.dark` class (already implemented).
- Typography: Inter Variable (already imported).
- Radius scale and chart colors available.
- Accessibility checklist:
  - All icon buttons have `aria-label` or `sr-only` text.
  - Focus-visible rings on all interactive elements.
  - Dialogs trap focus and close on `Esc` (Radix handles this).
  - Message list is keyboard navigable; announce new messages via `aria-live`
    (polite) when the chat is not focused.
  - Respect `prefers-reduced-motion`.
  - Contrast meets WCAG AA in both themes.
- Responsive:
  - `< md`: single pane; chat list → chat room navigation; back button.
  - `>= md`: sidebar + chat pane.
  - `>= xl`: optional right-side info panel.

---

## 16. Performance

- Virtualize `MessageList` and long `ChatList`.
- `React.memo` message items; stable keys; avoid inline objects in hot paths.
- Code-split routes and heavy components (emoji picker, lightbox, command palette).
- Lazy-load images; use `loading="lazy"` and fixed dimensions.
- Debounce user search (300ms) and abort in-flight requests.
- Throttle read receipts and typing emits.
- Budgets (define and measure):
  - Initial JS gzip < 250KB.
  - LCP < 2.5s on mid-tier mobile.
  - Interaction to next paint < 200ms for sending a message.
- Use React 19 features appropriately (`useOptimistic` optional; do not overuse).

---

## 17. Error handling and resilience

- `ErrorBoundary` at app and route level with reset action.
- `ApiError` → user-friendly toast; 401 → force logout + redirect.
- Offline detection (`navigator.onLine` + socket state) → banner + queue sends.
- Reconnect flow:
  1. Refetch `chats`.
  2. Refetch latest page of active chat.
  3. Flush queued messages.
  4. Show "Reconnected" toast.
- Failed optimistic messages show retry/delete.
- Never leave the UI in a permanent spinner; all requests have timeouts.

---

## 18. Testing strategy

| Layer | Tool | What to test |
|---|---|---|
| Unit | Vitest | formatters, reducers, store actions, schemas |
| Component | RTL + jsdom | forms, message bubble, chat list item, composer |
| API | MSW | hooks, error paths, optimistic rollback |
| Realtime | mocked socket | event handlers, dedupe, presence, typing expiry |
| E2E | Playwright | sign up → send message in two contexts → reply → delete → reconnect |
| A11y | `axe` (optional) | auth pages, chat shell |

Coverage target: 70%+ on `lib/`, `stores/`, and feature hooks.

CI: lint + typecheck + unit tests + build on every push.

---

## 19. Tooling and environment

- Add `client/.env.example` with `VITE_API_URL`, `VITE_SOCKET_URL`.
- Add scripts:
  - `dev`, `build`, `preview` (existing).
  - `typecheck`: `tsc -b --noEmit`.
  - `lint` (existing), `test`, `test:coverage`, `e2e`.
- Keep ESLint flat config; enable React hooks rules (already present).
- Add Prettier if desired, but do not fight the existing style.
- Ensure `tsconfig` `strict` remains on; avoid `any` in public types.
- Consider a `README.md` for the client with screenshots, setup, and architecture.

---

## 20. Deployment

- Build with `pnpm build` → static `dist/`.
- Host on Vercel/Netlify/Cloudflare Pages with SPA fallback to `index.html`.
- Set `VITE_API_URL` and `VITE_SOCKET_URL` per environment.
- CORS: backend allows only `FRONTEND_ORIGIN`; set it to the deployed origin.
- Cookies: use HTTPS; keep frontend and backend same-site, or use
  `SameSite=None; Secure` if truly cross-site.
- Add a preview environment for demos.
- Provide a seeded demo account and a 60-second demo GIF in the README.

---

## 21. Build phases (detailed)

Each phase is intentionally small, shippable, and testable. Do not start a phase
until the previous one is usable. Estimated effort assumes one developer.

### Phase 0 — Foundations (0.5–1 day)

**Goal:** a clean, typed, runnable skeleton with transport primitives.

Tasks:
- [ ] Create `src/types/models.ts`, `api.ts`, `socket.ts`.
- [ ] Add `lib/env.ts`, `lib/api-client.ts`, `lib/query-keys.ts`, `lib/storage.ts`, `lib/format.ts`.
- [ ] Add `app/providers.tsx`, `app/query-client.ts`, `app/error-boundary.tsx`.
- [ ] Refactor `main.tsx` to use providers.
- [ ] Add `client/.env.example`; add `.env` locally (git-ignored).
- [ ] Add `typecheck`/`test` scripts.
- [ ] Add `components/common/{user-avatar,online-dot,relative-time,empty-state,error-state,full-page-loader}.tsx`.

Acceptance:
- `pnpm dev` renders a styled placeholder page.
- `pnpm build` and `pnpm typecheck` pass.
- `api()` can hit `/health` and return typed data.

### Phase 1 — Authentication (1–2 days)

Tasks:
- [ ] `features/auth/{api,schemas,hooks}.ts` using `useMutation` + `useQuery`.
- [ ] `pages/auth/sign-in.tsx`, `sign-up.tsx` with RHF + Zod.
- [ ] `auth-store.ts` + `app/auth-bootstrap.tsx` calling `/auth/status`.
- [ ] `routes/route-guard.tsx` (`ProtectedRoute`, `PublicOnlyRoute`).
- [ ] Wire route tree in `routes/index.tsx`; update `App.tsx`.
- [ ] Logout action + cache/store reset.

Acceptance:
- Register, login, logout, and refresh all work.
- Protected routes redirect when unauthenticated; auth pages redirect when logged in.
- Form errors show inline; server errors show toast.

### Phase 2 — App shell and navigation (1–2 days)

Tasks:
- [ ] `components/layout/{app-shell,sidebar,top-bar,mobile-nav}.tsx`.
- [ ] Responsive layout with mobile drawer.
- [ ] Sidebar header (current user + new chat button), footer (theme, settings, logout).
- [ ] `pages/chat/chat-shell.tsx` with `<Outlet />` and `chat-empty.tsx`.
- [ ] `pages/not-found.tsx`, `pages/settings/settings.tsx` placeholder.
- [ ] Add `use-media-query.ts`, `use-online-status.ts`.

Acceptance:
- Desktop shows two panes; mobile shows one pane with navigation.
- Theme toggle and logout work from the shell.
- No layout shift; skeleton placeholders where needed.

### Phase 3 — Chat list and 1:1 creation (2–3 days)

Tasks:
- [ ] `features/chat-list/{api,hooks}.ts` → `useChats`.
- [ ] `chat-list.tsx`, `chat-list-item.tsx`, `chat-list-skeleton.tsx`.
- [ ] Chat preview: name, avatar, last message, relative time, online dot.
- [ ] `features/users/{api,hooks}.ts` with debounced search.
- [ ] `user-picker.tsx`, `new-chat-dialog.tsx`.
- [ ] `useCreateChat` mutation; navigate on success.
- [ ] Empty/error states.

Acceptance:
- Chats render sorted by `lastMessageAt`.
- Searching users and starting a chat works and opens the room.
- Duplicate 1:1 chat creation returns the existing chat.

### Phase 4 — Chat room and text messaging (3–4 days)

Tasks:
- [ ] `pages/chat/chat-room.tsx` reading `:chatId`.
- [ ] `features/chat-room/{api,hooks}.ts` → `useChat`, `useInfiniteMessages`.
- [ ] `chat-header.tsx`, `message-list.tsx`, `message-item.tsx`, `message-bubble.tsx`.
- [ ] `message-composer.tsx`: autosize, Enter/Shift+Enter, disabled state.
- [ ] Optimistic send with temp IDs + failure retry.
- [ ] Date dividers, own/other alignment, sender labels in groups.
- [ ] Reverse newest-first API data for display; infinite scroll up.
- [ ] Scroll-to-bottom button and "new messages" pill.
- [ ] Mark read on open/visibility.

Acceptance:
- Sending a text message appears instantly and persists after refresh.
- Pagination loads older messages on scroll up.
- Failed sends can be retried; duplicates never appear.

### Phase 5 — Realtime core (2–3 days)

Tasks:
- [ ] `lib/socket.ts` singleton + connect/disconnect tied to auth.
- [ ] `lib/socket-events.ts` typed event map.
- [ ] Global `useSocketEvents` hook registered once.
- [ ] Handle `message:new`, `chat:update`, `chat:new`, `chat:updated`.
- [ ] Dedupe by `_id`; reconcile optimistic temp messages.
- [ ] Reconnect: refetch chats + active messages; flush queue.
- [ ] Cleanup listeners on unmount/logout (StrictMode safe).

Acceptance:
- Two browser sessions exchange messages in real time.
- No duplicate messages on echo; ordering is stable.
- After network drop/reconnect, missed messages appear.

### Phase 6 — Presence, typing, receipts (2 days)

Tasks:
- [ ] `presence-store.ts`, `typing-store.ts`.
- [ ] `user:online/offline` handlers + online dots + last seen.
- [ ] Typing emit (start/stop with idle timeout) + indicator UI.
- [ ] `message:read` handler + read ticks.
- [ ] Mark-read throttle and visibility handling.

Acceptance:
- Online status updates across sessions.
- Typing indicator appears and expires correctly.
- Read state updates without refetching everything.

### Phase 7 — Media messages (2–3 days)

Tasks:
- [ ] Attachment button + hidden file input + drag-drop.
- [ ] Client-side type/size validation with clear errors.
- [ ] Base64 conversion with size guard (< 10MB body).
- [ ] Optimistic media preview + upload state.
- [ ] Renderers: image lightbox, video/audio players, file card.
- [ ] Error handling for failed uploads.

Acceptance:
- Images, audio, video, and files send and render.
- Oversized/invalid files are rejected before upload.
- Failed uploads can be retried or removed.

### Phase 8 — Message actions, replies, drafts (2 days)

Tasks:
- [ ] Hover/long-press action menu: reply, copy, delete (own).
- [ ] Reply preview in composer + quoted block in message.
- [ ] Delete with confirm + tombstone handling for `message:deleted`.
- [ ] Draft persistence per chat (`draft-store`).
- [ ] Scroll-to-replied-message when available.

Acceptance:
- Replies show context and survive refresh.
- Deleting removes/tombstones consistently across sessions.
- Drafts survive navigation and reload.

### Phase 9 — Group chats (3–4 days)

Tasks:
- [ ] `create-group-dialog.tsx` with multi-select (≥2 others) + name.
- [ ] Group avatar/name in list and header.
- [ ] `group-info-panel.tsx`, `member-list.tsx`.
- [ ] Admin-only add/remove member, rename, avatar.
- [ ] Handle `chat:updated` for all participants.
- [ ] Permission-aware UI (hide admin actions for non-admins).

Acceptance:
- Creating a group adds all members and opens it.
- Admins can manage members/name/avatar; non-admins cannot.
- Changes propagate in real time.

### Phase 10 — Search, command palette, polish (2–3 days)

Tasks:
- [ ] `command-palette.tsx` (`Cmd/Ctrl+K`): jump to chat, search users, actions.
- [ ] Instant local chat filter + debounced server user search.
- [ ] Keyboard shortcuts + shortcut help sheet.
- [ ] Empty/error/loading states everywhere.
- [ ] Accessibility pass (labels, focus, ARIA live, reduced motion).
- [ ] Responsive polish and mobile gestures.

Acceptance:
- Palette opens/closes with keyboard and is fully navigable.
- Search feels instant; no request spam.
- Lighthouse accessibility ≥ 95.

### Phase 11 — Testing and CI (2–3 days)

Tasks:
- [ ] Vitest + RTL setup; test stores, formatters, schemas, key components.
- [ ] MSW handlers for auth/chats/messages.
- [ ] Socket handler tests (dedupe, presence, typing expiry).
- [ ] Playwright E2E: sign up → send → receive in second context → reply → delete → reconnect.
- [ ] GitHub Actions: lint, typecheck, test, build.

Acceptance:
- CI is green on a fresh clone.
- Coverage ≥ 70% for `lib/`, `stores/`, feature hooks.
- E2E covers the critical path.

### Phase 12 — PWA, notifications, deployment (2–3 days)

Tasks:
- [ ] Web app manifest + icons; installable PWA (optional).
- [ ] Browser notifications for messages when tab is hidden (requires permission).
- [ ] Deploy to a hosting provider with SPA fallback.
- [ ] Configure `FRONTEND_ORIGIN`, cookies, HTTPS.
- [ ] Add demo account + screenshots/GIF to README.

Acceptance:
- Live URL works end to end with realtime.
- Demo can be completed by a stranger in under 2 minutes.

### Phase 13 — Differentiators (ongoing)

Pick one or two and go deep:
- [ ] Offline outbox (IndexedDB) with guaranteed flush on reconnect.
- [ ] Message search (needs backend; see §23).
- [ ] Pinned messages (needs backend).
- [ ] Message editing (needs backend).
- [ ] E2EE (large effort; only if you can explain the threat model).
- [ ] Link previews / rich attachments.
- [ ] Virtualized list performance benchmark published in README.

Acceptance:
- The differentiator has tests, docs, and a measurable claim you can defend.

---

## 22. Definition of done / quality gates

A phase is done only when:

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` pass.
- [ ] New code has tests where logic exists (hooks, stores, formatters).
- [ ] Loading, empty, error, and offline states are handled.
- [ ] Keyboard and screen-reader basics work for new UI.
- [ ] No `any` in public types; no `console.log` left behind.
- [ ] Responsive at 360px, 768px, 1280px.
- [ ] No duplicate socket listeners; no memory leaks on route change.
- [ ] Documented in the client README (feature + how to test).

---

## 23. Backend gaps that block frontend features

P0/P1 backend work is complete. Remaining gaps are listed as **Deferred**.

| Frontend need | Status | Contract |
|---|---|---|
| Accurate unread counts | **Resolved (P1)** | `GET /chats` returns `unreadCount` per chat. |
| Read state per message | **Resolved (P1)** | Chat-level watermark via `Chat.lastReadBy`; `Message.isRead` removed. |
| Message search | **Resolved (P1)** | `GET /messages/search?q=&chatId?=&page=&limit=`. |
| Pinned messages | **Resolved (P1)** | `isPinned/pinnedBy/pinnedAt`, `GET /messages/pinned`, pin/unpin PATCH, `message:updated`. Any participant may pin. |
| Edit message | **Resolved (P1)** | `PATCH /messages/:chatId/:messageId`, sender-only, text-only, `editedAt`. |
| Delivery status (sent/delivered/read) | **Deferred** | Only a read watermark exists; no per-recipient delivery tracking yet. |
| Missed-message backfill | **Resolved (P1)** | `GET /messages?chatId=&since=<ISO>` (oldest-first, `nextSince`). |
| Presence across instances | **Resolved (P1)** | Redis-backed presence/typing + `GET /users/presence?ids=`. |
| ~~Accurate 400 errors~~ | **Resolved (P0)** | `ZodError`/`CastError` → 400 with `{ message, errorCode, issues }`. |
| Group leave | **Resolved (P1)** | `DELETE /chats/:id/members/me` with admin/creator transfer. |
| Profile edit / avatar | **Resolved (P1)** | `PATCH /users/me` with `name?`/`avatar?`. |
| Paginated chat list | **Resolved (P1)** | `GET /chats?page=&limit=` returns `pagination`. |

Also confirm these before frontend realtime work:

- `GET /messages` uses `chatId` **query param**.
- `GET /chats/:id` returns only the latest 50 messages.
- Socket auth requires the browser to send cookies (`withCredentials`).
- CORS origin must match the frontend origin exactly.

---

## 24. Interview talking points

Prepare a 2-minute narrative and be ready for follow-ups.

**Architecture**
- Why Query for server state and Zustand for realtime/UI state.
- How you keep one socket and avoid duplicate listeners (StrictMode).
- How the API layer normalizes errors and handles 401 globally.

**Realtime correctness**
- Deduplication by `_id`; optimistic temp IDs; reconciliation.
- Ordering and missed-message backfill on reconnect.
- Typing throttle and expiry to avoid stuck indicators.
- Presence across multiple tabs/devices.

**Performance**
- Virtualization, code splitting, memoization, and measured budgets.
- Bundle size and Lighthouse numbers you can quote.

**UX**
- Keyboard-first design, command palette, drafts, scroll restoration.
- Accessibility decisions and how you tested them.

**Trade-offs**
- Polling vs WebSocket; cursor vs offset pagination; cookie vs bearer tokens.
- Client-side search vs server-side search; base64 upload vs signed direct upload.
- What you deliberately did not build and why.

**Debugging story**
- Have one concrete incident: e.g. duplicate messages after reconnect, how you
  diagnosed it (socket echo + optimistic insert), and how you fixed it (dedupe +
  reconciliation).

---

*End of guide. Build phases in order; do not skip Phase 0 and Phase 1 — every
later phase depends on the typed transport and auth foundation.*
