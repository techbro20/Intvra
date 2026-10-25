import { randomBytes } from "node:crypto";
import { applyPlanPurchase, db, getUserById, transaction } from "./db.js";

const EXACT_AMOUNT_TIP =
  "Send the exact amount, including the last digits: if you're withdrawing from an exchange, add the withdrawal fee so this exact amount arrives.";

export const CRYPTO_METHODS = {
  usdt_bsc: {
    label: "USDT",
    short: "BEP20",
    network: "BNB Smart Chain (BEP20)",
    currency: "USDT",
    explorer: "https://bscscan.com/tx/",
    warning: `Send USDT on BNB Smart Chain (BEP20) only. Sending on another network (Ethereum, TRON) or another token means we can't credit it automatically. ${EXACT_AMOUNT_TIP}`,
  },
  usdc_bsc: {
    label: "USDC",
    short: "BEP20",
    network: "BNB Smart Chain (BEP20)",
    currency: "USDC",
    explorer: "https://bscscan.com/tx/",
    warning: `Send USDC on BNB Smart Chain (BEP20) only. Sending on another network (Ethereum, TRON) or another token means we can't credit it automatically. ${EXACT_AMOUNT_TIP}`,
  },
  usdc_eth: {
    label: "USDC",
    short: "ERC20",
    network: "Ethereum (ERC20)",
    currency: "USDC",
    explorer: "https://etherscan.io/tx/",
    warning: `Send USDC on the Ethereum network (ERC20) only. Sending on another network (BNB Smart Chain, Base, Arbitrum) means we can't credit it automatically. Ethereum network fees are paid by you and can be a few dollars. ${EXACT_AMOUNT_TIP}`,
  },
  ltc: {
    label: "Litecoin",
    short: "LTC",
    network: "Litecoin",
    currency: "LTC",
    explorer: "https://litecoinspace.org/tx/",
    warning: `Send on the Litecoin network only. ${EXACT_AMOUNT_TIP}`,
  },
};

/** Block explorer link for a payment's transaction, or "". */
export function explorerUrl(payment) {
  const method = CRYPTO_METHODS[payment.method];
  const txid = String(payment.provider_ref || "").split(":")[1];
  return method && txid ? `${method.explorer}${txid}` : "";
}

export function createPayment({ userId, plan, method, amount, currency, expiresAt = null, detail = null }) {
  const id = `pay_${randomBytes(12).toString("hex")}`;
  db.prepare(
    `INSERT INTO payments (id, user_id, plan, method, amount, currency, status, detail, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).run(id, userId, plan, method, String(amount), currency, detail, Date.now(), expiresAt);
  return getPayment(id);
}

export const getPayment = (id) => db.prepare("SELECT * FROM payments WHERE id = ?").get(String(id || ""));

export function setPaymentStatus(id, status, { providerRef, detail } = {}) {
  db.prepare(
    "UPDATE payments SET status = ?, provider_ref = COALESCE(?, provider_ref), detail = COALESCE(?, detail) WHERE id = ?"
  ).run(status, providerRef ?? null, detail ?? null, id);
}

/** True if another payment already claimed this transaction / reference. */
export function refTaken(providerRef, paymentId) {
  const row = db.prepare("SELECT id FROM payments WHERE provider_ref = ?").get(providerRef);
  return Boolean(row && row.id !== paymentId);
}

/**
 * Marks a payment as paid and applies its plan exactly once.
 * Returns "paid", "already_paid" or "review" (paid, but needs a manual decision).
 */
export function fulfillPayment(paymentId, { providerRef, detail } = {}) {
  return transaction(() => {
    const payment = getPayment(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if (payment.status === "paid") return "already_paid";

    const user = getUserById(payment.user_id);
    const now = Date.now();
    if (user.plan === "lifetime" && payment.plan !== "lifetime") {
      db.prepare(
        "UPDATE payments SET status = 'review', provider_ref = COALESCE(?, provider_ref), detail = ?, paid_at = ? WHERE id = ?"
      ).run(providerRef ?? null, "Paid after the account already had Lifetime; refund or convert manually.", now, paymentId);
      return "review";
    }

    db.prepare(
      "UPDATE payments SET status = 'paid', paid_at = ?, provider_ref = COALESCE(?, provider_ref), detail = COALESCE(?, detail) WHERE id = ?"
    ).run(now, providerRef ?? null, detail ?? null, paymentId);
    applyPlanPurchase(payment.user_id, payment.plan, paymentId);
    return "paid";
  });
}
