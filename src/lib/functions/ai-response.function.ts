import {
  buildDynamicMessages,
  deepVariableReplacer,
  extractVariables,
  getByPath,
  getStreamingContent,
} from "./common.function";
import { Message, TYPE_PROVIDER } from "@/types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import curl2Json from "@bany/curl-to-json";
import { shouldUseLocalAPI } from "./local-api";
import { CHUNK_POLL_INTERVAL_MS } from "../chat-constants";
import { getResponseSettings, RESPONSE_LENGTHS, LANGUAGES } from "@/lib";
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from "@/config/constants";
import {
  getProviderApiKeyProfiles,
  ProviderApiKeyProfile,
} from "@/lib/storage/provider-api-keys";

export type AIResponseActivityType =
  | "quota"
  | "cooldown"
  | "switch_model"
  | "try_key"
  | "connected"
  | "exhausted";

export type AIResponseActivity = {
  type: AIResponseActivityType;
  label: string;
  keyName?: string;
  model?: string;
  timestamp: number;
};

export type AIResponseRoute = {
  keyName?: string;
  model?: string;
};

type ProviderModelCooldown = {
  providerId: string;
  keyProfileId: string;
  keyName?: string;
  model: string;
  reason?: string;
  blockedAt: number;
  expiresAt: number;
};

type SelectedAIProvider = {
  provider: string;
  variables: Record<string, string>;
};

type FallbackCandidate = {
  variables: Record<string, string>;
  providerId?: string;
  keyProfileId?: string;
  keyName?: string;
  model?: string;
  apiKeyValue?: string;
  isCurrent: boolean;
};

const QUOTA_ERROR_PATTERNS = [
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
  /quota/i,
  /resource\s+exhausted/i,
  /limit\s+exceeded/i,
  /requests?\s+per\s+minute/i,
  /tokens?\s+per\s+minute/i,
  /insufficient\s+quota/i,
];

const DAILY_QUOTA_PATTERNS = [
  /\bdaily\b/i,
  /\bper\s*day\b/i,
  /\brpd\b/i,
  /requests?\s+per\s+day/i,
  /GenerateRequestsPerDay/i,
];

const SHORT_RATE_LIMIT_PATTERNS = [
  /\brpm\b/i,
  /\btpm\b/i,
  /requests?\s+per\s+minute/i,
  /tokens?\s+per\s+minute/i,
  /per\s*minute/i,
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
];

const SPEND_OR_ROLLING_PATTERNS = [
  /spend/i,
  /rolling/i,
  /10\s*minute/i,
  /ten\s*minute/i,
];

const MINUTE_COOLDOWN_MS = 90 * 1000;
const GENERIC_COOLDOWN_MS = 10 * 60 * 1000;

function isQuotaError(
  status: number,
  statusText: string,
  errorText: string
) {
  const combined = `${statusText} ${errorText}`;
  return status === 429 || QUOTA_ERROR_PATTERNS.some((pattern) => pattern.test(combined));
}

function getHeaderValue(headers: Headers, name: string) {
  return headers.get(name) || headers.get(name.toLowerCase()) || "";
}

function getRetryAfterMs(headers: Headers) {
  const retryAfter = getHeaderValue(headers, "Retry-After").trim();
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return null;
}

function getNextPacificMidnightMs(now = new Date()) {
  const pacificDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const year = Number(pacificDateParts.year);
  const month = Number(pacificDateParts.month);
  const day = Number(pacificDateParts.day);
  const nextPacificDate = Date.UTC(year, month - 1, day + 1, 8, 0, 0);
  return nextPacificDate;
}

function getCooldownDurationMs(response: Response, errorText: string) {
  const retryAfterMs = getRetryAfterMs(response.headers);
  if (retryAfterMs !== null) return retryAfterMs;

  const combined = `${response.statusText} ${errorText}`;
  if (DAILY_QUOTA_PATTERNS.some((pattern) => pattern.test(combined))) {
    return Math.max(0, getNextPacificMidnightMs() - Date.now());
  }
  if (SHORT_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(combined))) {
    return MINUTE_COOLDOWN_MS;
  }
  if (SPEND_OR_ROLLING_PATTERNS.some((pattern) => pattern.test(combined))) {
    return GENERIC_COOLDOWN_MS;
  }
  return GENERIC_COOLDOWN_MS;
}

