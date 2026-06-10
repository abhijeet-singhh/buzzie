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

---

## 1. Project Overview

Buzzie is a real-time chat application backend built with **Express 5**, **Mongoose 9** (MongoDB), **Socket.IO 4**, and **Passport.js** (JWT auth via httpOnly cookies). It supports:

- One-to-one and group messaging
- Real-time message delivery via WebSockets
- Typing indicators and read receipts
- Media file uploads (images, audio, video, files) via Cloudinary
- Multi-device socket connections
- Cursor-based pagination for messages
- Soft-deletion of messages
- Group chat administration (add/remove members, update name/avatar)
- Horizontal scaling via optional Redis adapter

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
| **Typescript 6** | `^6.0.2` | Static type checking for the entire codebase. |

---

## 3. Directory Structure

```
backend/
├── .env                          # Environment variables (git-ignored)
├── package.json
├── tsconfig.json
├── nodemon.json
├── pnpm-lock.yaml
└── src/
    ├── index.ts                  # Entry point: creates Express app, HTTP server, Socket.IO, mounts middleware & routes
    ├── @types/
    │   └── express.d.ts          # Global type augmentation for Express.Request and Express.User
    ├── config/
    │   ├── cloudinary.config.ts   # Cloudinary SDK configuration
    │   ├── database.config.ts     # Mongoose connection logic
    │   ├── env.config.ts          # Typed environment variable accessor
    │   ├── http.config.ts         # HTTP status codes enum
    │   ├── passport.config.ts     # Passport JWT strategy setup
    │   └── redis.config.ts        # Optional Redis adapter for Socket.IO scaling
    ├── controllers/              # Request handlers (validate → call service → respond)
    │   ├── auth.controller.ts
    │   ├── chat.controller.ts
    │   ├── message.controller.ts
    │   └── user.controller.ts
    ├── lib/
    │   └── socket.ts             # Socket.IO initialization, event handlers, emitter functions
    ├── middlewares/
    │   ├── asyncHandler.middleware.ts   # Wraps async route handlers to catch rejected promises
    │   ├── errorHandler.middleware.ts   # Global Express error handler (distinguishes AppError vs unexpected)
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
    │   └── get-env.ts            # Safe environment variable getter (throws on missing required vars)
    └── validators/               # Zod schemas for request validation
        ├── auth.validator.ts
        ├── chat.validator.ts
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
│  lastReadBy    [{ user, lastReadAt }]    │
│  isGroup       Boolean (default false)    │
│  groupName     String? (required if gr…) │
│  groupAvatar   String?                    │
│  admins        ObjectId[] (ref: User)    │
│  createdBy     ObjectId (ref: User)      │
│  createdAt     Date (auto)               │
│  updatedAt     Date (auto)               │
├──────────────────────────────────────────┤
│  Indexes:                                │
│   { participants: 1, lastMessageAt: -1 } │
│   { participants: 1 } (unique, partial   │
│     filter: isGroup: false)              │
│   { isGroup: 1, updatedAt: -1 }         │
│  Pre-save: sort & dedupe participants    │
│    for non-group chats                   │
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
│  isRead       Boolean | null             │
│  isDeleted    Boolean (default false)     │
│  createdAt    Date (auto)                │
│  updatedAt    Date (auto)                │
├──────────────────────────────────────────┤
│  Indexes:                                │
│   { chatId: 1, isDeleted: 1,            │
│     createdAt: -1, replyTo: 1 }         │
│   { chatId: 1, sender: 1 }             │
│  Pre-validate: enforce content/mediaUrl  │
│    presence based on messageType         │
└──────────────────────────────────────────┘
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

### Socket authentication

Socket connections use the same JWT cookie, extracted and verified in `socketAuth.middleware.ts`. The middleware parses the `Cookie` header properly (handles multiple cookies), verifies the JWT, and attaches `userId` to the socket object.

### Authorization rules

| Action | Auth check |
|---|---|
| View chat | Must be in `chat.participants` |
| Send message | Must be in `chat.participants` |
| Delete message | Must be `message.sender` |
| Add/remove member | Must be in `chat.admins` or `chat.createdBy` (group only) |
| Update group name/avatar | Must be in `chat.admins` or `chat.createdBy` (group only) |
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

### Chats (`/api/v1/chats`)

| Method | Path | Auth | Controller | Description |
|---|---|---|---|---|
| POST | `/` | Yes | `createChatController` | Create 1-to-1 or group chat |
| GET | `/` | Yes | `getUserChatsController` | List user's chats |
| GET | `/:id` | Yes | `getSingleChatController` | Get chat + messages |
| PATCH | `/:id/members/add` | Yes | `addMemberController` | Add member to group |
| PATCH | `/:id/members/remove` | Yes | `removeMemberController` | Remove member from group |
| PATCH | `/:id/group-name` | Yes | `updateGroupNameController` | Update group name |
| PATCH | `/:id/group-avatar` | Yes | `updateGroupAvatarController` | Update group avatar |

### Messages (`/api/v1/messages`)

| Method | Path | Auth | Controller | Description |
|---|---|---|---|---|
| POST | `/` | Yes | `sendMessageController` | Send a message |
| GET | `/` | Yes | `getMessagesController` | Get messages (cursor paginated) |
| PATCH | `/:chatId/read` | Yes | `markAsReadController` | Mark chat as read |
| DELETE | `/:chatId/:messageId` | Yes | `deleteMessageController` | Soft-delete a message |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check (returns 200 OK) |

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
| `typing:start` | `chatId: string` | Broadcasts to room (2s throttle) | User started typing |
| `typing:stop` | `chatId: string` | Broadcasts to room | User stopped typing |
| `disconnect` | — | Removes from online map, updates DB, emits `user:offline` | Connection lost |

### Socket Events: Server → Client

| Event | Payload | Emitter | When |
|---|---|---|---|
| `user:online` | `{ userId }` | `connection` handler | User's first socket connects |
| `user:offline` | `{ userId }` | `disconnect` handler | User's last socket disconnects |
| `chat:new` | Chat document | `emitNewChatToParticipants` | Chat created |
| `chat:update` | `{ chatId, lastMessage }` | `emitLastMessageToParticipants` | New message updates sidebar |
| `chat:updated` | Chat document | `emitChatUpdated` | Group mutation (member/name/avatar) |
| `message:new` | Message document | `emitNewMessageToChatRoom` | New message in chat |
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
| `emitChatUpdated(chat)` | Each participant's `user:<id>` room | `chat:updated` | `chat.service.ts` |
| `isUserOnline(userId)` | — | — | Utility (returns boolean) |
| `getUserSocketIds(userId)` | — | — | Utility (returns socket ID array) |

---

## 10. Validation Layer

Validation is performed at the **controller layer** using **Zod** schemas defined in `src/validators/`.

### Validation patterns

```typescript
// Pattern 1: parse() — throws ZodError on failure (caught by errorHandler)
const body = createChatSchema.parse(req.body);

