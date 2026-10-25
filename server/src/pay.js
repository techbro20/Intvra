import { Hono } from "hono";
import QRCode from "qrcode";
import { config, paystackEnabled } from "./config.js";
import { sha256 } from "./crypto.js";
import { db, getUserById } from "./db.js";
import { CRYPTO_METHODS, getPayment } from "./billing.js";
import { confirmPaystackPayment, paystackPrice, startPaystackPayment, validWebhookSignature } from "./paystack.js";
import { createCryptoOrder, cryptoMethodsAvailable, PaymentCheckError, submitCryptoTx } from "./crypto-pay.js";
import { PAID_PLANS, isPaidPlan, purchaseBlockedReason } from "./plans.js";
import { checkoutPage, donePage } from "./paypage.js";
import { messagePage } from "./pages.js";
import { createLimiter } from "./ratelimit.js";
import { endWebSession, getWebUser, sameOrigin, startWebSession } from "./websession.js";

const PLAN_LABELS = { free: "Free", payg: "Pay as you go", pro: "Pro", lifetime: "Lifetime" };
const checkLimiter = createLimiter({ windowMs: 60_000, max: 30 });
const orderLimiter = createLimiter({ windowMs: 15 * 60_000, max: 20 });

const formatMoney = ({ amount, currency }) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

