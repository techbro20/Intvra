import { config } from "./config.js";

const MAX_MESSAGES = 60;
const MAX_TEXT_CHARS = 200_000;
const MAX_IMAGES = 4;

// Upstream keys/models that recently failed are skipped until their cooldown ends.
const keyCooldowns = new Map();
const modelCooldowns = new Map();
const keyCursor = new Map();
// Some models reject a parameter. Remember that and resend without it.
const modelParamDrops = new Map();

const SHRINK_CHARS = 12_000;
const SHORT_RETRY_MS = 2_500;

const coolingDown = (map, key) => (map.get(key) || 0) > Date.now();
const coolDown = (map, key, ms) => map.set(key, Date.now() + ms);

function retryAfterMs(response, detail, fallbackMs) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 60 * 60 * 1000);
  const mentioned = String(detail).match(/try again in\s+([\d.]+)\s*s/i);
  const seconds = mentioned ? Number(mentioned[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60 * 60 * 1000) : fallbackMs;
}

function organizationId(detail) {
  const quoted = String(detail).match(/organization\s+[`']([^`']+)[`']/i);
  if (quoted) return quoted[1];
  return String(detail).match(/organization\s+(org_[A-Za-z0-9]+)/i)?.[1] || "";
}

// Groq's limits belong to the account, so a second key from that same account fails the same way.
function failureKind(status, detail) {
  const text = String(detail).toLowerCase();
  if (status === 401 || status === 403) return "auth";
  if (
    status === 413 ||
    text.includes("request too large") ||
    text.includes("context_length_exceeded") ||
    text.includes("maximum context") ||
    text.includes("reduce the length")
  ) {
    return "too_large";
  }
  if (status === 429 || text.includes("rate_limit") || text.includes("rate limit")) return "rate_limit";
  if (
    status === 404 ||
    text.includes("model_not_found") ||
    text.includes("does not exist") ||
    text.includes("decommissioned") ||
    text.includes("no longer supported")
  ) {
    return "bad_model";
  }
  if (status === 400 && (text.includes("temperature") || text.includes("max_completion_tokens") || text.includes("max_tokens"))) {
    return "bad_param";
  }
  if (status === 400) return "bad_request";
  return "transient";
}

function keyOrder(tag, length) {
  const start = (keyCursor.get(tag) || 0) % length;
  keyCursor.set(tag, (start + 1) % length);
  return Array.from({ length }, (_, offset) => (start + offset) % length);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function soonestExpiry(keys) {
  const waiting = keys.map((key) => modelCooldowns.get(key) || keyCooldowns.get(key) || 0).filter((until) => until > Date.now());
  return waiting.length ? Math.min(...waiting) : 0;
}

export class UpstreamError extends Error {
  constructor(message, status = 503, detail = "", model = null) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.model = model;
  }
}

/** Validates client messages and keeps only text and image parts. Returns { messages, hasImages }. */
export function sanitizeMessages(input) {
  if (!Array.isArray(input) || !input.length) throw new UpstreamError("messages are required", 400);
  const recent = input.slice(-MAX_MESSAGES);
  let textChars = 0;
  let images = 0;

  const messages = recent.map((message) => {
    const role = ["system", "user", "assistant"].includes(message?.role) ? message.role : "user";
    const parts = typeof message?.content === "string" ? [{ type: "text", text: message.content }] : message?.content;
    if (!Array.isArray(parts)) throw new UpstreamError("Invalid message content", 400);

    const content = [];
    for (const part of parts) {
      if (part?.type === "text" && typeof part.text === "string") {
        textChars += part.text.length;
        content.push({ type: "text", text: part.text });
      } else if (part?.type === "image_url" && role === "user" && images < MAX_IMAGES) {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
        if (typeof url === "string" && url.startsWith("data:image/")) {
          images += 1;
          content.push({ type: "image_url", image_url: { url } });
        }
      }
    }
    return { role, content };
  });

  if (textChars > MAX_TEXT_CHARS) throw new UpstreamError("Request is too long", 413);
  return { messages, hasImages: images > 0 };
}

