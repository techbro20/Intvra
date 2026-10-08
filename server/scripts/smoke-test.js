// End-to-end check of the email sign-in flow against a running server.
//   node scripts/smoke-test.js start <email>   -> requests a code (printed in the dev server log)
//   node scripts/smoke-test.js finish <code>   -> verifies it, exchanges the token, calls /v1 endpoints
import crypto from "node:crypto";
import fs from "node:fs";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8787";
const stateFile = "./data/smoke-test.json";
const [step, arg] = process.argv.slice(2);

async function start(email) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  const redirectUri = "http://127.0.0.1:54321/callback";

  const health = await (await fetch(`${base}/health`)).json();
  const login = await fetch(
    `${base}/auth/login?challenge=${challenge}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    { redirect: "manual" }
  );
  const requestId = login.headers.get("location")?.split("/").pop();
  const page = await (await fetch(`${base}/auth/login/${requestId}`)).text();
  const sent = await fetch(`${base}/auth/email/start`, {
    method: "POST",
    body: new URLSearchParams({ req: requestId, email }),
  });
  const rejected = await fetch(
    `${base}/auth/login?challenge=${challenge}&state=${state}&redirect_uri=${encodeURIComponent("https://evil.example/callback")}`,
    { redirect: "manual" }
  );

  fs.writeFileSync(stateFile, JSON.stringify({ verifier, state, requestId, email }));
  console.log({
    health,
    loginRedirect: login.status,
    loginPageRendered: page.includes("Continue with email"),
    codeEmailRequested: sent.status,
    nonLoopbackRedirectRejected: rejected.status === 400,
  });
}

async function finish(code) {
  const { verifier, state, requestId, email } = JSON.parse(fs.readFileSync(stateFile, "utf8"));

  const wrong = await fetch(`${base}/auth/email/verify`, {
    method: "POST",
    body: new URLSearchParams({ req: requestId, email, code: "000000" === code ? "111111" : "000000" }),
    redirect: "manual",
  });
  const verified = await fetch(`${base}/auth/email/verify`, {
    method: "POST",
    body: new URLSearchParams({ req: requestId, email, code }),
    redirect: "manual",
  });
  const callback = new URL(verified.headers.get("location"));
  const loginCode = callback.searchParams.get("code");

  const badVerifier = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: loginCode, code_verifier: crypto.randomBytes(32).toString("base64url") }),
  });
  const tokenRes = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: loginCode, code_verifier: verifier, device: "smoke-test" }),
  });
  const { token, user } = await tokenRes.json();
  const replay = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: loginCode, code_verifier: verifier }),
  });

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const me = await (await fetch(`${base}/v1/me`, { headers: authHeaders })).json();
  const chat = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ messages: [{ role: "user", content: "Say hello in five words." }] }),
  });
  let chatPreview = "";
  if (chat.ok) {
    const text = await chat.text();
    chatPreview = text
      .split("\n")
      .filter((l) => l.startsWith("data:") && !l.includes("[DONE]"))
      .map((l) => JSON.parse(l.slice(5)).choices?.[0]?.delta?.content || "")
      .join("");
  } else {
    chatPreview = (await chat.json()).error?.message;
  }
  const meAfter = await (await fetch(`${base}/v1/me`, { headers: authHeaders })).json();
  const noAuth = await fetch(`${base}/v1/me`);
  const logout = await fetch(`${base}/v1/logout`, { method: "POST", headers: authHeaders });
  const afterLogout = await fetch(`${base}/v1/me`, { headers: authHeaders });

  console.log({
    wrongCodeRejected: wrong.status === 400,
    verifiedRedirectsToLoopback: verified.status === 302 && callback.host === "127.0.0.1:54321",
    stateEchoed: callback.searchParams.get("state") === state,
    wrongVerifierRejected: badVerifier.status === 400,
    tokenIssued: tokenRes.status === 200 && Boolean(token),
    codeReplayRejected: replay.status === 400,
    user,
    creditsBefore: me.user?.credits,
    chatStatus: chat.status,
    chatPreview,
    creditsAfter: meAfter.user?.credits,
    unauthenticatedRejected: noAuth.status === 401,
    logout: logout.status,
    tokenInvalidAfterLogout: afterLogout.status === 401,
  });
}

if (step === "start") await start(arg || "tester@example.com");
else if (step === "finish" && arg) await finish(arg);
else console.log("Usage: node scripts/smoke-test.js start <email> | finish <code>");
