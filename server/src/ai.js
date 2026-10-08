import { config } from "./config.js";

const MAX_MESSAGES = 60;
const MAX_TEXT_CHARS = 200_000;
const MAX_IMAGES = 4;

// Upstream keys/models that recently failed are skipped until their cooldown ends.
const keyCooldowns = new Map();
const modelCooldowns = new Map();

const coolingDown = (map, key) => (map.get(key) || 0) > Date.now();
const coolDown = (map, key, ms) => map.set(key, Date.now() + ms);

function retryAfterMs(response, fallbackMs) {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60 * 60 * 1000) : fallbackMs;
}

export class UpstreamError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
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

/**
 * Streams a chat completion from the upstream provider, falling back across
 * configured keys and models. Resolves with the upstream Response and model used.
 */
export async function streamChat({ messages, hasImages, maxTokens, signal }) {
  const { apiKeys, baseUrl, models, visionModels } = config.ai;
  if (!apiKeys.length) throw new UpstreamError("The AI service isn't configured yet.");

  const useVision = hasImages && visionModels.length > 0;
  const modelList = useVision ? visionModels : models;
  const payloadMessages = useVision ? messages : withoutImages(messages);
  const maxOutputTokens = Math.min(Math.max(Number(maxTokens) || config.ai.maxOutputTokens, 64), config.ai.maxOutputTokens);

  let lastError = "No AI model is available right now.";
  for (const model of modelList) {
    if (coolingDown(modelCooldowns, model)) continue;

    for (let index = 0; index < apiKeys.length; index++) {
      const slot = `${index}:${model}`;
      if (coolingDown(keyCooldowns, index) || coolingDown(keyCooldowns, slot)) continue;

      let response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKeys[index]}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: payloadMessages,
            stream: true,
            temperature: 0.7,
            max_completion_tokens: maxOutputTokens,
          }),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = `Network error contacting the AI provider: ${error.message}`;
        coolDown(keyCooldowns, slot, 15_000);
        continue;
      }

      if (response.ok && response.body) return { response, model };

      const detail = await response.text().catch(() => "");
      lastError = `${response.status} ${detail.slice(0, 300)}`;
      if (response.status === 401 || response.status === 403) {
        console.error(`AI key #${index + 1} rejected (${response.status}); disabling it for an hour.`);
        coolDown(keyCooldowns, index, 60 * 60 * 1000);
      } else if (response.status === 429) {
        coolDown(keyCooldowns, slot, retryAfterMs(response, 60_000));
      } else if (response.status === 400 || response.status === 404) {
        // Usually a retired or unsupported model; skip it for every key.
        console.error(`AI model ${model} failed: ${lastError}`);
        coolDown(modelCooldowns, model, 10 * 60 * 1000);
        break;
      } else {
        coolDown(keyCooldowns, slot, 30_000);
      }
    }
  }

  console.error("All AI candidates failed:", lastError);
  throw new UpstreamError("The AI service is busy right now. Please try again in a moment.");
}

/** Transcribes an audio file with the upstream speech-to-text provider. */
export async function transcribe(file) {
  const { apiKeys, baseUrl, model } = config.stt;
  if (!apiKeys.length) throw new UpstreamError("Speech-to-text isn't configured yet.");

  let lastError = "";
  for (let index = 0; index < apiKeys.length; index++) {
    const slot = `stt:${index}`;
    if (coolingDown(keyCooldowns, slot)) continue;

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

    lastError = `${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`;
    if (response.status === 400 || response.status === 413) {
      throw new UpstreamError("This audio clip couldn't be transcribed.", 400);
    }
    coolDown(keyCooldowns, slot, response.status === 429 ? retryAfterMs(response, 60_000) : 30_000);
  }

  console.error("All STT keys failed:", lastError);
  throw new UpstreamError("Speech-to-text is busy right now. Please try again in a moment.");
}
