# Buzzie Backend — Architecture Guide

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Tech Stack & Rationale](#2-tech-stack--rationale)
- [3. Directory Structure](#3-directory-structure)
- [4. Architectural Pattern: Layered Architecture](#4-architectural-pattern-layered-architecture)
- [5. Request Lifecycle (Step by Step)](#5-request-lifecycle-step-by-step)
- [6. Database Schema & Relationships](#6-database-schema--relationships)
- [7. Authentication & Authorization](#7-authentication--authorization)
- [8. API Route Map](#8-api-route-map)
- [9. Socket.IO Architecture](#9-socketio-architecture)
- [10. Validation Layer](#10-validation-layer)
- [11. Error Handling](#11-error-handling)
- [12. Middleware Chain](#12-middleware-chain)
- [13. File Upload Flow](#13-file-upload-flow)
- [14. Pagination Strategy](#14-pagination-strategy)
- [15. Multi-Device Socket Support](#15-multi-device-socket-support)
- [16. Group Chat Management](#16-group-chat-management)
- [17. Horizontal Scaling](#17-horizontal-scaling)
- [18. Environment Variables](#18-environment-variables)
- [19. Development Setup](#19-development-setup)
- [20. Testing](#20-testing)
- [21. Security Considerations](#21-security-considerations)
- [22. Observability & Logging](#22-observability--logging)
- [23. API Documentation & Collections](#23-api-documentation--collections)
- [24. Containerization & Load Testing](#24-containerization--load-testing)

---

## 1. Project Overview

Buzzie is a real-time chat application backend built with **Express 5**, **Mongoose 9** (MongoDB), **Socket.IO 4**, and **Passport.js** (JWT auth via httpOnly cookies). It supports:

- One-to-one and group messaging
- Real-time message delivery via WebSockets
- Typing indicators and read receipts
- Media file uploads (images, audio, video, files) via Cloudinary
- Multi-device socket connections
- Cursor-based pagination for messages, plus `since` backfill
- Message editing, text search, and pinning
- Chat-level read receipts and unread counts
- Soft-deletion of messages
- Group chat administration (add/remove/leave, update name/avatar)
- Redis-backed presence/typing for multi-instance deployments
- Structured JSON logging with request ids
- Automated REST + Socket.IO integration tests and CI
- OpenAPI contract, Postman collection, Docker Compose, and k6 load script

---

## 2. Tech Stack & Rationale

| Technology | Version | Purpose |
|---|---|---|
| **Express 5** | `^5.2.1` | HTTP framework. Express 5 brings native async error handling (rejected promises in route handlers automatically call `next(error)`). |
| **Mongoose 9** | `^9.4.1` | MongoDB ODM with schema validation, middleware (pre-save hooks), and population (joins). |
| **Socket.IO 4** | `^4.8.3` | Real-time bidirectional communication over WebSocket with fallback to HTTP long-polling. |
| **Passport.js** | `^0.7.0` | Authentication middleware. Uses JWT strategy extracted from httpOnly cookies. |
| **Zod 4** | `^4.3.6` | Runtime schema validation with TypeScript type inference. Used in controllers to validate request bodies, params, and queries. |
| **Cloudinary** | `^2.9.0` | Media upload and CDN delivery. Accepts base64/image URLs and returns a secure CDN URL. |
| **bcryptjs** | `^3.0.3` | Password hashing (pure JS, no native dependencies). |
| **jsonwebtoken** | `^9.0.3` | JWT signing and verification for stateless auth. |
| **helmet** | `^8.1.0` | HTTP security headers (XSS, content-type sniffing, clickjacking prevention). |
| **ioredis** | `^5.11.1` | Redis client for Socket.IO horizontal scaling adapter. |
| **@socket.io/redis-adapter** | `^8.3.0` | Enables Socket.IO to broadcast across multiple server instances via Redis pub/sub. |
| **Pino / pino-http** | `^10.4.0` / `^11.0.0` | Structured JSON logging, request logging, request ids, secret redaction. |
| **Vitest** | `^5.1.0` | Fast TypeScript test runner for integration tests. |
| **Supertest** | `^7.3.2` | HTTP assertions against the Express app without opening a network port. |
| **mongodb-memory-server** | `^11.3.0` | Disposable MongoDB for isolated integration tests. |
| **Typescript 6** | `^6.0.2` | Static type checking for the entire codebase. |

---

## 3. Directory Structure

```
backend/
├── .env                          # Environment variables (git-ignored)
├── .env.example
├── Dockerfile
├── openapi.yaml                  # OpenAPI 3.0 contract
├── postman/                      # Postman collection
├── loadtest/k6.js                # k6 read-heavy load scenario
├── tests/                        # Vitest + Supertest + Socket.IO tests
├── vitest.config.mts
├── tsconfig.test.json
├── package.json
├── tsconfig.json
├── nodemon.json
├── pnpm-lock.yaml
└── src/
    ├── index.ts                  # Bootstrap: HTTP server, Socket.IO, DB connect, shutdown
    ├── app.ts                    # createApp(): middleware, health check, routes, error handler
    ├── @types/
    │   └── express.d.ts          # Global type augmentation for Express.Request and Express.User
    ├── config/
    │   ├── cloudinary.config.ts   # Cloudinary SDK configuration
    │   ├── database.config.ts     # Mongoose connection logic
    │   ├── env.config.ts          # Typed environment variable accessor
    │   ├── http.config.ts         # HTTP status codes enum
    │   ├── media.config.ts        # Media MIME/size rules and payload validation
    │   ├── passport.config.ts     # Passport JWT strategy setup
    │   └── redis.config.ts        # Optional Redis adapter for Socket.IO scaling
    ├── controllers/              # Request handlers (validate → call service → respond)
    │   ├── auth.controller.ts
    │   ├── chat.controller.ts
    │   ├── message.controller.ts
    │   └── user.controller.ts
    ├── lib/
    │   ├── logger.ts             # Pino structured logger (redacts secrets)
    │   ├── presence.ts           # Redis-backed presence/typing state with in-memory fallback
    │   └── socket.ts             # Socket.IO initialization, event handlers, emitter functions
    ├── middlewares/
    │   ├── asyncHandler.middleware.ts   # Wraps async route handlers to catch rejected promises
    │   ├── errorHandler.middleware.ts   # Global Express error handler (AppError, ZodError, CastError, unexpected)
    │   ├── rateLimit.middleware.ts      # Rate limiters for auth and message-send routes
    │   ├── requestLogger.middleware.ts  # pino-http logging + x-request-id generation
    │   └── socketAuth.middleware.ts     # Socket.IO authentication middleware (JWT from cookie)
    ├── models/                   # Mongoose schemas and models
    │   ├── user.model.ts
    │   ├── chat.model.ts
    │   └── message.model.ts
    ├── routes/
    │   ├── index.ts              # Aggregates and mounts all route modules under /api/v1
    │   ├── auth.route.ts
    │   ├── chat.route.ts
    │   ├── message.route.ts
    │   └── user.route.ts
    ├── services/                 # Business logic layer (all DB queries, socket emitters, cloudinary uploads)
    │   ├── auth.service.ts
    │   ├── chat.service.ts
    │   ├── message.service.ts
    │   └── user.service.ts
    ├── utils/
    │   ├── app-error.ts          # Custom error classes (AppError → BadRequest, NotFound, Unauthorized, Internal)
    │   ├── bcrypt.ts             # Password hashing and comparison helpers
    │   ├── cookie.ts             # JWT cookie set/clear utilities
    │   ├── get-env.ts            # Safe environment variable getter (throws on missing required vars)
    │   └── validate.ts           # Shared Zod validation helper used by controllers
    └── validators/               # Zod schemas for request validation
        ├── auth.validator.ts
        ├── chat.validator.ts
        ├── common.validator.ts   # Shared objectIdSchema
        ├── message.validator.ts
        └── user.validator.ts
```

---

## 4. Architectural Pattern: Layered Architecture

Every feature follows a strict three-layer separation of concerns:

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Routes    │ ──▶ │ Controllers  │ ──▶ │  Services  │ ──▶  Models
│ (HTTP map)  │     │ (validate,   │     │ (business  │      (Mongoose)
│             │     │  call, resp) │     │  logic)    │
└─────────────┘     └──────────────┘     └────────────┘
                           │                     │
                           │                     ▼
                      Validators              Socket.IO
                       (Zod)                (emitters)
```

**Route layer** (`routes/*.ts`): Maps HTTP methods + paths to controller functions. Applies `passportAuthenticateJwt` middleware via `router.use()` for protected routes. Pure wiring — no logic.

**Controller layer** (`controllers/*.ts`): Receives the Express request, validates input using Zod (`.parse()` or `.safeParse()`), calls the appropriate service function, and sends back a structured JSON response. Controllers never touch the database directly.

**Service layer** (`services/*.ts`): Contains all business logic, database queries, Cloudinary uploads, and Socket.IO emissions. Services throw typed `AppError` subclasses on failure — they never handle response formatting.

**Model layer** (`models/*.ts`): Mongoose schema definitions with validation, indexes, pre-save hooks, and instance methods.

---

## 5. Request Lifecycle (Step by Step)

Here's exactly what happens when a client sends `POST /api/v1/messages` (send a message):

```
Client                           Server
  │                                │
  │  POST /api/v1/messages         │
  │  Cookie: accessToken=xxx       │
  │  Body: { chatId, messageType,  │
  │         content }              │
  │                                │
  ▼                                ▼
  1. Express receives the request
     └─ helmet() adds security headers
     └─ cors() checks origin
     └─ cookieParser() parses cookies → req.cookies.accessToken
     └─ express.json() parses body → req.body

  2. Routes (src/routes/message.route.ts:11)
     └─ passportAuthenticateJwt middleware runs:
        ├─ passport-jwt extracts token from req.cookies.accessToken
        ├─ verifies with JWT_SECRET
        ├─ loads user via findByIdUserService()
        └─ attaches to req.user

  3. sendMessageController (src/controllers/message.controller.ts:16)
     ├─ Reads req.user._id (throws UnauthorizedException if missing)
     ├─ Parses req.body with sendMessageSchema (Zod discriminated union)
     │  └─ Throws ZodError if invalid
     └─ Calls sendMessageService(userIdStr, body)

  4. sendMessageService (src/services/message.service.ts:19)
     ├─ Verifies chat exists & user is participant
     ├─ Uploads media to Cloudinary if mediaUrl provided
     ├─ Validates replyTo message if replyToId provided
     ├─ Creates Message document in MongoDB
     ├─ Updates Chat document (lastMessage, lastMessageAt)
     ├─ Populates sender and replyTo on the new message
     ├─ Emits message:new to chat room via Socket.IO
     ├─ Emits chat:update to all participants' personal rooms
     └─ Returns { message, chat }

  5. Controller sends response:
     res.status(201).json({
       message: "Message sent successfully",
       messageData: { ... },
       chat: { ... }
     })

  6. Global errorHandler catches any uncaught errors
```

### Socket.IO path (for the same message reaching other clients):

```
sendMessageService
  └─ emitNewMessageToChatRoom(chatId, newMessage)
     └─ getIO().to("chat:<chatId>").emit("message:new", message)
        ├─ Sender's other devices: receive the message (client deduplicates)
        └─ Other participants' devices: receive the message
```

---

## 6. Database Schema & Relationships

### User (`src/models/user.model.ts`)

```
┌──────────────────────────────────────┐
│  User                                │
├──────────────────────────────────────┤
│  _id        ObjectId (PK)            │
│  name       String (required, trim)  │
│  email      String (required, uni… ) │
│  password   String (required, hid… ) │
│  avatar     String | null            │
│  isOnline   Boolean (default false)  │
│  lastSeen   Date (default now)       │
│  createdAt  Date (auto)              │
│  updatedAt  Date (auto)              │
├──────────────────────────────────────┤
│  Index: { email: 1, createdAt: -1 }  │
│  Pre-save: hash password if modified │
│  Method: comparePassword(val)        │
│  toJSON: strips password field       │
└──────────────────────────────────────┘
```

### Chat (`src/models/chat.model.ts`)

```
┌──────────────────────────────────────────┐
│  Chat                                    │
├──────────────────────────────────────────┤
│  _id           ObjectId (PK)              │
│  participants  ObjectId[] (ref: User)    │
│  lastMessage   ObjectId? (ref: Message)  │
│  lastMessageAt Date (default now)         │
│  lastReadBy    [{ user, lastReadAt }]    │  ← read/unread watermark
│  isGroup       Boolean (default false)    │
│  directKey     String? (unique 1:1 pair)  │
│  groupName     String? (required if gr…) │
│  groupAvatar   String?                    │
│  admins        ObjectId[] (ref: User)    │
│  createdBy     ObjectId (ref: User)      │
│  createdAt     Date (auto)               │
│  updatedAt     Date (auto)               │
├──────────────────────────────────────────┤
│  Indexes:                                │
│   { participants: 1, lastMessageAt: -1 } │
│   { directKey: 1 } (unique, sparse)      │
│   { isGroup: 1, updatedAt: -1 }         │
│  Pre-save: sort & dedupe participants    │
│    for non-group chats                   │
│  directKey = sorted participant ids      │
│    (prevents duplicate 1:1 chats)        │
└──────────────────────────────────────────┘
```

### Message (`src/models/message.model.ts`)

```
┌──────────────────────────────────────────┐
│  Message                                 │
├──────────────────────────────────────────┤
│  _id          ObjectId (PK)               │
│  chatId       ObjectId (ref: Chat)       │
│  sender       ObjectId? (ref: User)      │
│  messageType  enum(text|image|audio|     │
│                 video|file|system)        │
│  content      String? (trim)             │
│  mediaUrl     String?                     │
│  replyTo      ObjectId? (ref: Message)   │
│  editedAt     Date | null                 │
│  isPinned     Boolean (default false)    │
│  pinnedBy     ObjectId? (ref: User)      │
│  pinnedAt     Date | null                │
│  isDeleted    Boolean (default false)     │
│  createdAt    Date (auto)                │
│  updatedAt    Date (auto)                │
├──────────────────────────────────────────┤
│  Indexes:                                │
│   { chatId: 1, isDeleted: 1,            │
│     createdAt: -1, replyTo: 1 }         │
│   { chatId: 1, sender: 1, createdAt: -1 }│
│   { chatId: 1, isPinned: 1, pinnedAt: -1}│
│   { content: "text" }                   │
│  Pre-validate: enforce content/mediaUrl  │
│    presence based on messageType         │
└──────────────────────────────────────────┘
```

Read state is **chat-level**, not per-message: `Chat.lastReadBy` is the source
of truth. `Message.isRead` has been removed to avoid a second, drifting truth.
`GET /chats` derives `unreadCount` with one aggregation over the returned page's
chats: messages where `createdAt > lastReadAt`, `sender != currentUser`,
`isDeleted != true`, and `messageType != "system"`.

**Existing deployments:** the old `{ participants: 1 }` unique partial index
was replaced by `Chat.directKey`. Backfill/deduplicate existing direct chats
before enabling the new unique index in production. New direct chats set
`directKey` automatically.

```javascript
// Run once against an existing database, after resolving duplicates.
db.chats.dropIndex("participants_1");
db.chats.find({ isGroup: false, directKey: { $exists: false } }).forEach((chat) => {
  db.chats.updateOne(
    { _id: chat._id },
    { $set: { directKey: chat.participants.map(String).sort().join(":") } },
  );
});
```

### Entity Relationships

```
User ──< Participant >── Chat ──< Message
 │                          │
 └── lastReadBy ────────────┘
     (embedded sub-doc)

Chat.lastMessage ──> Message (denormalized reference for sidebar)
Message.replyTo   ──> Message (self-reference for reply chains)
Chat.createdBy    ──> User
Chat.admins       ──> User[]  (only for groups)
```

---

## 7. Authentication & Authorization

### Flow

```
┌─────────┐         ┌──────────┐         ┌──────────┐
│ Register│ ───────▶│  Login   │ ───────▶│ JWT in   │
│  POST   │         │  POST    │         │ httpOnly │
│ /auth/  │         │ /auth/   │         │  cookie  │
└─────────┘         └──────────┘         └──────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │ Passport JWT      │
                                         │ Strategy extracts │
                                         │ from cookie,      │
                                         │ verifies, loads   │
                                         │ user → req.user   │
                                         └──────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────┐
                                         │ passportAuthenti- │
                                         │ cateJwt middleware│
                                         │ applied to routes │
                                         └──────────────────┘
```

### Implementation details

- **Cookie name**: `accessToken` (consistent across `cookie.ts`, `passport.config.ts`, and `socketAuth.middleware.ts`)
- **JWT payload**: `{ userId: string }`
- **JWT options**: `audience: ["user"]`, `issuer: "Buzzie"`, `algorithm: HS256`
- **Cookie options**: `httpOnly: true`, `secure: true` in production, `sameSite: "lax"`, `path: "/"`
- **Expiration**: Configurable via `JWT_EXPIRES_IN` env var (default: `7d`)
- **Token strategy**: A single stateless access token is stored in an httpOnly
  cookie with a 7-day lifetime. There is intentionally no refresh-token rotation
  yet; the client re-authenticates when the cookie expires. The planned upgrade
  is a short-lived access token plus a rotating refresh token in an httpOnly
  cookie with a `/auth/refresh` endpoint. Tokens are never exposed to JavaScript.

### Socket authentication

Socket connections use the same JWT cookie, extracted and verified in `socketAuth.middleware.ts`. The middleware parses the `Cookie` header properly (handles multiple cookies), verifies the JWT, and attaches `userId` to the socket object.

### Authorization rules

| Action | Auth check |
|---|---|
| View chat | Must be in `chat.participants` |
| Send message | Must be in `chat.participants` |
| Edit message | Must be `message.sender`; text messages only |
| Delete message | Must be `message.sender` |
| Pin/unpin message | Must be in `chat.participants` |
| Leave group | Must be in `chat.participants` (group only) |
| Add/remove member | Must still be a participant and in `chat.admins` or `chat.createdBy` (group only); otherwise 403 |
| Update group name/avatar | Must still be a participant and in `chat.admins` or `chat.createdBy` (group only); otherwise 403 |
| Mark as read | Must be in `chat.participants` |

---

## 8. API Route Map

### Auth (`/api/v1/auth`)

| Method | Path | Auth | Controller | Description |
|---|---|---|---|---|
| POST | `/register` | No | `registerController` | Create account & set JWT cookie |
| POST | `/login` | No | `loginController` | Login & set JWT cookie |
| POST | `/logout` | Yes | `logoutController` | Clear JWT cookie |
| GET | `/status` | Yes | `authStatusController` | Get current authenticated user |

### Users (`/api/v1/users`)

| Method | Path | Auth | Controller | Description |
|---|---|---|---|---|
| GET | `/` | Yes | `getUsersController` | List users (search, paginated) |
| GET | `/presence` | Yes | `getUsersPresenceController` | Presence snapshot for comma-separated `ids` (max 50) |
| PATCH | `/me` | Yes | `updateProfileController` | Update own `name` and/or `avatar` |

### Chats (`/api/v1/chats`)

| Method | Path | Auth | Controller | Description |
|---|---|---|---|---|
| POST | `/` | Yes | `createChatController` | Create 1-to-1 or group chat |
| GET | `/` | Yes | `getUserChatsController` | List user's chats (`page`, `limit`); each chat includes `unreadCount` |
| GET | `/:id` | Yes | `getSingleChatController` | Get chat + latest 50 messages |
| PATCH | `/:id/members/add` | Yes | `addMemberController` | Add member to group |
| PATCH | `/:id/members/remove` | Yes | `removeMemberController` | Remove member from group |
| DELETE | `/:id/members/me` | Yes | `leaveGroupChatController` | Leave a group chat (admin/creator transfer rules below) |
| PATCH | `/:id/group-name` | Yes | `updateGroupNameController` | Update group name |
| PATCH | `/:id/group-avatar` | Yes | `updateGroupAvatarController` | Update group avatar |

### Messages (`/api/v1/messages`)

| Method | Path | Auth | Controller | Description |
|---|---|---|---|---|
| POST | `/` | Yes | `sendMessageController` | Send a message |
| GET | `/` | Yes | `getMessagesController` | Get messages (`cursor`, or `since` for backfill) |
| GET | `/search` | Yes | `searchMessagesController` | Text search (`q`, optional `chatId`, `page`, `limit`) |
| GET | `/pinned` | Yes | `getPinnedMessagesController` | Pinned messages for a chat (`chatId`, `page`, `limit`) |
| PATCH | `/:chatId/read` | Yes | `markAsReadController` | Mark chat as read; returns `lastReadAt` |
| PATCH | `/:chatId/:messageId` | Yes | `editMessageController` | Edit own text message (`content`); sets `editedAt` |
| PATCH | `/:chatId/:messageId/pin` | Yes | `pinMessageController` | Pin/unpin (`{ pinned: boolean }`) |
| DELETE | `/:chatId/:messageId` | Yes | `deleteMessageController` | Soft-delete a message |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Readiness check: Mongo + optional Redis. Returns 200 when ready, 503 otherwise, with a `checks` object. |

---

## 9. Socket.IO Architecture

### Initialization (`src/lib/socket.ts`)

```
index.ts
  └─ http.createServer(app)
       └─ initializeSocket(server)
            ├─ new Server(httpServer, { cors, pingInterval, pingTimeout })
            ├─ setupRedisAdapter(io)          // Optional — only if REDIS_URL is set
            ├─ io.use(socketAuthMiddleware)    // JWT verification
            └─ io.on("connection", handler)
```

### Rooms

| Room pattern | Purpose | When joined |
|---|---|---|
| `user:<userId>` | Personal notification room | On connect (one per user) |
| `chat:<chatId>` | Chat room for real-time messages | Auto-join on connect (all user's chats) + Manual via `chat:join` |

### Socket Events: Client → Server

| Event | Payload | Handler | Description |
|---|---|---|---|
| `chat:join` | `chatId: string` | Validates participant, joins `chat:<chatId>` | Manually join a chat room |
| `chat:leave` | `chatId: string` | Leaves `chat:<chatId>` | Leave a chat room |
| `typing:start` | `chatId: string` | Broadcasts to room (2s Redis/memory throttle) | User started typing |
| `typing:stop` | `chatId: string` | Broadcasts to room | User stopped typing |
| `disconnect` | — | Removes from Redis/local presence, updates DB, emits `user:offline` | Connection lost |

### Socket Events: Server → Client

| Event | Payload | Emitter | When |
|---|---|---|---|
| `user:online` | `{ userId }` | `connection` handler | User's first socket connects |
| `user:offline` | `{ userId }` | `disconnect` handler | User's last socket disconnects |
| `chat:new` | Chat document | `emitNewChatToParticipants` | Chat created |
| `chat:update` | `{ chatId, lastMessage }` | `emitLastMessageToParticipants` | New message updates sidebar |
| `chat:updated` | Chat document | `emitChatUpdated` | Group mutation (member/name/avatar) |
| `chat:removed` | `{ chatId }` | `emitChatRemoved` | User left/was removed from a chat |
| `message:new` | Message document | `emitNewMessageToChatRoom` | New message in chat |
| `message:updated` | Message document | `emitMessageUpdated` | Message edited, pinned, or unpinned |
| `message:read` | `{ chatId, userId, lastReadAt }` | `emitMessageRead` | Messages marked as read |
| `message:deleted` | `{ chatId, messageId }` | `emitMessageDeleted` | Message soft-deleted |
| `typing:start` | `{ userId, chatId }` | Socket event handler | User started typing |
| `typing:stop` | `{ userId, chatId }` | Socket event handler | User stopped typing |

### Emitter Functions (`src/lib/socket.ts`)

All emitter functions are exported and used by services. They follow a consistent pattern:

```typescript
// Example:
export const emitNewMessageToChatRoom = (chatId: string, message: Record<string, any>) => {
  getIO().to(`chat:${chatId}`).emit("message:new", message);
};
```

Key emitters:

| Function | Target | Event | Used by |
|---|---|---|---|
| `emitNewChatToParticipants(ids, chat)` | Each participant's `user:<id>` room | `chat:new` | `chat.service.ts` |
| `emitNewMessageToChatRoom(chatId, msg)` | `chat:<chatId>` room | `message:new` | `message.service.ts` |
| `emitLastMessageToParticipants(ids, chatId, msg)` | Each participant's `user:<id>` room | `chat:update` | `message.service.ts` |
| `emitMessageRead(chatId, userId, date)` | `chat:<chatId>` room | `message:read` | `message.service.ts` |
| `emitMessageDeleted(chatId, msgId)` | `chat:<chatId>` room | `message:deleted` | `message.service.ts` |
| `emitMessageUpdated(chatId, msg)` | `chat:<chatId>` room | `message:updated` | `message.service.ts` |
| `emitChatUpdated(chat)` | Each participant's `user:<id>` room | `chat:updated` | `chat.service.ts` |
| `emitChatRemoved(userId, chatId)` | User's `user:<id>` room | `chat:removed` | `chat.service.ts` |
| `isUserOnline(userId)` | — | — | Async utility (Redis-aware) |
| `getUserSocketIds(userId)` | — | — | Async utility via Socket.IO adapter |

---

## 10. Validation Layer

Validation is performed at the **controller layer** using **Zod** schemas defined in `src/validators/`.

### Shared validation helper

All controllers use the same helper:

```typescript
// src/utils/validate.ts
import { type ZodType } from "zod";

export const validate = <T>(schema: ZodType<T>, data: unknown): T =>
  schema.parse(data);
```

```typescript
const body = validate(createChatSchema, req.body);
const { id } = validate(chatIdSchema, req.params);
const query = validate(getMessagesQuerySchema, req.query);
```

`validate()` throws `ZodError`, which the global error handler converts to a
**400** response with `{ message, errorCode: "ERR_BAD_REQUEST", issues }`.
This replaces the older mix of `.parse()` and hand-written `.safeParse()`
checks. All identifier fields use `objectIdSchema` so malformed IDs are rejected
by Zod (400) instead of reaching Mongoose and becoming 500s.

### Validator files

| File | Schemas |
|---|---|
| `auth.validator.ts` | `registerSchema`, `loginSchema`, `RegisterSchemaType`, `LoginSchemaType` |
| `chat.validator.ts` | `createChatSchema` (discriminated union), `chatIdSchema`, `memberActionBodySchema`, `updateGroupNameBodySchema`, `updateGroupAvatarBodySchema`, `getChatsQuerySchema` |
| `common.validator.ts` | `objectIdSchema`, `paginationQuerySchema` |
| `message.validator.ts` | `sendMessageSchema`, `getMessagesQuerySchema` (`cursor`/`since`), `markAsReadSchema`, `deleteMessageSchema`, `editMessageSchema`, `editMessageBodySchema`, `pinMessageSchema`, `pinMessageBodySchema`, `searchMessagesQuerySchema`, `getPinnedMessagesQuerySchema` |
| `user.validator.ts` | `getUsersQuerySchema`, `updateProfileSchema`, `presenceQuerySchema` |

### Discriminated Union Pattern

Message validation uses Zod's discriminated union to enforce structural constraints based on `messageType`:

```typescript
export const sendMessageSchema = z.discriminatedUnion("messageType", [
  base.extend({ messageType: z.literal("text"), content: z.string().trim().min(1) }),
  base.extend({ messageType: z.enum(["image", "audio", "video", "file"]), mediaUrl: z.string().trim().min(1) }),
]);
```

This ensures:
- Text messages **must** have `content`
- Media messages **must** have `mediaUrl`
- No other fields are allowed (`.strict()` on the base schema)

---

## 11. Error Handling

### Custom Error Class Hierarchy (`src/utils/app-error.ts`)

```
AppError (base)
  ├── statusCode: HttpStatusCodeType
  └── errorCode: ErrorCodeType
       │
       ├── BadRequestException (400)
       ├── UnauthorizedException (401)
       ├── ForbiddenException (403)
       ├── NotFoundException (404)
       └── InternalServerException (500)
```

### Global Error Handler (`src/middlewares/errorHandler.middleware.ts`)

All uncaught errors flow to this middleware:

```typescript
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));
    return res.status(400).json({
      message: issues.map((i) => i.message).join(", ") || "Invalid request",
      errorCode: "ERR_BAD_REQUEST",
      issues,
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      message: "Invalid identifier",
      errorCode: "ERR_BAD_REQUEST",
      issues: [{ path: error.path, message: "Invalid identifier", code: "invalid_id" }],
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  // Unknown errors → 500 (internal message only exposed outside production)
  return res.status(500).json({
    message: "Internal Server Error",
    errorCode: "ERR_INTERNAL",
  });
};
```

### asyncHandler (`src/middlewares/asyncHandler.middleware.ts`)

Wraps async route controllers so rejected promises are forwarded to `next(error)`:

```typescript
export const asyncHandler = (controller: AsyncController) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await controller(req, res, next);
    } catch (error) {
      next(error);
    }
  };
```

> **Note:** Express 5 natively catches rejected promises from async route handlers, so `asyncHandler` is technically redundant. It remains for explicit clarity and backward compatibility.

### Error response format

All errors return consistent JSON:

```json
{
  "message": "User not found",
  "errorCode": "ERR_NOT_FOUND"
}
```

Validation failures additionally include an `issues` array:

```json
{
  "message": "Invalid email address, Password must be at least 6 characters",
  "errorCode": "ERR_BAD_REQUEST",
  "issues": [
    { "path": "email", "message": "Invalid email address", "code": "invalid_format" },
    { "path": "password", "message": "Password must be at least 6 characters", "code": "too_small" }
  ]
}
```

---

## 12. Middleware Chain

The middleware order in `src/app.ts` is important:

```
1. requestLogger                    — pino-http logs + x-request-id
2. helmet()                         — Security headers
2. express.json({ limit: "10mb" })  — Parse JSON bodies (10MB limit for media uploads)
3. express.urlencoded({ extended: true }) — Parse URL-encoded bodies
4. cookieParser()                   — Parse cookies into req.cookies
5. cors()                           — CORS headers (origin: FRONTEND_ORIGIN, credentials: true)
6. passport.initialize()            — Initialize Passport
7. /health                          — Readiness endpoint (no auth; Mongo + optional Redis)
8. /api/v1                          — All API routes (auth via passportAuthenticateJwt per-route)
   └─ authRateLimiter               — Login/register limiter (route-level)
   └─ sendMessageRateLimiter        — Message-send limiter (route-level)
9. errorHandler                     — Global error handler (must be last)
```

`createApp()` builds the Express app. `src/index.ts` then attaches it to an
HTTP server and calls `initializeSocket(server)`, because Socket.IO attaches to
the raw HTTP server rather than the Express app:

```typescript
const app = createApp();
const server = http.createServer(app);
initializeSocket(server);
```

---

## 13. File Upload Flow

The app uses a **client-to-server-to-Cloudinary** architecture (not direct client upload):

```
Client                     Server                    Cloudinary
  │                          │                          │
  │  POST /api/v1/messages   │                          │
  │  { mediaUrl: "data:…" } │                          │
  │  or { mediaUrl: "https:…│                          │
  └─────────────────────────▶│                          │
                             │                          │
                             │  cloudinary.uploader.    │
                             │ upload(mediaUrl, {       │
                             │   folder: "chat-app",    │
                             │   resource_type: "auto"  │
                             │ })                       │
                             └─────────────────────────▶│
                             │                          │
                             │  ← secure_url            │
                             │                          │
                             │  Store secure_url in     │
                             │  Message.mediaUrl        │
                             │                          │
```

The controller accepts a base64 data URI or an `http(s)` URL in `mediaUrl`.
Cloudinary processes it and returns a CDN URL. Supported message types that
require media: `image`, `audio`, `video`, `file`.

### Upload hardening (`src/config/media.config.ts`)

Validation runs **before** the Cloudinary call:

| Type | Max decoded size | Allowed MIME types |
|---|---|---|
| image | 4 MB | image/jpeg, image/png, image/gif, image/webp |
| audio | 6 MB | audio/mpeg, audio/mp4, audio/ogg, audio/wav, audio/webm |
| video | 6 MB | video/mp4, video/webm, video/quicktime |
| file | 6 MB | PDF, plain text, zip, Word, Excel, octet-stream |

- Data URIs must match `data:<mime>;base64,<payload>` and decode within the limit.
- Remote media URLs must use `http:` or `https:`; other schemes are rejected.
- Invalid shapes and unsupported MIME types return `400 ERR_BAD_REQUEST`.
- The JSON body limit remains 10 MB, so the media limits above fit inside it.

**Signed direct uploads** were considered but deferred: the current frontend
contract sends base64/URL through `POST /messages`, and direct-to-Cloudinary
uploads would require a new signing endpoint plus a client-side flow change.
Server-side MIME/size checks remove the most obvious abuse path in the meantime.

---

## 14. Pagination Strategy

### Messages: Cursor-based pagination

Messages use cursor-based pagination (keyset pagination) for efficiency and consistency (new messages don't shift page boundaries):

```typescript
// src/services/message.service.ts
const messageQuery: any = { chatId, isDeleted: false };
if (cursor) {
  messageQuery._id = { $lt: new mongoose.Types.ObjectId(cursor) };
}

const messages = await MessageModel.find(messageQuery)
  .sort({ _id: -1 })   // newest first
  .limit(limit)
  .lean();

const nextCursor = messages.length === limit ? messages[messages.length - 1]._id : null;
```

**How it works:**
- MongoDB `_id` contains a timestamp, so sorting by `_id` is equivalent to sorting by creation time
- The client sends the last message's `_id` as the `cursor` query param
- The server fetches messages with `_id < cursor` (older than the cursor)
- If fewer results than `limit` are returned, there are no more pages (`nextCursor: null`)

### Messages: `since` backfill

For reconnect backfill, `GET /messages?chatId=&since=<ISO>` returns messages with
`createdAt > since`, sorted **oldest-first**, limited to `limit` (max 100).
`since` and `cursor` are mutually exclusive. If `nextSince` is non-null, use it
as the next `since` value.

### Chats, search, and pinned lists: Offset pagination

`GET /chats`, `GET /messages/search`, and `GET /messages/pinned` use
`page`/`limit` (default 20, max 50) and return a `pagination` object with
`{ page, limit, total, totalPages }`. The chat list query uses
`{ participants: 1, lastMessageAt: -1 }`; search uses the text index plus chat
membership scoping; pinned queries use `{ chatId, isPinned, pinnedAt }`.
Search requires the `{ content: "text" }` index to exist; ensure model indexes
are synced on deploy (`autoIndex` handles development, but production migrations
should create it explicitly).

### Users: Offset-based pagination

Users use offset pagination (page/limit) since the user list is relatively small and stable:

```typescript
const skip = (page - 1) * limit;
const users = await UserModel.find(query)
  .skip(skip)
  .limit(limit)
  .lean();
const total = await UserModel.countDocuments(query);
```

---

## 15. Multi-Device Socket Support

The socket layer supports a single user connecting from multiple devices/browser tabs simultaneously.

### Data structure (Redis-aware)

Presence lives in `src/lib/presence.ts`. When `REDIS_URL` is configured it uses
a Redis sorted set per user:

```
buzzie:presence:user:<userId>   ZSET member=socketId score=expiryTimestamp
buzzie:typing:<userId>:<chatId> STRING with 2s TTL (SET NX PX throttle)
```

Each socket refreshes its ZSET entry every 30 seconds; entries expire after 60
seconds and the key itself expires after 5 minutes without activity. With no
Redis configured, the same API falls back to in-memory maps for local
development.

### Connection logic

- `addUserSocket()` returns `wasOffline` by checking the Redis ZSET count before
  adding the socket.
- First socket globally: `user:online` emitted, DB `isOnline` set to `true`.
- Subsequent sockets (same or different instance): no broadcast.

### Disconnection logic

- `removeUserSocket()` removes the socket, prunes expired members, and returns
  `nowOffline` only when no live sockets remain across instances.
- Last socket globally: `user:offline` emitted, DB `isOnline` set to `false`.
- Intermediate sockets: no broadcast.

### Typing throttle

`throttleTyping()` uses Redis `SET NX PX 2000` so the throttle is shared across
instances. `typing:stop` clears the key; keys also expire automatically. On
disconnect, local typing entries are cleared.

### Presence snapshot

`GET /users/presence?ids=<id1>,<id2>` returns
`{ presences: [{ userId, isOnline, lastSeen }] }`. Redis status is authoritative
when configured; otherwise the local in-memory presence is used. The persisted
`User.isOnline` field is kept in sync for list/search payloads.

---

## 16. Group Chat Management

### Creation

Group chats are created via `POST /api/v1/chats` with `{ isGroup: true, participants: [...], groupName: "..." }`.

Constraints:
- Creator must **not** include themselves in `participants` (they are added automatically)
- Minimum **3 total participants** (creator + 2 others)
- Participants must be unique
- All participant IDs must exist in the DB

### Administration

All group mutations require the requesting user to be either:
- In the `chat.admins` array
- The `chat.createdBy` user

| Action | Endpoint | Service |
|---|---|---|
| Add member | `PATCH /chats/:id/members/add` | `addMemberToGroupService` |
| Remove member | `PATCH /chats/:id/members/remove` | `removeMemberFromGroupService` |
| Update name | `PATCH /chats/:id/group-name` | `updateGroupNameService` |
| Update avatar | `PATCH /chats/:id/group-avatar` | `updateGroupAvatarService` |

Each mutation:
1. Validates the chat exists and is a group
2. Verifies admin/creator authorization
3. Performs the mutation on the Chat document
4. Reloads the chat with populated participants
5. Emits `chat:updated` to remaining participants; removals also emit
   `chat:removed` to the affected user

### Add member details

The new member is added to:
- `chat.participants` array
- `chat.lastReadBy` array (with `lastReadAt: now()`)

### Remove member details

When removed, the user is pulled from:
- `chat.participants`
- `chat.admins` (if they were an admin)
- `chat.lastReadBy`

Removal is rejected if fewer than 2 participants would remain. If the removed
user was the creator, `createdBy` is transferred to an admin or the first
remaining participant; if no admins remain, one is promoted.

### Self-leave rules

`DELETE /chats/:id/members/me` applies to groups only:

1. The user must still be a participant.
2. At least **2 participants must remain** after leaving; otherwise 400.
3. The user is removed from `participants`, `admins`, and `lastReadBy`.
4. If no admins remain, the first remaining participant is promoted.
5. If the creator leaves, `createdBy` is transferred to an admin (or the first
   remaining participant).
6. Remaining members receive `chat:updated`; the leaver receives `chat:removed`.

---

## 17. Horizontal Scaling

### Socket.IO Redis Adapter

For production deployments with multiple server instances, the Redis adapter enables cross-instance broadcast:

```typescript
// src/config/redis.config.ts
if (!Env.REDIS_URL) return;   // Optional — no-op in development

const pubClient = new Redis(Env.REDIS_URL);
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

**How it works:**
- Each server instance publishes events to Redis
- All instances subscribe to Redis and receive cross-instance events
- `io.to(room).emit(...)` broadcasts to all instances' clients in that room

**Configuration:** Set `REDIS_URL` in `.env` to enable. Leave empty for single-instance development.

### Presence and typing across instances

Redis-backed presence/typing (`src/lib/presence.ts`) is shared across instances:

- `isUserOnline()` and the presence snapshot read the Redis ZSET, not local maps.
- Typing throttles use Redis `SET NX PX`, so one user cannot bypass the throttle
  by hitting a different instance.
- Socket-ID lookup uses `io.in("user:<id>").fetchSockets()`, which works through
  the Redis adapter.
- Without Redis, everything still works within a single instance using the
  in-memory fallback.

---

## 18. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Environment name |
| `PORT` | No | `8000` | HTTP server port |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | No | `secret_jwt` | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `7d` | Access-token lifetime (ms format) |
| `FRONTEND_ORIGIN` | No | `http://localhost:5173` | CORS allowed origin |
| `LOG_LEVEL` | No | `info` | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) |
| `REDIS_URL` | No | `""` | Redis URL (optional, for Socket.IO scaling + readiness check) |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | **Yes** | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | **Yes** | — | Cloudinary API secret |

Copy `backend/.env.example` to `.env` and fill in real values. `.env` is
git-ignored; never commit secrets.

---

## 19. Development Setup

### Prerequisites
- Node.js >= 18
- pnpm (or npm/yarn)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# At minimum: MONGO_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

# Edit .env with your credentials

# Start development server (with hot reload)
pnpm dev

# Build for production
pnpm build
pnpm start
```

### Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start with nodemon (hot reload via ts-node) |
| `pnpm build` | Compile TypeScript to `dist/` (`tsc`) |
| `pnpm typecheck` | Type-check src and tests without emitting |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm start` | Run compiled JS from `dist/index.js` |

### Configuration files

| File | Purpose |
|---|---|
| `tsconfig.json` | TypeScript compiler options (target ES2021, strict mode, commonjs modules) |
| `tsconfig.test.json` | Type-checks `src/` plus `tests/` without emitting |
| `vitest.config.mts` | Vitest config (Node env, setup file, sequential files) |
| `nodemon.json` | Nodemon config (watches `src/` for `.ts` changes) |
| `.env` | Environment variables (git-ignored) |
| `.env.example` | Documented template of every supported env var (no secrets) |

### Production build & graceful shutdown

```bash
pnpm build
pnpm start
```

`tsconfig.json` uses `rootDir: "src"` and `outDir: "dist"`, so
`src/index.ts` compiles to `dist/index.js`.

On `SIGINT` or `SIGTERM` the server:

1. Stops accepting new work and closes Socket.IO connections.
2. Closes the HTTP server if it is still listening.
3. Disconnects Mongoose.
4. Quits Redis pub/sub clients when the adapter is enabled.
5. Exits with code 0, or forces exit after a 10-second timeout.

### Type checking

```bash
pnpm typecheck
# or
npx tsc --noEmit
```

---

## 20. Testing

### Automated suite

The backend uses **Vitest** as the runner, **Supertest** for HTTP integration
tests, **socket.io-client** for real WebSocket tests, and
**mongodb-memory-server** so tests do not need an external MongoDB.

```bash
pnpm test          # one run
pnpm test:watch    # watch mode
pnpm typecheck     # src + tests
```

The suite currently covers **27 tests across 6 files**:

| File | Coverage |
|---|---|
| `tests/auth.test.ts` | Register/login/logout, JWT cookie, auth status, validation errors, health, request ids |
| `tests/chats.test.ts` | 1:1 idempotency, group creation rules, list pagination, unread counts, invalid ids |
| `tests/messages.test.ts` | Send/list/cursor/`since` backfill, edit, pin/unpin, search, media rejection, delete, non-participants |
| `tests/authorization.test.ts` | Group admin add/remove, self-leave, creator transfer, profile update, presence snapshot |
| `tests/socket.test.ts` | Unauthenticated rejection, `user:online`, `chat:new`, `chat:join`, `message:new`, `message:updated` |
| `tests/validators.test.ts` | Media URL shape, MIME allow-list, size limits |

`tests/setup.ts` runs before each file, starts one in-memory MongoDB, connects
Mongoose, and clears collections between tests. Files run sequentially
(`fileParallelism: false`) because the app has a single global Socket.IO
instance.

### CI

`.github/workflows/backend-ci.yml` runs on pushes/PRs touching `backend/`:

1. Install pnpm + Node 22 with cache
2. `pnpm install --frozen-lockfile`
3. `pnpm typecheck`
4. `pnpm build`
5. `pnpm test`

### Legacy manual socket script

`scripts/test-socket.ts` remains available for manual end-to-end checks against
a running server:

```bash
# Terminal 1
pnpm dev

# Terminal 2
npx ts-node scripts/test-socket.ts
```

The automated `tests/socket.test.ts` suite is preferred for CI because it starts
its own server and database.

## 21. Security Considerations

### Authentication
- JWT stored in **httpOnly cookie** (not accessible via JavaScript)
- Cookie set with `secure: true` in production, `sameSite: "lax"`
- Passwords hashed with bcryptjs (salt rounds: 10)
- JWT includes `audience` and `issuer` claims for validation

### Authorization
- All chat operations verify the user is a participant
- Group mutations require admin or creator status
- Message deletion restricted to the original sender
- Socket connections authenticated via same JWT cookie

### Network
- Helmet middleware sets security headers (X-XSS-Protection, X-Content-Type-Options, etc.)
- CORS restricted to `FRONTEND_ORIGIN` only
- Request body limited to 10MB to prevent abuse
- Media payloads validated by MIME category and decoded size before upload
- Rate limiting: auth endpoints 20 requests/15 min in production (100 in dev);
  message sends 60/min in production (1000 in dev). Responses use 429 with
  `errorCode: "ERR_TOO_MANY_REQUESTS"`.
- Behind a single reverse proxy in production, Express `trust proxy` is enabled
  so client IPs are read correctly.

### Database
- Mongoose schemas enforce validation at the application layer
- `Chat.directKey` (unique, sparse) prevents duplicate 1-to-1 chats
- Unique user email index; partial/sparse indexes minimize index size
- Message text index powers server-side search

### Socket.IO
- Ping/pong with 25s interval and 20s timeout detects stale connections
- Authentication middleware rejects unauthenticated socket connections
- Typing events throttled to 1 per 2 seconds per user per chat
- Chat join events validate participant status server-side

---

## 22. Observability & Logging

### Structured logs

`src/lib/logger.ts` creates a Pino logger:

- JSON logs in every environment; level controlled by `LOG_LEVEL`
- base field `service: "buzzie-backend"`
- redacts `req.headers.authorization`, `req.headers.cookie`,
  `res.headers["set-cookie"]`, and password fields
- used by startup/shutdown, database/Redis helpers, Socket.IO error handlers,
  and the global error handler

### Request IDs

`src/middlewares/requestLogger.middleware.ts` uses `pino-http`:

- accepts an incoming `x-request-id` (max 100 chars) or generates a UUID
- returns the id in the `x-request-id` response header (also exposed via CORS)
- logs method, path, status, and latency; `/health` is excluded from access logs
- logs 4xx as `warn` and 5xx as `error`

Example local run:

```bash
LOG_LEVEL=debug pnpm dev
```

### Metrics

Prometheus metrics were left optional/deferred. Adding an unauthenticated
`/metrics` endpoint requires a network-exposure decision (private scrape network
or auth) and is better paired with a deployment target. The readiness endpoint
and structured logs cover the current single-service deployment needs.

---

## 23. API Documentation & Collections

- `openapi.yaml` — OpenAPI 3.0 contract for all REST endpoints, auth, error
  shapes, media limits, and pagination.
- `postman/Buzzie.postman_collection.json` — importable collection with auth,
  users, chats, messages, health, and test scripts that save `userId`, `chatId`,
  and `messageId` collection variables.

Preview/lint the OpenAPI file with any compatible tool, for example:

```bash
npx @redocly/cli lint openapi.yaml
npx @redocly/cli preview-docs openapi.yaml
```

The Postman collection uses Postman's cookie jar, so run **Register** or
**Login** first; the `accessToken` cookie is stored automatically.

---

## 24. Containerization & Load Testing

### Docker

`backend/Dockerfile` is a multi-stage build:

1. `deps` — install pnpm dependencies from the frozen lockfile
2. `build` — compile TypeScript and prune dev dependencies
3. `runner` — non-root `app` user, production `node_modules` + `dist`, healthcheck

Root `docker-compose.yml` starts:

- `mongo:8` with a persistent volume and `mongosh` healthcheck
- `redis:7-alpine` with a persistent volume and `redis-cli` healthcheck
- the API built from `backend/`, connected to Mongo/Redis

Set required values in the shell (or a root `.env`, which is git-ignored):

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export CLOUDINARY_CLOUD_NAME=...
export CLOUDINARY_API_KEY=...
export CLOUDINARY_API_SECRET=...

docker compose up --build
docker compose ps
curl http://localhost:8000/health
```

`JWT_SECRET` is required by Compose (`:?`), so the stack refuses to start with
the development fallback. Mongo and Redis ports are published for local
debugging; remove those port mappings in production.

### k6 load script

`loadtest/k6.js` runs a ramping read-heavy scenario against:

- `GET /health`
- `GET /api/v1/chats`
- `GET /api/v1/messages?chatId=...`
- `GET /api/v1/messages/pinned?chatId=...`

It registers two users and creates a direct chat in `setup()`, then reuses the
auth cookie. Thresholds: failed requests `<1%`, p95 `<500ms`, p99 `<1000ms`.

```bash
# Start the API (local or docker compose) first
k6 run -e BASE_URL=http://localhost:8000 -e VUS=20 backend/loadtest/k6.js
```

**Result status:** the script was added but not executed in this environment
because Docker and k6 are unavailable and the real MongoDB DNS lookup fails.
Run it against a reachable staging/local stack before making capacity claims.

---

*This guide covers the complete architecture of the Buzzie backend as of the latest update. For questions or contributions, refer to the repository's issue tracker.*
