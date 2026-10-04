import { invoke } from "@tauri-apps/api/core";
import { ScreenshotConfig } from "@/types";

const OCR_TEXT_MAX_CHARS = 8000;

export type ScreenshotOcrContext = {
  id: string;
  source: "ocr";
  text: string;
  confidence: number;
  durationMs: number;
  truncated: boolean;
};

export type AccessibilityTextContext = {
  id: string;
  source: "accessibility";
  text: string;
  windowTitle: string;
  processId: number;
  elementCount: number;
  durationMs: number;
  truncated: boolean;
};

export type ScreenshotTextContext =
  | ScreenshotOcrContext
  | AccessibilityTextContext;

export type ScreenshotPayloadResult =
  | {
      kind: "ocr_text";
      context: ScreenshotOcrContext;
      notice: string;
    }
  | {
      kind: "image";
      imageBase64: string;
      notice?: string;
    };

export type AccessibilityTextPayloadResult =
  | {
      kind: "accessibility_text";
      context: AccessibilityTextContext;
      notice: string;
    }
  | {
      kind: "no_accessibility_text";
      notice: string;
    };

type OcrResult = {
  text: string;
  confidence: number;
  durationMs: number;
};

type AccessibilityTextResult = {
  text: string;
  windowTitle: string;
  processId: number;
  elementCount: number;
  durationMs: number;
  truncated: boolean;
  unsupportedPlatform?: boolean;
  error?: string | null;
};

const createContextId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function truncateCaptureText(text: string, marker: string) {
  const normalized = text.trim();
  if (normalized.length <= OCR_TEXT_MAX_CHARS) {
    return { text: normalized, truncated: false };
  }

  return {
    text: `${normalized.slice(0, OCR_TEXT_MAX_CHARS)}\n\n${marker}`,
    truncated: true,
  };
}

export function buildOcrUserMessage(
  prompt: string,
  contexts: ScreenshotTextContext[]
) {
  const cleanPrompt = prompt.trim();
  const validContexts = contexts.filter((context) => context.text.trim());
  if (!validContexts.length) return cleanPrompt;

  const ocrText = validContexts
    .map((context, index) => {
      if (context.source === "accessibility") {
        const label =
          validContexts.length > 1
            ? `Local accessibility text extracted from active window ${index + 1}:`
            : "Local accessibility text extracted from the active window:";
        const windowLine = context.windowTitle
          ? `Window: ${context.windowTitle}\n`
          : "";
        return `${label}\n${windowLine}\"\"\"\n${context.text}\n\"\"\"`;
      }

      const label =
        validContexts.length > 1
          ? `Local OCR text extracted from screenshot ${index + 1}:`
          : "Local OCR text extracted from the screenshot:";
      return `${label}\n\"\"\"\n${context.text}\n\"\"\"`;
    })
    .join("\n\n");

  const hasAccessibility = validContexts.some(
    (context) => context.source === "accessibility"
  );
  const instruction = hasAccessibility
    ? "Answer using the extracted text. If layout, images, video, or visual details are required, say that no screenshot image was sent in Ai.Intvra Ultra Instinct Mode."
    : "Answer using the extracted text. If layout or visual details are required, say that the screenshot image was not sent in OCR Text Only mode.";

  return `${cleanPrompt}\n\n${ocrText}\n\n${instruction}`;
}

export async function prepareAccessibilityTextPayload(): Promise<AccessibilityTextPayloadResult> {
  try {
    const result = await invoke<AccessibilityTextResult>(
      "accessibility_extract_text",
      {
        target: "active_window",
        maxChars: OCR_TEXT_MAX_CHARS,
      }
    );

    if (result.unsupportedPlatform) {
      return {
        kind: "no_accessibility_text",
        notice:
          "Ai.Intvra Ultra Instinct Mode is only available on Windows in this version.",
      };
    }

    const { text, truncated } = truncateCaptureText(
      result.text || "",
      "[accessibility text truncated]"
    );
    if (!text.trim()) {
      return {
        kind: "no_accessibility_text",
        notice: result.error
          ? `No window text found through Ai.Intvra Ultra Instinct Mode. ${result.error}`
          : "No window text found through Ai.Intvra Ultra Instinct Mode. No screenshot was taken.",
      };
    }

    return {
      kind: "accessibility_text",
      context: {
        id: createContextId(),
        source: "accessibility",
        text,
        windowTitle: result.windowTitle || "",
        processId: Number(result.processId || 0),
        elementCount: Number(result.elementCount || 0),
        durationMs: Number(result.durationMs || 0),
        truncated: truncated || Boolean(result.truncated),
      },
      notice: truncated || result.truncated
        ? "Ai.Intvra Ultra Instinct Mode captured active-window text and truncated it before sending. No screenshot image was sent."
        : "Ai.Intvra Ultra Instinct Mode captured active-window text. No screenshot image was sent.",
    };
  } catch (error) {
    return {
      kind: "no_accessibility_text",
      notice: `Ai.Intvra Ultra Instinct Mode could not read active-window text. No screenshot was taken.${
        error instanceof Error ? ` ${error.message}` : ""
      }`,
    };
  }
}

export async function prepareScreenshotPayload(
  imageBase64: string,
  screenshotConfiguration: ScreenshotConfig
): Promise<ScreenshotPayloadResult> {
  if (screenshotConfiguration.payloadMode !== "ocr_text") {
    return { kind: "image", imageBase64 };
  }

  try {
    const result = await invoke<OcrResult>("ocr_extract_text", {
      imageBase64,
      language: "eng",
    });
    const { text, truncated } = truncateCaptureText(
      result.text || "",
      "[OCR text truncated]"
    );

    if (!text.trim()) {
      return {
        kind: "image",
        imageBase64,
        notice: "No readable OCR text was found. Ai.Intvra sent the screenshot image instead.",
      };
    }

    return {
      kind: "ocr_text",
      context: {
        id: createContextId(),
        source: "ocr",
        text,
        confidence: result.confidence,
        durationMs: result.durationMs,
        truncated,
      },
      notice: truncated
        ? "OCR text captured locally and truncated before sending. Screenshot image was not sent."
        : "OCR text captured locally. Screenshot image was not sent.",
    };
  } catch (error) {
    return {
      kind: "image",
      imageBase64,
      notice: `OCR failed locally. Ai.Intvra sent the screenshot image instead.${
        error instanceof Error ? ` ${error.message}` : ""
      }`,
    };
  }
}