function currentPlanLabel(user) {
  if (user.is_admin) return "Admin (own API keys)";
  const label = PLAN_LABELS[user.plan] || user.plan;
  if (user.plan === "pro" && user.plan_renews_at) {
    return `${label}, active until ${new Date(user.plan_renews_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return label;
}

const jsonError = (c, status, error) => c.json({ error }, status);

export const pay = new Hono();

pay.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// JSON endpoints: signed-in browser on this site only.
pay.use("/paystack/init", requireWebJson);
pay.use("/paystack/verify", requireWebJson);
pay.use("/crypto/*", requireWebJson);

async function requireWebJson(c, next) {
  if (c.req.method !== "POST" || !sameOrigin(c)) return jsonError(c, 403, "Please reload the page and try again.");
  const user = getWebUser(c);
  if (!user) return jsonError(c, 401, "Your session has ended. Reload the page to sign in again.");
  c.set("user", user);
  await next();
}

pay.get("/", (c) => {
  const user = getWebUser(c);
  const requested = c.req.query("plan");
  if (!user) {
    const next = `/pay${requested ? `?plan=${encodeURIComponent(requested)}` : ""}`;
    return c.redirect(`/auth/web?next=${encodeURIComponent(next)}`, 302);
  }

  const paystack = paystackEnabled();
  const plans = Object.entries(PAID_PLANS).map(([id, plan]) => ({
    id,
    name: plan.name,
    summary: plan.summary,
    usd: plan.usd,
    payLabel: formatMoney(paystack ? paystackPrice(id) : { amount: plan.usd, currency: "USD" }),
    blocked: purchaseBlockedReason(user, id),
  }));
  const available = plans.filter((p) => !p.blocked);
  const selected = available.find((p) => p.id === requested)?.id || available.find((p) => p.id === "pro")?.id || available[0]?.id || "";

  if (!available.length) {
    return c.html(
      donePage({
        user,
        title: user.plan === "lifetime" ? "You have Lifetime" : "Nothing to buy",
        message: purchaseBlockedReason(user, "pro"),
        showDownload: false,
      })
    );
  }

  const cryptoMethods = cryptoMethodsAvailable().map((id) => ({
    id,
    label: CRYPTO_METHODS[id].label,
    short: CRYPTO_METHODS[id].short,
  }));
  return c.html(checkoutPage({ user, currentPlan: currentPlanLabel(user), plans, selected, paystack, cryptoMethods }));
});

// Opened by the desktop app with a one-time code, so the user doesn't sign in twice.
pay.get("/open", (c) => {
  const code = c.req.query("code") || "";
  const plan = c.req.query("plan");
  const link = code && db.prepare("SELECT * FROM web_links WHERE code_hash = ?").get(sha256(code));
  const target = `/pay${plan && isPaidPlan(plan) ? `?plan=${plan}` : ""}`;
  if (!link || link.used_at || link.expires_at < Date.now()) {
    // An old link: fall back to normal sign-in instead of an error.
    return c.redirect(getWebUser(c) ? target : `/auth/web?next=${encodeURIComponent(target)}`, 302);
  }
  db.prepare("UPDATE web_links SET used_at = ? WHERE code_hash = ?").run(Date.now(), link.code_hash);
  const user = getUserById(link.user_id);
  if (!user || user.disabled) return c.html(messagePage("Account unavailable", "This account can't make purchases."), 403);
  startWebSession(c, user.id);
  return c.redirect(target, 302);
});

pay.post("/logout", (c) => {
  endWebSession(c);
  return c.redirect("/pay", 302);
});

pay.post("/paystack/init", async (c) => {
  const user = c.get("user");
  if (!paystackEnabled()) return jsonError(c, 503, "Card and M-Pesa payments aren't available right now.");
  const { plan } = await c.req.json().catch(() => ({}));
  const blocked = purchaseBlockedReason(user, plan);
  if (blocked) return jsonError(c, 400, blocked);
  if (orderLimiter(`order:${user.id}`)) return jsonError(c, 429, "Too many attempts. Please wait a few minutes.");
  try {
    return c.json(await startPaystackPayment(user, plan));
  } catch (error) {
    console.error("Paystack init failed:", error);
    return jsonError(c, 502, "We couldn't start the payment. Please try again.");
  }
});

const PAYSTACK_MESSAGES = {
  review: `Your payment was received but needs a quick manual check. We'll email you, usually within a day. Questions: ${config.supportEmail}`,
  failed: "The payment didn't go through. You haven't been charged. Please try again.",
};

pay.post("/paystack/verify", async (c) => {
  const user = c.get("user");
  const { reference } = await c.req.json().catch(() => ({}));
  const payment = getPayment(reference);
  if (!payment || payment.user_id !== user.id) return jsonError(c, 404, "Payment not found.");
  if (checkLimiter(`check:${user.id}`)) return jsonError(c, 429, "Please wait a moment and try again.");
  try {
    const status = await confirmPaystackPayment(payment.id);
    return c.json({ status, message: PAYSTACK_MESSAGES[status] || "" });
  } catch (error) {
    console.error("Paystack verify failed:", error);
    return c.json({ status: "pending", message: "" });
  }
});

// Paystack sends the browser here when the redirect checkout (not the pop-up) is used.
pay.get("/paystack/return", async (c) => {
  const reference = c.req.query("reference") || c.req.query("trxref") || "";
  const payment = getPayment(reference);
  if (!payment) return c.redirect("/pay", 302);
  try {
    const status = await confirmPaystackPayment(payment.id);
    if (status === "paid" || status === "already_paid") return c.redirect(`/pay/done?payment=${payment.id}`, 302);
    if (status === "review" || status === "failed") {
      return c.html(messagePage(status === "review" ? "Payment being checked" : "Payment didn't go through", PAYSTACK_MESSAGES[status]));
    }
  } catch (error) {
    console.error("Paystack return verify failed:", error);
  }
  return c.html(
    messagePage(
      "Waiting for confirmation",
      "We haven't received confirmation from Paystack yet. If you approved the payment, your plan will activate within a few minutes."
    )
  );
});

pay.post("/crypto/order", async (c) => {
  const user = c.get("user");
  const { plan, method } = await c.req.json().catch(() => ({}));
  const blocked = purchaseBlockedReason(user, plan);
  if (blocked) return jsonError(c, 400, blocked);
  if (orderLimiter(`order:${user.id}`)) return jsonError(c, 429, "Too many attempts. Please wait a few minutes.");
  try {
    const order = await createCryptoOrder(user, plan, method);
    const qrText = method === "ltc" ? `litecoin:${order.address}?amount=${order.payment.amount}` : order.address;
    const qrSvg = await QRCode.toString(qrText, { type: "svg", margin: 1, color: { dark: "#050B1E", light: "#ffffff" } });
    return c.json({
      paymentId: order.payment.id,
      method,
      amount: order.payment.amount,
      currency: order.currency,
      network: order.network,
      warning: order.warning,
      address: order.address,
      expiresAt: order.payment.expires_at,
      qrSvg,
    });
  } catch (error) {
    if (error instanceof PaymentCheckError) return jsonError(c, 400, error.message);
    console.error("Crypto order failed:", error);
    return jsonError(c, 500, "We couldn't create the order. Please try again.");
  }
});

pay.post("/crypto/submit", async (c) => {
  const user = c.get("user");
  if (checkLimiter(`check:${user.id}`)) return jsonError(c, 429, "Please wait a moment and try again.");
  const { paymentId, txid } = await c.req.json().catch(() => ({}));
  return c.json(await submitCryptoTx(user, paymentId, txid));
});

pay.get("/done", (c) => {
  const user = getWebUser(c);
  const payment = getPayment(c.req.query("payment"));
  if (!user || !payment || payment.user_id !== user.id) return c.redirect("/pay", 302);
  if (payment.status !== "paid") {
    return c.html(messagePage("Payment pending", "We haven't confirmed this payment yet. Please check again in a few minutes."));
  }
  const fresh = getUserById(user.id);
  const message =
    payment.plan === "lifetime"
      ? "Lifetime is active. Open the Ai.Intvra app and add your own API key on the Providers page to start answering."
      : payment.plan === "pro"
        ? `Pro is active until ${new Date(fresh.plan_renews_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, with ${PAID_PLANS.pro.credits} credits. Go back to the Ai.Intvra app: your balance updates automatically.`
        : `${PAID_PLANS.payg.credits} credits were added to your account. Go back to the Ai.Intvra app: your balance updates automatically.`;
  return c.html(donePage({ user, title: "Payment received", message, showDownload: true }));
});

/** Paystack server-to-server notifications. */
export async function paystackWebhook(c) {
  const raw = await c.req.text();
  if (!validWebhookSignature(raw, c.req.header("x-paystack-signature"))) return c.text("invalid signature", 401);
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return c.text("bad request", 400);
  }
  if (event.event === "charge.success" && event.data?.reference) {
    try {
      await confirmPaystackPayment(event.data.reference);
    } catch (error) {
      console.error("Paystack webhook handling failed:", error);
      return c.text("retry", 500);
    }
  }
  return c.text("ok");
}