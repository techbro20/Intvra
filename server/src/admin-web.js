import { Hono } from "hono";
import { config, cryptoEnabled, emailDevMode, googleEnabled, paystackEnabled } from "./config.js";
import { PLANS, db, getUserById, totalCredits } from "./db.js";
import { CRYPTO_METHODS, explorerUrl } from "./billing.js";
import { PAID_PLANS } from "./plans.js";
import { escapeHtml as h, messagePage } from "./pages.js";
import { createLimiter } from "./ratelimit.js";
import { endWebSession, getWebUser, sameOrigin } from "./websession.js";
import * as ops from "./admin-ops.js";
import { badge, bars, emptyRow, fmtDate, fmtDay, layout, stat, trialLabel, usd } from "./admin-views.js";

const DAY = 86_400_000;
const STATUSES = ["review", "confirming", "pending", "paid", "failed", "expired"];
const PLAN_LABELS = { free: "Free", payg: "Pay as you go", pro: "Pro", lifetime: "Lifetime" };
const actionLimiter = createLimiter({ windowMs: 60_000, max: 60 });

const one = (sql, ...params) => db.prepare(sql).get(...params)?.n ?? 0;
const methodLabel = (method) =>
  method === "paystack" ? "Paystack" : CRYPTO_METHODS[method] ? `${CRYPTO_METHODS[method].label} · ${CRYPTO_METHODS[method].short}` : method;
const paymentUsd = (p) => PAID_PLANS[p.plan]?.usd ?? 0;
const reviewCount = () => one("SELECT COUNT(*) AS n FROM payments WHERE status = 'review'");

export const admin = new Hono();

admin.use("*", async (c, next) => {
  const user = getWebUser(c);
  if (!user) {
    if (c.req.method !== "GET") return c.text("Signed out", 401);
    return c.redirect(`/auth/web?next=${encodeURIComponent(c.req.path + (new URL(c.req.url).search || ""))}`, 302);
  }
  if (!user.is_admin) return c.html(messagePage("Not allowed", "This account doesn't have admin access."), 403);
  if (c.req.method === "POST") {
    if (!sameOrigin(c)) return c.text("Cross-site request blocked", 403);
    if (actionLimiter(`admin:${user.id}`)) return c.text("Too many actions, slow down", 429);
  }
  c.set("admin", user);
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "same-origin");
});

function render(c, active, title, body) {
  const flash = { text: c.req.query("ok") || c.req.query("err") || "", kind: c.req.query("err") ? "err" : "ok" };
  return c.html(layout({ admin: c.get("admin"), active, title, flash, reviewCount: reviewCount(), body }));
}

/** Runs an action, then returns to the form's `back` page (or `fallback`) with a success or error message. */
async function act(c, fallback, fn) {
  const form = await c.req.parseBody();
  const back = safeBack(form.back, fallback).replace(/[?&](ok|err)=[^&]*/g, "");
  const sep = back.includes("?") ? "&" : "?";
  try {
    const message = await fn(form, c.get("admin").email);
    return c.redirect(`${back}${sep}ok=${encodeURIComponent(message)}`, 303);
  } catch (error) {
    if (!(error instanceof ops.AdminError)) console.error("Admin action failed:", error);
    const message = error instanceof ops.AdminError ? error.message : "Something went wrong. Check the server log.";
    return c.redirect(`${back}${sep}err=${encodeURIComponent(message)}`, 303);
  }
}

const safeBack = (value, fallback) => (/^\/admin(\/|\?|$)/.test(String(value || "")) ? String(value) : fallback);

admin.post("/logout", (c) => {
  endWebSession(c);
  return c.redirect(config.siteUrl, 302);
});

// ---------- Overview ----------

