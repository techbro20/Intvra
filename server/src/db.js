import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { answerCost, config } from "./config.js";
import { sha256 } from "./crypto.js";
import { PAID_PLANS } from "./plans.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    google_sub TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    credits INTEGER NOT NULL DEFAULT 0,
    plan_renews_at INTEGER,
    is_admin INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id, created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS login_requests (
    id TEXT PRIMARY KEY,
    code_challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    app_state TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    login_code_hash TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER,
    used_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS email_codes (
    request_id TEXT PRIMARY KEY REFERENCES login_requests(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id, kind, created_at);

  CREATE TABLE IF NOT EXISTS trial_devices (
    device_hash TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trial_networks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    network_hash TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_trial_networks ON trial_networks(network_hash, created_at);

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    method TEXT NOT NULL,
    provider_ref TEXT,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    paid_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_ref ON payments(provider_ref) WHERE provider_ref IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);

  CREATE TABLE IF NOT EXISTS web_links (
    code_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS admin_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    created_at INTEGER NOT NULL
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
if (!userColumns.includes("trial_claimed_at")) {
  db.exec(`
    ALTER TABLE users ADD COLUMN trial_claimed_at INTEGER;
    ALTER TABLE users ADD COLUMN trial_denied_at INTEGER;
  `);
  // Accounts created before device checks already received their signup credits.
  db.exec("UPDATE users SET trial_claimed_at = created_at");
}
if (!userColumns.includes("trial_denied_reason")) {
  db.exec("ALTER TABLE users ADD COLUMN trial_denied_reason TEXT");
  db.exec("UPDATE users SET trial_denied_reason = 'device' WHERE trial_denied_at IS NOT NULL");
}
// Pro's monthly allowance is kept apart from bought/bonus credits so it can reset each period.
if (!userColumns.includes("plan_credits")) {
  db.exec("ALTER TABLE users ADD COLUMN plan_credits INTEGER NOT NULL DEFAULT 0");
}

const usageColumns = db.prepare("PRAGMA table_info(usage_events)").all().map((column) => column.name);
if (!usageColumns.includes("detail")) {
  db.exec("ALTER TABLE usage_events ADD COLUMN detail TEXT");
}

export const totalCredits = (user) => user.credits + (user.plan_credits || 0);

export const PLANS = ["free", "payg", "pro", "lifetime"];

export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).toLowerCase());
}

function insertLedger(userId, delta, balanceAfter, reason, ref = null) {
  db.prepare(
    "INSERT INTO credit_ledger (user_id, delta, balance_after, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, delta, balanceAfter, reason, ref, Date.now());
}

/** Finds or creates the account for a verified email (and optional Google identity). Free credits come later, from claimTrial. */
export function upsertUser({ email, name = null, googleSub = null }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  return transaction(() => {
    let user =
      (googleSub && db.prepare("SELECT * FROM users WHERE google_sub = ?").get(googleSub)) ||
      db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

    if (user) {
      db.prepare(
        "UPDATE users SET name = COALESCE(name, ?), google_sub = COALESCE(google_sub, ?), last_seen_at = ? WHERE id = ?"
      ).run(name, googleSub, Date.now(), user.id);
      return getUserById(user.id);
    }

    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      "INSERT INTO users (id, email, name, google_sub, plan, credits, created_at, last_seen_at) VALUES (?, ?, ?, ?, 'free', 0, ?, ?)"
    ).run(id, normalizedEmail, name, googleSub, now, now);
    return getUserById(id);
  });
}

/**
 * Grants the free trial the first time an account signs in from the app: once per account,
 * once per device, and at most `trialIpLimit` per network within the window.
 * `networkKey` is null when the network can't be identified (e.g. local development).
 * Returns "granted", "already_claimed", "device_used", "network_limit" or "no_device".
 */
export function claimTrial(userId, deviceId, networkKey = null) {
  return transaction(() => {
    const user = getUserById(userId);
    if (!user || user.trial_claimed_at) return "already_claimed";
    if (!deviceId) return "no_device";

    const now = Date.now();
    const deny = (reason) => {
      db.prepare("UPDATE users SET trial_denied_at = ?, trial_denied_reason = ? WHERE id = ?").run(now, reason, userId);
      return reason === "device" ? "device_used" : "network_limit";
    };

    const deviceHash = sha256(`trial:${deviceId}`);
    const taken = db.prepare("SELECT user_id FROM trial_devices WHERE device_hash = ?").get(deviceHash);
    if (taken && taken.user_id !== userId) return deny("device");

    const networkHash = networkKey ? sha256(`trial-net:${networkKey}`) : null;
    if (networkHash && config.trialIpLimit > 0) {
      const since = now - config.trialIpWindowDays * 86_400_000;
      const { n } = db
        .prepare("SELECT COUNT(*) AS n FROM trial_networks WHERE network_hash = ? AND created_at >= ?")
        .get(networkHash, since);
      if (n >= config.trialIpLimit) return deny("network");
    }

    db.prepare("INSERT OR IGNORE INTO trial_devices (device_hash, user_id, created_at) VALUES (?, ?, ?)").run(
      deviceHash,
      userId,
      now
    );
    if (networkHash) {
      db.prepare("INSERT INTO trial_networks (network_hash, user_id, created_at) VALUES (?, ?, ?)").run(networkHash, userId, now);
    }
    const row = db
      .prepare(
        "UPDATE users SET credits = credits + ?, trial_claimed_at = ?, trial_denied_at = NULL, trial_denied_reason = NULL WHERE id = ? RETURNING credits"
      )
      .get(config.freeCredits, now, userId);
    insertLedger(userId, config.freeCredits, row.credits, "signup_bonus");
    return "granted";
  });
}

