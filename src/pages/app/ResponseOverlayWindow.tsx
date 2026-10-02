import { FormEvent, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  CopyIcon,
  FileTextIcon,
  GripIcon,
  ImageIcon,
  Loader2,
  PinIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Button, Input, Markdown, ScrollArea, Switch } from "@/components";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useOverlayScale } from "@/hooks";
import type { AIResponseActivity, AIResponseRoute } from "@/lib";

type ResponseMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
};

type ResponseWindowState = {
  open: boolean;
  isLoading: boolean;
  error: string | null;
  notice: string | null;
  response: string;
  activities: AIResponseActivity[];
  route: AIResponseRoute | null;
  keepEngaged: boolean;
  conversationHistory: ResponseMessage[];
};

const emptyState: ResponseWindowState = {
  open: false,
  isLoading: false,
  error: null,
  notice: null,
  response: "",
  activities: [],
  route: null,
  keepEngaged: false,
  conversationHistory: [],
};

function getCaptureStatus(notice: string | null) {
  if (!notice) return null;

  const normalized = notice.toLowerCase();

  if (normalized.includes("ultra instinct mode captured")) {
    return {
      label: normalized.includes("truncated")
        ? "Window text sent - trimmed"
        : "Window text sent",
      className: "is-ultra",
      Icon: SparklesIcon,
      isAnimated: false,
    };
  }

  if (
    normalized.includes("no window text") ||
    normalized.includes("could not read active-window text")
  ) {
    return {
      label: "No window text",
      className: "is-fallback",
      Icon: FileTextIcon,
      isAnimated: false,
    };
  }

  if (normalized.includes("only available on windows")) {
    return {
      label: "Windows only",
      className: "is-fallback",
      Icon: SparklesIcon,
      isAnimated: false,
    };
  }

  if (normalized.includes("ultra instinct mode is reading")) {
    return {
      label: "Reading window",
      className: "is-working",
      Icon: Loader2,
      isAnimated: true,
    };
  }

  if (normalized.includes("ocr text captured locally")) {
    return {
      label: normalized.includes("truncated")
        ? "OCR text sent · trimmed"
        : "OCR text sent · no image",
      className: "is-ocr",
      Icon: FileTextIcon,
      isAnimated: false,
    };
  }

  if (
    normalized.includes("no readable ocr") ||
    normalized.includes("ocr failed") ||
    normalized.includes("sent the screenshot image instead")
  ) {
    return {
      label: "Image fallback",
      className: "is-fallback",
      Icon: ImageIcon,
      isAnimated: false,
    };
  }

  if (normalized.includes("capturing screenshot")) {
    return {
      label: "Capturing",
      className: "is-working",
      Icon: Loader2,
      isAnimated: true,
    };
  }

  if (normalized.includes("select an area")) {
    return {
      label: "Select area",
      className: "is-working",
      Icon: ImageIcon,
      isAnimated: false,
    };
  }

  if (normalized.includes("screenshot attached")) {
    return {
      label: "Image attached",
      className: "is-image",
      Icon: ImageIcon,
      isAnimated: false,
    };
  }

  return {
    label: "Capture ready",
    className: "is-ready",
    Icon: CheckCircle2Icon,
    isAnimated: false,
  };
}

function getActivityStatus(activity: AIResponseActivity) {
  if (activity.type === "quota") {
    return {
      className: "is-warning",
      Icon: AlertTriangleIcon,
    };
  }
  if (activity.type === "cooldown") {
    return {
      className: "is-cooldown",
      Icon: RefreshCwIcon,
    };
  }
  if (activity.type === "connected") {
    return {
      className: "is-success",
      Icon: CheckCircle2Icon,
    };
  }
  if (activity.type === "exhausted") {
    return {
      className: "is-error",
      Icon: AlertTriangleIcon,
    };
  }
  if (activity.type === "try_key" || activity.type === "switch_model") {
    return {
      className: "is-switching",
      Icon: RefreshCwIcon,
    };
  }
  return {
    className: "is-ready",
    Icon: SparklesIcon,
  };
}

function getActivityLabel(activity: AIResponseActivity) {
  switch (activity.type) {
    case "try_key":
    case "switch_model":
      return "Retrying…";
    case "connected":
      return "Connected";
    case "cooldown":
      return "Cooling down";
    case "quota":
      return "Quota reached";
    case "exhausted":
      return activity.label.startsWith("Fallback exhausted")
        ? activity.label
        : "Fallback exhausted";
    default:
      return activity.label;
  }
}

