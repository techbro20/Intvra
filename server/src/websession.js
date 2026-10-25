import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "./config.js";
import { randomToken, sha256 } from "./crypto.js";
import { db, expirePlans, getUserById } from "./db.js";

const COOKIE = "iv_web";
const WEB_SESSION_DAYS = 30;

const cookieOptions = () => ({
  path: "/",
  httpOnly: true,
  sameSite: "Lax",
  secure: config.publicUrl.startsWith("https://"),
});

/** Signs the browser in for the checkout page and admin dashboard. */
export function startWebSession(c, userId) {
  const token = `iv_${randomToken(32)}`;
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, device, created_at, last_used_at, expires_at) VALUES (?, ?, 'Web checkout', ?, ?, ?)"
  ).run(sha256(token), userId, now, now, now + WEB_SESSION_DAYS * 86_400_000);
  setCookie(c, COOKIE, token, { ...cookieOptions(), maxAge: WEB_SESSION_DAYS * 86_400 });
}

export function getWebUser(c) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(token));
  if (!session || session.expires_at < Date.now()) return null;
  let user = getUserById(session.user_id);
  if (!user || user.disabled) return null;
  if (user.plan === "pro" && user.plan_renews_at && user.plan_renews_at < Date.now()) {
    expirePlans(user.id);
    user = getUserById(user.id);
  }
  return user;
}

export function endWebSession(c) {
  const token = getCookie(c, COOKIE);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  deleteCookie(c, COOKIE, cookieOptions());
}

/** Only same-site pages may call the checkout JSON endpoints. */
export function sameOrigin(c) {
  const origin = c.req.header("origin");
  return Boolean(origin) && origin === new URL(config.publicUrl).origin;
}

/** Paths the web sign-in may return to. */
export const safeNextPath = (value) => {
  const next = String(value || "");
  return /^\/(pay|admin)(\/|\?|$)/.test(next) && !next.startsWith("//") ? next : "/pay";
};
