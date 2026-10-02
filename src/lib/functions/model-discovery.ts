import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { deepVariableReplacer } from "./common.function";

export type ModelKind = "chat" | "stt";

const NON_CHAT_MODEL_PATTERN =
  /whisper|transcri|tts|speech|playai|orpheus|guard|embed|moderation|dall-e|image|rerank/i;
const STT_MODEL_PATTERN = /whisper|transcri|scribe|nova|speech-to-text|stt/i;

const modelListCache = new Map<string, string[]>();

export function buildModelListEndpoint(
  providerId: string | undefined,
  url = ""
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (providerId === "ollama") {
      return `${parsed.origin}/api/tags`;
    }
    if (providerId === "cohere") {
      return `${parsed.origin}/v2/models`;
    }
    for (const suffix of ["/chat/completions", "/messages", "/audio/transcriptions"]) {
      if (parsed.pathname.includes(suffix)) {
        parsed.pathname = parsed.pathname.replace(suffix, "/models");
        parsed.search = "";
        return parsed.toString();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractModelCodes(
  providerId: string | undefined,
  json: any
): string[] {
  if (providerId === "ollama" && Array.isArray(json?.models)) {
    return json.models
      .map((model: any) => String(model?.name || "").trim())
      .filter(Boolean);
  }

  const list = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
    ? json.models
    : [];

  return list
    .filter((model: any) => model?.active !== false)
    .map((model: any) => String(model?.id || model?.name || "").trim())
    .filter(Boolean);
}

export function filterModelsByKind(models: string[], kind: ModelKind) {
  const filtered =
    kind === "stt"
      ? models.filter((model) => STT_MODEL_PATTERN.test(model))
      : models.filter((model) => !NON_CHAT_MODEL_PATTERN.test(model));
  return Array.from(new Set(filtered)).sort((a, b) => a.localeCompare(b));
}

/**
 * Lists the models the configured key can use. Returns null when the provider
 * has no known model-list endpoint.
 */
export async function fetchAvailableModels({
  providerId,
  url,
  headers,
  variables,
  kind,
  force = false,
}: {
  providerId: string | undefined;
  url: string | undefined;
  headers: Record<string, string> | undefined;
  variables: Record<string, string>;
  kind: ModelKind;
  force?: boolean;
}): Promise<string[] | null> {
  const endpoint = buildModelListEndpoint(providerId, url);
  if (!endpoint) return null;

  const replacementVariables = Object.fromEntries(
    Object.entries(variables || {}).map(([key, value]) => [
      key.toUpperCase(),
      value,
    ])
  );
  const resolvedHeaders: Record<string, string> = deepVariableReplacer(
    headers || {},
    replacementVariables
  );
  for (const key of Object.keys(resolvedHeaders)) {
    if (key.toLowerCase() === "content-type") delete resolvedHeaders[key];
  }

  const cacheKey = `${kind}|${endpoint}|${JSON.stringify(resolvedHeaders)}`;
  if (!force && modelListCache.has(cacheKey)) {
    return modelListCache.get(cacheKey)!;
  }

  const response = await tauriFetch(endpoint, {
    method: "GET",
    headers: resolvedHeaders,
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("API key was rejected by the provider");
  }
  if (!response.ok) {
    throw new Error(`Model list request failed (HTTP ${response.status})`);
  }

  const models = filterModelsByKind(
    extractModelCodes(providerId, await response.json()),
    kind
  );
  modelListCache.set(cacheKey, models);
  return models;
}
