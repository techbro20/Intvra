import {
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Header,
  Textarea,
  Button,
  Switch,
} from "@/components";
import { STORAGE_KEYS } from "@/config";
import { safeLocalStorage } from "@/lib";
import { UseSettingsReturn } from "@/types";
import {
  LaptopMinimalIcon,
  FileTextIcon,
  ImageIcon,
  MousePointer2Icon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  TrashIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ScreenshotPromptPreset = {
  id: string;
  name: string;
  prompt: string;
};

const DEFAULT_SCREENSHOT_PROMPT =
  "Analyze this screenshot and provide insights";

const createPresetId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function getScreenshotPromptPresets(currentPrompt: string) {
  const stored = safeLocalStorage.getItem(STORAGE_KEYS.SCREENSHOT_PROMPT_PRESETS);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed
          .filter((preset) => preset?.prompt)
          .map((preset) => ({
            id: String(preset.id || createPresetId()),
            name: String(preset.name || "Screenshot prompt"),
            prompt: String(preset.prompt),
          })) as ScreenshotPromptPreset[];
      }
    } catch {
      // Fall back to the default preset below.
    }
  }

  return [
    {
      id: createPresetId(),
      name: "General analysis",
      prompt: currentPrompt || DEFAULT_SCREENSHOT_PROMPT,
    },
  ];
}

function saveScreenshotPromptPresets(presets: ScreenshotPromptPreset[]) {
  safeLocalStorage.setItem(
    STORAGE_KEYS.SCREENSHOT_PROMPT_PRESETS,
    JSON.stringify(presets)
  );
}

