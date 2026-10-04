export type FormStatus = { state: "idle" | "sending" | "sent" | "error"; message?: string };

export async function submitForm(payload: Record<string, string>): Promise<FormStatus> {
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { state: "error", message: data.error || "Something went wrong. Please try again." };
    return { state: "sent" };
  } catch {
    return { state: "error", message: "Network error. Please check your connection and try again." };
  }
}
