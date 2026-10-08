import { openUrl } from "@tauri-apps/plugin-opener";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { answersLeft, logout, PLAN_LABELS, trialBlockedMessage } from "@/lib/cloud";
import { cn } from "@/lib/utils";

export function AccountCard() {
  const state = useAuth();
  const user = state?.user;
  if (!user) return null;

  const answers = answersLeft(user);
  const lowCredits = !user.byok && answers <= 3;
  const creditsLabel = user.byok
    ? "Using your own API keys"
    : `${answers} answer${answers === 1 ? "" : "s"} left`;
  const planLabel = user.isAdmin ? "Admin" : PLAN_LABELS[user.plan] ?? user.plan;

  return (
    <div className="mb-3 rounded-xl border border-border bg-secondary/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium" title={user.email}>
            {user.name || user.email}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {planLabel}
            {state?.offline ? " · offline" : ""}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          title="Sign out"
          onClick={() => void logout()}
        >
          <LogOutIcon className="size-3.5" />
        </Button>
      </div>
      <p className={cn("mt-2 text-sm font-semibold", lowCredits ? "text-amber-400" : "text-primary")}>
        {creditsLabel}
      </p>
      {!user.byok ? (
        <p className="text-[11px] text-muted-foreground">
          {trialBlockedMessage(user) || `${user.credits} credit${user.credits === 1 ? "" : "s"}`}
        </p>
      ) : null}
      {!user.byok ? (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => void openUrl(user.upgradeUrl)}>
          {answers <= 0 ? "Get more credits" : "Upgrade"}
        </Button>
      ) : null}
    </div>
  );
}