export const ScreenshotConfigs = ({
  screenshotConfiguration,
  handleScreenshotPayloadModeChange,
  handleUltraInstinctEnabledChange,
  handleScreenshotModeChange,
  handleScreenshotPromptChange,
  handleScreenshotEnabledChange,
}: UseSettingsReturn) => {
  const [promptPresets, setPromptPresets] = useState<ScreenshotPromptPreset[]>(
    []
  );
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptName, setPromptName] = useState("");
  const [status, setStatus] = useState("");
  const isWindows = navigator.platform.toLowerCase().includes("win");

  useEffect(() => {
    const presets = getScreenshotPromptPresets(
      screenshotConfiguration.autoPrompt
    );
    const matchingPreset = presets.find(
      (preset) => preset.prompt === screenshotConfiguration.autoPrompt
    );
    const selected = matchingPreset || presets[0];

    setPromptPresets(presets);
    setSelectedPromptId(selected.id);
    setPromptName(selected.name);
    if (!matchingPreset && selected.prompt !== screenshotConfiguration.autoPrompt) {
      handleScreenshotPromptChange(selected.prompt);
    }
    saveScreenshotPromptPresets(presets);
  }, []);

  const selectedPreset = useMemo(
    () => promptPresets.find((preset) => preset.id === selectedPromptId),
    [promptPresets, selectedPromptId]
  );

  const setTemporaryStatus = (value: string) => {
    setStatus(value);
    window.setTimeout(() => setStatus(""), 1600);
  };

  const handlePromptPresetSelect = (presetId: string) => {
    const preset = promptPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedPromptId(preset.id);
    setPromptName(preset.name);
    handleScreenshotPromptChange(preset.prompt);
    setTemporaryStatus("Selected");
  };

  const handleCreatePromptPreset = () => {
    const preset: ScreenshotPromptPreset = {
      id: createPresetId(),
      name: `Screenshot prompt ${promptPresets.length + 1}`,
      prompt: screenshotConfiguration.autoPrompt || DEFAULT_SCREENSHOT_PROMPT,
    };
    const next = [...promptPresets, preset];
    setPromptPresets(next);
    setSelectedPromptId(preset.id);
    setPromptName(preset.name);
    handleScreenshotPromptChange(preset.prompt);
    saveScreenshotPromptPresets(next);
    setTemporaryStatus("New prompt");
  };

  const handleSavePromptPreset = () => {
    const currentPrompt =
      screenshotConfiguration.autoPrompt || DEFAULT_SCREENSHOT_PROMPT;
    const existingId = selectedPromptId || createPresetId();
    const nextPreset: ScreenshotPromptPreset = {
      id: existingId,
      name: promptName.trim() || "Screenshot prompt",
      prompt: currentPrompt,
    };
    const next = promptPresets.some((preset) => preset.id === existingId)
      ? promptPresets.map((preset) =>
          preset.id === existingId ? nextPreset : preset
        )
      : [...promptPresets, nextPreset];

    setPromptPresets(next);
    setSelectedPromptId(nextPreset.id);
    setPromptName(nextPreset.name);
    saveScreenshotPromptPresets(next);
    setTemporaryStatus("Saved");
  };

  const handleDeletePromptPreset = () => {
    if (!selectedPromptId || promptPresets.length <= 1) return;
    const next = promptPresets.filter((preset) => preset.id !== selectedPromptId);
    const fallback = next[0];
    setPromptPresets(next);
    setSelectedPromptId(fallback.id);
    setPromptName(fallback.name);
    handleScreenshotPromptChange(fallback.prompt);
    saveScreenshotPromptPresets(next);
    setTemporaryStatus("Deleted");
  };

  return (
    <div id="screenshot" className="space-y-3">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Capture Method"
              description={
                screenshotConfiguration.enabled
                  ? "Screenshot Mode: Quickly capture the entire screen with one click."
                  : "Selection Mode: Click and drag to select a specific area to capture."
              }
            />
          </div>
          <Select
            value={screenshotConfiguration.enabled ? "screenshot" : "selection"}
            onValueChange={(value) =>
              handleScreenshotEnabledChange(value === "screenshot")
            }
          >
            <SelectTrigger className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                {screenshotConfiguration.enabled ? (
                  <LaptopMinimalIcon className="size-4" />
                ) : (
                  <MousePointer2Icon className="size-4" />
                )}
                <div className="text-sm font-medium">
                  {screenshotConfiguration.enabled
                    ? "Screenshot Mode"
                    : "Selection Mode"}
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selection">
                <div className="flex items-center gap-2">
                  <MousePointer2Icon className="size-4" />
                  <div className="font-medium">Selection Mode</div>
                </div>
              </SelectItem>
              <SelectItem value="screenshot" className="flex flex-row gap-2">
                <LaptopMinimalIcon className="size-4" />
                <div className="font-medium">Screenshot Mode</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div
          className={`rounded-2xl border p-4 transition-all ${
            screenshotConfiguration.ultraInstinctEnabled
              ? "border-violet-300/35 bg-violet-400/[0.08] shadow-[0_0_28px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]"
              : "border-cyan-200/15 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          } ${!isWindows ? "opacity-70" : ""}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                  screenshotConfiguration.ultraInstinctEnabled
                    ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
                    : "border-cyan-200/15 bg-white/[0.04] text-cyan-100"
                }`}
              >
                <SparklesIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-sm font-semibold">
                    Ai.Intvra Ultra Instinct Mode
                  </Label>
                  <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2 py-0.5 text-[0.65rem] font-medium text-cyan-100">
                    Windows only
                  </span>
                  {screenshotConfiguration.ultraInstinctEnabled && isWindows ? (
                    <span className="rounded-full border border-violet-200/20 bg-violet-300/15 px-2 py-0.5 text-[0.65rem] font-medium text-violet-100">
                      No screenshot
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Reads accessible text from the active window without taking a
                  screenshot. Useful when screenshot capture returns a blank
                  screen.
                </p>
                {!isWindows ? (
                  <p className="mt-2 text-xs text-amber-200/85">
                    Only available on Windows in this version.
                  </p>
                ) : null}
              </div>
            </div>
            <Switch
              checked={Boolean(screenshotConfiguration.ultraInstinctEnabled)}
              disabled={!isWindows}
              onCheckedChange={handleUltraInstinctEnabledChange}
              aria-label="Toggle Ai.Intvra Ultra Instinct Mode"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Screenshot Payload"
              description={
                screenshotConfiguration.ultraInstinctEnabled
                  ? "Ultra Instinct Mode is active, so Ai.Intvra reads window text without creating a screenshot payload."
                  : screenshotConfiguration.payloadMode === "ocr_text"
                  ? "OCR runs locally. Screenshots are not sent when text is detected."
                  : "Send the screenshot image to the selected AI provider."
              }
            />
          </div>
          <Select
            value={screenshotConfiguration.payloadMode || "ocr_text"}
            onValueChange={handleScreenshotPayloadModeChange}
          >
            <SelectTrigger
              disabled={screenshotConfiguration.ultraInstinctEnabled}
              className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {screenshotConfiguration.payloadMode === "image" ? (
                  <ImageIcon className="size-4" />
                ) : (
                  <FileTextIcon className="size-4" />
                )}
                <div className="text-sm font-medium">
                  {screenshotConfiguration.payloadMode === "image"
                    ? "Full Screenshot"
                    : "OCR Text Only"}
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ocr_text">
                <div className="flex items-center gap-2">
                  <FileTextIcon className="size-4" />
                  <div>
                    <div className="font-medium">OCR Text Only</div>
                    <div className="text-xs text-muted-foreground">
                      Extract text locally and send no image when OCR succeeds.
                    </div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="image">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-4" />
                  <div>
                    <div className="font-medium">Full Screenshot</div>
                    <div className="text-xs text-muted-foreground">
                      Use the current image-based screenshot behavior.
                    </div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Processing Mode"
              description={
                screenshotConfiguration.mode === "manual"
                  ? "Screenshots are added as attachments so you can combine multiple captures with your own prompt."
                  : "Screenshots are submitted to AI immediately with the prompt below, then saved into chat history when a response arrives."
              }
            />
          </div>
          <Select
            value={screenshotConfiguration.mode}
            onValueChange={handleScreenshotModeChange}
          >
            <SelectTrigger className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">
                  {screenshotConfiguration.mode === "auto" ? "Auto" : "Manual"}{" "}
                  Mode
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">
                <div className="font-medium">Manual Mode</div>
              </SelectItem>
              <SelectItem value="auto">
                <div className="font-medium">Auto Mode</div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {screenshotConfiguration.mode === "auto" && (
          <div className="space-y-3 rounded-2xl border border-cyan-200/15 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Auto Prompt</Label>
                <p className="text-xs text-muted-foreground">
                  Choose or create reusable prompts for automatic screenshot
                  analysis.
                </p>
              </div>
              {status ? (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
                  {status}
                </span>
              ) : null}
            </div>

            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto]">
              <Select
                value={selectedPromptId}
                onValueChange={handlePromptPresetSelect}
              >
                <SelectTrigger className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
                  <div className="truncate text-sm font-medium">
                    {selectedPreset?.name || "Select prompt"}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {promptPresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      <div className="font-medium">{preset.name}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Prompt name"
                value={promptName}
                onChange={(event) => setPromptName(event.target.value)}
                className="h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleCreatePromptPreset}
                  title="Create new screenshot prompt"
                  className="size-11"
                >
                  <PlusIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleSavePromptPreset}
                  title="Save screenshot prompt"
                  className="size-11"
                >
                  <SaveIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  onClick={handleDeletePromptPreset}
                  disabled={promptPresets.length <= 1}
                  title="Delete screenshot prompt"
                  className="size-11"
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            </div>

            <Textarea
              placeholder="Enter prompt for automatic screenshot analysis..."
              value={screenshotConfiguration.autoPrompt}
              onChange={(e) => handleScreenshotPromptChange(e.target.value)}
              className="min-h-28 w-full border-1 border-input/50 focus:border-primary/50 transition-colors"
            />
            <p className="text-xs text-muted-foreground">
              The selected prompt is used immediately when screenshots are taken.
            </p>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground/70">
        <p>
          <strong>Tip:</strong>{" "}
          {screenshotConfiguration.enabled
            ? "Screenshot mode captures the full screen with one click."
            : "Selection mode lets you choose specific areas to capture."}{" "}
          Auto mode is best for immediate responses and saved chats; manual mode
          is for batching attachments.
        </p>
      </div>
    </div>
  );
};
