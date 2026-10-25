import { Hono } from "hono";
import { config, emailDevMode, googleEnabled } from "./config.js";
import { randomToken, safeEqual, sha256, sha256Base64Url, sixDigitCode } from "./crypto.js";
import { claimTrial, db, getUserById, publicUser, upsertUser } from "./db.js";
import { isDisposableEmail } from "./disposable.js";
import { networkKey } from "./network.js";
import { safeNextPath, startWebSession } from "./websession.js";
import { codePage, loginPage, messagePage } from "./pages.js";
import { createLimiter } from "./ratelimit.js";

const LOGIN_REQUEST_TTL_MS = 15 * 60 * 1000;
const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WEB_REDIRECT = "web";

const emailSendLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const ipLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 40 });

export const clientIp = (c) =>
  (config.trustProxy && c.req.header("x-forwarded-for")?.split(",")[0]?.trim()) ||
  c.env?.incoming?.socket?.remoteAddress ||
  "unknown";

// The desktop app listens on a loopback port for the one-time login code.
function isLoopbackRedirect(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      Boolean(url.port) &&
      url.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

function getOpenLoginRequest(id) {
  const request = id && db.prepare("SELECT * FROM login_requests WHERE id = ?").get(String(id));
  if (!request || request.completed_at || request.expires_at < Date.now()) return null;
  return request;
}

function completeLogin(c, request, user) {
  if (user.disabled) {
    return c.html(messagePage("Account disabled", "This account has been disabled. Contact support for help."), 403);
  }
  if (request.redirect_uri === WEB_REDIRECT) {
    const now = Date.now();
    db.prepare("UPDATE login_requests SET user_id = ?, completed_at = ?, used_at = ? WHERE id = ? AND completed_at IS NULL").run(
      user.id,
      now,
      now,
      request.id
    );
    startWebSession(c, user.id);
    return c.redirect(safeNextPath(request.app_state), 302);
  }
  const loginCode = randomToken(32);
  db.prepare(
    "UPDATE login_requests SET user_id = ?, login_code_hash = ?, completed_at = ? WHERE id = ? AND completed_at IS NULL"
  ).run(user.id, sha256(loginCode), Date.now(), request.id);

  const redirect = new URL(request.redirect_uri);
  redirect.searchParams.set("code", loginCode);
  redirect.searchParams.set("state", request.app_state);
  return c.redirect(redirect.toString(), 302);
}

async function sendLoginCodeEmail(email, code) {
  if (emailDevMode()) {
    console.log(`[dev] Login code for ${email}: ${code}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.email.from,
      to: [email],
      subject: `${code} is your Ai.Intvra sign-in code`,
      text: `Your Ai.Intvra sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

export const auth = new Hono();

auth.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
});

// Entry point opened by the desktop app in the user's browser.
auth.get("/login", (c) => {
  const challenge = c.req.query("challenge") || "";
  const redirectUri = c.req.query("redirect_uri") || "";
  const appState = c.req.query("state") || "";

  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !isLoopbackRedirect(redirectUri) || !/^[A-Za-z0-9_-]{16,128}$/.test(appState)) {
    return c.html(messagePage("Invalid sign-in link", "Please start signing in again from the Ai.Intvra app."), 400);
  }
  if (ipLimiter(`login:${clientIp(c)}`)) {
    return c.html(messagePage("Too many attempts", "Please wait a few minutes and try again."), 429);
  }

  const id = randomToken(18);
  const now = Date.now();
  db.prepare(
    "INSERT INTO login_requests (id, code_challenge, redirect_uri, app_state, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, challenge, redirectUri, appState, now, now + LOGIN_REQUEST_TTL_MS);
  return c.redirect(`/auth/login/${id}`, 302);
});

// Browser-only sign-in for the checkout page (people buying from the website).
auth.get("/web", (c) => {
  if (ipLimiter(`login:${clientIp(c)}`)) {
    return c.html(messagePage("Too many attempts", "Please wait a few minutes and try again."), 429);
  }
  const id = randomToken(18);
  const now = Date.now();
  db.prepare(
    "INSERT INTO login_requests (id, code_challenge, redirect_uri, app_state, created_at, expires_at) VALUES (?, 'web', ?, ?, ?, ?)"
  ).run(id, WEB_REDIRECT, safeNextPath(c.req.query("next")), now, now + LOGIN_REQUEST_TTL_MS);
  return c.redirect(`/auth/login/${id}`, 302);
});

auth.get("/login/:id", (c) => {
  const request = getOpenLoginRequest(c.req.param("id"));
  if (!request) {
    return c.html(messagePage("Sign-in link expired", "Please start signing in again from the Ai.Intvra app."), 410);
  }
  return c.html(loginPage({ requestId: request.id }));
});

auth.get("/google", (c) => {
  const request = getOpenLoginRequest(c.req.query("req"));
  if (!request) {
    return c.html(messagePage("Sign-in link expired", "Please start signing in again from the Ai.Intvra app."), 410);
  }
  if (!googleEnabled()) {
    return c.html(loginPage({ requestId: request.id, error: "Google sign-in isn't available yet. Use your email instead." }), 503);
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.google.clientId);
  url.searchParams.set("redirect_uri", `${config.publicUrl}/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", request.id);
  url.searchParams.set("prompt", "select_account");
  return c.redirect(url.toString(), 302);
});

auth.get("/google/callback", async (c) => {
  const request = getOpenLoginRequest(c.req.query("state"));
  if (!request) {
    return c.html(messagePage("Sign-in link expired", "Please start signing in again from the Ai.Intvra app."), 410);
  }
  const code = c.req.query("code");
  if (!code) {
    return c.html(loginPage({ requestId: request.id, error: "Google sign-in was cancelled." }));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: `${config.publicUrl}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    const { access_token: accessToken } = await tokenRes.json();

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) throw new Error(`userinfo failed: ${profileRes.status}`);
    const profile = await profileRes.json();
    if (!profile.email || !profile.email_verified) {
      return c.html(loginPage({ requestId: request.id, error: "Your Google account email isn't verified." }));
    }
    if (isDisposableEmail(profile.email)) {
      return c.html(loginPage({ requestId: request.id, error: "Temporary email addresses aren't supported." }), 400);
    }

    const user = upsertUser({ email: profile.email, name: profile.name || null, googleSub: profile.sub });
    return completeLogin(c, request, user);
  } catch (error) {
    console.error("Google sign-in error:", error);
    return c.html(loginPage({ requestId: request.id, error: "Google sign-in failed. Please try again." }), 502);
  }
});

auth.post("/email/start", async (c) => {
  const form = await c.req.parseBody();
  const request = getOpenLoginRequest(form.req);
  if (!request) {
    return c.html(messagePage("Sign-in link expired", "Please start signing in again from the Ai.Intvra app."), 410);
  }
  const email = String(form.email || "").trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) {
    return c.html(loginPage({ requestId: request.id, email, error: "Please enter a valid email address." }), 400);
  }
  if (isDisposableEmail(email)) {
    return c.html(
      loginPage({ requestId: request.id, email, error: "Temporary email addresses aren't supported. Please use your personal or work email." }),
      400
    );
  }
  if (emailSendLimiter(email) || ipLimiter(`email:${clientIp(c)}`)) {
    return c.html(loginPage({ requestId: request.id, email, error: "Too many codes requested. Please wait a few minutes." }), 429);
  }

  const code = sixDigitCode();
  db.prepare(
    `INSERT INTO email_codes (request_id, email, code_hash, attempts, expires_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(request_id) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at`
  ).run(request.id, email, sha256(`${request.id}:${code}`), Date.now() + EMAIL_CODE_TTL_MS);

  const sent = await sendLoginCodeEmail(email, code);
  if (!sent) {
    return c.html(loginPage({ requestId: request.id, email, error: "We couldn't send the email. Please try again." }), 502);
  }
  return c.html(codePage({ requestId: request.id, email }));
});

