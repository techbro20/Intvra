// Account and payment changes shared by the admin dashboard and the admin CLI. Every change is logged.
import { config } from "./config.js";
import { PLANS, adjustCredits, db, getUserById } from "./db.js";
import { fulfillPayment, getPayment } from "./billing.js";
import { PAID_PLANS } from "./plans.js";

export class AdminError extends Error {}

function log(adminEmail, action, target, detail = null) {
  db.prepare("INSERT INTO admin_actions (admin_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)").run(
    adminEmail,
    action,
    target,
    detail,
    Date.now()
  );
}

function requireUser(userId) {
  const user = getUserById(userId);
  if (!user) throw new AdminError("User not found.");
  return user;
}

/** Approves a payment (e.g. one in review) and applies its plan. Returns "paid", "already_paid" or "review". */
export function confirmPayment(adminEmail, paymentId) {
  const payment = getPayment(paymentId);
  if (!payment) throw new AdminError("Payment not found.");
  if (payment.status === "paid") return "already_paid";
  if (payment.status === "expired") throw new AdminError("This payment has expired. Create a new checkout instead.");
  db.prepare("UPDATE payments SET status = 'pending' WHERE id = ?").run(payment.id);
  const result = fulfillPayment(payment.id, { detail: `Confirmed by ${adminEmail} (was ${payment.status})` });
  log(adminEmail, "confirm_payment", payment.id, `${payment.plan} via ${payment.method}: ${result}`);
  return result;
}

export function rejectPayment(adminEmail, paymentId, reason) {
  const payment = getPayment(paymentId);
  if (!payment) throw new AdminError("Payment not found.");
  if (payment.status === "paid") throw new AdminError("This payment is already paid. Adjust the account's plan or credits instead.");
  if (payment.status === "failed") throw new AdminError("This payment was already rejected.");
  if (payment.status === "expired") throw new AdminError("This payment has expired.");
  const detail = String(reason || "").trim() || "Rejected by admin";
  db.prepare("UPDATE payments SET status = 'failed', detail = ? WHERE id = ?").run(detail, payment.id);
  log(adminEmail, "reject_payment", payment.id, detail);
}

export function grantCredits(adminEmail, userId, amount, reason) {
  const user = requireUser(userId);
  const delta = Number.parseInt(amount, 10);
  if (!Number.isFinite(delta) || delta === 0) throw new AdminError("Amount must be a non-zero whole number.");
  const note = String(reason || "").trim() || "admin_grant";
  const balance = adjustCredits(user.id, delta, note);
  log(adminEmail, "grant_credits", user.email, `${delta > 0 ? "+" : ""}${delta} (${note})`);
  return balance;
}

/** Sets the plan directly. Pro gets a fresh allowance and runs until `renewsAt` (default: 30 days). */
export function setPlan(adminEmail, userId, plan, renewsAt = null) {
  const user = requireUser(userId);
  if (!PLANS.includes(plan)) throw new AdminError(`Plan must be one of: ${PLANS.join(", ")}.`);
  let renews = null;
  if (plan === "pro") {
    renews = renewsAt ? Date.parse(renewsAt) : Date.now() + PAID_PLANS.pro.days * 86_400_000;
    if (!Number.isFinite(renews) || renews <= Date.now()) throw new AdminError("The Pro end date must be in the future.");
  }
  db.prepare("UPDATE users SET plan = ?, plan_renews_at = ?, plan_credits = ? WHERE id = ?").run(
    plan,
    renews,
    plan === "pro" ? PAID_PLANS.pro.credits : 0,
    user.id
  );
  log(adminEmail, "set_plan", user.email, plan === "pro" ? `pro until ${new Date(renews).toISOString().slice(0, 10)}` : plan);
  return renews;
}

export function setAdmin(adminEmail, userId, on) {
  const user = requireUser(userId);
  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(on ? 1 : 0, user.id);
  log(adminEmail, on ? "admin_on" : "admin_off", user.email);
}

export function setDisabled(adminEmail, userId, disabled) {
  const user = requireUser(userId);
  db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, user.id);
  if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  log(adminEmail, disabled ? "disable" : "enable", user.email);
}

export function signOutEverywhere(adminEmail, userId) {
  const user = requireUser(userId);
  const { changes } = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  log(adminEmail, "sign_out_everywhere", user.email, `${changes} sessions`);
  return changes;
}

/** Gives the free trial to an account the device or network check refused (e.g. a shared office computer). */
export function grantTrial(adminEmail, userId) {
  const user = requireUser(userId);
  if (user.trial_claimed_at) throw new AdminError("This account already received its free trial.");
  adjustCredits(user.id, config.freeCredits, "signup_bonus_admin");
  db.prepare("UPDATE users SET trial_claimed_at = ?, trial_denied_at = NULL, trial_denied_reason = NULL WHERE id = ?").run(
    Date.now(),
    user.id
  );
  log(adminEmail, "grant_trial", user.email, `${config.freeCredits} credits`);
}
