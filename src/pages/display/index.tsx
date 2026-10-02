import { useEffect, useMemo, useState } from "react";
import { Button, Card, Select, SelectContent, SelectItem, SelectTrigger } from "@/components";
import { useOverlayScale } from "@/hooks";
import { PageLayout } from "@/layouts";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckIcon,
  MinusIcon,
  MonitorIcon,
  MoveDiagonal2Icon,
  PlusIcon,
  RefreshCwIcon,
  ScreenShareIcon,
} from "lucide-react";

type DisplayDescriptor = {
  id: string;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
};

type DisplaySettings = {
  overlayDisplayId: string;
  captureDisplayIds: string[];
};

type DisplayConfiguration = {
  displays: DisplayDescriptor[];
  settings: DisplaySettings;
};

const emptyConfiguration: DisplayConfiguration = {
  displays: [],
  settings: {
    overlayDisplayId: "",
    captureDisplayIds: [],
  },
};

const Display = () => {
  const [configuration, setConfiguration] =
    useState<DisplayConfiguration>(emptyConfiguration);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const {
    metrics: overlayScale,
    refresh: refreshOverlayScale,
    setScale: setOverlayScale,
  } = useOverlayScale();

  const selectedOverlay = useMemo(
    () =>
      configuration.displays.find(
        (display) => display.id === configuration.settings.overlayDisplayId
      ),
    [configuration]
  );

  const loadConfiguration = async () => {
    const [next] = await Promise.all([
      invoke<DisplayConfiguration>("get_display_configuration"),
      refreshOverlayScale(),
    ]);
    setConfiguration(next);
  };

  useEffect(() => {
    void loadConfiguration();
  }, []);

  const applySettings = async (settings: DisplaySettings) => {
    setIsSaving(true);
    try {
      const next = await invoke<DisplayConfiguration>(
        "update_display_configuration",
        { settings }
      );
      setConfiguration(next);
      setStatus("Saved");
      window.setTimeout(() => setStatus(""), 1600);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOverlayDisplayChange = (displayId: string) => {
    const previousOverlayId = configuration.settings.overlayDisplayId;
    const currentCaptureIds = configuration.settings.captureDisplayIds;
    const captureDisplayIds =
      !currentCaptureIds.length ||
      (currentCaptureIds.length === 1 && currentCaptureIds[0] === previousOverlayId)
        ? [displayId]
        : currentCaptureIds.includes(displayId)
          ? currentCaptureIds
          : [...currentCaptureIds, displayId];

    void applySettings({
      overlayDisplayId: displayId,
      captureDisplayIds,
    });
  };

  const handleToggleCaptureDisplay = (displayId: string) => {
    const selected = new Set(configuration.settings.captureDisplayIds);
    if (selected.has(displayId)) {
      if (selected.size <= 1) return;
      selected.delete(displayId);
    } else {
      selected.add(displayId);
    }

    void applySettings({
      ...configuration.settings,
      captureDisplayIds: [...selected],
    });
  };

  const applyOverlayScale = async (scale: number) => {
    setIsSaving(true);
    try {
      await setOverlayScale(Number(scale.toFixed(2)));
      setStatus("Saved");
      window.setTimeout(() => setStatus(""), 1600);
    } finally {
      setIsSaving(false);
    }
  };

  const adjustOverlayScale = (delta: number) => {
    void applyOverlayScale(overlayScale.scale + delta);
  };

  const canDecrease = overlayScale.scale > overlayScale.min;
  const canIncrease = overlayScale.scale < overlayScale.max;
  const overlayScalePercent = Math.round(overlayScale.scale * 100);

  return (
    <PageLayout
      title="Display"
      description="Choose where PruvoAI appears and which monitors can be captured."
      rightSlot={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadConfiguration()}
          disabled={isSaving}
          title="Refresh detected displays"
        >
          <RefreshCwIcon className="size-4" />
          Refresh
        </Button>
      }
    >
      <div className="space-y-5">
        <Card className="relative overflow-hidden rounded-2xl border border-cyan-200/15 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MonitorIcon className="size-4 text-cyan-200" />
                Overlay Display
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                The floating bar opens on this monitor. Full screenshot mode
                captures this same monitor.
              </p>
            </div>
            <Select
              value={configuration.settings.overlayDisplayId}
              onValueChange={handleOverlayDisplayChange}
            >
              <SelectTrigger className="h-11 w-full border-1 border-input/50 focus:border-primary/50">
                <div className="truncate text-sm font-medium">
                  {selectedOverlay?.label || "Choose display"}
                </div>
              </SelectTrigger>
              <SelectContent>
                {configuration.displays.map((display) => (
                  <SelectItem key={display.id} value={display.id}>
                    <div className="font-medium">{display.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status ? (
            <p className="mt-3 text-xs text-cyan-100">{status}</p>
          ) : null}
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-cyan-200/15 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="pointer-events-none absolute -right-16 -top-20 size-44 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/65 to-transparent" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MoveDiagonal2Icon className="size-4 text-violet-200" />
                Overlay Size
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Resize the floating bar and response window together. This keeps
                the native click area matched to the visible UI.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                  Bar {overlayScale.width} x {overlayScale.collapsedHeight}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                  Response height {overlayScale.responseHeight}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 shadow-[0_0_28px_rgba(56,189,248,0.08)]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => adjustOverlayScale(-overlayScale.step)}
                disabled={isSaving || !canDecrease}
                title="Decrease overlay size"
                className="size-10 rounded-xl border border-white/10 bg-white/[0.04] hover:border-cyan-300/40 hover:bg-cyan-300/10"
              >
                <MinusIcon className="size-4" />
              </Button>
              <div className="grid min-w-20 place-items-center px-2 text-center">
                <span className="text-lg font-semibold text-foreground">
                  {overlayScalePercent}%
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Scale
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => adjustOverlayScale(overlayScale.step)}
                disabled={isSaving || !canIncrease}
                title="Increase overlay size"
                className="size-10 rounded-xl border border-white/10 bg-white/[0.04] hover:border-cyan-300/40 hover:bg-cyan-300/10"
              >
                <PlusIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void applyOverlayScale(1)}
                disabled={isSaving || overlayScale.scale === 1}
                title="Reset overlay size"
                className="ml-1 h-10 rounded-xl border-white/10 bg-white/[0.03] px-3"
              >
                Reset
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {configuration.displays.map((display) => {
            const isOverlay =
              display.id === configuration.settings.overlayDisplayId;
            const isCaptureEnabled =
              configuration.settings.captureDisplayIds.includes(display.id);

            return (
              <button
                key={display.id}
                type="button"
                onClick={() => handleToggleCaptureDisplay(display.id)}
                className={cn(
                  "group min-h-[176px] rounded-2xl border bg-white/[0.035] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-white/[0.06]",
                  isCaptureEnabled
                    ? "border-cyan-300/55 shadow-[0_0_26px_rgba(34,211,238,0.12)]"
                    : "border-white/10"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid size-12 place-items-center rounded-2xl border border-cyan-200/15 bg-black/25">
                    <ScreenShareIcon className="size-5 text-cyan-100" />
                  </div>
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full border",
                      isCaptureEnabled
                        ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                        : "border-white/10 bg-black/20 text-muted-foreground"
                    )}
                  >
                    {isCaptureEnabled ? <CheckIcon className="size-4" /> : null}
                  </span>
                </div>

                <div className="mt-4 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">
                      {display.label}
                    </p>
                    {isOverlay ? (
                      <span className="rounded-md border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-medium text-violet-100">
                        Overlay
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {display.size.width} x {display.size.height} at{" "}
                    {display.scaleFactor}x scale
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Position {display.bounds.x}, {display.bounds.y}
                  </p>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  {isCaptureEnabled
                    ? "Selection capture is enabled for this monitor."
                    : "Click to include this monitor in selection capture."}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
};

export default Display;