// Pattern 2: safeParse() — handles errors manually
const result = registerSchema.safeParse(req.body);
if (!result.success) {
  const message = result.error.issues.map((err) => err.message).join(", ");
  throw new BadRequestException(message);
}
```

### Validator files

| File | Schemas |
|---|---|
| `auth.validator.ts` | `registerSchema`, `loginSchema`, `RegisterSchemaType`, `LoginSchemaType` |
| `chat.validator.ts` | `createChatSchema` (discriminated union), `chatIdSchema`, `memberActionBodySchema`, `updateGroupNameBodySchema`, `updateGroupAvatarBodySchema` |
| `message.validator.ts` | `sendMessageSchema` (discriminated union by messageType), `getMessagesQuerySchema`, `markAsReadSchema`, `deleteMessageSchema` |
| `user.validator.ts` | `getUsersQuerySchema` (search, page, limit) |

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
       ├── NotFoundException (404)
       └── InternalServerException (500)
```

### Global Error Handler (`src/middlewares/errorHandler.middleware.ts`)

All uncaught errors flow to this middleware:

```typescript
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }
  // Unknown errors → 500
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

---

## 12. Middleware Chain

The middleware order in `src/index.ts` is important:

```
1. helmet()                         — Security headers
2. express.json({ limit: "10mb" })  — Parse JSON bodies (10MB limit for media uploads)
3. express.urlencoded({ extended: true }) — Parse URL-encoded bodies
4. cookieParser()                   — Parse cookies into req.cookies
5. cors()                           — CORS headers (origin: FRONTEND_ORIGIN, credentials: true)
6. passport.initialize()            — Initialize Passport
7. /health                          — Health check endpoint (no auth)
8. /api/v1                          — All API routes (auth via passportAuthenticateJwt per-route)
9. errorHandler                     — Global error handler (must be last)
```

The Socket.IO server is initialized **before** Express middleware because it attaches to the raw HTTP server, not the Express app:

```typescript
const server = http.createServer(app);
initializeSocket(server);     // Socket.IO attaches to the HTTP server
app.use(helmet());             // Express middleware
// ... rest of middleware
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
                             │    upload(mediaUrl,      │
                             │    { folder: "chat-app"})│
                             └─────────────────────────▶│
                             │                          │
                             │  ← secure_url            │
                             │                          │
                             │  Store secure_url in     │
                             │  Message.mediaUrl        │
                             │                          │
