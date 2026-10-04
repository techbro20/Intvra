"use client";

import { useState } from "react";
import { submitForm, type FormStatus } from "@/lib/submit-form";

const topics = ["Bug report", "Billing", "Account", "Feature request", "Other"];

const field =
  "w-full rounded-xl border border-line bg-ink/80 px-4 py-3 text-sm text-text placeholder:text-muted/70 focus:border-cyan/60 focus:outline-none";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", topic: topics[0], message: "", website: "" });
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ state: "sending" });
    const result = await submitForm({ kind: "contact", ...form });
    setStatus(result);
    if (result.state === "sent") setForm((f) => ({ ...f, message: "" }));
  }

  if (status.state === "sent") {
    return (
      <div className="glow-border rounded-2xl bg-panel p-8 text-center">
        <h2 className="font-display text-xl font-semibold">Thanks — we got your message.</h2>
        <p className="mt-2 text-sm text-muted">We usually reply within one business day, to the email you provided.</p>
        <button
          type="button"
          onClick={() => setStatus({ state: "idle" })}
          className="mt-6 rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-cyan/50"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="glow-border flex flex-col gap-5 rounded-2xl bg-panel p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Name
          <input type="text" autoComplete="name" placeholder="Your name" value={form.name} onChange={update("name")} className={field} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email <span className="sr-only">(required)</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={update("email")}
            className={field}
          />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Topic
        <select value={form.topic} onChange={update("topic")} className={field}>
          {topics.map((t) => (
            <option key={t} value={t} className="bg-panel">
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Message
        <textarea
          required
          minLength={10}
          rows={6}
          placeholder="What happened? For bugs, include what you expected, what you saw, and your app version."
          value={form.message}
          onChange={update("message")}
          className={`${field} resize-y`}
        />
      </label>
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={form.website}
        onChange={update("website")}
        className="hidden"
      />
      {status.state === "error" && <p className="text-sm text-red-300">{status.message}</p>}
      <button
        type="submit"
        disabled={status.state === "sending"}
        className="btn-primary self-start rounded-full px-7 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {status.state === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
