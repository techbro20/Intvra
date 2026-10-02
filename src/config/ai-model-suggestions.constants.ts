export type ModelSuggestion = {
  label: string;
  model: string;
  description?: string;
};

export const AI_MODEL_SUGGESTIONS: Record<string, ModelSuggestion[]> = {
  openai: [
    { label: "GPT-5.5", model: "gpt-5.5", description: "Flagship" },
    { label: "GPT-5.4", model: "gpt-5.4", description: "General purpose" },
    { label: "GPT-5.4 Mini", model: "gpt-5.4-mini", description: "Fast" },
    { label: "GPT-4.1 Mini", model: "gpt-4.1-mini", description: "Compatible fallback" },
  ],
  gemini: [
    { label: "Gemini 3.5 Flash", model: "gemini-3.5-flash", description: "Fast multimodal" },
    { label: "Gemini 3.1 Flash Lite", model: "gemini-3.1-flash-lite", description: "Low cost" },
    { label: "Gemini 2.5 Flash", model: "gemini-2.5-flash", description: "Stable fallback" },
    { label: "Gemini 2.5 Pro", model: "gemini-2.5-pro", description: "Reasoning" },
  ],
  claude: [
    { label: "Claude Sonnet 5", model: "claude-sonnet-5", description: "Balanced" },
    { label: "Claude Opus 4.8", model: "claude-opus-4-8", description: "High capability" },
    { label: "Claude Haiku 4.5", model: "claude-haiku-4-5-20251001", description: "Fast" },
    { label: "Claude 3.5 Sonnet Latest", model: "claude-3-5-sonnet-latest", description: "Compatible fallback" },
  ],
  groq: [
    { label: "Llama 3.3 70B", model: "llama-3.3-70b-versatile", description: "Versatile" },
    { label: "Llama 3.1 8B", model: "llama-3.1-8b-instant", description: "Instant" },
    { label: "GPT OSS 120B", model: "openai/gpt-oss-120b", description: "Large OSS" },
    { label: "GPT OSS 20B", model: "openai/gpt-oss-20b", description: "Small OSS" },  ],
  "nvidia-nim": [
    { label: "Kimi K2.6", model: "moonshotai/kimi-k2.6", description: "Thinking" },
    { label: "Kimi K2.5", model: "moonshotai/kimi-k2.5", description: "Fallback" },
    { label: "Nemotron 3 Super", model: "nvidia/nemotron-3-super-120b-a12b", description: "Reasoning" },
    { label: "Llama 4 Maverick", model: "meta/llama-4-maverick-17b-128e-instruct", description: "Multimodal" },
  ],
  mistral: [
    { label: "Mistral Medium 3.5", model: "mistral-medium-3-5", description: "Balanced" },
    { label: "Mistral Large", model: "mistral-large-2512", description: "Large" },
    { label: "Mistral Small", model: "mistral-small-2603", description: "Fast" },
    { label: "Ministral 14B", model: "ministral-14b-2512", description: "Compact" },
  ],
  grok: [
    { label: "Grok 4.3", model: "grok-4.3", description: "General purpose" },
    { label: "Grok Build", model: "grok-build-0.1", description: "Coding" },
    { label: "Grok Code Fast", model: "grok-code-fast-1", description: "Fast coding" },
  ],
  openrouter: [
    { label: "OpenAI GPT-5.4 Mini", model: "openai/gpt-5.4-mini", description: "OpenRouter" },
    { label: "Anthropic Sonnet 5", model: "anthropic/claude-sonnet-5", description: "OpenRouter" },
    { label: "Google Gemini 3.5 Flash", model: "google/gemini-3.5-flash", description: "OpenRouter" },
    { label: "Mistral Medium 3.5", model: "mistralai/mistral-medium-3-5", description: "OpenRouter" },
  ],
  ollama: [
    { label: "Llama 3.2", model: "llama3.2", description: "Local" },
    { label: "Llama 3.1", model: "llama3.1", description: "Local" },
    { label: "Qwen 2.5", model: "qwen2.5", description: "Local" },
    { label: "Gemma 3", model: "gemma3", description: "Local" },
  ],
  cohere: [
    { label: "Command A Plus", model: "command-a-plus-05-2026", description: "General purpose" },
    { label: "Command A", model: "command-a-03-2025", description: "Balanced" },
    { label: "Aya Vision", model: "c4ai-aya-vision-32b", description: "Vision" },
  ],
  perplexity: [
    { label: "Sonar", model: "sonar", description: "Search" },
    { label: "Sonar Pro", model: "sonar-pro", description: "Search pro" },
    { label: "Sonar Deep Research", model: "sonar-deep-research", description: "Research" },
    { label: "Sonar Reasoning Pro", model: "sonar-reasoning-pro", description: "Reasoning" },
  ],
};

export function getModelSuggestions(providerId?: string) {
  if (!providerId) return [];
  return AI_MODEL_SUGGESTIONS[providerId] || [];
}
