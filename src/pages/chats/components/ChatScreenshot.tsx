import { Button } from "@/components";
import {
  LaptopMinimalIcon,
  Loader2,
  MousePointer2Icon,
  SparklesIcon,
} from "lucide-react";
import { MAX_FILES } from "@/config";
import { useApp } from "@/contexts";

interface ChatScreenshotProps {
  screenshotConfiguration: any;
  attachedFiles: any[];
  isLoading: boolean;
  captureScreenshot: () => Promise<void>;
  isScreenshotLoading: boolean;
  disabled: boolean;
}

export const ChatScreenshot = ({
  screenshotConfiguration,
  attachedFiles,
  isLoading,
  captureScreenshot,
  isScreenshotLoading,
  disabled,
}: ChatScreenshotProps) => {
  const { supportsImages } = useApp();
  const isUltraInstinct = Boolean(screenshotConfiguration.ultraInstinctEnabled);
  const captureMode = isUltraInstinct
    ? "Ai.Intvra Ultra Instinct"
    : screenshotConfiguration.enabled
    ? "Screenshot"
    : "Selection";
  const processingMode = screenshotConfiguration.mode;

  return (
    <Button
      size="icon"
      variant="outline"
      className="size-7 lg:size-9 rounded-lg"
      title={
        isUltraInstinct
          ? `Ai.Intvra Ultra Instinct Mode (${processingMode}) - reads active-window text without taking a screenshot`
          : !supportsImages
          ? `${captureMode} mode (${processingMode}) - current provider may not support image input`
          : `${captureMode} mode (${processingMode}) - ${attachedFiles.length}/${MAX_FILES} files`
      }
      onClick={captureScreenshot}
      disabled={
        (!isUltraInstinct && attachedFiles.length >= MAX_FILES) ||
        isLoading ||
        isScreenshotLoading ||
        (!isUltraInstinct && disabled && supportsImages)
      }
    >
      {isScreenshotLoading ? (
        <Loader2 className="size-3 lg:size-4 animate-spin" />
      ) : isUltraInstinct ? (
        <SparklesIcon className="size-3 lg:size-4" />
      ) : screenshotConfiguration.enabled ? (
        <LaptopMinimalIcon className="size-3 lg:size-4" />
      ) : (
        <MousePointer2Icon className="size-3 lg:size-4" />
      )}
    </Button>
  );
};
