import {
  Button,
  Header,
  Input,
  Label,
  Selection,
  Switch,
  TextInput,
} from "@/components";
import {
  deleteProviderApiKeyProfile,
  getProviderApiKeyProfiles,
  ProviderApiKeyProfile,
  ProviderModelProfile,
  saveProviderApiKeyProfile,
  saveProviderApiKeyProfiles,
} from "@/lib/storage/provider-api-keys";
import { getModelSuggestions, ModelSuggestion } from "@/config";
import { fetchAvailableModels } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { UseSettingsReturn } from "@/types";
import anthropicLogo from "@lobehub/icons-static-svg/icons/anthropic.svg?url";
import cohereLogo from "@lobehub/icons-static-svg/icons/cohere-color.svg?url";
import geminiLogo from "@lobehub/icons-static-svg/icons/gemini-color.svg?url";
import grokLogo from "@lobehub/icons-static-svg/icons/grok.svg?url";
import groqLogo from "@lobehub/icons-static-svg/icons/groq.svg?url";
import mistralLogo from "@lobehub/icons-static-svg/icons/mistral-color.svg?url";
import nvidiaLogo from "@lobehub/icons-static-svg/icons/nvidia-color.svg?url";
import ollamaLogo from "@lobehub/icons-static-svg/icons/ollama.svg?url";
import openAiLogo from "@lobehub/icons-static-svg/icons/openai.svg?url";
import openRouterLogo from "@lobehub/icons-static-svg/icons/openrouter.svg?url";
import perplexityLogo from "@lobehub/icons-static-svg/icons/perplexity-color.svg?url";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  RadioIcon,
  RefreshCwIcon,
  SaveIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProviderVisual = {
  label: string;
  mark: string;
  logoSrc?: string;
  logoClassName?: string;
  accent: string;
  glow: string;
  recommended?: boolean;
};

const PROVIDER_VISUALS: Record<string, ProviderVisual> = {
  openai: {
    label: "OpenAI Compatible",
    mark: "AI",
    logoSrc: openAiLogo,
    accent: "from-sky-400 via-indigo-400 to-violet-500",
    glow: "shadow-cyan-400/30",
    recommended: true,
  },
  gemini: {
    label: "Gemini",
    mark: "G",
    logoSrc: geminiLogo,
    accent: "from-blue-300 via-cyan-300 to-violet-400",
    glow: "shadow-blue-400/30",
  },
  claude: {
    label: "Anthropic",
    mark: "A",
    logoSrc: anthropicLogo,
    logoClassName: "scale-110",
    accent: "from-slate-200 via-cyan-300 to-violet-400",
    glow: "shadow-violet-400/25",
  },
  groq: {
    label: "Groq",
    mark: "g",
    logoSrc: groqLogo,
    accent: "from-cyan-300 via-blue-400 to-violet-500",
    glow: "shadow-cyan-400/30",
  },
  "nvidia-nim": {
    label: "NVIDIA NIM",
    mark: "N",
    logoSrc: nvidiaLogo,
    logoClassName: "scale-125",
    accent: "from-lime-300 via-green-400 to-emerald-500",
    glow: "shadow-lime-400/30",
  },
  ollama: {
    label: "Ollama",
    mark: "O",
    logoSrc: ollamaLogo,
    accent: "from-zinc-200 via-slate-300 to-cyan-300",
    glow: "shadow-cyan-200/25",
  },
  openrouter: {
    label: "OpenRouter",
    mark: "OR",
    logoSrc: openRouterLogo,
    accent: "from-fuchsia-300 via-violet-400 to-blue-400",
    glow: "shadow-violet-400/30",
  },
  mistral: {
    label: "Mistral",
    mark: "M",
    logoSrc: mistralLogo,
    accent: "from-sky-300 via-indigo-400 to-violet-500",
    glow: "shadow-blue-400/30",
  },
  cohere: {
    label: "Cohere",
    mark: "C",
    logoSrc: cohereLogo,
    accent: "from-emerald-300 via-teal-400 to-sky-400",
    glow: "shadow-emerald-400/30",
  },
  perplexity: {
    label: "Perplexity",
    mark: "P",
    logoSrc: perplexityLogo,
    accent: "from-cyan-300 via-teal-300 to-blue-500",
    glow: "shadow-cyan-400/30",
  },
  grok: {
    label: "xAI Grok",
    mark: "x",
    logoSrc: grokLogo,
    accent: "from-slate-100 via-zinc-300 to-violet-300",
    glow: "shadow-violet-300/25",
  },
};