function withoutImages(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
  }));
}

function messageText(message) {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function withText(message, text) {
  if (typeof message.content === "string") return { ...message, content: text };
  if (!Array.isArray(message.content)) return message;
  let replaced = false;
  const content = [];
  for (const part of message.content) {
    if (part?.type !== "text") {
      content.push(part);
      continue;
    }
    if (replaced) continue;
    replaced = true;
    content.push({ ...part, text });
  }
  return { ...message, content };
}

// Keeps the system prompt and the newest turns. A request larger than the
// account's tokens-per-minute limit fails on every key, so the retry is smaller.
function shrinkMessages(messages) {
  const systems = [];
  const rest = [];
  for (const message of messages) {
    (message.role === "system" ? systems : rest).push(message);
  }
  const clip = (text, max) => (text.length <= max ? text : text.slice(0, max));
  const clippedSystems = systems.map((message) => withText(message, clip(messageText(message), 4_000)));
  const chars = (list) => list.reduce((sum, message) => sum + messageText(message).length, 0);
  const kept = [];
  for (let index = rest.length - 1; index >= 0; index -= 1) {
    const candidate = [rest[index], ...kept];
    if (chars(clippedSystems) + chars(candidate) > SHRINK_CHARS) {
      if (!kept.length) {
        const room = Math.max(1_000, SHRINK_CHARS - chars(clippedSystems));
        kept.unshift(withText(rest[index], clip(messageText(rest[index]), room)));
      }
      break;
    }
    kept.unshift(rest[index]);
  }
  return [...clippedSystems, ...kept];
}

function chatBody(model, messages, maxOutputTokens) {
  const drops = modelParamDrops.get(model) || new Set();
  const body = { model, messages, stream: true };
  if (!drops.has("temperature")) body.temperature = 0.7;
  if (drops.has("max_completion_tokens")) body.max_tokens = maxOutputTokens;
  else body.max_completion_tokens = maxOutputTokens;
  return body;
}

/**
 * One pass over models and keys. Keys are rotated, but a rate limit is per
 * account on Groq: once two keys report the same account, the rest are skipped
 * and the next model is tried. A request that cannot fit the token budget sets
 * oversized so the caller can retry with a shorter transcript.
 */
async function completeChat({ tag, baseUrl, apiKeys, models, messages, maxOutputTokens, signal }) {
  const order = keyOrder(tag, apiKeys.length);
  let lastError = "No AI model is available right now.";
  let lastModel = null;
  let oversized = false;
  let attempted = false;
  const expiryKeys = [];
  const heldLimits = [];

  for (const model of models) {
    const modelKey = `${tag}:${model}`;
    expiryKeys.push(modelKey);
    if (coolingDown(modelCooldowns, modelKey)) continue;

    let sharedOrg = "";
    let rateLimitHits = 0;
    for (const index of order) {
      const keyId = `${tag}:${index}`;
      const slot = `${keyId}:${model}`;
      expiryKeys.push(keyId, slot);
      if (coolingDown(keyCooldowns, keyId) || coolingDown(keyCooldowns, slot)) continue;
      if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });

      let response;
      let detail = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        attempted = true;
        try {
          response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKeys[index]}`, "Content-Type": "application/json" },
            body: JSON.stringify(chatBody(model, messages, maxOutputTokens)),
            signal,
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = `Network error contacting the AI provider: ${error.message}`;
          lastModel = model;
          coolDown(keyCooldowns, slot, 15_000);
          response = null;
          break;
        }

        if (response.ok && response.body) return { response, model };

        detail = await response.text().catch(() => "");
        lastError = `${response.status} ${detail.slice(0, 300)}`;
        lastModel = model;
        if (failureKind(response.status, detail) !== "bad_param") break;

        const text = detail.toLowerCase();
        const param = text.includes("temperature") ? "temperature" : "max_completion_tokens";
        const drops = modelParamDrops.get(model) || new Set();
        if (drops.has(param)) break;
        modelParamDrops.set(model, new Set([...drops, param]));
      }

      if (!response) continue;
      if (response.ok && response.body) return { response, model };

      const kind = failureKind(response.status, detail);
      if (kind === "auth") {
        console.error(`AI ${tag} key #${index + 1} rejected (${response.status}); disabling it for an hour.`);
        coolDown(keyCooldowns, keyId, 60 * 60 * 1000);
        continue;
      }
      if (kind === "too_large") {
        oversized = true;
        break;
      }
      if (kind === "rate_limit") {
        const wait = retryAfterMs(response, detail, 20_000);
        coolDown(keyCooldowns, slot, wait);
        heldLimits.push([keyCooldowns, slot]);
        const org = organizationId(detail);
        rateLimitHits += 1;
        const sameAccount = (org && sharedOrg && org === sharedOrg) || (!org && rateLimitHits >= 2);
        if (sameAccount) {
          console.error(`AI ${tag} model ${model} is rate-limited for the whole account; skipping the other keys.`);
          coolDown(modelCooldowns, modelKey, wait);
          heldLimits.push([modelCooldowns, modelKey]);
          break;
        }
        sharedOrg = org || sharedOrg;
        continue;
      }
      if (kind === "bad_model") {
        console.error(`AI model ${model} failed: ${lastError}`);
        coolDown(modelCooldowns, modelKey, 10 * 60 * 1000);
        break;
      }
      if (kind === "bad_request" || kind === "bad_param") {
        console.error(`AI model ${model} rejected the request: ${lastError}`);
        break;
      }
      coolDown(keyCooldowns, slot, 30_000);
    }
    if (oversized) break;
  }

  return { lastError, lastModel, oversized, attempted, retryAt: soonestExpiry(expiryKeys), heldLimits };
}