```

The controller accepts a base64 data URI or any URL in `mediaUrl`. Cloudinary processes it and returns a CDN URL. Supported message types that require media: `image`, `audio`, `video`, `file`.

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

### Data structure

```typescript
// src/lib/socket.ts
const onlineUsers = new Map<string, Set<string>>();
//                 userId ──────────▶ Set of socket IDs
```

### Connection logic

```typescript
const wasOffline = !onlineUsers.has(userId);
if (!onlineUsers.has(userId)) {
  onlineUsers.set(userId, new Set());
}
onlineUsers.get(userId)!.add(socket.id);
```

- First socket: `user:online` event emitted, DB `isOnline` set to `true`
- Subsequent sockets: only added to the set, no broadcast

### Disconnection logic

```typescript
const userSockets = onlineUsers.get(userId);
if (userSockets) {
  userSockets.delete(socket.id);
  if (userSockets.size === 0) {
    onlineUsers.delete(userId);
    // Update DB to offline
    // Emit user:offline
  }
}
```

- Last socket: `user:offline` event emitted, DB `isOnline` set to `false`
- Intermediate sockets: only removed from the set

### Typing throttle cleanup

On disconnect, all typing throttle entries for the user are cleaned up:

```typescript
typingThrottle.forEach((_, key) => {
  if (key.startsWith(`${userId}:`)) typingThrottle.delete(key);
});
```

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
5. Emits `chat:updated` to all participants via socket

### Add member details

The new member is added to:
- `chat.participants` array
- `chat.lastReadBy` array (with `lastReadAt: now()`)

### Remove member details

When removed, the user is pulled from:
- `chat.participants`
- `chat.admins` (if they were an admin)
- `chat.lastReadBy`

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

### What does NOT scale horizontally

The `onlineUsers` Map and `typingThrottle` Map are in-memory and instance-local. In a multi-instance setup:
- `isUserOnline()` only returns online status for the local instance
- `getUserSocketIds()` only returns socket IDs for the local instance

For full horizontal scaling of presence data, a future improvement would be to store online status in Redis.

---

## 18. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Environment name |
| `PORT` | No | `8000` | HTTP server port |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | No | `secret_jwt` | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `7d` | JWT expiration (ms format) |
| `FRONTEND_ORIGIN` | No | `http://localhost:5173` | CORS allowed origin |
| `REDIS_URL` | No | `""` | Redis URL (optional, for Socket.IO scaling) |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | **Yes** | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | **Yes** | — | Cloudinary API secret |

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
cp .env.example .env   # (if available) or create manually

# Edit .env with your credentials
# At minimum: MONGO_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