const createModelId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `model-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function createModelProfile(
  model: string,
  source: ProviderModelProfile["source"],
  label?: string
): ProviderModelProfile {
  const now = new Date().toISOString();
  const code = model.trim();
  return {
    id: createModelId(),
    label: label?.trim() || code,
    model: code,
    enabled: true,
    source,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeModelProfiles(
  currentModels: ProviderModelProfile[],
  incomingModels: ProviderModelProfile[]
) {
  const byCode = new Map<string, ProviderModelProfile>();
  for (const model of currentModels) {
    const code = model.model.trim();
    if (!code) continue;
    byCode.set(code.toLowerCase(), { ...model, model: code });
  }
  for (const model of incomingModels) {
    const code = model.model.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    const existing = byCode.get(key);
    byCode.set(key, {
      ...(existing || model),
      label: existing?.label || model.label || code,
      model: code,
      enabled: true,
      source: existing?.source || model.source,
      updatedAt: new Date().toISOString(),
    });
  }
  return Array.from(byCode.values());
}

function getEnabledModel(profile?: ProviderApiKeyProfile) {
  return profile?.models.find((model) => model.enabled !== false)?.model || "";
}

function reorderList<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function promoteModelToPrimary(
  models: ProviderModelProfile[],
  modelCode: string
) {
  const index = models.findIndex(
    (model) => model.model.toLowerCase() === modelCode.toLowerCase()
  );
  if (index < 0) return models;

  const next = [...models];
  const [model] = next.splice(index, 1);
  return [
    {
      ...model,
      enabled: true,
      updatedAt: new Date().toISOString(),
    },
    ...next,
  ];
}

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  variables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyProfiles, setApiKeyProfiles] = useState<
    ProviderApiKeyProfile[]
  >([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState("");
  const [apiKeyProfileName, setApiKeyProfileName] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const selectedProvider = allAiProviders?.find(
    (p) => p?.id === selectedAIProvider?.provider
  );
  const selectedProviderName =
    selectedProvider?.name || selectedAIProvider?.provider || "AI provider";
  const selectedProviderVisual = getProviderVisual(selectedProvider);
  const apiKeyVar = findVariable(variables, "api_key");
  const modelVar = findVariable(variables, "model");
  const extraVariables = variables.filter(
    (variable) =>
      variable.key !== apiKeyVar?.key && variable.key !== modelVar?.key
  );
  const apiKeyValue = getVariableValue(selectedAIProvider, apiKeyVar?.key);
  const modelValue = getVariableValue(selectedAIProvider, modelVar?.key);
  const selectedApiKeyProfile = apiKeyProfiles.find(
    (profile) => profile.id === selectedApiKeyId
  );
  const modelProfiles = selectedApiKeyProfile?.models || [];
  const primaryModel = modelProfiles.find((model) => model.enabled !== false);
  const staticSuggestedModels = useMemo(() => {
    const defaults = getModelSuggestions(selectedAIProvider?.provider);
    const defaultModel = selectedProvider?.defaultModel?.trim();
    if (
      defaultModel &&
      !defaults.some(
        (suggestion) =>
          suggestion.model.toLowerCase() === defaultModel.toLowerCase()
      )
    ) {
      return [
        {
          label: defaultModel,
          model: defaultModel,
          description: "Provider default",
        },
        ...defaults,
      ];
    }
    return defaults;
  }, [selectedAIProvider?.provider, selectedProvider?.defaultModel]);
  const suggestedModels: ModelSuggestion[] = useMemo(
    () =>
      availableModels.length
        ? availableModels.map((model) => ({
            label: model,
            model,
            description: "Available on this key",
          }))
        : staticSuggestedModels,
    [availableModels, staticSuggestedModels]
  );
  const filteredSuggestedModels = useMemo(() => {
    const search = modelSearch.trim().toLowerCase();
    if (!search) return suggestedModels;
    return suggestedModels.filter(
      (suggestion) =>
        suggestion.model.toLowerCase().includes(search) ||
        suggestion.label.toLowerCase().includes(search) ||
        suggestion.description?.toLowerCase().includes(search)
    );
  }, [modelSearch, suggestedModels]);
  const hasRequiredConfig =
    (!apiKeyVar || Boolean(apiKeyValue.trim())) &&
    (!modelVar || Boolean(modelValue.trim()));
  const endpoint = localSelectedProvider?.url || "Endpoint unavailable";

  const providerOptions = useMemo(
    () =>
      allAiProviders?.map((provider) => {
        const json = curl2Json(provider?.curl);
        return {
          label: provider?.isCustom
            ? json?.url || "Custom Provider"
            : getProviderVisual(provider).label,
          value: provider?.id || "Custom Provider",
          isCustom: provider?.isCustom,
        };
      }) || [],
    [allAiProviders]
  );

  useEffect(() => {
    if (selectedAIProvider?.provider) {
      const provider = allAiProviders?.find(
        (p) => p?.id === selectedAIProvider?.provider
      );
      if (provider) {
        const json = curl2Json(provider?.curl);
        setLocalSelectedProvider(json as ResultJSON);
      }
    }
  }, [allAiProviders, selectedAIProvider?.provider]);

  useEffect(() => {
    setModelDraft("");
    setModelSearch("");
  }, [selectedAIProvider?.provider, selectedApiKeyId]);

  useEffect(() => {
    setAvailableModels([]);
  }, [selectedAIProvider?.provider]);

  const getNextApiKeyProfileName = useCallback(
    (profiles = apiKeyProfiles) =>
      `${selectedProviderVisual.label} key ${profiles.length + 1}`,
    [apiKeyProfiles, selectedProviderVisual.label]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadApiKeyProfiles() {
      if (!apiKeyVar || !selectedAIProvider?.provider) {
        setApiKeyProfiles([]);
        setSelectedApiKeyId("");
        setApiKeyProfileName("");
        return;
      }

      const profiles = await getProviderApiKeyProfiles(
        "ai",
        selectedAIProvider.provider
      );
      if (!isMounted) return;

      const fallbackModel =
        modelValue.trim() || selectedProvider?.defaultModel?.trim() || "";
      const migratedProfiles =
        fallbackModel && modelVar
          ? profiles.map((profile) =>
              profile.models.length
                ? profile
                : {
                    ...profile,
                    models: [
                      createModelProfile(fallbackModel, "custom", fallbackModel),
                    ],
                    updatedAt: new Date().toISOString(),
                  }
            )
          : profiles;
      if (migratedProfiles.some((profile, index) => profile !== profiles[index])) {
        await saveProviderApiKeyProfiles(
          "ai",
          selectedAIProvider.provider,
          migratedProfiles
        );
      }

      const matchingProfile = migratedProfiles.find(
        (profile) => profile.value === apiKeyValue
      );
      setApiKeyProfiles(migratedProfiles);
      setSelectedApiKeyId(matchingProfile?.id || "");
      setApiKeyProfileName(
        matchingProfile?.name || getNextApiKeyProfileName(migratedProfiles)
      );
    }

    void loadApiKeyProfiles();

    return () => {
      isMounted = false;
    };
  }, [
    apiKeyVar?.key,
    apiKeyValue,
    getNextApiKeyProfileName,
    modelValue,
    modelVar,
    selectedProvider?.defaultModel,
    selectedAIProvider?.provider,
  ]);

  const setSelectedProvider = (provider: string) => {
    const nextProvider = allAiProviders?.find((p) => p?.id === provider);
    const defaultModel = nextProvider?.defaultModel?.trim();
    onSetSelectedAIProvider({
      provider,
      variables: defaultModel ? { model: defaultModel } : {},
    });
    setShowApiKey(false);
  };

  const setVariableValues = (updates: Record<string, string>) => {
    if (!selectedAIProvider) return;

    onSetSelectedAIProvider({
      ...selectedAIProvider,
      variables: {
        ...selectedAIProvider.variables,
        ...updates,
      },
    });
  };

  const setVariableValue = (key: string | undefined, value: string) => {
    if (!key) return;
    setVariableValues({ [key]: value });
  };

  const persistApiKeyProfile = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!apiKeyVar || !selectedAIProvider?.provider || !apiKeyValue.trim()) {
        return undefined;
      }

      const existingProfile =
        apiKeyProfiles.find((profile) => profile.id === selectedApiKeyId) ||
        apiKeyProfiles.find((profile) => profile.value === apiKeyValue.trim());
      const currentModelProfile =
        modelValue.trim() && modelVar
          ? createModelProfile(modelValue.trim(), "custom")
          : null;
      const models = currentModelProfile
        ? mergeModelProfiles(existingProfile?.models || [], [
            currentModelProfile,
          ])
        : existingProfile?.models || [];

      const profile = await saveProviderApiKeyProfile(
        "ai",
        selectedAIProvider.provider,
        {
          id: selectedApiKeyId || existingProfile?.id || undefined,
          name: apiKeyProfileName || getNextApiKeyProfileName(),
          value: apiKeyValue.trim(),
          models,
        }
      );

      setApiKeyProfiles((profiles) => {
        const existingIndex = profiles.findIndex(
          (item) => item.id === profile.id
        );
        if (existingIndex === -1) {
          return [...profiles, profile];
        }
        const next = [...profiles];
        next[existingIndex] = profile;
        return next;
      });
      setSelectedApiKeyId(profile.id);
      setApiKeyProfileName(profile.name);
      setApiKeyStatus(silent ? "Auto-saved" : "Saved");
      window.setTimeout(() => setApiKeyStatus(""), 1800);
      return profile;
    },
    [
      apiKeyProfiles,
      apiKeyProfileName,
      apiKeyValue,
      apiKeyVar?.key,
      getNextApiKeyProfileName,
      modelValue,
      modelVar,
      selectedAIProvider?.provider,
      selectedApiKeyId,
    ]
  );

  useEffect(() => {
    if (!apiKeyVar || !selectedAIProvider?.provider || !apiKeyValue.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistApiKeyProfile({ silent: true });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    apiKeyValue,
    apiKeyProfileName,
    apiKeyVar?.key,
    persistApiKeyProfile,
    selectedAIProvider?.provider,
  ]);

  const handleApiKeyProfileSelect = (profileId: string) => {
    const profile = apiKeyProfiles.find((item) => item.id === profileId);
    if (!profile || !apiKeyVar) return;

    setSelectedApiKeyId(profile.id);
    setApiKeyProfileName(profile.name);
    setVariableValues({
      [apiKeyVar.key]: profile.value,
      ...(modelVar
        ? {
            [modelVar.key]:
              getEnabledModel(profile) ||
              modelValue ||
              selectedProvider?.defaultModel ||
              "",
          }
        : {}),
    });
    setApiKeyStatus("Selected");
    window.setTimeout(() => setApiKeyStatus(""), 1600);
  };

  const handleCreateNewApiKeyProfile = () => {
    setSelectedApiKeyId("");
    setApiKeyProfileName(getNextApiKeyProfileName());
    if (apiKeyVar) {
      setVariableValue(apiKeyVar.key, "");
    }
    setShowApiKey(false);
    setApiKeyStatus("New key");
    window.setTimeout(() => setApiKeyStatus(""), 1600);
  };

  const handleDeleteSelectedApiKey = async () => {
    if (!apiKeyVar || !selectedAIProvider?.provider) return;

    if (!selectedApiKeyId) {
      setVariableValue(apiKeyVar.key, "");
      setApiKeyProfileName(getNextApiKeyProfileName());
      return;
    }

    const deletedProfile = apiKeyProfiles.find(
      (profile) => profile.id === selectedApiKeyId
    );
    const nextProfiles = await deleteProviderApiKeyProfile(
      "ai",
      selectedAIProvider.provider,
      selectedApiKeyId
    );
    setApiKeyProfiles(nextProfiles);
    setSelectedApiKeyId("");
    setApiKeyProfileName(getNextApiKeyProfileName(nextProfiles));

    if (deletedProfile?.value === apiKeyValue) {
      setVariableValue(apiKeyVar.key, "");
    }

    setApiKeyStatus("Deleted");
    window.setTimeout(() => setApiKeyStatus(""), 1600);
  };

  const saveProfilesForProvider = useCallback(
    async (profiles: ProviderApiKeyProfile[]) => {
      if (!selectedAIProvider?.provider) return profiles;
      setApiKeyProfiles(profiles);
      return saveProviderApiKeyProfiles(
        "ai",
        selectedAIProvider.provider,
        profiles
      );
    },
    [selectedAIProvider?.provider]
  );

  const ensureActiveApiKeyProfile = useCallback(async () => {
    if (!apiKeyVar || !apiKeyValue.trim()) {
      setModelStatus("Add an API key before saving models");
      window.setTimeout(() => setModelStatus(""), 1800);
      return undefined;
    }

    if (selectedApiKeyProfile) {
      return selectedApiKeyProfile;
    }

    return persistApiKeyProfile({ silent: true });
  }, [apiKeyValue, apiKeyVar, persistApiKeyProfile, selectedApiKeyProfile]);

  const updateSelectedProfileModels = useCallback(
    async (
      updater: (models: ProviderModelProfile[]) => ProviderModelProfile[]
    ) => {
      const profile = await ensureActiveApiKeyProfile();
      if (!profile) return undefined;

      const nextProfile = {
        ...profile,
        models: updater(profile.models || []),
        updatedAt: new Date().toISOString(),
      };
      const existingIndex = apiKeyProfiles.findIndex(
        (item) => item.id === nextProfile.id
      );
      const nextProfiles =
        existingIndex === -1
          ? [...apiKeyProfiles, nextProfile]
          : apiKeyProfiles.map((item) =>
              item.id === nextProfile.id ? nextProfile : item
            );

      await saveProfilesForProvider(nextProfiles);
      setSelectedApiKeyId(nextProfile.id);
      return nextProfile;
    },
    [apiKeyProfiles, ensureActiveApiKeyProfile, saveProfilesForProvider]
  );

  const handleAddModel = useCallback(
    async (
      modelCode: string,
      source: ProviderModelProfile["source"] = "custom",
      suggestion?: Pick<ModelSuggestion, "label">
    ) => {
      const code = modelCode.trim();
      if (!code || !modelVar) return;

      setVariableValue(modelVar.key, code);
      const profile = await updateSelectedProfileModels((models) => {
        const merged = mergeModelProfiles(models, [
            createModelProfile(code, source, suggestion?.label),
        ]);
        return promoteModelToPrimary(merged, code);
      });
      if (profile) {
        setModelDraft("");
        setModelStatus("Model saved");
        window.setTimeout(() => setModelStatus(""), 1800);
      }
    },
    [modelVar, updateSelectedProfileModels]
  );

  const handleAddPopularDefaults = useCallback(async () => {
    if (!modelVar || !staticSuggestedModels.length) return;
    const profile = await updateSelectedProfileModels((models) =>
      mergeModelProfiles(
        models,
        staticSuggestedModels.map((suggestion) =>
          createModelProfile(suggestion.model, "suggested", suggestion.label)
        )
      )
    );
    if (profile) {
      const firstModel = getEnabledModel(profile);
      if (firstModel) {
        setVariableValue(modelVar.key, firstModel);
      }
      setModelStatus("Popular models added");
      window.setTimeout(() => setModelStatus(""), 1800);
    }
  }, [modelVar, staticSuggestedModels, updateSelectedProfileModels]);

  const discoverModels = useCallback(
    async ({ force = false, silent = false } = {}) => {
      if (!localSelectedProvider?.url) return;
      if (apiKeyVar && !apiKeyValue.trim()) return;

      setIsRefreshingModels(true);
      try {
        const models = await fetchAvailableModels({
          providerId: selectedAIProvider?.provider,
          url: localSelectedProvider.url,
          headers: localSelectedProvider.header as Record<string, string>,
          variables: selectedAIProvider.variables || {},
          kind: "chat",
          force,
        });
        if (models === null) {
          if (!silent) {
            setModelStatus("Model list is not available for this provider");
            window.setTimeout(() => setModelStatus(""), 2200);
          }
          return;
        }
        setAvailableModels(models);
        setModelStatus(
          models.length
            ? `${models.length} models available`
            : "No chat models returned"
        );
        window.setTimeout(() => setModelStatus(""), 2200);
      } catch (error) {
        setAvailableModels([]);
        setModelStatus(
          error instanceof Error ? error.message : "Model refresh failed"
        );
        window.setTimeout(() => setModelStatus(""), 3200);
      } finally {
        setIsRefreshingModels(false);
      }
    },
    [
      apiKeyValue,
      apiKeyVar,
      localSelectedProvider?.header,
      localSelectedProvider?.url,
      selectedAIProvider?.provider,
      selectedAIProvider.variables,
    ]
  );

  const handleRefreshModels = useCallback(
    () => discoverModels({ force: true }),
    [discoverModels]
  );

  useEffect(() => {
    if (apiKeyVar && !apiKeyValue.trim()) return;
    const timeout = window.setTimeout(
      () => void discoverModels({ silent: true }),
      1000
    );
    return () => window.clearTimeout(timeout);
    // Re-run only when the key or provider changes, not on every variable edit
  }, [apiKeyValue, selectedAIProvider?.provider, localSelectedProvider?.url]);

  const handleMoveApiKeyProfile = useCallback(
    async (profileId: string, direction: -1 | 1) => {
      const index = apiKeyProfiles.findIndex((profile) => profile.id === profileId);
      const nextProfiles = reorderList(apiKeyProfiles, index, direction);
      await saveProfilesForProvider(nextProfiles);
    },
    [apiKeyProfiles, saveProfilesForProvider]
  );

  const handleMoveModel = useCallback(
    async (modelId: string, direction: -1 | 1) => {
      const profile = await updateSelectedProfileModels((models) => {
        const index = models.findIndex((model) => model.id === modelId);
        return reorderList(models, index, direction);
      });
      const firstModel = getEnabledModel(profile);
      if (firstModel && modelVar) {
        setVariableValue(modelVar.key, firstModel);
      }
    },
    [modelVar, updateSelectedProfileModels]
  );

  const handleToggleModel = useCallback(
    async (modelId: string) => {
      const profile = await updateSelectedProfileModels((models) =>
        models.map((model) =>
          model.id === modelId
            ? {
                ...model,
                enabled: !model.enabled,
                updatedAt: new Date().toISOString(),
              }
            : model
        )
      );
      const firstModel = getEnabledModel(profile);
      if (firstModel && modelVar) {
        setVariableValue(modelVar.key, firstModel);
      }
    },
    [modelVar, updateSelectedProfileModels]
  );

  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      const profile = await updateSelectedProfileModels((models) =>
        models.filter((model) => model.id !== modelId)
      );
      const firstModel = getEnabledModel(profile);
      if (modelVar) {
        setVariableValue(modelVar.key, firstModel);
      }
    },
    [modelVar, updateSelectedProfileModels]
  );

  const handleSelectModel = useCallback(
    async (model: ProviderModelProfile) => {
      if (!modelVar) return;
      setVariableValue(modelVar.key, model.model);
      const profile = await updateSelectedProfileModels((models) =>
        promoteModelToPrimary(models, model.model)
      );
      if (profile) {
        setModelStatus("Primary model updated");
        window.setTimeout(() => setModelStatus(""), 1800);
      }
    },
    [modelVar, updateSelectedProfileModels]
  );

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(6,10,20,0.92),rgba(12,16,34,0.76)_48%,rgba(11,8,27,0.86))] p-5 shadow-[0_0_0_1px_rgba(125,211,252,0.12),0_0_52px_rgba(56,189,248,0.12),0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-cyan-500/14 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-8 size-96 rounded-full bg-violet-500/14 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-12 h-28 w-2/3 -translate-x-1/2 rounded-full bg-blue-500/8 blur-3xl" />

      <div className="relative space-y-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <Header
            title="Providers"
            description="Connect and manage the AI models you want to use with Ai.Intvra."
            titleClassName="text-2xl"
            descriptionClassName="text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium",
                hasRequiredConfig
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                  : "border-violet-300/20 bg-violet-300/10 text-violet-100"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  hasRequiredConfig ? "bg-emerald-400" : "bg-violet-300"
                )}
              />
              {hasRequiredConfig ? "Configured" : "Needs setup"}
            </span>
            <span
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-foreground"
              title="Run a prompt from the overlay to test this provider."
            >
              <RadioIcon className="size-4" />
              Test from overlay
            </span>
          </div>
        </div>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">
              Active Provider
            </Label>
            <Selection
              selected={selectedAIProvider?.provider}
              options={providerOptions}
              placeholder="Choose your AI provider"
              onChange={setSelectedProvider}
            />
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-cyan-200/15 bg-white/[0.055] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
            <ProviderLogo visual={selectedProviderVisual} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {selectedProviderVisual.label}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {selectedProvider?.streaming ? "Streaming enabled" : "Standard response"}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">
            Choose a Provider
          </Label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {allAiProviders?.map((provider) => {
              const visual = getProviderVisual(provider);
              const isSelected = provider?.id === selectedAIProvider?.provider;

              return (
                <button
                  key={provider?.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    provider?.id && provider?.id !== selectedAIProvider.provider
                      ? setSelectedProvider(provider.id)
                      : undefined
                  }
                  className={cn(
                    "group relative min-h-[142px] overflow-hidden rounded-2xl border bg-white/[0.045] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-all duration-300",
                    "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_0%,rgba(125,211,252,0.18),transparent_42%)] before:opacity-0 before:transition-opacity hover:before:opacity-100",
                    "hover:-translate-y-0.5 hover:border-cyan-300/55 hover:bg-white/[0.075] hover:shadow-[0_0_42px_rgba(34,211,238,0.14),0_18px_50px_rgba(0,0,0,0.22)]",
                    isSelected
                      ? "border-cyan-300/75 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_32px_rgba(56,189,248,0.20),0_18px_60px_rgba(99,102,241,0.22)]"
                      : "border-white/10"
                  )}
                >
                  <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div
                    className={cn(
                      "absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-60 transition-opacity",
                      visual.accent,
                      isSelected ? "opacity-100" : "group-hover:opacity-90"
                    )}
                  />
                  {isSelected ? (
                    <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-violet-500 text-white shadow-[0_0_18px_rgba(139,92,246,0.5)]">
                      <CheckIcon className="size-3.5" />
                    </span>
                  ) : null}

                  <ProviderLogo visual={visual} />

                  <div className="space-y-1">
                    <p className="min-h-[36px] text-sm font-semibold leading-tight text-foreground">
                      {visual.label}
                    </p>
                    {visual.recommended ? (
                      <span className="inline-flex rounded-md border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-medium text-violet-200">
                        Recommended
                      </span>
                    ) : provider?.isCustom ? (
                      <span className="inline-flex rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100">
                        Custom
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        Built-in
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-200/15 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Failover Order
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ai.Intvra tries every enabled model for this key before
                    switching to the next API key.
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                  Model first, key second
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                API keys are only used after the selected key's model list is
                exhausted.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              {apiKeyVar ? (
                <div className="space-y-3 rounded-2xl border border-cyan-200/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm font-medium text-foreground">
                        API Key Priority
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Numbered keys are tried top to bottom.
                      </p>
                    </div>
                    {apiKeyStatus ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-medium text-cyan-100">
                        {apiKeyStatus}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Key tag
                      </Label>
                      <Input
                        value={apiKeyProfileName}
                        onChange={(event) =>
                          setApiKeyProfileName(event.target.value)
                        }
                        placeholder="Gemini backup 1"
                        className="h-10 rounded-xl border-cyan-200/15 bg-black/25"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        API key
                      </Label>
                      <div className="relative">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder="Paste provider key"
                          value={apiKeyValue}
                          onChange={(event) =>
                            setVariableValue(apiKeyVar.key, event.target.value)
                          }
                          className="h-10 rounded-xl border-cyan-200/15 bg-black/25 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((value) => !value)}
                          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                          title={showApiKey ? "Hide API key" : "Show API key"}
                        >
                          {showApiKey ? (
                            <EyeOffIcon className="size-4" />
                          ) : (
                            <EyeIcon className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void persistApiKeyProfile()}
                      variant="outline"
                      disabled={!apiKeyValue.trim()}
                      className="h-9"
                      title="Save API key profile"
                    >
                      <SaveIcon className="mr-2 size-4" />
                      Save key
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCreateNewApiKeyProfile}
                      variant="outline"
                      className="h-9"
                      title="Create a new saved API key"
                    >
                      <PlusIcon className="mr-2 size-4" />
                      New key
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleDeleteSelectedApiKey()}
                      variant={
                        apiKeyValue || selectedApiKeyId
                          ? "destructive"
                          : "outline"
                      }
                      disabled={!apiKeyValue && !selectedApiKeyId}
                      className="h-9"
                      title={
                        selectedApiKeyId
                          ? "Delete saved API key"
                          : "Clear current API key"
                      }
                    >
                      <TrashIcon className="mr-2 size-4" />
                      {selectedApiKeyId ? "Delete" : "Clear"}
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    {apiKeyProfiles.length ? (
                      apiKeyProfiles.map((profile, index) => (
                        <div
                          key={profile.id}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-2 py-2 text-xs transition",
                            profile.id === selectedApiKeyId
                              ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
                              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-cyan-300/25 hover:bg-white/[0.055]"
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => handleApiKeyProfileSelect(profile.id)}
                            title={profile.name}
                          >
                            <span className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/25 text-[11px]">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">
                                {profile.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {profile.models.filter((model) => model.enabled !== false).length} enabled models
                              </span>
                            </span>
                            {profile.id === selectedApiKeyId ? (
                              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                                Active
                              </span>
                            ) : null}
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            disabled={index === 0}
                            onClick={() =>
                              void handleMoveApiKeyProfile(profile.id, -1)
                            }
                            title="Move key up"
                          >
                            <ArrowUpIcon className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            disabled={index === apiKeyProfiles.length - 1}
                            onClick={() =>
                              void handleMoveApiKeyProfile(profile.id, 1)
                            }
                            title="Move key down"
                          >
                            <ArrowDownIcon className="size-3.5" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">
                        Save an API key to start building the failover order.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {modelVar ? (
                <div className="space-y-3 rounded-2xl border border-cyan-200/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm font-medium text-foreground">
                        Models for Selected Key
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        First enabled model is primary. Click a model to make it
                        primary.
                      </p>
                    </div>
                    {modelStatus ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-medium text-cyan-100">
                        {modelStatus}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    {modelProfiles.length ? (
                      modelProfiles.map((model, index) => {
                        const isPrimary = primaryModel?.id === model.id;
                        const isActive = model.model === modelValue;
                        return (
                          <div
                            key={model.id}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-2 py-2 text-xs transition",
                              isPrimary
                                ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
                                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-cyan-300/25 hover:bg-white/[0.055]",
                              model.enabled === false && "opacity-45"
                            )}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() => void handleSelectModel(model)}
                              title="Set as primary model"
                            >
                              <span className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/25 text-[11px]">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-foreground">
                                  {model.label || model.model}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {model.model}
                                </span>
                              </span>
                              {isPrimary ? (
                                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100">
                                  Primary
                                </span>
                              ) : isActive ? (
                                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                                  Active
                                </span>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                model.enabled
                                  ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                                  : "border-white/10 bg-white/[0.03] text-muted-foreground"
                              )}
                              onClick={() => void handleToggleModel(model.id)}
                              title={
                                model.enabled ? "Disable model" : "Enable model"
                              }
                            >
                              {model.enabled ? "On" : "Off"}
                            </button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              disabled={index === 0}
                              onClick={() => void handleMoveModel(model.id, -1)}
                              title="Move model up"
                            >
                              <ArrowUpIcon className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              disabled={index === modelProfiles.length - 1}
                              onClick={() => void handleMoveModel(model.id, 1)}
                              title="Move model down"
                            >
                              <ArrowDownIcon className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => void handleDeleteModel(model.id)}
                              title="Remove model"
                            >
                              <XIcon className="size-3.5" />
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-muted-foreground">
                        Add a model to this key. Ai.Intvra will try models here
                        before it tries the next API key.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl border border-cyan-200/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={modelDraft}
                        onChange={(event) => setModelDraft(event.target.value)}
                        placeholder="Add model code, e.g. gemini-3.5-flash"
                        className="h-10 min-w-[220px] flex-1 rounded-xl border-cyan-200/15 bg-black/25"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        disabled={!modelDraft.trim()}
                        onClick={() => void handleAddModel(modelDraft, "custom")}
                        title="Add this model and make it primary"
                      >
                        <PlusIcon className="mr-2 size-4" />
                        Add model
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        disabled={!staticSuggestedModels.length}
                        onClick={() => void handleAddPopularDefaults()}
                        title="Add all suggested models to this key"
                      >
                        <SparklesIcon className="mr-2 size-4" />
                        Add defaults
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10"
                        disabled={isRefreshingModels}
                        onClick={() => void handleRefreshModels()}
                        title="Refresh available models from provider"
                      >
                        <RefreshCwIcon
                          className={cn(
                            "mr-2 size-4",
                            isRefreshingModels && "animate-spin"
                          )}
                        />
                        Refresh
                      </Button>
                    </div>
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="Filter suggested models"
                        className="h-9 rounded-xl border-cyan-200/15 bg-black/25 pl-9 text-xs"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {availableModels.length
                        ? "Models available on this API key - click one to use it."
                        : "Suggested models - add your key to see what it can use."}
                    </p>
                    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {filteredSuggestedModels.length ? (
                        filteredSuggestedModels.map((suggestion) => (
                          <button
                            key={suggestion.model}
                            type="button"
                            className="rounded-full border border-cyan-200/15 bg-white/[0.045] px-2.5 py-1 text-[11px] text-foreground transition hover:border-cyan-300/45 hover:bg-cyan-300/10"
                            onClick={() =>
                              void handleAddModel(
                                suggestion.model,
                                "suggested",
                                suggestion
                              )
                            }
                            title={suggestion.description || suggestion.model}
                          >
                            {suggestion.label}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No matching suggestions. Type any model code above.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Endpoint
                </Label>
                <Input
                  value={endpoint}
                  readOnly
                  className="h-11 rounded-xl border-cyan-200/15 bg-black/25 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                />
                <p className="text-xs text-muted-foreground">
                  Create a custom provider if you want to edit the base URL.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-cyan-200/15 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div>
                  <Label className="text-sm font-medium text-foreground">
                    Streaming
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable streaming responses for faster visible output.
                  </p>
                </div>
                <Switch checked={Boolean(selectedProvider?.streaming)} disabled />
              </div>
            </div>
          </div>

          {extraVariables.length > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {extraVariables.map((variable) => (
                <TextInput
                  key={variable.key}
                  label={variable.value}
                  placeholder={`Enter ${variable.key.replace(/_/g, " ")}`}
                  value={getVariableValue(selectedAIProvider, variable.key)}
                  onChange={(value) => setVariableValue(variable.key, value)}
                  notes={`Used as {{${variable.value}}} for ${selectedProviderName}.`}
                />
              ))}
            </div>
          ) : null}

          <details className="group mt-4 rounded-xl border border-cyan-200/15 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <summary
              className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-left"
              title="Advanced provider details."
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <SlidersHorizontalIcon className="size-4 text-cyan-200" />
                Advanced Options
                <span className="text-xs font-normal text-muted-foreground">
                  Headers, endpoint, response path, vision and more
                </span>
              </span>
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-white/10 px-3 py-3 text-xs text-muted-foreground md:grid-cols-3">
              <div>
                <p className="font-medium text-foreground">Method</p>
                <p>{localSelectedProvider?.method || "POST"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Response Path</p>
                <p>{selectedProvider?.responseContentPath || "Not set"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Vision</p>
                <p>{selectedProvider?.curl?.includes("{{IMAGE}}") ? "Supported" : "Text only"}</p>
              </div>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
};

function findVariable(
  variables: { key: string; value: string }[],
  key: string
) {
  return variables.find((variable) => variable.key === key);
}

function getVariableValue(
  selectedAIProvider: UseSettingsReturn["selectedAIProvider"],
  key?: string
) {
  if (!key || !selectedAIProvider?.variables) return "";
  return selectedAIProvider.variables[key] || "";
}

function ProviderLogo({
  visual,
  size = "md",
}: {
  visual: ProviderVisual;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "relative mb-3 grid place-items-center overflow-hidden rounded-2xl bg-gradient-to-br text-base font-bold text-black shadow-lg",
        visual.accent,
        visual.glow,
        size === "sm" ? "mb-0 size-10 rounded-xl" : "size-14"
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.65),transparent_34%)]" />
      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_1px_rgba(255,255,255,0.55),inset_0_-12px_22px_rgba(0,0,0,0.18)]" />
      {visual.logoSrc ? (
        <img
          src={visual.logoSrc}
          alt=""
          aria-hidden="true"
          className={cn(
            "relative size-7 object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.25)]",
            size === "sm" && "size-5",
            visual.logoClassName
          )}
        />
      ) : (
        <SparklesIcon
          className={cn("relative size-6", size === "sm" && "size-4")}
        />
      )}
    </div>
  );
}

function getProviderVisual(
  provider?: UseSettingsReturn["allAiProviders"][number]
): ProviderVisual {
  if (!provider?.id) {
    return {
      label: "AI Provider",
      mark: "AI",
      accent: "from-cyan-300 via-blue-400 to-violet-500",
      glow: "shadow-cyan-400/30",
    };
  }

  if (provider.isCustom) {
    return {
      label: provider.name || "Custom",
      mark: "+",
      accent: "from-slate-200 via-cyan-300 to-violet-400",
      glow: "shadow-cyan-300/25",
    };
  }

  return (
    PROVIDER_VISUALS[provider.id] || {
      label: provider.name || provider.id,
      mark: provider.name?.slice(0, 2).toUpperCase() || "AI",
      accent: "from-cyan-300 via-blue-400 to-violet-500",
      glow: "shadow-cyan-400/30",
    }
  );
}
