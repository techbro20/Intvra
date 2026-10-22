import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getLatestRelease } from "@/lib/release";

export const metadata: Metadata = {
  title: "How to use the overlay",
  description:
    "Learn every Ai.Intvra overlay icon: listen to the interviewer, ask questions, capture the screen, and read live answers.",
};

export const revalidate = 300;

type IconProps = { className?: string };

function IconBox({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-ink/80 text-cyan"
      aria-hidden
      title={label}
    >
      {children}
    </div>
  );
}

function HeadphonesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M3 14v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Zm14 0v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2Z" />
      <path d="M5 12a7 7 0 0 1 14 0" />
    </svg>
  );
}
function MicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
    </svg>
  );
}
function ScanIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}
function ImagePlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21M16 5h6M19 2v6" />
    </svg>
  );
}
function PanelsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}
function GripIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}
function BrainIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 5a3 3 0 0 0-3 3v1H8a3 3 0 0 0 0 6h1v1a3 3 0 0 0 6 0v-1h1a3 3 0 0 0 0-6h-1V8a3 3 0 0 0-3-3Z" />
      <path d="M9 12h6" />
    </svg>
  );
}
function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M12 17v5M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76l1.9 1.9A1 1 0 0 1 16.2 15H7.8a1 1 0 0 1-.7-1.7L9 10.76Z" />
    </svg>
  );
}
function CopyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function SendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const COMMAND_BAR = [
  {
    name: "Move overlay",
    shortcut: "Ctrl + arrow keys",
    Icon: GripIcon,
    use: "Drag the grip (or hold Ctrl and use the arrow keys) to place the bar where it won’t cover your call.",
  },
  {
    name: "Ask anything…",
    shortcut: "Enter to send · Ctrl+Shift+I to focus",
    Icon: null,
    use: "Type a question or follow-up and press Enter. Animated dots mean the AI is writing an answer.",
  },
  {
    name: "Voice input",
    shortcut: "Ctrl+Shift+A",
    Icon: MicIcon,
    use: "Speak your own question into the microphone. This is separate from listening to the interviewer.",
  },
  {
    name: "Capture screen",
    shortcut: "Ctrl+Enter",
    Icon: ScanIcon,
    use: "Grab what’s on screen (coding problem, slide, form) so the answer can use that context. Mode is set under Dashboard → Screenshot.",
  },
  {
    name: "Attach image",
    shortcut: "—",
    Icon: ImagePlusIcon,
    use: "Attach a picture when your AI model supports images. Useful for screenshots you’ve already saved.",
  },
  {
    name: "System audio",
    shortcut: "Ctrl+Shift+M",
    Icon: HeadphonesIcon,
    use: "Start or stop listening to what your PC plays (the interviewer). Pulsing means it’s on. Turn this on before the call.",
  },
  {
    name: "Open dashboard",
    shortcut: "Ctrl+Shift+D",
    Icon: PanelsIcon,
    use: "Opens the full app: account, chats, audio devices, prompts, shortcuts, and settings.",
  },
];

const RESPONSE_PANEL = [
  {
    name: "Move response",
    Icon: GripIcon,
    use: "Drag the answer panel so it stays readable during the call.",
  },
  {
    name: "AI Response",
    Icon: BrainIcon,
    use: "The live answer streams here. Status chips show Listening, Transcribing, AI Responding, Ready, or Error.",
  },
  {
    name: "Keep panel open",
    Icon: PinIcon,
    use: "Pin the panel so it stays open for follow-ups instead of closing after each answer.",
  },
  {
    name: "Copy response",
    Icon: CopyIcon,
    use: "Copy the answer to your clipboard if you want to paste it somewhere else.",
  },
  {
    name: "Close / cancel",
    Icon: CloseIcon,
    use: "Close the panel, or cancel while an answer is still generating.",
  },
  {
    name: "Send follow-up",
    Icon: SendIcon,
    use: "Ask a related question in the same conversation without starting over.",
  },
];

