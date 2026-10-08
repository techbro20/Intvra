import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config, emailDevMode, googleEnabled } from "./config.js";
import "./db.js";
import { auth } from "./auth.js";
import { api } from "./api.js";

const app = new Hono();

app.get("/", (c) => c.redirect("https://ai.intvra.com", 302));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", auth);
app.route("/v1", api);

app.notFound((c) => c.json({ error: { message: "Not found" } }, 404));
app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.json({ error: { message: "Internal server error" } }, 500);
});

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, ({ address, port }) => {
  console.log(`Ai.Intvra server listening on http://${address}:${port} (public URL ${config.publicUrl})`);
  if (!config.ai.apiKeys.length) console.warn("AI_API_KEYS is empty: answers will fail until it is set.");
  if (!googleEnabled()) console.warn("Google sign-in disabled: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  if (emailDevMode()) console.warn("RESEND_API_KEY not set: email login codes are printed here (development only).");
});
