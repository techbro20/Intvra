"use client";

import { useState } from "react";
import { submitForm, type FormStatus } from "@/lib/submit-form";

const field =
  "w-full rounded-xl border border-line bg-ink/80 px-4 py-3 text-sm text-text placeholder:text-muted/70 focus:border-cyan/60 focus:outline-none";

export function UnsubscribeForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ state: "sending" });
    const result = await submitForm({ kind: "unsubscribe", email, website });
    setStatus(result);
    if (result.state === "sent") setEmail("");
  }

  if (status.state === "sent") {
    return (
      <div className="glow-border rounded-2xl bg-panel p-8 text-center">
        <h2 className="font-display text-xl font-semibold">You&apos;re unsubscribed.</h2>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll remove this email from the waitlist and marketing emails. Account or billing mail (like sign-in
          codes) is separate and only sent when you use the product.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="glow-border flex flex-col gap-5 rounded-2xl bg-panel p-6 sm:p-8">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Email on the waitlist or newsletter
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </label>
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
      />
      {status.state === "error" && <p className="text-sm text-red-300">{status.message}</p>}
      <button
        type="submit"
        disabled={status.state === "sending"}
        className="btn-primary self-start rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {status.state === "sending" ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </form>
  );
}
