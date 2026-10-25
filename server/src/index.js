import fs from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config, cryptoEnabled, emailDevMode, googleEnabled, paystackEnabled } from "./config.js";
import "./db.js";
import { auth } from "./auth.js";
import { api } from "./api.js";
import { pay, paystackWebhook } from "./pay.js";
import { admin } from "./admin-web.js";

const APPLE_PAY_FILE = new URL("../public/.well-known/apple-developer-merchantid-domain-association", import.meta.url);

const app = new Hono();

app.get("/", (c) => c.redirect(config.siteUrl, 302));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/.well-known/apple-developer-merchantid-domain-association", (c) => {
  if (!fs.existsSync(APPLE_PAY_FILE)) return c.text("Not found", 404);
  return c.body(fs.readFileSync(APPLE_PAY_FILE), 200, { "Content-Type": "text/plain" });
});
app.route("/auth", auth);
app.route("/v1", api);
app.route("/pay", pay);
app.route("/admin", admin);
app.post("/billing/paystack/webhook", paystackWebhook);

app.notFound((c) => c.json({ error: { message: "Not found" } }, 404));
app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.json({ error: { message: "Internal server error" } }, 500);
});

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, ({ address, port }) => {
  console.log(`Ai.Intvra server listening on http://${address}:${port} (public URL ${config.publicUrl})`);
  if (!config.ai.apiKeys.length) console.warn("AI_API_KEYS is empty: answers will fail until it is set.");
  else console.log(`AI answers: ${config.ai.apiKeys.length} key(s), ${config.ai.models.length} model(s).`);
  if (!googleEnabled()) console.warn("Google sign-in disabled: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  if (emailDevMode()) console.warn("RESEND_API_KEY not set: email login codes are printed here (development only).");
  if (!paystackEnabled()) console.warn("Paystack disabled: set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY.");
  if (!cryptoEnabled()) console.warn("Crypto payments disabled: set CRYPTO_BSC_ADDRESS, CRYPTO_ETH_ADDRESS and/or CRYPTO_LTC_ADDRESS.");
  console.log(`Admin dashboard: ${config.publicUrl}/admin`);
});
