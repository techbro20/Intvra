// Account administration from the server shell (the web dashboard at /admin does the same).
// Usage: npm run admin -- <command> [args]
import { PLANS, db, getUserByEmail } from "../src/db.js";
import { PAID_PLANS } from "../src/plans.js";
import * as ops from "../src/admin-ops.js";

const [command, ...args] = process.argv.slice(2);
const BY = "cli";

const fmtDate = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "-");

function requireUser(email) {
  const user = email && getUserByEmail(email);
  if (!user) {
    console.error(`No user with email "${email}".`);
    process.exit(1);
  }
  return user;
}

function printUser(user) {
  console.log(
    [
      `Email:      ${user.email}`,
      `Name:       ${user.name || "-"}`,
      `Plan:       ${user.plan}${user.plan_renews_at ? ` (renews ${fmtDate(user.plan_renews_at)})` : ""}`,
      `Credits:    ${user.credits + (user.plan_credits || 0)}${user.plan_credits ? ` (${user.plan_credits} from Pro this period)` : ""}`,
      `Admin:      ${user.is_admin ? "yes" : "no"}`,
      `Disabled:   ${user.disabled ? "yes" : "no"}`,
      `Trial:      ${
        user.trial_claimed_at
          ? `claimed ${fmtDate(user.trial_claimed_at)}`
          : user.trial_denied_at
            ? user.trial_denied_reason === "network"
              ? "blocked (network trial limit reached)"
              : "blocked (device already used a trial)"
            : "not claimed yet"
      }`,
      `Created:    ${fmtDate(user.created_at)}`,
      `Last seen:  ${fmtDate(user.last_seen_at)}`,
    ].join("\n")
  );
}

const commands = {
  users(search = "") {
    const rows = db
      .prepare(
        "SELECT email, plan, credits, is_admin, disabled, created_at FROM users WHERE email LIKE ? ORDER BY created_at DESC LIMIT 200"
      )
      .all(`%${search.toLowerCase()}%`);
    console.table(
      rows.map((r) => ({
        email: r.email,
        plan: r.plan,
        credits: r.credits,
        admin: r.is_admin ? "yes" : "",
        disabled: r.disabled ? "yes" : "",
        created: fmtDate(r.created_at),
      }))
    );
  },

  user(email) {
    const user = requireUser(email);
    printUser(user);
    const ledger = db
      .prepare("SELECT delta, balance_after, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 15")
      .all(user.id);
    console.log("\nRecent credit changes:");
    console.table(ledger.map((l) => ({ when: fmtDate(l.created_at), delta: l.delta, balance: l.balance_after, reason: l.reason })));
  },

  grant(email, amount, ...reason) {
    const user = requireUser(email);
    const balance = ops.grantCredits(BY, user.id, amount, reason.join(" "));
    console.log(`Done. ${user.email} now has ${balance} credits.`);
  },

  "set-plan"(email, plan, renewsAt) {
    const user = requireUser(email);
    const renews = ops.setPlan(BY, user.id, plan, renewsAt || null);
    console.log(`${user.email} is now on the ${plan} plan.${plan === "pro" ? ` ${PAID_PLANS.pro.credits} credits until ${fmtDate(renews)}.` : ""}`);
  },

  admin(email, value = "on") {
    const user = requireUser(email);
    ops.setAdmin(BY, user.id, value !== "off");
    console.log(`${user.email} admin: ${value === "off" ? "off" : "on"}.`);
  },

  disable(email) {
    const user = requireUser(email);
    ops.setDisabled(BY, user.id, true);
    console.log(`${user.email} disabled and signed out everywhere.`);
  },

  enable(email) {
    const user = requireUser(email);
    ops.setDisabled(BY, user.id, false);
    console.log(`${user.email} enabled.`);
  },

  payments(filter = "") {
    const byStatus = ["pending", "confirming", "paid", "review", "failed", "expired"].includes(filter);
    const rows = db
      .prepare(
        `SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id
         WHERE ${byStatus ? "p.status = ?" : "u.email LIKE ?"} ORDER BY p.created_at DESC LIMIT 100`
      )
      .all(byStatus ? filter : `%${filter.toLowerCase()}%`);
    console.table(
      rows.map((p) => ({
        id: p.id,
        email: p.email,
        plan: p.plan,
        method: p.method,
        amount: `${p.amount} ${p.currency}`,
        status: p.status,
        created: fmtDate(p.created_at),
        detail: p.detail || "",
      }))
    );
    const review = rows.filter((p) => p.status === "review");
    if (review.length) {
      console.log("\nNeeds review:");
      for (const p of review) console.log(`  ${p.id}  ${p.provider_ref || ""}`);
    }
  },

  "confirm-payment"(id) {
    const result = ops.confirmPayment(BY, id);
    console.log(result === "paid" ? "Confirmed and plan applied." : result === "already_paid" ? "Already paid; nothing to do." : `Result: ${result}`);
  },

  "reject-payment"(id, ...reason) {
    ops.rejectPayment(BY, id, reason.join(" "));
    console.log("Marked as failed.");
  },

  stats() {
    const dayAgo = Date.now() - 86_400_000;
    const one = (sql, ...params) => db.prepare(sql).get(...params).n;
    console.log(
      [
        `Users:               ${one("SELECT COUNT(*) AS n FROM users")}`,
        `New users (24h):     ${one("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", dayAgo)}`,
        `Active users (24h):  ${one("SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?", dayAgo)}`,
        `Answers (24h):       ${one("SELECT COUNT(*) AS n FROM usage_events WHERE kind = 'answer' AND status = 'ok' AND created_at >= ?", dayAgo)}`,
        `Failed answers (24h):${one("SELECT COUNT(*) AS n FROM usage_events WHERE kind = 'answer' AND status = 'failed' AND created_at >= ?", dayAgo)}`,
        `Transcriptions (24h):${one("SELECT COUNT(*) AS n FROM usage_events WHERE kind = 'stt' AND created_at >= ?", dayAgo)}`,
      ].join("\n")
    );
    const plans = db.prepare("SELECT plan, COUNT(*) AS users FROM users GROUP BY plan").all();
    console.table(plans);
  },
};

if (!commands[command]) {
  console.log(`Ai.Intvra admin

  users [search]                     List users
  user <email>                       Show a user and recent credit changes
  grant <email> <amount> [reason]    Add (or remove, with a negative amount) credits
  set-plan <email> <plan> [renews]   Plan: ${PLANS.join(" | ")}; optional renewal date (YYYY-MM-DD)
  admin <email> [on|off]             Admins can use their own API keys in the app
  disable <email> / enable <email>   Block or unblock an account
  payments [email|status]            Recent payments (status: pending, confirming, paid, review, failed)
  confirm-payment <id>               Approve a payment (e.g. one in review) and apply its plan
  reject-payment <id> [reason]       Mark a payment as failed
  stats                              Usage summary`);
  process.exit(command ? 1 : 0);
}

try {
  commands[command](...args);
} catch (error) {
  if (!(error instanceof ops.AdminError)) throw error;
  console.error(error.message);
  process.exit(1);
}