# Start development server (with hot reload)
pnpm dev

# Build for production
pnpm run build
pnpm start
```

### Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start with nodemon (hot reload via ts-node) |
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled JS from `dist/` |

### Configuration files

| File | Purpose |
|---|---|
| `tsconfig.json` | TypeScript compiler options (target ES2021, strict mode, commonjs modules) |
| `nodemon.json` | Nodemon config (watches `src/` for `.ts` changes) |
| `.env` | Environment variables (git-ignored) |

### Type checking

```bash
npx tsc --noEmit
```

---

## 20. Testing

### Socket.IO integration test

A standalone test script at `scripts/test-socket.ts` exercises the entire socket layer end-to-end. It creates a real user, connects via WebSocket, and validates every socket event and handler.

**What it tests:**

| # | Test | What it validates |
|---|---|---|
| 1 | HTTP login | JWT cookie is issued and accepted by the API |
| 2 | Socket connection | Connection succeeds with valid JWT cookie in headers |
| 3 | `user:online` | Server emits the event when a user's first socket connects |
| 4 | Chat creation | HTTP endpoint creates a chat, returns its ID |
| 5 | `chat:new` | Socket event fires (or is correctly suppressed for the creator) |
| 6 | `chat:join` (valid) | Callback resolves without error for a real chat the user belongs to |
| 7 | `chat:join` (invalid) | Callback returns an error for a non-existent chat ID |
| 8 | `chat:leave` | Room leave completes without error |
| 9 | `typing:start` / `typing:stop` | Events emit correctly (no echo since alone in room) |
| 10 | Typing throttle | Rapid `typing:start` bursts are suppressed by the 2-second debounce |
| 11 | Disconnect | Clean disconnect with no errors |
| 12 | Unauthenticated rejection | Connection **without** a cookie is rejected with `connect_error` |

**How to run:**

```bash
# Terminal 1 — start the server
pnpm dev

# Terminal 2 — run the test suite
npx ts-node scripts/test-socket.ts

# Point at a different server
BASE_URL=http://staging:8000 npx ts-node scripts/test-socket.ts
```

**Test design patterns used:**

The script uses **Promise-based wrappers** around Socket.IO callbacks to avoid race conditions:

```typescript
// Wrap an emit-with-callback in a Promise
const result = await new Promise<string | undefined>((resolve) => {
  socket.emit("chat:join", chatId, (err?: string) => resolve(err));
});

// Wait for a server-to-client event with timeout
const data = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), 3000);
  socket.once("user:online", (d) => { clearTimeout(timer); resolve(d); });
});
```

**Dependencies** (already in `devDependencies`):

| Package | Purpose |
|---|---|
| `socket.io-client` | Connect to the Socket.IO server from Node.js |
| `axios` | Make HTTP requests (login, create chat) to set up test state |

### Manual testing

**Postman** has built-in Socket.IO support:

1. Login via `POST /api/v1/auth/login` — the `accessToken` cookie is set
2. Open a Socket.IO connection to `http://localhost:8000` with the cookie
3. Subscribe to events: `user:online`, `chat:new`, `message:new`, `typing:start`
4. Emit events: `chat:join`, `typing:start`

### Adding new tests

To add a test for a new socket event, follow the pattern in `scripts/test-socket.ts`:

```typescript
divider("My Feature");

try {
  // Act — emit or trigger the event
  // Assert — use waitForEvent or callback-promise
  pass("My feature works");
} catch (err) {
  fail("My feature", err);
}
```

---

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

### Database
- Mongoose schemas enforce validation at the application layer
- Unique indexes prevent duplicate 1-to-1 chats and email addresses
- Partial indexes minimize index size

### Socket.IO
- Ping/pong with 25s interval and 20s timeout detects stale connections
- Authentication middleware rejects unauthenticated socket connections
- Typing events throttled to 1 per 2 seconds per user per chat
- Chat join events validate participant status server-side

---

*This guide covers the complete architecture of the Buzzie backend as of the latest update. For questions or contributions, refer to the repository's issue tracker.*
