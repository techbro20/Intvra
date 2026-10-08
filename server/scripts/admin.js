// Account administration from the server shell. Usage: npm run admin -- <command> [args]
import { PLANS, adjustCredits, db, getUserByEmail } from "../src/db.js";

const [command, ...args] = process.argv.slice(2);

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
      `Credits:    ${user.credits}`,
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
    const delta = Number.parseInt(amount, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      console.error("Amount must be a non-zero whole number (negative to remove credits).");
      process.exit(1);
    }
    const balance = adjustCredits(user.id, delta, reason.join(" ") || "admin_grant");
    console.log(`${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} credits. ${user.email} now has ${balance}.`);
  },

  "set-plan"(email, plan, renewsAt) {
    const user = requireUser(email);
    if (!PLANS.includes(plan)) {
      console.error(`Plan must be one of: ${PLANS.join(", ")}`);
      process.exit(1);
    }
    const renews = renewsAt ? Date.parse(renewsAt) : null;
    db.prepare("UPDATE users SET plan = ?, plan_renews_at = ? WHERE id = ?").run(plan, Number.isFinite(renews) ? renews : null, user.id);
    console.log(`${user.email} is now on the ${plan} plan.`);
  },

  admin(email, value = "on") {
    const user = requireUser(email);
    db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(value === "off" ? 0 : 1, user.id);
    console.log(`${user.email} admin: ${value === "off" ? "off" : "on"}.`);
  },

  disable(email) {
    const user = requireUser(email);
    db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    console.log(`${user.email} disabled and signed out everywhere.`);
  },

  enable(email) {
    const user = requireUser(email);
    db.prepare("UPDATE users SET disabled = 0 WHERE id = ?").run(user.id);
    console.log(`${user.email} enabled.`);
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
  stats                              Usage summary`);
  process.exit(command ? 1 : 0);
}

commands[command](...args);
