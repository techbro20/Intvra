import path from "node:path";

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const env = process.env;
const port = int(env.PORT, 8787);
const aiApiKeys = list(env.AI_API_KEYS);

export const config = {
  isProduction: env.NODE_ENV === "production",
  host: env.HOST || "127.0.0.1",
  port,
  publicUrl: (env.PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, ""),
  databasePath: path.resolve(env.DATABASE_PATH || "./data/intvra.db"),
  trustProxy: env.TRUST_PROXY === "1",

  freeCredits: int(env.FREE_CREDITS, 20),
  freeAnswerCost: Math.max(1, int(env.FREE_ANSWER_COST, 2)),
  trialIpLimit: int(env.TRIAL_IP_LIMIT, 3),
  trialIpWindowDays: int(env.TRIAL_IP_WINDOW_DAYS, 30),
  blockedEmailDomains: list(env.BLOCKED_EMAIL_DOMAINS).map((d) => d.toLowerCase()),
  allowedEmailDomains: list(env.ALLOWED_EMAIL_DOMAINS).map((d) => d.toLowerCase()),
  disposableDomainsFile: env.DISPOSABLE_DOMAINS_FILE ? path.resolve(env.DISPOSABLE_DOMAINS_FILE) : "",
  sessionDays: int(env.SESSION_DAYS, 90),
  upgradeUrl: env.UPGRADE_URL || "https://ai.intvra.com/#pricing",
  supportEmail: env.SUPPORT_EMAIL || "support@intvra.com",

  google: {
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
  },

  email: {
    resendApiKey: env.RESEND_API_KEY || "",
    from: env.EMAIL_FROM || "Ai.Intvra <noreply@intvra.com>",
  },

  ai: {
    baseUrl: (env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    apiKeys: aiApiKeys,
    models: list(env.AI_MODELS || "llama-3.3-70b-versatile,openai/gpt-oss-120b,llama-3.1-8b-instant"),
    visionModels: list(env.AI_VISION_MODELS),
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 2048),
  },

  stt: {
    baseUrl: (env.STT_BASE_URL || env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    apiKeys: list(env.STT_API_KEYS).length ? list(env.STT_API_KEYS) : aiApiKeys,
    model: env.STT_MODEL || "whisper-large-v3-turbo",
    dailyLimit: int(env.STT_DAILY_LIMIT, 1500),
    freeDailyLimit: int(env.FREE_STT_DAILY_LIMIT, 300),
  },
};

export function answerCost(user) {
  return user.plan === "free" ? config.freeAnswerCost : 1;
}

export function googleEnabled() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

// Without an email provider, development builds print login codes to the console.
export function emailDevMode() {
  return !config.email.resendApiKey && !config.isProduction;
}
