import Image from "next/image";
import { DownloadButton } from "@/components/DownloadButton";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { OverlayDemo } from "@/components/OverlayDemo";
import { Pricing } from "@/components/Pricing";
import { WaitlistForm } from "@/components/WaitlistForm";
import { getLatestRelease } from "@/lib/release";
import { site } from "@/lib/site";

const steps = [
  {
    title: "Download & open",
    body: "Install Ai.Intvra on Windows. It sits as a small, translucent bar on top of your screen.",
  },
  {
    title: "Join your call",
    body: "Zoom, Teams, Meet or an AI interviewer — hit the headphones button and Ai.Intvra listens to your computer audio.",
  },
  {
    title: "Read your answer",
    body: "When the interviewer stops talking, a ready-to-say answer streams into a private window only you can see.",
  },
];

const features = [
  {
    title: "Hands-free answers",
    body: "No typing, no toggling. Each question is detected automatically and answered in seconds.",
    icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3",
  },
  {
    title: "Invisible on screen share",
    body: "The overlay is protected from screen capture, so it never shows up in the recording or the shared screen.",
    icon: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 0 0 4.4-1.1",
  },
  {
    title: "Answers in your voice",
    body: "First-person, natural replies ready to speak aloud — not robotic essays you have to rewrite.",
    icon: "M8 10h8M8 14h5M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12Z",
  },
  {
    title: "Reads your screen",
    body: "Snap a coding question or a slide and get the solution explained, right in the overlay.",
    icon: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 12h8",
  },
  {
    title: "Remembers the context",
    body: "Follow-up questions use what the interviewer already said, so answers stay consistent.",
    icon: "M12 8v4l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
  },
  {
    title: "Private by design",
    body: "Your chats stay on your machine. Only the answers are saved — never the interviewer's questions.",
    icon: "M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z",
  },
];

const faqs = [
  {
    q: "What is a credit?",
    a: "On paid plans, one credit is one AI answer. On the free plan each answer uses 2 credits, so your 20 free credits cover 10 answers. Listening and transcribing the interviewer is always free — you only spend credits when an answer is generated. A typical 30-minute interview uses around 10–20 answers.",
  },
  {
    q: "Can the interviewer see Ai.Intvra?",
    a: "The overlay window is protected from screen capture on Windows, so it does not appear when you share your screen or record it. As always, use it responsibly and follow the rules of the process you're in.",
  },
  {
    q: "Does it work with headphones?",
    a: "Yes. Ai.Intvra captures the audio your computer plays, so wired and USB headsets work out of the box. Some Bluetooth headsets switch to a 'hands-free' mode during calls — pick the stereo output if answers stop arriving.",
  },
  {
    q: "Which apps does it work with?",
    a: "Anything that plays audio on your PC: Zoom, Microsoft Teams, Google Meet, Slack huddles, browser-based AI interviewers and more.",
  },
  {
    q: "Can I use my own API key?",
    a: "Yes. With the one-time $200 Lifetime plan you use your own Groq, OpenAI or other compatible key with no credit limits — you pay your AI provider directly.",
  },
  {
    q: "How do I sign up and pay?",
    a: "Download the app and create your account — you can sign in with Google or email. You start with 20 free credits. When you need more, upgrade from your account page in the browser: pay as you go, subscribe to Pro, or buy Lifetime. Card payments are supported, with M-Pesa coming soon.",
  },
  {
    q: "Is macOS supported?",
    a: "Windows 10 and 11 are supported today. macOS is on the roadmap — join the waitlist to hear first.",
  },
  {
    q: "I found a bug. How do I get help?",
    a: "Use the contact form on our Contact page or email support@intvra.com. Tell us what you were doing, what you expected, and what happened, and we'll get back to you by email.",
  },
];

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-muted">{sub}</p>}
    </div>
  );
}

export default async function Home() {
  const release = await getLatestRelease();

  return (
    <>
      <Navbar downloadUrl={release.downloadUrl} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-electric/25 blur-[120px]" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div className="text-center sm:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-panel/70 px-3 py-1 text-xs font-medium text-cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
                {release.version ? `New: ${release.version} for Windows` : "Now available for Windows"}
              </span>
              <h1 className="mt-6 font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Your <span className="text-gradient">invisible</span> AI interview assistant.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted">
                Ai.Intvra listens to the interviewer and streams the perfect answer into a private overlay —
                hands-free, in real time, and hidden from screen share.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <DownloadButton release={release} />
                <a
                  href="#demo"
                  className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3.5 text-base font-semibold text-text transition-colors hover:border-cyan/50"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7L8 5Z" />
                  </svg>
                  See it in action
                </a>
              </div>
              <p className="mt-6 text-sm text-muted">
                <span className="text-text">10 free answers</span> on sign-up · No card required
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute inset-6 -z-10 rounded-full bg-cyan/20 blur-3xl" />
              <Image
                src="/robot.webp"
                alt="Ai.Intvra robot assistant wearing a headset"
                width={800}
                height={800}
                priority
                className="animate-float rounded-[2rem] [mask-image:radial-gradient(circle,black_55%,transparent_75%)]"
              />
            </div>
          </div>
        </section>

        {/* Demo */}
        <section id="demo" className="scroll-mt-20 overflow-x-clip px-5 py-20">
          <SectionHeading
            eyebrow="Live demo"
            title="They ask. You answer. Effortlessly."
            sub="Ai.Intvra hears the question from your call audio and writes your reply as it's spoken."
          />
          <OverlayDemo />
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 px-5 py-20">
          <SectionHeading eyebrow="How it works" title="Set up in under a minute" />
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-line bg-panel/60 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-electric to-cyan font-display font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 px-5 py-20">
          <SectionHeading
            eyebrow="Features"
            title="Everything you need in the moment"
            sub="Built for live interviews, where every second counts."
          />
          <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-line bg-panel/60 p-6 transition-colors hover:border-cyan/40"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan/25 bg-electric/10 text-cyan">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={f.icon} />
                  </svg>
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 px-5 py-20">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple credits. No surprises."
            sub="1 credit = 1 AI answer on paid plans. Listening is always free."
          />
          <div className="mx-auto max-w-6xl">
            <Pricing downloadUrl={release.downloadUrl} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 px-5 py-20">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-panel/60 px-6 py-4 open:border-cyan/30">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-display font-semibold">
                  {f.q}
                  <span className="faq-icon text-2xl leading-none text-cyan transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Waitlist */}
        <section id="waitlist" className="scroll-mt-20 px-5 py-20">
          <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-panel/60 px-6 py-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Waitlist</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Be first in line</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Join the waitlist for early access to new features, the macOS version, and launch discounts.
            </p>
            <div className="mt-8">
              <WaitlistForm />
            </div>
            <p className="mt-4 text-xs text-muted">No spam. Unsubscribe anytime.</p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-5 py-20">
          <div className="glow-border relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-panel">
            <Image
              src="/banner.jpg"
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover opacity-30"
            />
            <div className="relative flex flex-col items-center px-6 py-16 text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Walk into your next interview <span className="text-gradient">ready</span>.
              </h2>
              <p className="mt-4 max-w-xl text-muted">
                Download Ai.Intvra free and get 10 answers to try it on a real call.
              </p>
              <div className="mt-8">
                <DownloadButton release={release} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

export const revalidate = 3600;

export const metadata = {
  alternates: { canonical: site.url },
};
