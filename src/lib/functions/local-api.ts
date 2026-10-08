import { getAuthState, usesCloud } from "../cloud";

/** True when requests should go through Ai.Intvra Cloud instead of the user's own provider keys. */
export async function shouldUseLocalAPI(): Promise<boolean> {
  try {
    return usesCloud(await getAuthState());
  } catch {
    return false;
  }
}