/**
 * Streams a chat completion, falling back across keys and models.
 * A screenshot provider that fails falls back to the text models.
 * Resolves with the upstream Response and model used.
 */
export async function streamChat({ messages, hasImages, maxTokens, signal }) {
  const { models, visionModels } = config.ai;
  const useVision = hasImages && visionModels.length > 0;
  const maxOutputTokens = Math.min(Math.max(Number(maxTokens) || config.ai.maxOutputTokens, 64), config.ai.maxOutputTokens);
  const textMessages = withoutImages(messages);

  const send = (options) =>
    deliverChat({
      ...options,
      maxOutputTokens,
      signal,
    });

  if (useVision) {
    if (!config.ai.visionApiKeys.length) throw new UpstreamError("The AI service isn't configured yet.");
    try {
      return await send({
        tag: "vision",
        baseUrl: config.ai.visionBaseUrl,
        apiKeys: config.ai.visionApiKeys,
        models: visionModels,
        messages,
      });
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      console.error("Vision answers failed, trying text models:", error.detail || error.message);
    }
  }

  if (!config.ai.apiKeys.length) throw new UpstreamError("The AI service isn't configured yet.");
  return send({
    tag: "chat",
    baseUrl: config.ai.baseUrl,
    apiKeys: config.ai.apiKeys,
    models,
    messages: textMessages,
  });
}

