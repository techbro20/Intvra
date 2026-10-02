import { Button, Header, Input, Selection, TextInput } from "@/components";
import { STT_MODEL_SUGGESTIONS } from "@/config";
import { fetchAvailableModels } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { KeyIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export const Providers = ({
  allSttProviders,
  selectedSttProvider,
  onSetSelectedSttProvider,
  sttVariables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const selectedProviderConfig = allSttProviders?.find(
    (p) => p?.id === selectedSttProvider?.provider
  );
  const providerLabel = selectedProviderConfig?.isCustom
    ? "Custom Provider"
    : selectedProviderConfig?.name || selectedSttProvider?.provider;

  useEffect(() => {
    if (selectedSttProvider?.provider) {
      const provider = allSttProviders?.find(
        (p) => p?.id === selectedSttProvider?.provider
      );
      if (provider) {
        const json = curl2Json(provider?.curl);
        setLocalSelectedProvider(json as ResultJSON);
      }
    }
  }, [selectedSttProvider?.provider]);

  useEffect(() => {
    setAvailableModels([]);
    setModelStatus("");
  }, [selectedSttProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return sttVariables?.find((v) => v?.key === key);
  };

  const getApiKeyValue = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedSttProvider?.variables) return "";
    return selectedSttProvider?.variables?.[apiKeyVar.key] || "";
  };

  const isApiKeyEmpty = () => {
    return !getApiKeyValue().trim();
  };

  const apiKeyValue = getApiKeyValue();
  const hasModelVariable = Boolean(findKeyAndValue("model"));

  const modelSuggestions = useMemo(
    () =>
      availableModels.length
        ? availableModels
        : STT_MODEL_SUGGESTIONS[selectedSttProvider?.provider || ""] || [],
    [availableModels, selectedSttProvider?.provider]
  );

  const discoverModels = useCallback(
    async (force = false) => {
      if (!hasModelVariable || !localSelectedProvider?.url) return;
      if (findKeyAndValue("api_key") && !apiKeyValue.trim()) return;

      setIsLoadingModels(true);
      try {
        const models = await fetchAvailableModels({
          providerId: selectedSttProvider?.provider,
          url: localSelectedProvider.url,
          headers: localSelectedProvider.header as Record<string, string>,
          variables: selectedSttProvider?.variables || {},
          kind: "stt",
          force,
        });
        if (models === null) {
          if (force) setModelStatus("Model list is not available for this provider");
          return;
        }
        setAvailableModels(models);
        setModelStatus(
          models.length
            ? `${models.length} speech models available on this key`
            : "No speech models returned for this key"
        );
      } catch (error) {
        setAvailableModels([]);
        setModelStatus(
          error instanceof Error ? error.message : "Model refresh failed"
        );
      } finally {
        setIsLoadingModels(false);
      }
    },
    [
      apiKeyValue,
      hasModelVariable,
      localSelectedProvider?.header,
      localSelectedProvider?.url,
      selectedSttProvider?.provider,
      selectedSttProvider?.variables,
      sttVariables,
    ]
  );

  useEffect(() => {
    if (!apiKeyValue.trim()) return;
    const timeout = window.setTimeout(() => void discoverModels(), 1000);
    return () => window.clearTimeout(timeout);
    // Re-run only when the key or provider changes, not on every variable edit
  }, [apiKeyValue, selectedSttProvider?.provider, localSelectedProvider?.url]);

  const setVariable = (key: string, value: string) => {
    if (!selectedSttProvider) return;
    onSetSelectedSttProvider({
      ...selectedSttProvider,
      variables: {
        ...selectedSttProvider.variables,
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Header
          title="Select STT Provider"
          description="Select your preferred STT service provider or custom providers to get started."
        />
        <Selection
          selected={selectedSttProvider?.provider}
          options={allSttProviders?.map((provider) => {
            const json = curl2Json(provider?.curl);
            return {
              label: provider?.isCustom
                ? json?.url || "Custom Provider"
                : provider?.name || provider?.id || "Custom Provider",
              value: provider?.id || "Custom Provider",
              isCustom: provider?.isCustom,
            };
          })}
          placeholder="Choose your STT provider"
          onChange={(value) => {
            const defaultModel = STT_MODEL_SUGGESTIONS[value]?.[0];
            onSetSelectedSttProvider({
              provider: value,
              variables: defaultModel ? { model: defaultModel } : {},
            });
          }}
        />
      </div>
      {localSelectedProvider ? (
        <Header
          title={`Method: ${
            localSelectedProvider?.method || "Invalid"
          }, Endpoint: ${localSelectedProvider?.url || "Invalid"}`}
          description={`If you want to use different url or method, you can always create a custom provider.`}
        />
      ) : null}
      {findKeyAndValue("api_key") ? (
        <div className="space-y-2">
          <Header
            title="API Key"
            description={`Enter your ${providerLabel} API key to authenticate and access STT models. Your key is stored locally and never shared.`}
          />

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="**********"
                value={apiKeyValue}
                onChange={(value) => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar) return;
                  setVariable(
                    apiKeyVar.key,
                    typeof value === "string" ? value : value.target.value
                  );
                }}
                disabled={false}
                className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
              />
              {isApiKeyEmpty() ? (
                <Button
                  onClick={() => {
                    const apiKeyVar = findKeyAndValue("api_key");
                    if (!apiKeyVar || isApiKeyEmpty()) return;
                    setVariable(apiKeyVar.key, apiKeyValue);
                  }}
                  disabled={isApiKeyEmpty()}
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  title="Submit API Key"
                >
                  <KeyIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    const apiKeyVar = findKeyAndValue("api_key");
                    if (!apiKeyVar) return;
                    setVariable(apiKeyVar.key, "");
                  }}
                  size="icon"
                  variant="destructive"
                  className="shrink-0 h-11 w-11"
                  title="Remove API Key"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 mt-2">
        {sttVariables
          ?.filter(
            (variable) => variable?.key !== findKeyAndValue("api_key")?.key
          )
          .map((variable) => {
            const value = selectedSttProvider?.variables?.[variable.key] || "";
            const isModel = variable.key === "model";

            return (
              <div className="space-y-1" key={variable?.key}>
                <Header
                  title={variable?.value || ""}
                  description={`add your preferred ${variable?.key?.replace(
                    /_/g,
                    " "
                  )} for ${providerLabel}`}
                />
                <TextInput
                  placeholder={`Enter ${providerLabel} ${
                    variable?.key?.replace(/_/g, " ") || "value"
                  }`}
                  value={value}
                  onChange={(next) => {
                    if (!variable?.key) return;
                    setVariable(variable.key, next);
                  }}
                />
                {isModel ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        {modelStatus ||
                          (availableModels.length
                            ? "Models available on this API key"
                            : modelSuggestions.length
                            ? "Suggested models - add your key to see what it can use"
                            : "Type the model name your provider expects")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={isLoadingModels || isApiKeyEmpty()}
                        onClick={() => void discoverModels(true)}
                        title="Refresh models available on this key"
                      >
                        <RefreshCwIcon
                          className={cn(
                            "mr-1 size-3.5",
                            isLoadingModels && "animate-spin"
                          )}
                        />
                        Refresh
                      </Button>
                    </div>
                    {modelSuggestions.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {modelSuggestions.map((model) => (
                          <button
                            key={model}
                            type="button"
                            onClick={() => setVariable(variable.key, model)}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] transition",
                              model === value
                                ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                                : "border-cyan-200/15 bg-white/[0.045] text-foreground hover:border-cyan-300/45 hover:bg-cyan-300/10"
                            )}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
      </div>
    </div>
  );
};
