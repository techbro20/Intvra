import { createHmac } from "node:crypto";
import { config } from "./config.js";
import { safeEqual } from "./crypto.js";
import { createPayment, fulfillPayment, getPayment, setPaymentStatus } from "./billing.js";

const API = "https://api.paystack.co";

async function paystack(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.paystack.secretKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    throw new Error(`Paystack ${path} failed: ${res.status} ${data.message || ""}`.trim());
  }
  return data.data;
}

const minorUnits = (plan) => Math.round(config.paystack.prices[plan] * 100);

export const paystackPrice = (plan) => ({
  amount: config.paystack.prices[plan],
  currency: config.paystack.currency,
});

/** Creates a pending payment and a Paystack transaction for it. */
export async function startPaystackPayment(user, plan) {
  const payment = createPayment({
    userId: user.id,
    plan,
    method: "paystack",
    amount: config.paystack.prices[plan].toFixed(2),
    currency: config.paystack.currency,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
  const tx = await paystack("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      amount: minorUnits(plan),
      currency: config.paystack.currency,
      reference: payment.id,
      callback_url: `${config.publicUrl}/pay/paystack/return`,
      metadata: { payment_id: payment.id, user_id: user.id, plan },
    }),
  });
  setPaymentStatus(payment.id, "pending", { providerRef: `paystack:${payment.id}` });
  return { paymentId: payment.id, accessCode: tx.access_code, authorizationUrl: tx.authorization_url };
}

/**
 * Asks Paystack for the transaction's real status and applies the plan if it succeeded.
 * Returns "paid", "already_paid", "review", "pending" or "failed".
 */
export async function confirmPaystackPayment(reference) {
  const payment = getPayment(reference);
  if (!payment || payment.method !== "paystack") return "failed";
  if (payment.status === "paid") return "already_paid";

  const tx = await paystack(`/transaction/verify/${encodeURIComponent(payment.id)}`);
  if (tx.status === "success") {
    if (tx.amount !== Math.round(Number(payment.amount) * 100) || tx.currency !== payment.currency) {
      setPaymentStatus(payment.id, "review", { detail: `Amount mismatch: got ${tx.amount} ${tx.currency}` });
      return "review";
    }
    return fulfillPayment(payment.id, { detail: tx.channel || null });
  }
  if (["failed", "abandoned", "reversed"].includes(tx.status)) {
    if (tx.status !== "abandoned") setPaymentStatus(payment.id, "failed", { detail: tx.gateway_response || tx.status });
    return tx.status === "abandoned" ? "pending" : "failed";
  }
  return "pending";
}

export function validWebhookSignature(rawBody, signature) {
  if (!config.paystack.secretKey || !signature) return false;
  const expected = createHmac("sha512", config.paystack.secretKey).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