admin.get("/", (c) => {
  const now = Date.now();
  const startOfToday = new Date().setHours(0, 0, 0, 0);

  const paid30 = db.prepare("SELECT plan, method, paid_at FROM payments WHERE status = 'paid' AND paid_at >= ?").all(now - 30 * DAY);
  const revenue30 = paid30.reduce((sum, p) => sum + paymentUsd(p), 0);
  const revenue7 = paid30.filter((p) => p.paid_at >= now - 7 * DAY).reduce((sum, p) => sum + paymentUsd(p), 0);
  const byMethod = {};
  for (const p of paid30) byMethod[methodLabel(p.method)] = (byMethod[methodLabel(p.method)] || 0) + paymentUsd(p);

  const review = reviewCount();
  const confirming = one("SELECT COUNT(*) AS n FROM payments WHERE status = 'confirming'");
  const users = one("SELECT COUNT(*) AS n FROM users");
  const new24 = one("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", now - DAY);
  const new7 = one("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?", now - 7 * DAY);
  const active24 = one("SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?", now - DAY);
  const answers24 = one("SELECT COUNT(*) AS n FROM usage_events WHERE kind = 'answer' AND status = 'ok' AND created_at >= ?", now - DAY);
  const failed24 = one("SELECT COUNT(*) AS n FROM usage_events WHERE kind = 'answer' AND status != 'ok' AND created_at >= ?", now - DAY);
  const stt24 = one("SELECT COUNT(*) AS n FROM usage_events WHERE kind = 'stt' AND created_at >= ?", now - DAY);
  const trials7 = one("SELECT COUNT(*) AS n FROM users WHERE trial_claimed_at >= ?", now - 7 * DAY);
  const denied7 = db
    .prepare("SELECT trial_denied_reason AS reason, COUNT(*) AS n FROM users WHERE trial_denied_at >= ? AND trial_claimed_at IS NULL GROUP BY reason")
    .all(now - 7 * DAY);
  const deniedText = denied7.length ? denied7.map((d) => `${d.n} ${d.reason || "device"}`).join(", ") : "none";
  const plans = Object.fromEntries(db.prepare("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan").all().map((r) => [r.plan, r.n]));

  const days = 14;
  const dayStart = (i) => startOfToday - (days - 1 - i) * DAY;
  const answerRows = db
    .prepare("SELECT created_at FROM usage_events WHERE kind = 'answer' AND status = 'ok' AND created_at >= ?")
    .all(dayStart(0));
  const signupRows = db.prepare("SELECT created_at FROM users WHERE created_at >= ?").all(dayStart(0));
  const series = (rows, noun) =>
    Array.from({ length: days }, (_, i) => {
      const from = dayStart(i);
      const value = rows.filter((r) => r.created_at >= from && r.created_at < from + DAY).length;
      const label = new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return { label, value, tip: `${label}: ${value} ${noun}` };
    });
  const revenueRows = paid30.filter((p) => p.paid_at >= dayStart(0));
  const revenueSeries = Array.from({ length: days }, (_, i) => {
    const from = dayStart(i);
    const value = revenueRows.filter((p) => p.paid_at >= from && p.paid_at < from + DAY).reduce((s, p) => s + paymentUsd(p), 0);
    const label = new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { label, value, tip: `${label}: ${usd(value)}` };
  });

  const recentPayments = db
    .prepare("SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status != 'expired' ORDER BY p.created_at DESC LIMIT 8")
    .all();
  const recentUsers = db.prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 8").all();

  const keyMode = config.paystack.secretKey.startsWith("sk_live_") ? "live keys" : config.paystack.secretKey ? "test keys" : "";
  const checks = [
    ["Paystack", paystackEnabled(), paystackEnabled() ? `${keyMode}, charging in ${config.paystack.currency}` : "Add PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY"],
    ["USDT / USDC on BNB Smart Chain", Boolean(config.crypto.bscAddress), config.crypto.bscAddress ? short(config.crypto.bscAddress) : "Add CRYPTO_BSC_ADDRESS"],
    ["USDC on Ethereum", Boolean(config.crypto.ethAddress), config.crypto.ethAddress ? short(config.crypto.ethAddress) : "Add CRYPTO_ETH_ADDRESS"],
    ["Litecoin", Boolean(config.crypto.ltcAddress), config.crypto.ltcAddress ? short(config.crypto.ltcAddress) : "Add CRYPTO_LTC_ADDRESS"],
    ["Google sign-in", googleEnabled(), googleEnabled() ? "On" : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"],
    ["Email codes", !emailDevMode() && Boolean(config.email.resendApiKey), config.email.resendApiKey ? "Resend" : "Add RESEND_API_KEY"],
    ["AI keys", config.ai.apiKeys.length > 0, `${config.ai.apiKeys.length} key(s), ${config.ai.models.length} model(s)`],
  ];

  const body = `
    <h1>Overview</h1>
    <p class="sub">Revenue is counted in US dollars at plan prices.</p>
    <div class="grid g4">
      ${stat("Revenue, last 30 days", usd(revenue30), `${usd(revenue7)} in the last 7 days · ${paid30.length} payments`)}
      ${stat("Payments to review", String(review), review ? "Open Payments to approve or reject" : "Nothing waiting", review > 0)}
      ${stat("Users", String(users), `${new24} new today · ${new7} this week`)}
      ${stat("Active today", String(active24), `${plans.pro || 0} Pro · ${plans.lifetime || 0} Lifetime · ${plans.payg || 0} pay as you go`)}
      ${stat("Answers, last 24 hours", String(answers24), failed24 ? `${failed24} failed` : "No failures")}
      ${stat("Transcriptions, last 24 hours", String(stt24))}
      ${stat("Free trials, last 7 days", String(trials7), `Refused: ${deniedText}`)}
      ${stat("Waiting for confirmations", String(confirming), "Crypto payments seen on chain")}
    </div>
    <div class="grid g2">
      <div class="card"><h2>Revenue, last 14 days</h2>${bars(revenueSeries)}</div>
      <div class="card"><h2>Answers, last 14 days</h2>${bars(series(answerRows, "answers"))}</div>
      <div class="card"><h2>Sign-ups, last 14 days</h2>${bars(series(signupRows, "sign-ups"))}</div>
      <div class="card"><h2>Revenue by method, last 30 days</h2>
        <table>${
          Object.keys(byMethod).length
            ? Object.entries(byMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([m, v]) => `<tr><td>${h(m)}</td><td style="text-align:right">${usd(v)}</td></tr>`)
                .join("")
            : emptyRow(2, "No payments yet.")
        }</table>
      </div>
    </div>
    <div class="grid g2">
      <div class="card"><h2>Recent payments</h2>${paymentsTable(recentPayments, { compact: true })}<p class="small"><a href="/admin/payments?status=all">All payments →</a></p></div>
      <div class="card"><h2>New users</h2>
        <table><tr><th>Email</th><th>Plan</th><th>Joined</th></tr>${
          recentUsers.length
            ? recentUsers
                .map((u) => `<tr><td><a href="/admin/users/${h(u.id)}">${h(u.email)}</a></td><td>${planBadge(u.plan)}</td><td class="muted small">${fmtDate(u.created_at)}</td></tr>`)
                .join("")
            : emptyRow(3, "No users yet.")
        }</table>
        <p class="small"><a href="/admin/users">All users →</a></p>
      </div>
    </div>
    <div class="card"><h2>Setup</h2>
      <table>${checks
        .map(([name, ok, note]) => `<tr><td><span class="${ok ? "ok-dot" : "no-dot"}"></span>${h(name)}</td><td class="muted">${h(note)}</td></tr>`)
        .join("")}</table>
    </div>`;
  return render(c, "overview", "Overview", body);
});

const short = (value) => (value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value);
const planBadge = (plan) => badge(PLAN_LABELS[plan] || plan, plan);

// ---------- Payments ----------

function paymentsTable(rows, { compact = false, back = "/admin/payments" } = {}) {
  if (!rows.length) return `<table>${emptyRow(1, "No payments.")}</table>`;
  const head = compact
    ? "<tr><th>Email</th><th>Plan</th><th>Method</th><th>Status</th></tr>"
    : "<tr><th>Created</th><th>Email</th><th>Plan</th><th>Method</th><th>Amount</th><th>Status</th><th>Details</th><th></th></tr>";
  const body = rows
    .map((p) => {
      const user = `<a href="/admin/users/${h(p.user_id)}">${h(p.email)}</a>`;
      if (compact) {
        return `<tr><td>${user}<div class="muted small">${fmtDate(p.created_at)}</div></td><td>${h(PAID_PLANS[p.plan]?.name || p.plan)}</td><td class="small">${h(methodLabel(p.method))}</td><td>${badge(p.status)}</td></tr>`;
      }
      const link = explorerUrl(p);
      const tx = link ? `<a href="${h(link)}" target="_blank" rel="noopener" class="mono">View transaction ↗</a>` : "";
      const approve = `<form class="inline pay-act" method="post" action="/admin/payments/${h(p.id)}/confirm" data-confirm="${h(
        p.status === "failed"
          ? `Approve this rejected payment and apply ${PAID_PLANS[p.plan]?.name || p.plan} to ${p.email}?`
          : `Approve this payment and apply ${PAID_PLANS[p.plan]?.name || p.plan} to ${p.email}?`
      )}"><input type="hidden" name="back" value="${h(back)}"><button class="btn" type="submit">${p.status === "failed" ? "Approve anyway" : "Approve"}</button></form>`;
      const reject = `<form class="inline pay-act" method="post" action="/admin/payments/${h(p.id)}/reject">
               <input type="hidden" name="back" value="${h(back)}"><input name="reason" placeholder="Reason" autocomplete="off">
               <button class="btn danger" type="submit">Reject</button></form>`;
      let actionCell = `<span class="muted small">–</span>`;
      if (p.status === "review" || p.status === "confirming") {
        actionCell = `${approve}${reject}`;
      } else if (p.status === "failed") {
        actionCell = `<details><summary class="small muted" style="cursor:pointer">Undo reject</summary>${approve}</details>`;
      } else if (p.status === "pending") {
        actionCell = `<details><summary class="small muted" style="cursor:pointer">Actions</summary>${approve}${reject}</details>`;
      } else if (p.status === "paid") {
        actionCell = `<span class="muted small">Settled</span>`;
      } else if (p.status === "expired") {
        actionCell = `<span class="muted small">Expired</span>`;
      }
      return `<tr>
        <td class="small">${fmtDate(p.created_at)}${p.paid_at ? `<div class="muted">paid ${fmtDate(p.paid_at)}</div>` : ""}</td>
        <td>${user}</td>
        <td style="white-space:nowrap">${h(PAID_PLANS[p.plan]?.name || p.plan)}</td>
        <td class="small" style="white-space:nowrap">${h(methodLabel(p.method))}</td>
        <td class="mono">${h(p.amount)} ${h(p.currency)}</td>
        <td>${badge(p.status)}</td>
        <td class="small"><div class="muted">${h(p.detail || "")}</div>${tx}<div class="mono muted" style="margin-top:2px">${h(p.id)}</div></td>
        <td class="pay-actions">${actionCell}</td>
      </tr>`;
    })
    .join("");
  return `<div class="table-scroll"><table>${head}${body}</table></div>`;
}

admin.get("/payments", (c) => {
  const status = c.req.query("status") || (reviewCount() ? "review" : "all");
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const where = [];
  const params = [];
  if (STATUSES.includes(status)) {
    where.push("p.status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(u.email LIKE ? OR p.id = ? OR p.provider_ref LIKE ?)");
    params.push(`%${q}%`, q, `%${q}%`);
  }
  const rows = db
    .prepare(
      `SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY p.created_at DESC LIMIT 200`
    )
    .all(...params);
  const counts = Object.fromEntries(db.prepare("SELECT status, COUNT(*) AS n FROM payments GROUP BY status").all().map((r) => [r.status, r.n]));
  const back = `/admin/payments?status=${encodeURIComponent(status)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const tab = (id, label) =>
    `<a href="/admin/payments?status=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}" class="${status === id ? "on" : ""}">${label}${
      id !== "all" && counts[id] ? ` (${counts[id]})` : ""
    }</a>`;

  const body = `
    <h1>Payments</h1>
    <p class="sub">"Review" means money arrived but didn't match the order exactly (wrong amount, too late, or the account already had Lifetime). Check the transaction, then approve or reject.</p>
    <div class="tabs">${tab("review", "Review")}${tab("confirming", "Confirming")}${tab("paid", "Paid")}${tab("pending", "Pending")}${tab("failed", "Failed")}${tab("expired", "Expired")}${tab("all", "All")}</div>
    <form method="get" action="/admin/payments" class="filters">
      <input type="hidden" name="status" value="${h(status)}">
      <input name="q" value="${h(q)}" placeholder="Email, payment ID or transaction hash">
      <button class="btn ghost" type="submit">Search</button>
    </form>
    <div class="card">${paymentsTable(rows, { back })}</div>`;
  return render(c, "payments", "Payments", body);
});

admin.post("/payments/:id/confirm", (c) =>
  act(c, "/admin/payments", (form, by) => {
    const result = ops.confirmPayment(by, c.req.param("id"));
    if (result === "review") throw new ops.AdminError("This account already has Lifetime, so the payment stayed in review. Refund it outside the app.");
    return result === "already_paid" ? "This payment was already paid." : "Payment approved and plan applied.";
  })
);

admin.post("/payments/:id/reject", (c) =>
  act(c, "/admin/payments", (form, by) => {
    ops.rejectPayment(by, c.req.param("id"), form.reason);
    return "Payment rejected.";
  })
);

// ---------- Users ----------

admin.get("/users", (c) => {
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const plan = c.req.query("plan") || "";
  const where = [];
  const params = [];
  if (q) {
    where.push("(email LIKE ? OR name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (PLANS.includes(plan)) {
    where.push("plan = ?");
    params.push(plan);
  } else if (plan === "blocked") {
    where.push("trial_denied_at IS NOT NULL AND trial_claimed_at IS NULL");
  } else if (plan === "admin") {
    where.push("is_admin = 1");
  }
  const rows = db
    .prepare(`SELECT * FROM users ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 200`)
    .all(...params);
  const opt = (value, label) => `<option value="${value}" ${plan === value ? "selected" : ""}>${label}</option>`;

  const body = `
    <h1>Users</h1>
    <p class="sub">Showing up to 200, newest first.</p>
    <form method="get" action="/admin/users" class="filters">
      <input name="q" value="${h(q)}" placeholder="Search email or name">
      <select name="plan">${opt("", "Everyone")}${opt("free", "Free")}${opt("payg", "Pay as you go")}${opt("pro", "Pro")}${opt("lifetime", "Lifetime")}${opt("blocked", "Trial refused")}${opt("admin", "Admins")}</select>
      <button class="btn ghost" type="submit">Filter</button>
    </form>
    <div class="card table-scroll"><table>
      <tr><th>Email</th><th>Plan</th><th>Credits</th><th>Free trial</th><th>Joined</th><th>Last seen</th></tr>
      ${
        rows.length
          ? rows
              .map(
                (u) => `<tr>
          <td><a href="/admin/users/${h(u.id)}">${h(u.email)}</a>${u.is_admin ? ` ${badge("admin", "pro")}` : ""}${u.disabled ? ` ${badge("disabled", "failed")}` : ""}${
            u.name ? `<div class="muted small">${h(u.name)}</div>` : ""
          }</td>
          <td>${planBadge(u.plan)}${u.plan === "pro" && u.plan_renews_at ? `<div class="muted small">until ${fmtDay(u.plan_renews_at)}</div>` : ""}</td>
          <td>${totalCredits(u)}</td>
          <td class="small">${h(trialLabel(u))}</td>
          <td class="small muted">${fmtDate(u.created_at)}</td>
          <td class="small muted">${fmtDate(u.last_seen_at)}</td>
        </tr>`
              )
              .join("")
          : emptyRow(6, "No users match.")
      }
    </table></div>`;
  return render(c, "users", "Users", body);
});

admin.get("/users/:id", (c) => {
  const user = getUserById(c.req.param("id"));
  if (!user) return c.redirect("/admin/users?err=User+not+found", 303);
  const now = Date.now();
  const payments = db.prepare("SELECT p.*, ? AS email FROM payments p WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user.email, user.id);
  const ledger = db.prepare("SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30").all(user.id);
  const usage = (kind, since) => one("SELECT COUNT(*) AS n FROM usage_events WHERE user_id = ? AND kind = ? AND created_at >= ?", user.id, kind, since);
  const sessions = db.prepare("SELECT device, created_at, last_used_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC").all(user.id, now);
  const self = `/admin/users/${user.id}`;
  const post = (path, inner, confirmText = "") =>
    `<form method="post" action="${self}/${path}"${confirmText ? ` data-confirm="${h(confirmText)}"` : ""}>${inner}</form>`;
  const renewDefault = new Date((user.plan === "pro" && user.plan_renews_at > now ? user.plan_renews_at : now) + PAID_PLANS.pro.days * DAY)
    .toISOString()
    .slice(0, 10);

  const body = `
    <p class="small"><a href="/admin/users">← Users</a></p>
    <h1>${h(user.email)}</h1>
    <p class="sub">${h(user.name || "")}${user.name ? " · " : ""}Joined ${fmtDate(user.created_at)} · Last seen ${fmtDate(user.last_seen_at)}</p>
    <div class="grid g2">
      <div class="card"><h2>Account</h2><dl>
        <dt>Plan</dt><dd>${planBadge(user.plan)}${user.plan === "pro" && user.plan_renews_at ? ` until ${fmtDay(user.plan_renews_at)}` : ""}</dd>
        <dt>Credits</dt><dd><strong>${totalCredits(user)}</strong>${user.plan_credits ? ` <span class="muted">(${user.plan_credits} Pro allowance + ${user.credits} bought or bonus)</span>` : ""}</dd>
        <dt>Free trial</dt><dd>${h(trialLabel(user))}</dd>
        <dt>Admin</dt><dd>${user.is_admin ? "Yes (uses own API keys)" : "No"}</dd>
        <dt>Status</dt><dd>${user.disabled ? badge("Disabled", "failed") : "Active"}</dd>
        <dt>Answers</dt><dd>${usage("answer", now - DAY)} today · ${usage("answer", now - 30 * DAY)} in 30 days</dd>
        <dt>Transcriptions</dt><dd>${usage("stt", now - DAY)} today · ${usage("stt", now - 30 * DAY)} in 30 days</dd>
        <dt>Signed in on</dt><dd>${sessions.length ? sessions.map((s) => `${h(s.device || "Unknown")} <span class="muted small">(${fmtDate(s.last_used_at)})</span>`).join("<br>") : "No active sessions"}</dd>
      </dl></div>
      <div class="card actions"><h2>Manage</h2>
        ${post(
          "credits",
          `<div class="small muted" style="margin-bottom:4px">Add or remove credits (negative removes)</div>
           <div class="row-fields"><input name="amount" type="number" step="1" placeholder="e.g. 50" required>
           <input name="reason" placeholder="Reason"><button class="btn" type="submit">Apply</button></div>`
        )}
        ${post(
          "plan",
          `<div class="small muted" style="margin-bottom:4px">Set plan (Pro gets ${PAID_PLANS.pro.credits} fresh credits until the date)</div>
           <div class="row-fields"><select name="plan">${PLANS.map((p) => `<option value="${p}" ${p === user.plan ? "selected" : ""}>${PLAN_LABELS[p]}</option>`).join("")}</select>
           <input name="renews" type="date" value="${renewDefault}" title="Pro end date"><button class="btn" type="submit">Set</button></div>`,
          "Change this account's plan?"
        )}
        <div class="action-row">
          ${!user.trial_claimed_at ? post("grant-trial", `<button class="btn ghost" type="submit">Give free trial</button>`, "Give this account the free trial credits?") : ""}
          ${post("admin", `<input type="hidden" name="on" value="${user.is_admin ? "0" : "1"}"><button class="btn ghost" type="submit">${user.is_admin ? "Remove admin" : "Make admin"}</button>`, user.is_admin ? "Remove admin access?" : "Give this account admin access, including this dashboard?")}
          ${post("sign-out", `<button class="btn ghost" type="submit">Sign out everywhere</button>`, "Sign this account out on every device?")}
          ${post("disable", `<input type="hidden" name="on" value="${user.disabled ? "0" : "1"}"><button class="btn ${user.disabled ? "ghost" : "danger"}" type="submit">${user.disabled ? "Enable account" : "Disable account"}</button>`, user.disabled ? "Enable this account?" : "Disable this account and sign it out everywhere?")}
        </div>
      </div>
    </div>
    <div class="card"><h2>Payments</h2>${paymentsTable(payments, { back: self })}</div>
    <div class="card table-scroll"><h2>Credit history</h2><table>
      <tr><th>When</th><th>Change</th><th>Balance</th><th>Reason</th></tr>
      ${
        ledger.length
          ? ledger
              .map((l) => `<tr><td class="small muted">${fmtDate(l.created_at)}</td><td>${l.delta > 0 ? "+" : ""}${l.delta}</td><td>${l.balance_after}</td><td class="small">${h(l.reason)}</td></tr>`)
              .join("")
          : emptyRow(4, "No credit changes yet.")
      }
    </table></div>`;
  return render(c, "users", user.email, body);
});

const userAction = (path, fn) =>
  admin.post(`/users/:id/${path}`, (c) => act(c, `/admin/users/${c.req.param("id")}`, (form, by) => fn(c.req.param("id"), form, by, c)));

userAction("credits", (id, form, by) => {
  const balance = ops.grantCredits(by, id, form.amount, form.reason);
  return `Done. New balance: ${balance} credits.`;
});
userAction("plan", (id, form, by) => {
  ops.setPlan(by, id, String(form.plan), form.plan === "pro" ? `${form.renews}T23:59:59` : null);
  return `Plan set to ${PLAN_LABELS[form.plan] || form.plan}.`;
});
userAction("grant-trial", (id, form, by) => {
  ops.grantTrial(by, id);
  return `Free trial given (${config.freeCredits} credits).`;
});
userAction("admin", (id, form, by, c) => {
  if (id === c.get("admin").id && form.on !== "1") throw new ops.AdminError("You can't remove your own admin access here. Use the server command line.");
  ops.setAdmin(by, id, form.on === "1");
  return form.on === "1" ? "Admin access given." : "Admin access removed.";
});
userAction("disable", (id, form, by, c) => {
  if (id === c.get("admin").id) throw new ops.AdminError("You can't disable your own account.");
  ops.setDisabled(by, id, form.on === "1");
  return form.on === "1" ? "Account disabled and signed out everywhere." : "Account enabled.";
});
userAction("sign-out", (id, form, by, c) => {
  const n = ops.signOutEverywhere(by, id);
  return id === c.get("admin").id ? "Signed out everywhere." : `Signed out of ${n} session(s).`;
});

// ---------- Activity ----------

admin.get("/activity", (c) => {
  const actions = db.prepare("SELECT * FROM admin_actions ORDER BY id DESC LIMIT 100").all();
  const refused = db
    .prepare("SELECT id, email, trial_denied_at, trial_denied_reason FROM users WHERE trial_denied_at IS NOT NULL AND trial_claimed_at IS NULL ORDER BY trial_denied_at DESC LIMIT 50")
    .all();
  const failures = db
    .prepare(
      `SELECT e.kind, e.model, e.status, e.detail, e.created_at, u.email, u.id AS user_id FROM usage_events e JOIN users u ON u.id = e.user_id
       WHERE e.status != 'ok' ORDER BY e.id DESC LIMIT 30`
    )
    .all();

  const body = `
    <h1>Activity</h1>
    <p class="sub">Admin changes, refused free trials and failed AI requests.</p>
    <div class="card"><h2>Admin changes</h2><div class="table-scroll"><table>
      <tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr>
      ${
        actions.length
          ? actions
              .map((a) => `<tr><td class="small muted">${fmtDate(a.created_at)}</td><td class="small">${h(a.admin_email)}</td><td>${h(a.action.replace(/_/g, " "))}</td><td class="small">${h(a.target || "")}</td><td class="small muted">${h(a.detail || "")}</td></tr>`)
              .join("")
          : emptyRow(5, "No admin changes yet.")
      }
    </table></div></div>
    <div class="grid g2">
      <div class="card"><h2>Refused free trials</h2><div class="table-scroll"><table>
        <tr><th>Email</th><th>Reason</th><th>When</th></tr>
        ${
          refused.length
            ? refused
                .map((u) => `<tr><td><a href="/admin/users/${h(u.id)}">${h(u.email)}</a></td><td class="small">${u.trial_denied_reason === "network" ? "Network limit" : "Device already used"}</td><td class="small muted">${fmtDate(u.trial_denied_at)}</td></tr>`)
                .join("")
            : emptyRow(3, "None.")
        }
      </table></div></div>
      <div class="card"><h2>Failed AI requests</h2><div class="table-scroll"><table>
        <tr><th>Email</th><th>Type</th><th>When</th></tr>
        ${
          failures.length
            ? failures
                .map((f) => `<tr><td><a href="/admin/users/${h(f.user_id)}">${h(f.email)}</a></td><td class="small">${h(f.kind)}${f.model ? ` · ${h(f.model)}` : ""} <span class="muted">(${h(f.status)})</span>${f.detail ? `<div class="muted">${h(f.detail)}</div>` : ""}</td><td class="small muted">${fmtDate(f.created_at)}</td></tr>`)
                .join("")
            : emptyRow(3, "None.")
        }
      </table></div></div>
    </div>`;
  return render(c, "activity", "Activity", body);
});
