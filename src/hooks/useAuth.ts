import { useEffect, useState } from "react";
import { AuthState, getAuthState, getCachedAuthState, onAuthChanged } from "@/lib/cloud";

/** Live account state shared across windows; refreshed from the server on mount. */
export function useAuth() {
  const [state, setState] = useState<AuthState | null>(getCachedAuthState());

  useEffect(() => {
    const unsubscribe = onAuthChanged(setState);
    getAuthState(true)
      .then(setState)
      .catch(() =>
        setState({
          status: "signed_out",
          user: null,
          apiBase: "",
          loginPending: false,
          error: "Can't reach Ai.Intvra right now.",
        })
      );
    return unsubscribe;
  }, []);

  return state;
}
