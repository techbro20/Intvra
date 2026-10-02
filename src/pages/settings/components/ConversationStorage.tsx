import { useEffect, useState } from "react";
import { DatabaseIcon, FolderOpenIcon, RotateCcwIcon } from "lucide-react";
import { Button, Header, Input } from "@/components";
import {
  chooseConversationStorageFolder,
  ConversationStorageInfo,
  getConversationStorageInfo,
  openConversationStorageFolder,
  resetConversationStorageFolder,
} from "@/lib";

export const ConversationStorage = () => {
  const [info, setInfo] = useState<ConversationStorageInfo | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = async () => {
    const nextInfo = await getConversationStorageInfo();
    setInfo(nextInfo);
  };

  useEffect(() => {
    refresh().catch((error) => {
      setStatus(
        error instanceof Error
          ? error.message
          : "Failed to read conversation storage location."
      );
    });
  }, []);

  const runAction = async (
    action: () => Promise<ConversationStorageInfo>,
    message: string
  ) => {
    try {
      setIsBusy(true);
      setStatus(null);
      const nextInfo = await action();
      setInfo(nextInfo);
      setStatus(message);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Storage location update failed."
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div id="conversation-storage" className="space-y-3">
      <Header
        title="Conversation Storage"
        description="Choose where PruvoAI stores the local SQLite conversation database."
        isMainTitle
      />

      <div className="rounded-lg border bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-md border border-primary/20 bg-primary/10 p-2 text-primary">
            <DatabaseIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-sm font-medium">
                {info?.isDefault ? "Default installation folder" : "Custom folder"}
              </p>
              <p className="text-xs text-muted-foreground">
                Database file: phantom.db
              </p>
            </div>

            <Input
              value={info?.folderPath || "Loading..."}
              readOnly
              className="font-mono text-xs"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  runAction(
                    chooseConversationStorageFolder,
                    "Conversation storage folder updated."
                  )
                }
                disabled={isBusy}
              >
                <FolderOpenIcon className="size-4" />
                Choose Folder
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  runAction(
                    openConversationStorageFolder,
                    "Opened conversation storage folder."
                  )
                }
                disabled={isBusy || !info}
              >
                <FolderOpenIcon className="size-4" />
                Open Folder
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  runAction(
                    resetConversationStorageFolder,
                    "Conversation storage reset to the installation folder."
                  )
                }
                disabled={isBusy || info?.isDefault}
              >
                <RotateCcwIcon className="size-4" />
                Use Default
              </Button>
            </div>

            {info ? (
              <p className="text-xs text-muted-foreground">
                Default: {info.defaultFolderPath}
              </p>
            ) : null}
            {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
};
