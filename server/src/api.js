import { Hono } from "hono";
import { answerCost, config } from "./config.js";
import { randomToken, sha256 } from "./crypto.js";
import {
  countUsageSince,
  db,
  expirePlans,
  getUserById,
  publicUser,
  recordUsage,
  refundSpend,
  spendCredit,
  totalCredits,
} from "./db.js";
import { sanitizeMessages, streamChat, transcribe, UpstreamError } from "./ai.js";
import { createLimiter } from "./ratelimit.js";

const MAX_CHAT_BODY_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const answerLimiter = createLimiter({ windowMs: 60_000, max: 20 });
const sttLimiter = createLimiter({ windowMs: 60_000, max: 40 });

const apiError = (c, status, message, extra = {}) => c.json({ error: { message, ...extra } }, status);

const outOfCredits = (c, user) =>
  apiError(
    c,
    402,
    user.plan === "lifetime"
      ? "Your Lifetime plan uses your own API key. Add it on the Providers page to keep answering."
      : user.trial_denied_at && !user.trial_claimed_at
        ? user.trial_denied_reason === "network"
          ? "Too many free trials have been claimed from this network. Choose a plan to keep getting answers."
          : "This computer has already used a free trial. Choose a plan to keep getting answers."
        : "You're out of credits. Upgrade your plan to keep getting answers.",
    { code: "insufficient_credits", upgradeUrl: config.upgradeUrl }
  );

export const api = new Hono();

api.use("*", async (c, next) => {
  const header = c.req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return apiError(c, 401, "Please sign in.", { code: "unauthorized" });

  const session = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(token));
  if (!session || session.expires_at < Date.now()) {
    return apiError(c, 401, "Your session has expired. Please sign in again.", { code: "unauthorized" });
  }
  let user = getUserById(session.user_id);
  if (!user || user.disabled) return apiError(c, 403, "This account is unavailable.", { code: "disabled" });
  if (user.plan === "pro" && user.plan_renews_at && user.plan_renews_at < Date.now()) {
    expirePlans(user.id);
    user = getUserById(user.id);
  }

  const now = Date.now();
  if (now - session.last_used_at > 5 * 60 * 1000) {
    db.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").run(now, session.token_hash);
    db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(now, user.id);
  }

  c.set("user", user);
  c.set("sessionHash", session.token_hash);
  await next();
});

api.get("/me", (c) => c.json({ user: publicUser(c.get("user")) }));

api.post("/logout", (c) => {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(c.get("sessionHash"));
  return c.json({ ok: true });
});

// One-time link that opens the checkout page in the browser already signed in.
api.post("/billing/link", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const code = randomToken(32);
  db.prepare("INSERT INTO web_links (code_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha256(code),
    c.get("user").id,
    Date.now() + 2 * 60 * 1000
  );
  const url = new URL(`${config.publicUrl}/pay/open`);
  url.searchParams.set("code", code);
  if (typeof body.plan === "string" && /^[a-z]{2,12}$/.test(body.plan)) url.searchParams.set("plan", body.plan);
  return c.json({ url: url.toString() });
});

// OpenAI-compatible streaming endpoint. Free-plan answers cost more so the trial stays small.
api.post("/chat/completions", async (c) => {
  const user = c.get("user");
  const cost = answerCost(user);
  if (Number(c.req.header("content-length") || 0) > MAX_CHAT_BODY_BYTES) {
    return apiError(c, 413, "Request is too large.");
  }
  if (answerLimiter(user.id)) {
    return apiError(c, 429, "You're sending requests too quickly. Please wait a moment.");
  }
  if (totalCredits(user) < cost) return outOfCredits(c, user);

  let body;
  let sanitized;
  try {
    body = await c.req.json();
    sanitized = sanitizeMessages(body.messages);
  } catch (error) {
    return apiError(c, error instanceof UpstreamError ? error.status : 400, error.message || "Invalid request.");
  }

  const spend = spendCredit(user.id, "answer", null, cost);
  if (!spend) return outOfCredits(c, user);

  try {
    const { response, model } = await streamChat({
      messages: sanitized.messages,
      hasImages: sanitized.hasImages,
      maxTokens: body.max_tokens ?? body.max_completion_tokens,
      signal: c.req.raw.signal,
    });
    recordUsage(user.id, "answer", model, "ok");
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Credits-Remaining": String(spend.balance),
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    refundSpend(user.id, spend, "refund_failed_answer");
    // A newer question cancels the one already in flight. That is not a provider failure.
    if (c.req.raw.signal.aborted || error?.name === "AbortError") return new Response(null, { status: 499 });
    recordUsage(user.id, "answer", error.model, "failed", error.detail || error.message);
    return apiError(c, error instanceof UpstreamError ? error.status : 503, error.message || "The AI service failed.");
  }
});

// Listening is free, but only for accounts that can still get answers, and within a daily cap.
api.post("/audio/transcriptions", async (c) => {
  const user = c.get("user");
  if (Number(c.req.header("content-length") || 0) > MAX_AUDIO_BYTES) {
    return apiError(c, 413, "Audio clip is too large.");
  }
  if (totalCredits(user) < answerCost(user)) return outOfCredits(c, user);
  if (sttLimiter(user.id)) return apiError(c, 429, "Too many transcription requests. Please wait a moment.");
  const dailyLimit = user.plan === "free" ? config.stt.freeDailyLimit : config.stt.dailyLimit;
  if (countUsageSince(user.id, "stt", Date.now() - 86_400_000) >= dailyLimit) {
    return apiError(c, 429, "Daily listening limit reached. It resets within 24 hours.");
  }

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string" || !file.size) return apiError(c, 400, "An audio file is required.");

  try {
    const text = await transcribe(file);
    recordUsage(user.id, "stt", config.stt.model, "ok");
    return c.json({ text });
  } catch (error) {
    recordUsage(user.id, "stt", config.stt.model, "failed", error.detail || error.message);
    return apiError(c, error instanceof UpstreamError ? error.status : 503, error.message || "Transcription failed.");
  }
});