/**
 * Takes `amount` credits, plan allowance first. Returns { balance, fromPlan, fromCredits },
 * or null if the user doesn't have enough.
 */
export function spendCredit(userId, reason, ref = null, amount = 1) {
  return transaction(() => {
    const user = getUserById(userId);
    if (!user || totalCredits(user) < amount) return null;
    const fromPlan = Math.min(user.plan_credits || 0, amount);
    const fromCredits = amount - fromPlan;
    db.prepare("UPDATE users SET plan_credits = plan_credits - ?, credits = credits - ? WHERE id = ?").run(
      fromPlan,
      fromCredits,
      userId
    );
    const balance = totalCredits(user) - amount;
    insertLedger(userId, -amount, balance, reason, ref);
    return { balance, fromPlan, fromCredits };
  });
}

/** Returns credits taken by spendCredit to the balances they came from. */
export function refundSpend(userId, spend, reason) {
  return transaction(() => {
    db.prepare("UPDATE users SET plan_credits = plan_credits + ?, credits = credits + ? WHERE id = ?").run(
      spend.fromPlan,
      spend.fromCredits,
      userId
    );
    const balance = totalCredits(getUserById(userId));
    insertLedger(userId, spend.fromPlan + spend.fromCredits, balance, reason);
    return balance;
  });
}

export function adjustCredits(userId, delta, reason, ref = null) {
  return transaction(() => {
    const row = db
      .prepare("UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ? RETURNING credits, plan_credits")
      .get(delta, userId);
    if (!row) throw new Error("User not found");
    const balance = row.credits + row.plan_credits;
    insertLedger(userId, delta, balance, reason, ref);
    return balance;
  });
}

export function recordUsage(userId, kind, model, status, detail = null) {
  db.prepare("INSERT INTO usage_events (user_id, kind, model, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    userId,
    kind,
    model || null,
    status,
    detail ? String(detail).slice(0, 300) : null,
    Date.now()
  );
}

export function countUsageSince(userId, kind, sinceMs) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM usage_events WHERE user_id = ? AND kind = ? AND created_at >= ?")
    .get(userId, kind, sinceMs).n;
}

export function publicUser(user) {
  const isAdmin = Boolean(user.is_admin);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    credits: totalCredits(user),
    creditsPerAnswer: answerCost(user),
    planRenewsAt: user.plan_renews_at,
    isAdmin,
    // Lifetime and admin accounts use their own provider keys inside the app.
    byok: user.plan === "lifetime" || isAdmin,
    // "device" or "network" when the free trial was refused for this account.
    trialBlocked: user.trial_denied_at && !user.trial_claimed_at ? user.trial_denied_reason || "device" : null,
    upgradeUrl: config.upgradeUrl,
  };
}

/** Starts the next Pro period, adds bought credits or switches to Lifetime. Call inside a transaction. */
export function applyPlanPurchase(userId, plan, paymentId) {
  const user = getUserById(userId);
  const now = Date.now();
  const before = totalCredits(user);

  if (plan === "payg") {
    db.prepare(
      "UPDATE users SET credits = credits + ?, plan = CASE WHEN plan = 'free' THEN 'payg' ELSE plan END WHERE id = ?"
    ).run(PAID_PLANS.payg.credits, userId);
  } else if (plan === "pro") {
    const periodStart = user.plan === "pro" && user.plan_renews_at > now ? user.plan_renews_at : now;
    db.prepare("UPDATE users SET plan = 'pro', plan_credits = ?, plan_renews_at = ? WHERE id = ?").run(
      PAID_PLANS.pro.credits,
      periodStart + PAID_PLANS.pro.days * 86_400_000,
      userId
    );
  } else if (plan === "lifetime") {
    db.prepare("UPDATE users SET plan = 'lifetime', plan_credits = 0, plan_renews_at = NULL WHERE id = ?").run(userId);
  } else {
    throw new Error(`Unknown plan ${plan}`);
  }

  const after = totalCredits(getUserById(userId));
  insertLedger(userId, after - before, after, `purchase_${plan}`, paymentId);
}

/** Ends Pro periods that have run out. Remaining bought credits stay; the monthly allowance goes. */
export function expirePlans(userId = null) {
  const now = Date.now();
  const due = db
    .prepare(
      `SELECT * FROM users WHERE plan = 'pro' AND plan_renews_at IS NOT NULL AND plan_renews_at < ?${userId ? " AND id = ?" : ""}`
    )
    .all(...(userId ? [now, userId] : [now]));
  for (const user of due) {
    transaction(() => {
      db.prepare("UPDATE users SET plan = 'payg', plan_credits = 0, plan_renews_at = NULL WHERE id = ?").run(user.id);
      if (user.plan_credits) insertLedger(user.id, -user.plan_credits, user.credits, "pro_period_ended");
    });
  }
  return due.length;
}

// Drop stale login attempts and expired sessions once an hour.
setInterval(() => {
  const now = Date.now();
  db.prepare("DELETE FROM login_requests WHERE expires_at < ?").run(now - 24 * 60 * 60 * 1000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM web_links WHERE expires_at < ?").run(now - 24 * 60 * 60 * 1000);
  db.prepare("UPDATE payments SET status = 'expired' WHERE status = 'pending' AND expires_at < ?").run(now);
  expirePlans();
}, 60 * 60 * 1000).unref();