auth.post("/email/verify", async (c) => {
  const form = await c.req.parseBody();
  const request = getOpenLoginRequest(form.req);
  if (!request) {
    return c.html(messagePage("Sign-in link expired", "Please start signing in again from the Ai.Intvra app."), 410);
  }
  const email = String(form.email || "").trim().toLowerCase();
  const code = String(form.code || "").replace(/\D/g, "");
  const row = db.prepare("SELECT * FROM email_codes WHERE request_id = ?").get(request.id);

  if (!row || row.email !== email || row.expires_at < Date.now() || row.attempts >= MAX_CODE_ATTEMPTS) {
    return c.html(loginPage({ requestId: request.id, email, error: "That code has expired. Request a new one." }), 400);
  }
  if (!safeEqual(row.code_hash, sha256(`${request.id}:${code}`))) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE request_id = ?").run(request.id);
    return c.html(codePage({ requestId: request.id, email, error: "That code isn't right. Check the email and try again." }), 400);
  }

  db.prepare("DELETE FROM email_codes WHERE request_id = ?").run(request.id);
  const user = upsertUser({ email });
  return completeLogin(c, request, user);
});

// Called by the desktop app (not the browser) to trade the one-time code for a session.
auth.post("/token", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.code || "");
  const verifier = String(body.code_verifier || "");
  if (!code || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    return c.json({ error: { message: "Invalid sign-in request." } }, 400);
  }

  const request = db.prepare("SELECT * FROM login_requests WHERE login_code_hash = ?").get(sha256(code));
  const valid =
    request &&
    !request.used_at &&
    request.completed_at &&
    Date.now() - request.completed_at < LOGIN_CODE_TTL_MS &&
    safeEqual(sha256Base64Url(verifier), request.code_challenge);
  if (!valid) {
    return c.json({ error: { message: "This sign-in has expired. Please try again." } }, 400);
  }

  const account = getUserById(request.user_id);
  if (!account || account.disabled) {
    return c.json({ error: { message: "This account is unavailable." } }, 403);
  }

  const now = Date.now();
  db.prepare("UPDATE login_requests SET used_at = ? WHERE id = ?").run(now, request.id);

  const deviceId = /^[a-f0-9]{64}$/.test(String(body.device_id || "")) ? body.device_id : "";
  const trial = claimTrial(request.user_id, deviceId, networkKey(clientIp(c)));
  const user = getUserById(request.user_id);

  const token = `iv_${randomToken(32)}`;
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, device, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(sha256(token), user.id, String(body.device || "").slice(0, 120) || null, now, now, now + config.sessionDays * 86_400_000);

  return c.json({ token, user: publicUser(user), trial });
});