export function ResponseOverlayWindow() {
  const [state, setState] = useState<ResponseWindowState>(emptyState);
  const [followUp, setFollowUp] = useState("");
  const { metrics: overlayMetrics } = useOverlayScale();
  const captureStatus = getCaptureStatus(state.notice);
  const latestActivities = (state.activities || [])
    .map((activity) => ({ ...activity, label: getActivityLabel(activity) }))
    .filter(
      (activity, index, all) =>
        index === 0 || all[index - 1].label !== activity.label
    )
    .slice(-3);
  const stateLabel = state.error
    ? "Error"
    : state.isLoading
    ? "Streaming"
    : "Ready";

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    invoke<ResponseWindowState | null>("get_response_window_state").then(
      (initialState) => {
        if (initialState) {
          setState(initialState);
        }
      }
    );

    listen<ResponseWindowState>("response-window-state", (event) => {
      setState(event.payload || emptyState);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        invoke("response_window_action", { action: "close" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const copyContent = async () => {
    const content = state.response || state.notice || state.error || "";
    if (!content) return;
    await navigator.clipboard.writeText(content);
  };

  const submitFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = followUp.trim();
    if (!text || state.isLoading) return;

    setFollowUp("");
    await invoke("response_window_action", {
      action: "submit_follow_up",
      text,
    });
  };

  return (
    <div
      className="phantom-response-native-root"
      style={
        {
          "--phantom-overlay-scale": overlayMetrics.scale,
        } as CSSProperties
      }
    >
      <div className="phantom-response-window is-native">
        <div className="phantom-response-header" data-tauri-drag-region={true}>
          <div className="flex min-w-0 flex-row items-center gap-2">
            <div className="phantom-response-drag-handle" title="Move response">
              <GripIcon className="size-3.5" />
            </div>
            <div className="phantom-response-icon">
              <BrainCircuitIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="phantom-response-title-row">
                <h3 className="truncate text-sm font-semibold select-none">
                  {state.keepEngaged ? "Conversation" : "AI Response"}
                </h3>
                {captureStatus ? (
                  <span
                    className={`phantom-capture-chip ${captureStatus.className}`}
                    title={state.notice || undefined}
                    aria-label={state.notice || captureStatus.label}
                  >
                    <captureStatus.Icon
                      className={captureStatus.isAnimated ? "animate-spin" : ""}
                    />
                    <span>{captureStatus.label}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className={`phantom-state-chip ${
                    state.error
                      ? "is-error"
                      : state.isLoading
                      ? "is-loading"
                      : "is-ready"
                  }`}
                >
                  {stateLabel}
                </span>
                {state.keepEngaged ? (
                  <span className="phantom-state-chip is-pinned">Pinned</span>
                ) : null}
              </div>
              {latestActivities.length ? (
                <div className="phantom-response-activity-row">
                  {latestActivities.map((activity, index) => {
                    const activityStatus = getActivityStatus(activity);
                    return (
                      <span
                        key={`${activity.timestamp}-${activity.type}-${index}`}
                        className={`phantom-activity-chip ${activityStatus.className}`}
                        title={activity.label}
                      >
                        <activityStatus.Icon
                          className={
                            activity.type === "try_key" ||
                            activity.type === "switch_model"
                              ? "animate-spin"
                              : undefined
                          }
                        />
                        <span>{activity.label}</span>
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="flex items-center gap-2 select-none"
            data-tauri-no-drag-region={true}
          >
            <div
              className="flex flex-row items-center gap-2"
              title="Keep panel open"
            >
              <PinIcon className="size-3.5 text-muted-foreground" />
              <Switch
                checked={state.keepEngaged}
                onCheckedChange={(checked) => {
                  invoke("response_window_action", {
                    action: "set_keep_engaged",
                    checked,
                  });
                }}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={copyContent}
              className="phantom-icon-button"
              title="Copy response"
            >
              <CopyIcon />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => invoke("response_window_action", { action: "close" })}
              className="phantom-icon-button"
              title={state.isLoading ? "Cancel loading" : "Close response"}
            >
              {state.isLoading ? <Loader2 className="animate-spin" /> : <XIcon />}
            </Button>
          </div>
        </div>

        <ScrollArea className="phantom-response-scroll is-native">
          <div className="phantom-response-body">
            {state.error && (
              <div className="phantom-message is-error">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <strong>Error</strong>
                  <p>{state.error}</p>
                </div>
              </div>
            )}
            {state.isLoading && (
              <div className="phantom-message is-loading">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating response...</span>
              </div>
            )}
            {state.response && (
              <div className="phantom-markdown-shell">
                <Markdown>{state.response}</Markdown>
              </div>
            )}

            {state.keepEngaged && state.conversationHistory.length > 1 && (
              <div className="space-y-3 pt-3">
                {[...state.conversationHistory]
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((message, index) => {
                    if (!state.isLoading && index === 0) {
                      return null;
                    }
                    return (
                      <div
                        key={message.id}
                        className={`phantom-history-item ${
                          message.role === "user" ? "is-user" : "is-assistant"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase">
                            {message.role === "user" ? "You" : "AI"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(message.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <Markdown>{message.content}</Markdown>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </ScrollArea>

        <form
          className="phantom-response-followup"
          onSubmit={submitFollowUp}
          data-tauri-no-drag-region={true}
        >
          <Input
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            placeholder="Continue this conversation..."
            disabled={state.isLoading}
            className="phantom-response-followup-input"
          />
          <Button
            type="submit"
            size="icon"
            className="phantom-response-followup-send"
            disabled={!followUp.trim() || state.isLoading}
            title="Send follow-up"
          >
            {state.isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <SendHorizontalIcon />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
