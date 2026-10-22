import { useState, type CSSProperties, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DragButton } from "@/components/DragButton";
import { useAuth } from "@/hooks/useAuth";
import { useOverlayScale } from "@/hooks/useOverlayScale";
import { cancelLogin, startLogin } from "@/lib/cloud";
import logoUrl from "../../../build/icon.png?url";

const SUPPORT_EMAIL = "support@intvra.com";

function useStartLogin() {
  const [error, setError] = useState("");
  const begin = async () => {
    setError("");
    try {
      await startLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the sign-in page.");
    }
  };
  return { begin, error };
}

function LoginScreen({ loginPending, error }: { loginPending: boolean; error?: string }) {
  const { begin, error: startError } = useStartLogin();
  const message = startError || error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-[0_20px_60px_-20px_rgba(30,107,255,0.45)]">
        <img src={logoUrl} alt="" className="mx-auto h-16 w-16 rounded-2xl" draggable={false} />
        <h1 className="mt-5 text-xl font-semibold">Welcome to Ai.Intvra</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in or create an account to start. New accounts get 40 free credits, enough for 20 answers (one free trial per computer).
        </p>

        {message ? (
          <p className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        {loginPending ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Finish signing in in your browser…
            </div>
            <Button variant="outline" className="w-full" onClick={begin}>
              Open the sign-in page again
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => void cancelLogin()}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="lg" className="mt-6 w-full" onClick={begin}>
            Sign in with your browser
          </Button>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Google or email sign-in opens in your browser. Trouble signing in?{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => void openUrl(`mailto:${SUPPORT_EMAIL}`)}
          >
            {SUPPORT_EMAIL}
          </button>
        </p>
      </div>
    </div>
  );
}

function SignInBar({ loginPending }: { loginPending: boolean }) {
  const { metrics } = useOverlayScale();
  const { begin } = useStartLogin();

  return (
    <div
      className="phantom-overlay-root"
      style={{ "--phantom-overlay-scale": metrics.scale } as CSSProperties}
    >
      <div className="phantom-overlay-shell">
        <DragButton />
        <div className="phantom-command-strip">
          <span className="min-w-0 flex-1 truncate px-2 text-sm text-muted-foreground">
            {loginPending ? "Finish signing in in your browser…" : "Sign in to start using Ai.Intvra"}
          </span>
          <Button size="sm" onClick={begin}>
            {loginPending ? "Reopen" : "Sign in"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Blocks the overlay and dashboard until the user is signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const state = useAuth();
  const isDashboard = window.phantom?.windowLabel === "dashboard";

  if (!state) {
    return isDashboard ? (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    ) : null;
  }

  if (state.status !== "signed_in") {
    return isDashboard ? (
      <LoginScreen loginPending={state.loginPending} error={state.error} />
    ) : (
      <SignInBar loginPending={state.loginPending} />
    );
  }

  return <>{children}</>;
}
