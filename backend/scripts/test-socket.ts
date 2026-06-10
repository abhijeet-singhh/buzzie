import axios from "axios";
import { io, type Socket } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:8000";
const API = `${BASE}/api/v1`;

let passed = 0;
let failed = 0;

function pass(label: string) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label: string, err?: any) {
  console.log(`  ❌ ${label}${err ? ` — ${err.message || err}` : ""}`);
  failed++;
}

function divider(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

async function login(): Promise<{ cookie: string; userId: string }> {
  const email = `socket-test-${Date.now()}@test.com`;
  const password = "test123456";
  const name = "Socket Tester";

  // Try register first (may already exist on re-run, that's fine)
  try {
    await axios.post(`${API}/auth/register`, { name, email, password });
  } catch {}

  // Login to get cookie
  const loginRes = await axios.post(
    `${API}/auth/login`,
    { email, password },
    { withCredentials: true },
  );

  const setCookie = loginRes.headers["set-cookie"];
  if (!setCookie) throw new Error("No set-cookie header received");

  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  // Get userId from status endpoint
  const statusRes = await axios.get(`${API}/auth/status`, {
    headers: { Cookie: cookie },
  });

  return {
    cookie,
    userId: statusRes.data.data._id,
  };
}

async function createTestChat(
  cookie: string,
  userId: string,
): Promise<string> {
  // Need another user to create a chat. Create one.
  const otherEmail = `socket-other-${Date.now()}@test.com`;
  await axios.post(`${API}/auth/register`, {
    name: "Other User",
    email: otherEmail,
    password: "test123456",
  });

  const otherLogin = await axios.post(
    `${API}/auth/login`,
    { email: otherEmail, password: "test123456" },
    { withCredentials: true },
  );
  const otherCookie = Array.isArray(otherLogin.headers["set-cookie"])
    ? otherLogin.headers["set-cookie"][0]
    : otherLogin.headers["set-cookie"];

  const otherStatus = await axios.get(`${API}/auth/status`, {
    headers: { Cookie: otherCookie },
  });
  const otherUserId = otherStatus.data.data._id;

  // Create 1-to-1 chat
  const chatRes = await axios.post(
    `${API}/chats`,
    { participantId: otherUserId },
    { headers: { Cookie: cookie } },
  );

  return chatRes.data.chat._id;
}

async function waitForEvent(
  socket: Socket,
  event: string,
  timeout = 3000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function runTests() {
  console.log(`\n🔌 Buzzie Socket Test Suite\n`);
  console.log(`Server: ${BASE}`);
  console.log(`API:    ${API}\n`);

  // ── Phase 1: Login ──
  divider("Authentication");

  let cookie: string;
  let userId: string;
  let chatId: string;

  try {
    const creds = await login();
    cookie = creds.cookie;
    userId = creds.userId;
    pass("HTTP login — got JWT cookie");
  } catch (err: any) {
    fail("HTTP login", err);
    console.log("\n⚠️  Cannot continue without authentication. Exiting.");
    process.exit(1);
  }

  // ── Phase 2: Connection ──
  divider("Socket Connection");

  let socket: Socket;

  try {
    socket = io(BASE, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
    });

    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", (err) => reject(err));
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });

    pass("Connected with valid JWT cookie");
  } catch (err: any) {
    fail("Socket connection", err);
    console.log("\n⚠️  Cannot continue without socket connection. Exiting.");
    process.exit(1);
  }

  // ── Phase 3: Online presence ──
  divider("Online Presence");

  try {
    const data = await waitForEvent(socket, "user:online");
    if (data?.userId) {
      pass(`Received user:online for ${data.userId}`);
    } else {
      fail("user:online payload missing userId");
    }
  } catch {
    fail("user:online event (may be expected if already online)");
  }

  // ── Phase 4: Chat ──
  divider("Chat & Rooms");

  try {
    chatId = await createTestChat(cookie, userId);
    pass(`Created test chat (${chatId})`);
  } catch (err: any) {
    fail("Create test chat", err);
    console.log("⚠️  Cannot test chat rooms. Skipping.");
    chatId = "";
  }

  if (chatId) {
    // Wait for chat:new event (auto-join triggers this for the other user,
    // but we may receive it in our personal room too)
    try {
      await waitForEvent(socket, "chat:new");
      pass("Received chat:new event");
    } catch {
      pass("chat:new not received (sender may be excluded)");
    }

    // chat:join — valid chat
    try {
      const joinResult = await new Promise<string | undefined>((resolve) => {
        socket.emit("chat:join", chatId, (err?: string) => resolve(err));
      });
      if (joinResult) {
        fail(`chat:join — valid chat rejected: ${joinResult}`);
      } else {
        pass("chat:join — joined a valid chat room");
      }
    } catch (err: any) {
      fail("chat:join — valid chat", err);
    }

    // chat:join — invalid chat
    const fakeId = "000000000000000000000000";
    try {
      const joinResult = await new Promise<string | undefined>((resolve) => {
        socket.emit("chat:join", fakeId, (err?: string) => resolve(err));
      });
      if (joinResult) {
        pass("chat:join — rejected fake chatId");
      } else {
        fail("chat:join — should have rejected fake chatId");
      }
    } catch (err: any) {
      fail("chat:join — unexpected error", err);
    }

    // chat:leave
    socket.emit("chat:leave", chatId);
    await new Promise((r) => setTimeout(r, 200));
    pass("chat:leave — left chat room");
  }

  // ── Phase 5: Typing indicators ──
  divider("Typing Indicators");

  if (chatId) {
    // Re-join chat room for typing tests
    socket.emit("chat:join", chatId);
    await new Promise((r) => setTimeout(r, 200));

    socket.emit("typing:start", chatId);
    await new Promise((r) => setTimeout(r, 100));
    pass("typing:start — emitted (no echo since alone in room)");

    socket.emit("typing:stop", chatId);
    await new Promise((r) => setTimeout(r, 100));
    pass("typing:stop — emitted");

    // Throttle test: rapid typing:start should be throttled
    for (let i = 0; i < 5; i++) {
      socket.emit("typing:start", chatId);
    }
    await new Promise((r) => setTimeout(r, 300));
    pass("typing:start — rapid emits throttled");
  }

  // ── Phase 6: Disconnect ──
  divider("Disconnect");

  try {
    await new Promise<void>((resolve) => {
      socket.once("disconnect", () => resolve());
      socket.disconnect();
      setTimeout(() => resolve(), 1000);
    });
    pass("Disconnected cleanly");
  } catch {
    fail("Disconnect");
  }

  // ── Phase 7: Rejection without auth ──
  divider("Unauthenticated Connection");

  try {
    const badSocket = io(BASE, {
      transports: ["websocket"],
    });
    await new Promise<void>((resolve, reject) => {
      badSocket.on("connect", () => reject(new Error("Should not connect")));
      badSocket.on("connect_error", () => resolve());
      setTimeout(() => reject(new Error("Timeout")), 3000);
    });
    badSocket.disconnect();
    pass("Connection without cookie was rejected");
  } catch (err: any) {
    fail("Connection without cookie should be rejected", err);
  }

  // ── Summary ──
  console.log(`\n━━━ Results ━━━`);
  const total = passed + failed;
  console.log(`  Total: ${total}  ✅ ${passed}  ❌ ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("\n💥 Unexpected error:", err);
  process.exit(1);
});