const SHORTCUTS = [
  ["Show / hide overlay", "Ctrl+\\"],
  ["System audio (listen)", "Ctrl+Shift+M"],
  ["Voice input", "Ctrl+Shift+A"],
  ["Capture screen", "Ctrl+Enter"],
  ["Open dashboard", "Ctrl+Shift+D"],
  ["Focus ask box", "Ctrl+Shift+I"],
];

export default async function GuidePage() {
  const release = await getLatestRelease();

  return (
    <>
      <Navbar downloadUrl={release.downloadUrl} />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Help</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">How to use the overlay</h1>
        <p className="mt-4 text-muted">
          The thin bar floats above your interview apps. Each icon has one job — listen, ask, capture, or open settings.
          On Windows it is designed to stay off screen share. Use it responsibly and follow the rules of your interview.
        </p>

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold">Quick start</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-muted">
            <li>Download the app, sign in, and leave the overlay visible.</li>
            <li>
              Click the <span className="text-text">headphones</span> icon (or press{" "}
              <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs text-text">Ctrl+Shift+M</kbd>)
              to start listening <em>before</em> the call.
            </li>
            <li>When the interviewer speaks, an answer streams into the AI Response panel.</li>
            <li>
              Or type in <span className="text-text">Ask anything…</span> and press Enter for a manual question.
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted">
            System audio hears what your PC plays — not your mic. Use Voice input when you want to speak a question
            yourself. Listening is free; you spend credits when an answer is generated.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold">Command bar icons</h2>
          <p className="mt-2 text-sm text-muted">Left to right on the main overlay strip.</p>
          <ul className="mt-6 flex flex-col gap-4">
            {COMMAND_BAR.map((item) => (
              <li
                key={item.name}
                className="flex gap-4 rounded-2xl border border-line bg-panel/50 p-4"
              >
                {item.Icon ? (
                  <IconBox label={item.name}>
                    <item.Icon className="h-5 w-5" />
                  </IconBox>
                ) : (
                  <div className="flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl border border-dashed border-line px-2 text-[10px] font-medium text-muted">
                    Type
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-display font-semibold text-text">{item.name}</h3>
                    <span className="text-xs text-muted">{item.shortcut}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{item.use}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Hide or show the whole overlay with{" "}
            <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs text-text">Ctrl+\</kbd>. Change
            shortcuts anytime in Dashboard → Shortcuts.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold">Answer panel icons</h2>
          <p className="mt-2 text-sm text-muted">Appears when an answer is generating or ready.</p>
          <ul className="mt-6 flex flex-col gap-4">
            {RESPONSE_PANEL.map((item) => (
              <li
                key={item.name}
                className="flex gap-4 rounded-2xl border border-line bg-panel/50 p-4"
              >
                <IconBox label={item.name}>
                  <item.Icon className="h-5 w-5" />
                </IconBox>
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-text">{item.name}</h3>
                  <p className="mt-1 text-sm text-muted">{item.use}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold">Default shortcuts (Windows)</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="border-b border-line bg-panel/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Keys</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {SHORTCUTS.map(([action, keys]) => (
                  <tr key={action} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 text-text">{action}</td>
                    <td className="px-4 py-3 font-mono text-xs text-cyan">{keys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold">Tips</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
            <li>Start headphones before joining Zoom, Teams, Meet, or a browser interviewer.</li>
            <li>If a Bluetooth headset goes quiet, pick its stereo output in Dashboard → Audio.</li>
            <li>Dashboard → Prompts lets you add your role, CV, and answer style.</li>
            <li>Low on credits? Upgrade from the app or the Pricing section on the site.</li>
          </ul>
        </section>

        <p className="mt-12 text-sm text-muted">
          Still stuck?{" "}
          <Link href="/contact" className="text-cyan hover:underline">
            Contact support
          </Link>{" "}
          or see{" "}
          <Link href="/#faq" className="text-cyan hover:underline">
            FAQ
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