function normalizeCooldownPart(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function getCooldownKey(args: {
  providerId?: string;
  keyProfileId?: string;
  model?: string;
}) {
  const providerId = normalizeCooldownPart(args.providerId);
  const keyProfileId = normalizeCooldownPart(args.keyProfileId);
  const model = normalizeCooldownPart(args.model);
  if (!providerId || !keyProfileId || !model) return "";
  return `${providerId}::${keyProfileId}::${model}`;
}

function getCandidateCooldown(
  candidate: FallbackCandidate,
  cooldowns: ProviderModelCooldown[]
) {
  const key = getCooldownKey(candidate);
  if (!key) return undefined;
  const now = Date.now();
  return cooldowns.find(
    (cooldown) => getCooldownKey(cooldown) === key && cooldown.expiresAt > now
  );
}

function formatRetryTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getVariableKey(
  variables: { key: string; value: string }[],
  target: "api_key" | "model"
) {
  const exact = variables.find((variable) => variable.key === target);
  if (exact) return exact.key;

  const normalizedTarget = target.replace(/_/g, "");
  return variables.find(
    (variable) => variable.key.replace(/_/g, "").toLowerCase() === normalizedTarget
  )?.key;
}

// Groq rejects reasoning_effort for non-reasoning models, and Qwen 3 only
// accepts "none" or "default".
function adjustGroqReasoningEffort(providerId: string | undefined, body: any) {
  if (providerId !== "groq" || !body || typeof body !== "object") return;
  if (!("reasoning_effort" in body)) return;
  const model = String(body.model || "");
  if (/gpt-oss/i.test(model)) return;
  if (/qwen3/i.test(model)) {
    body.reasoning_effort = "default";
    return;
  }
  delete body.reasoning_effort;
}

function sanitizeModelList(profile: ProviderApiKeyProfile, defaultModel = "") {
  const enabledModels = (profile.models || [])
    .filter((model) => model.enabled !== false && model.model.trim())
    .map((model) => ({
      model: model.model.trim(),
      label: model.label || model.model,
    }));

  if (enabledModels.length) return enabledModels;
  return defaultModel.trim()
    ? [{ model: defaultModel.trim(), label: defaultModel.trim() }]
    : [];
}

function buildFallbackCandidates(args: {
  providerId?: string;
  selectedVariables: Record<string, string>;
  profiles: ProviderApiKeyProfile[];
  apiKeyVarKey?: string;
  modelVarKey?: string;
  defaultModel?: string;
}): FallbackCandidate[] {
  const {
    providerId,
    selectedVariables,
    profiles,
    apiKeyVarKey,
    modelVarKey,
    defaultModel = "",
  } = args;
  const currentApiKey = apiKeyVarKey
    ? selectedVariables[apiKeyVarKey]?.trim()
    : "";
  const currentModel = modelVarKey
    ? selectedVariables[modelVarKey]?.trim() || defaultModel.trim()
    : "";
  const matchingProfile = apiKeyVarKey
    ? profiles.find((profile) => profile.value === currentApiKey)
    : undefined;
  const orderedProfiles = matchingProfile
    ? [
        matchingProfile,
        ...profiles.filter((profile) => profile.id !== matchingProfile.id),
      ]
    : profiles;

  const candidates: FallbackCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: FallbackCandidate) => {
    const apiKeyValue = apiKeyVarKey
      ? candidate.variables[apiKeyVarKey]?.trim()
      : "";
    const modelValue = modelVarKey
      ? candidate.variables[modelVarKey]?.trim()
      : "";
    const key = `${apiKeyValue || "no-key"}::${modelValue || "no-model"}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  if (!matchingProfile) {
    addCandidate({
      variables: {
        ...selectedVariables,
        ...(modelVarKey && currentModel ? { [modelVarKey]: currentModel } : {}),
      },
      providerId,
      keyName: "Current key",
      model: currentModel,
      apiKeyValue: currentApiKey,
      isCurrent: true,
    });
  }

  for (const profile of orderedProfiles) {
    let models = sanitizeModelList(profile, currentModel || defaultModel);
    if (
      profile.id === matchingProfile?.id &&
      currentModel &&
      !models.some(
        (model) => model.model.toLowerCase() === currentModel.toLowerCase()
      )
    ) {
      models.unshift({ model: currentModel, label: currentModel });
    } else if (profile.id === matchingProfile?.id && currentModel) {
      models = [
        ...models.filter(
          (model) => model.model.toLowerCase() === currentModel.toLowerCase()
        ),
        ...models.filter(
          (model) => model.model.toLowerCase() !== currentModel.toLowerCase()
        ),
      ];
    }

    for (const model of models) {
      addCandidate({
        variables: {
          ...selectedVariables,
          ...(apiKeyVarKey ? { [apiKeyVarKey]: profile.value } : {}),
          ...(modelVarKey ? { [modelVarKey]: model.model } : {}),
        },
        providerId,
        keyProfileId: profile.id,
        keyName: profile.name,
        model: model.model,
        apiKeyValue: profile.value,
        isCurrent:
          profile.value === currentApiKey && model.model === currentModel,
      });
    }
  }

  return candidates;
}

function createActivity(
  type: AIResponseActivityType,
  label: string,
  details: Pick<AIResponseActivity, "keyName" | "model"> = {}
): AIResponseActivity {
  return {
    type,
    label,
    timestamp: Date.now(),
    ...details,
  };
}

function buildEnhancedSystemPrompt(baseSystemPrompt?: string): string {
  const responseSettings = getResponseSettings();
  const prompts: string[] = [];

  if (baseSystemPrompt) {
    prompts.push(baseSystemPrompt);
  }

  const lengthOption = RESPONSE_LENGTHS.find(
    (l) => l.id === responseSettings.responseLength
  );
  if (lengthOption?.prompt?.trim()) {
    prompts.push(lengthOption.prompt);
  }

  const languageOption = LANGUAGES.find(
    (l) => l.id === responseSettings.language
  );
  if (languageOption?.prompt?.trim()) {
    prompts.push(languageOption.prompt);
  }

  // Add markdown formatting instructions
  prompts.push(MARKDOWN_FORMATTING_INSTRUCTIONS);

  return prompts.join(" ");
}

// Hosted AI streaming function retained for compatibility. It is disabled in Ai.Intvra.
async function* fetchLocalAIResponse(params: {
  systemPrompt?: string;
  userMessage: string;
  imagesBase64?: string[];
  history?: Message[];
  signal?: AbortSignal;
}): AsyncIterable<string> {
  try {
    const {
      systemPrompt,
      userMessage,
      imagesBase64 = [],
      history = [],
      signal,
    } = params;

    // Check if already aborted before starting
    if (signal?.aborted) {
      return;
    }

    // Convert history to the expected format
    let historyString: string | undefined;
    if (history.length > 0) {
      // Create a copy before reversing to avoid mutating the original array
      const formattedHistory = [...history].reverse().map((msg) => ({
        role: msg.role,
        content: [{ type: "text", text: msg.content }],
      }));
      historyString = JSON.stringify(formattedHistory);
    }

    // Handle images - can be string or array
    let imageBase64: any = undefined;
    if (imagesBase64.length > 0) {
      imageBase64 = imagesBase64.length === 1 ? imagesBase64[0] : imagesBase64;
    }

    // Set up streaming event listener
    let streamComplete = false;
    const streamChunks: string[] = [];

    const unlisten = await listen("chat_stream_chunk", (event) => {
      const chunk = event.payload as string;
      streamChunks.push(chunk);
    });

    const unlistenComplete = await listen("chat_stream_complete", () => {
      streamComplete = true;
    });

    try {
      // Check if aborted before starting invoke
      if (signal?.aborted) {
        unlisten();
        unlistenComplete();
        return;
      }

      // Start the streaming request using the new API response endpoint
      await invoke("chat_stream_response", {
        userMessage,
        systemPrompt,
        imageBase64,
        history: historyString,
      });

      // Yield chunks as they come in
      let lastIndex = 0;
      while (!streamComplete) {
        // Check if aborted during streaming
        if (signal?.aborted) {
          unlisten();
          unlistenComplete();
          return;
        }

        // Wait a bit for chunks to accumulate
        await new Promise((resolve) =>
          setTimeout(resolve, CHUNK_POLL_INTERVAL_MS)
        );

        // Check again after timeout
        if (signal?.aborted) {
          unlisten();
          unlistenComplete();
          return;
        }

        // Yield any new chunks
        for (let i = lastIndex; i < streamChunks.length; i++) {
          yield streamChunks[i];
        }
        lastIndex = streamChunks.length;
      }

      // Final abort check before yielding remaining chunks
      if (signal?.aborted) {
        unlisten();
        unlistenComplete();
        return;
      }

      // Yield any remaining chunks
      for (let i = lastIndex; i < streamChunks.length; i++) {
        yield streamChunks[i];
      }
    } finally {
      unlisten();
      unlistenComplete();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    yield `Ai.Intvra hosted API error: ${errorMessage}`;
  }
}

export async function* fetchAIResponse(params: {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: SelectedAIProvider;
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
  onFallbackActivity?: (activity: AIResponseActivity) => void;
  onResolvedRoute?: (route: AIResponseRoute | null) => void;
  onResolvedSelectedProvider?: (selectedProvider: SelectedAIProvider) => void;
}): AsyncIterable<string> {
  try {
    const {
      provider,
      selectedProvider,
      systemPrompt,
      history = [],
      userMessage,
      imagesBase64 = [],
      signal,
      onFallbackActivity,
      onResolvedRoute,
      onResolvedSelectedProvider,
    } = params;

    // Check if already aborted
    if (signal?.aborted) {
      return;
    }

    const enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);

    // Check if we should use the hosted compatibility path instead.
    const useLocalAPI = await shouldUseLocalAPI();
    if (useLocalAPI) {
      yield* fetchLocalAIResponse({
        systemPrompt: enhancedSystemPrompt,
        userMessage,
        imagesBase64,
        history,
        signal,
      });
      return;
    }
    if (!provider) {
      throw new Error(`Provider not provided`);
    }
    if (!selectedProvider) {
      throw new Error(`Selected provider not provided`);
    }

    let curlJson;
    try {
      curlJson = curl2Json(provider.curl);
    } catch (error) {
      throw new Error(
        `Failed to parse curl: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const selectedVariables = {
      ...(selectedProvider.variables || {}),
    };
    if (
      provider.defaultModel &&
      (!selectedVariables.model || selectedVariables.model.trim() === "")
    ) {
      selectedVariables.model = provider.defaultModel;
    }

    const extractedVariables = extractVariables(provider.curl);
    const apiKeyVarKey = getVariableKey(extractedVariables, "api_key");
    const modelVarKey = getVariableKey(extractedVariables, "model");
    const requiredVars = extractedVariables.filter(
      ({ key }) => key !== "SYSTEM_PROMPT" && key !== "TEXT" && key !== "IMAGE"
    );
    for (const { key } of requiredVars) {
      if (key === apiKeyVarKey || key === modelVarKey) continue;
      if (
        !selectedVariables[key] ||
        selectedVariables[key].trim() === ""
      ) {
        throw new Error(
          `Missing required variable: ${key}. Please configure it in settings.`
        );
      }
    }

    if (!userMessage) {
      throw new Error("User message is required");
    }
    if (imagesBase64.length > 0 && !provider.curl.includes("{{IMAGE}}")) {
      throw new Error(
        `Provider ${provider?.id ?? "unknown"} does not support image input`
      );
    }

    const profiles =
      provider.id && apiKeyVarKey
        ? await getProviderApiKeyProfiles("ai", provider.id).catch(() => [])
        : [];
    const activeCooldowns = provider.id
      ? await invoke<ProviderModelCooldown[]>(
          "provider_model_cooldowns_get"
        ).catch(() => [])
      : [];
    const rawCandidates = buildFallbackCandidates({
      providerId: provider.id,
      selectedVariables,
      profiles,
      apiKeyVarKey,
      modelVarKey,
      defaultModel: provider.defaultModel,
    });
    const configuredCandidates = rawCandidates.filter((candidate) =>
      requiredVars.every(({ key }) => candidate.variables[key]?.trim())
    );
    const cooledConfiguredCandidates = configuredCandidates
      .map((candidate) => ({
        candidate,
        cooldown: getCandidateCooldown(candidate, activeCooldowns),
      }))
      .filter((item) => item.cooldown);
    const candidates = configuredCandidates.filter(
      (candidate) => !getCandidateCooldown(candidate, activeCooldowns)
    );

    for (const { key } of requiredVars) {
      const hasCandidateValue = configuredCandidates.some((candidate) =>
        candidate.variables[key]?.trim()
      );
      if (!hasCandidateValue) {
        throw new Error(
          `Missing required variable: ${key}. Please configure it in settings.`
        );
      }
    }

    if (!candidates.length && cooledConfiguredCandidates.length) {
      const nearestCooldown = cooledConfiguredCandidates
        .map((item) => item.cooldown!)
        .sort((a, b) => a.expiresAt - b.expiresAt)[0];
      onFallbackActivity?.(
        createActivity(
          "exhausted",
          `Fallback exhausted - retry after ${formatRetryTime(
            nearestCooldown.expiresAt
          )}`,
          {
            keyName: nearestCooldown.keyName,
            model: nearestCooldown.model,
          }
        )
      );
      yield `All configured models are cooling down. Try again after ${formatRetryTime(
        nearestCooldown.expiresAt
      )}.`;
      return;
    }

    if (
      candidates.length &&
      configuredCandidates.length &&
      getCandidateCooldown(configuredCandidates[0], activeCooldowns)
    ) {
      onFallbackActivity?.(
        createActivity(
          "switch_model",
          `Switching model: ${candidates[0].model || "next available"}`,
          { keyName: candidates[0].keyName, model: candidates[0].model }
        )
      );
    }

    const buildRequest = (variables: Record<string, string>) => {
      let bodyObj: any = curlJson.data
        ? JSON.parse(JSON.stringify(curlJson.data))
        : {};
      const messagesKey = Object.keys(bodyObj).find((key) =>
        ["messages", "contents", "conversation", "history"].includes(key)
      );

      if (messagesKey && Array.isArray(bodyObj[messagesKey])) {
        const finalMessages = buildDynamicMessages(
          bodyObj[messagesKey],
          history,
          userMessage,
          imagesBase64
        );
        bodyObj[messagesKey] = finalMessages;
      }

      const allVariables = {
        ...Object.fromEntries(
          Object.entries(variables).map(([key, value]) => [
            key.toUpperCase(),
            value,
          ])
        ),
        SYSTEM_PROMPT: enhancedSystemPrompt || "",
      };

      bodyObj = deepVariableReplacer(bodyObj, allVariables);
      adjustGroqReasoningEffort(provider?.id, bodyObj);
      const url = deepVariableReplacer(curlJson.url || "", allVariables);
      const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
      headers["Content-Type"] = "application/json";

      if (provider?.streaming) {
        if (typeof bodyObj === "object" && bodyObj !== null) {
          const streamKey = Object.keys(bodyObj).find(
            (k) => k.toLowerCase() === "stream"
          );
          if (streamKey) {
            bodyObj[streamKey] = true;
          } else {
            bodyObj.stream = true;
          }
        }
      }

      return { bodyObj, headers, url };
    };

    const fetchFunction = tauriFetch;
    let response: Awaited<ReturnType<typeof fetchFunction>> | null = null;
    let activeCandidate: FallbackCandidate | null = null;

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];

      if (signal?.aborted) {
        return;
      }

      onResolvedRoute?.({
        keyName: candidate.keyName,
        model: candidate.model,
      });

      if (index > 0) {
        const previous = candidates[index - 1];
        if (candidate.apiKeyValue !== previous.apiKeyValue) {
          onFallbackActivity?.(
            createActivity(
              "try_key",
              `Trying key: ${candidate.keyName || "saved key"}`,
              { keyName: candidate.keyName, model: candidate.model }
            )
          );
        }
        if (candidate.model && candidate.model !== previous.model) {
          onFallbackActivity?.(
            createActivity(
              "switch_model",
              `Switching model: ${candidate.model}`,
              { keyName: candidate.keyName, model: candidate.model }
            )
          );
        }
      }

      const request = buildRequest(candidate.variables);
      try {
        response = await fetchFunction(request.url, {
          method: curlJson.method || "POST",
          headers: request.headers,
          body:
            curlJson.method === "GET"
              ? undefined
              : JSON.stringify(request.bodyObj),
          signal,
        });
      } catch (fetchError) {
        if (
          signal?.aborted ||
          (fetchError instanceof Error && fetchError.name === "AbortError")
        ) {
          return;
        }
        yield `Network error during API request: ${
          fetchError instanceof Error ? fetchError.message : "Unknown error"
        }`;
        return;
      }

      if (!response) {
        yield "API request failed before a response was available.";
        return;
      }
      const currentResponse = response;

      if (currentResponse.ok) {
        activeCandidate = candidate;
        if (candidate.keyProfileId && candidate.model && candidate.providerId) {
          void invoke("provider_model_cooldown_clear", {
            providerId: candidate.providerId,
            keyProfileId: candidate.keyProfileId,
            model: candidate.model,
          });
        }
        if (!candidate.isCurrent) {
          onFallbackActivity?.(
            createActivity(
              "connected",
              `Connected: ${candidate.keyName || "saved key"}${
                candidate.model ? ` / ${candidate.model}` : ""
              }`,
              { keyName: candidate.keyName, model: candidate.model }
            )
          );
          onResolvedSelectedProvider?.({
            provider: selectedProvider.provider,
            variables: candidate.variables,
          });
        }
        break;
      }

      let errorText = "";
      try {
        errorText = await currentResponse.text();
      } catch {}

      const canFallback =
        index < candidates.length - 1 &&
        isQuotaError(currentResponse.status, currentResponse.statusText, errorText);
      const isQuota = isQuotaError(
        currentResponse.status,
        currentResponse.statusText,
        errorText
      );

      const markCandidateCooldown = async () => {
        if (!candidate.keyProfileId || !candidate.model || !candidate.providerId) {
          return;
        }
        const cooldownMs = getCooldownDurationMs(currentResponse, errorText);
        const expiresAt = Date.now() + Math.max(1000, cooldownMs);
        await invoke("provider_model_cooldown_mark", {
          providerId: candidate.providerId,
          keyProfileId: candidate.keyProfileId,
          keyName: candidate.keyName || "saved key",
          model: candidate.model,
          reason: `${currentResponse.status} ${currentResponse.statusText}`.trim(),
          blockedAt: Date.now(),
          expiresAt,
        });
        onFallbackActivity?.(
          createActivity(
            "cooldown",
            `Cooling down: ${candidate.model}`,
            { keyName: candidate.keyName, model: candidate.model }
          )
        );
      };

      if (canFallback) {
        onFallbackActivity?.(
          createActivity(
            "quota",
            `Quota reached${
              candidate.model ? ` on ${candidate.model}` : ""
            }`,
            { keyName: candidate.keyName, model: candidate.model }
          )
        );
        await markCandidateCooldown();
        continue;
      }

      if (isQuota) {
        onFallbackActivity?.(
          createActivity(
            "quota",
            `Quota reached${
              candidate.model ? ` on ${candidate.model}` : ""
            }`,
            { keyName: candidate.keyName, model: candidate.model }
          )
        );
        await markCandidateCooldown();
        onFallbackActivity?.(
          createActivity("exhausted", "Fallback exhausted", {
            keyName: candidate.keyName,
            model: candidate.model,
          })
        );
      }

      yield `API request failed: ${currentResponse.status} ${currentResponse.statusText}${
        errorText ? ` - ${errorText}` : ""
      }`;
      return;
    }

    if (!response || !activeCandidate) {
      yield "No API key/model fallback candidates are available. Add at least one API key and model in Providers.";
      return;
    }

    if (!provider?.streaming) {
      let json;
      try {
        json = await response.json();
      } catch (parseError) {
        yield `Failed to parse non-streaming response: ${
          parseError instanceof Error ? parseError.message : "Unknown error"
        }`;
        return;
      }
      const content =
        getByPath(json, provider?.responseContentPath || "") || "";
      yield (
        content ||
        "The provider returned a response, but Ai.Intvra could not extract any text. Check the response content path for this provider."
      );
      return;
    }

    if (!response.body) {
      yield "Streaming not supported or response body missing";
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let yieldedContent = false;

    const extractStreamingDelta = (line: string): string | null => {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith("data:")) {
        return null;
      }

      const payload = trimmedLine.substring(5).trim();
      if (!payload || payload === "[DONE]") {
        return null;
      }

      try {
        const parsed = JSON.parse(payload);
        return (
          getStreamingContent(parsed, provider?.responseContentPath || "") ||
          null
        );
      } catch {
        return null;
      }
    };

    while (true) {
      // Check if aborted
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      let readResult;
      try {
        readResult = await reader.read();
      } catch (readError) {
        // Check if aborted
        if (
          signal?.aborted ||
          (readError instanceof Error && readError.name === "AbortError")
        ) {
          return; // Silently return on abort
        }
        yield `Error reading stream: ${
          readError instanceof Error ? readError.message : "Unknown error"
        }`;
        return;
      }
      const { done, value } = readResult;
      if (done) break;

      // Check if aborted before processing
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const delta = extractStreamingDelta(line);
        if (delta) {
          yieldedContent = true;
          yield delta;
        }
      }
    }

    const trailingDelta = extractStreamingDelta(buffer);
    if (trailingDelta) {
      yieldedContent = true;
      yield trailingDelta;
    }

    if (!yieldedContent && !signal?.aborted) {
      yield "The provider returned a streaming response, but Ai.Intvra could not extract any text. Check the response content path or turn off streaming for this provider.";
    }
  } catch (error) {
    throw new Error(
      `Error in fetchAIResponse: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