async function deliverChat({ tag, baseUrl, apiKeys, models, messages, maxOutputTokens, signal }) {
  let payload = messages;
  let outputTokens = maxOutputTokens;
  let outcome = await completeChat({ tag, baseUrl, apiKeys, models, messages: payload, maxOutputTokens: outputTokens, signal });
  if (outcome.response) return { response: outcome.response, model: outcome.model };

  const promptChars = messages.reduce((sum, message) => sum + messageText(message).length, 0);
  const tokenLimited = /tokens per minute|tpm/i.test(outcome.lastError);
  if (outcome.oversized || (tokenLimited && promptChars > SHRINK_CHARS)) {
    const previousError = outcome.lastError;
    const previousModel = outcome.lastModel;
    payload = shrinkMessages(payload);
    outputTokens = Math.min(outputTokens, 768);
    console.error("AI request was larger than the account token budget; retrying a shorter transcript.");
    for (const [map, key] of outcome.heldLimits || []) map.delete(key);
    outcome = await completeChat({ tag, baseUrl, apiKeys, models, messages: payload, maxOutputTokens: outputTokens, signal });
    if (outcome.response) return { response: outcome.response, model: outcome.model };
    if (!outcome.attempted) {
      outcome.lastError = previousError;
      outcome.lastModel = previousModel;
    }
  }

  const wait = outcome.retryAt - Date.now();
  if (outcome.attempted && wait > 0 && wait <= SHORT_RETRY_MS) {
    const previousError = outcome.lastError;
    const previousModel = outcome.lastModel;
    await sleep(wait, signal);
    outcome = await completeChat({ tag, baseUrl, apiKeys, models, messages: payload, maxOutputTokens: outputTokens, signal });
    if (outcome.response) return { response: outcome.response, model: outcome.model };
    if (!outcome.attempted) {
      outcome.lastError = previousError;
      outcome.lastModel = previousModel;
    }
  }

  if (!outcome.attempted && outcome.lastError === "No AI model is available right now.") {
    outcome.lastError = "All configured models are cooling down after a provider limit.";
  }
  console.error("All AI candidates failed:", outcome.lastError);
  throw new UpstreamError(
    "The AI service is busy right now. Please try again in a moment.",
    503,
    outcome.lastError,
    outcome.lastModel
  );
}

/** Transcribes an audio file with the upstream speech-to-text provider. */
export async function transcribe(file) {
  const { apiKeys, baseUrl, model } = config.stt;
  if (!apiKeys.length) throw new UpstreamError("Speech-to-text isn't configured yet.");

  let lastError = "";
  let sharedOrg = "";
  let rateLimitHits = 0;
  for (const index of keyOrder("stt", apiKeys.length)) {
    const slot = `stt:${index}`;
    if (coolingDown(modelCooldowns, "stt") || coolingDown(keyCooldowns, slot)) continue;

    const form = new FormData();
    form.append("file", file, file.name || "audio.wav");
    form.append("model", model);
    form.append("response_format", "json");

    let response;
    try {
      response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKeys[index]}` },
        body: form,
      });
    } catch (error) {
      lastError = error.message;
      coolDown(keyCooldowns, slot, 15_000);
      continue;
    }

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return String(data.text || "").trim();
    }

    const detail = await response.text().catch(() => "");
    lastError = `${response.status} ${detail.slice(0, 300)}`;
    const kind = failureKind(response.status, detail);
    if (kind === "bad_request" || kind === "too_large") {
      throw new UpstreamError("This audio clip couldn't be transcribed.", 400, lastError, model);
    }
    if (kind === "auth") {
      console.error(`STT key #${index + 1} rejected (${response.status}); disabling it for an hour.`);
      coolDown(keyCooldowns, slot, 60 * 60 * 1000);
      continue;
    }
    if (kind === "rate_limit") {
      const wait = retryAfterMs(response, detail, 20_000);
      coolDown(keyCooldowns, slot, wait);
      const org = organizationId(detail);
      rateLimitHits += 1;
      const sameAccount = (org && sharedOrg && org === sharedOrg) || (!org && rateLimitHits >= 2);
      if (sameAccount) {
        console.error("Speech-to-text is rate-limited for the whole account; skipping the other keys.");
        coolDown(modelCooldowns, "stt", wait);
        break;
      }
      sharedOrg = org || sharedOrg;
      continue;
    }
    coolDown(keyCooldowns, slot, 30_000);
  }

  console.error("All STT keys failed:", lastError);
  throw new UpstreamError("Speech-to-text is busy right now. Please try again in a moment.", 503, lastError, model);
}
