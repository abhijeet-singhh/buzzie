import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

export const options = {
  scenarios: {
    read_heavy: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "15s", target: Number(__ENV.VUS || 20) },
        { duration: "30s", target: Number(__ENV.VUS || 20) },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
  },
};

const randomSuffix = () =>
  `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const parseCookie = (res) => {
  const raw = res.headers["Set-Cookie"] || res.headers["set-cookie"];
  if (!raw) throw new Error("Registration did not return a cookie");
  return String(raw).split(";")[0];
};

const register = (label) => {
  const email = `${label}-${randomSuffix()}@loadtest.local`;
  const res = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({
      name: `${label} Load`,
      email,
      password: "Password123!",
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  check(res, { [`register ${label} 201`]: (r) => r.status === 201 });
  return { cookie: parseCookie(res), user: res.json("data") };
};

export function setup() {
  const alice = register("alice");
  const bob = register("bob");

  const chatRes = http.post(
    `${BASE_URL}/api/v1/chats`,
    JSON.stringify({ participantId: bob.user._id }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: alice.cookie,
      },
    },
  );

  check(chatRes, { "chat created": (r) => r.status === 201 });

  return {
    cookie: alice.cookie,
    chatId: chatRes.json("chat._id"),
  };
}

export default function (data) {
  const headers = { Cookie: data.cookie };
  const responses = http.batch([
    ["GET", `${BASE_URL}/health`, null, { tags: { name: "health" } }],
    [
      "GET",
      `${BASE_URL}/api/v1/chats?page=1&limit=20`,
      null,
      { headers, tags: { name: "chats" } },
    ],
    [
      "GET",
      `${BASE_URL}/api/v1/messages?chatId=${data.chatId}&limit=20`,
      null,
      { headers, tags: { name: "messages" } },
    ],
    [
      "GET",
      `${BASE_URL}/api/v1/messages/pinned?chatId=${data.chatId}`,
      null,
      { headers, tags: { name: "pinned" } },
    ],
  ]);

  for (const res of responses) {
    check(res, { "read path 200": (r) => r.status === 200 });
  }

  sleep(1);
}
