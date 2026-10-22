"use client";

import Link from "next/link";
import { useState } from "react";
import { submitForm, type FormStatus } from "@/lib/submit-form";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ state: "sending" });
    const result = await submitForm({ kind: "waitlist", email, website });
    setStatus(result);
    if (result.state === "sent") setEmail("");
  }

  if (status.state === "sent") {
    return (
      <div className="text-center">
        <p className="rounded-full border border-cyan/30 bg-panel px-6 py-3.5 text-sm text-text">
          You&apos;re on the list! We&apos;ll email you with early access and launch offers.
        </p>
        <p className="mt-3 text-xs text-muted">
          Changed your mind?{" "}
          <Link href="/unsubscribe" className="text-cyan hover:underline">
            Unsubscribe
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-lg">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-full border border-line bg-ink/80 px-5 py-3.5 text-sm text-text placeholder:text-muted/70 focus:border-cyan/60 focus:outline-none"
        />
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
        />
        <button
          type="submit"
          disabled={status.state === "sending"}
          className="btn-primary rounded-full px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {status.state === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      {status.state === "error" && <p className="mt-3 text-center text-sm text-red-300">{status.message}</p>}
      <p className="mt-3 text-center text-xs text-muted">
        <Link href="/unsubscribe" className="text-cyan hover:underline">
          Unsubscribe
        </Link>{" "}
        anytime.
      </p>
    </form>
  );
}
