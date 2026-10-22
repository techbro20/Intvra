import { NextResponse } from "next/server";
import { site } from "@/lib/site";

type Payload = {
  kind?: string;
  name?: string;
  email?: string;
  topic?: string;
  message?: string;
  website?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot field: real users never fill it in.
  if (body.website) return NextResponse.json({ ok: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  const kind =
    body.kind === "waitlist" ? "waitlist" : body.kind === "unsubscribe" ? "unsubscribe" : "contact";
  const email = clean(body.email, 200);
  const name = clean(body.name, 100);
  const topic = clean(body.topic, 50) || "General";
  const message = clean(body.message, 5000);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (kind === "contact" && message.length < 10) {
    return NextResponse.json({ error: "Please describe the issue in a bit more detail." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set; cannot deliver form submission.");
    return NextResponse.json(
      { error: `Our form is temporarily unavailable. Please email ${site.email}.` },
      { status: 503 },
    );
  }

  let subject: string;
  let text: string;
  if (kind === "waitlist") {
    subject = `Waitlist signup: ${email}`;
    text = `New waitlist signup\n\nEmail: ${email}\nIP: ${ip}\nTime: ${new Date().toISOString()}`;
  } else if (kind === "unsubscribe") {
    subject = `Unsubscribe request: ${email}`;
    text = `Please remove this address from the waitlist and any marketing / newsletter emails.\n\nEmail: ${email}\nNote: ${message || "-"}\nIP: ${ip}\nTime: ${new Date().toISOString()}`;
  } else {
    subject = `[${topic}] ${name ? `${name} — ` : ""}${email}`;
    text = `New ${topic} message\n\nName: ${name || "-"}\nEmail: ${email}\nTopic: ${topic}\n\n${message}\n\n---\nIP: ${ip}\nTime: ${new Date().toISOString()}`;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || "Ai.Intvra <noreply@intvra.com>",
      to: [process.env.CONTACT_TO || site.email],
      reply_to: email,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return NextResponse.json(
      { error: `Something went wrong. Please email ${site.email}.` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
