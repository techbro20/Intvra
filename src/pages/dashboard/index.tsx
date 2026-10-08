import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components";
import { PageLayout } from "@/layouts";
import { useAuth } from "@/hooks/useAuth";
import { answersLeft, PLAN_LABELS, trialBlockedMessage } from "@/lib/cloud";
import { getShortcutsConfig } from "@/lib/storage/shortcuts.storage";
import { ShortcutKeycaps } from "@/pages/shortcuts/components/shortcuts/ShortcutKeycaps";
import { cn } from "@/lib/utils";
import {
  ArrowRightIcon,
  AudioLinesIcon,
  BracesIcon,
  CloudIcon,
  CodeIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  MessagesSquareIcon,
  ScanSearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

const STEPS = [
  {
    icon: AudioLinesIcon,
    title: "Turn on system audio",
    text: "Start listening before the call. Ai.Intvra hears the other side of the conversation, not your microphone.",
  },
  {
    icon: ScanSearchIcon,
    title: "Ask or capture",
    text: "Questions are picked up automatically. You can also type, use voice input, or capture your screen.",
  },
  {
    icon: SparklesIcon,
    title: "Read the answer live",
    text: "The answer streams into the overlay as it's written. A new question replaces the old answer straight away.",
  },
];

const SHORTCUT_IDS = [
  "system_audio",
  "screenshot",
  "audio_recording",
  "toggle_window",
  "toggle_dashboard",
] as const;

const SHORTCUT_LABELS: Record<(typeof SHORTCUT_IDS)[number], string> = {
  system_audio: "System audio",
  screenshot: "Capture screen",
  audio_recording: "Voice input",
  toggle_window: "Show / hide overlay",
  toggle_dashboard: "Open dashboard",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const state = useAuth();
  const user = state?.user;

  const shortcuts = useMemo(() => {
    const { bindings } = getShortcutsConfig();
    return SHORTCUT_IDS.map((id) => ({
      id,
      label: SHORTCUT_LABELS[id],
      key: bindings[id]?.enabled === false ? "" : bindings[id]?.key ?? "",
    }));
  }, []);

  const firstName = user?.name?.split(" ")[0];
  const planLabel = user?.isAdmin ? "Admin" : user ? PLAN_LABELS[user.plan] ?? user.plan : "";
  const answers = user ? answersLeft(user) : 0;
  const perAnswer = user?.creditsPerAnswer ?? 1;
  const lowCredits = !!user && !user.byok && answers <= 3;

  const quickLinks = [
    user?.byok
      ? { icon: CodeIcon, title: "Providers", text: "Manage the API keys and models you answer with.", href: "/dev-space" }
      : { icon: MessagesSquareIcon, title: "Chats", text: "Look back over past questions and answers.", href: "/chats" },
    { icon: MessageSquareTextIcon, title: "Responses", text: "Answer length, language and auto-scroll.", href: "/responses" },
    { icon: AudioLinesIcon, title: "Audio", text: "Pick the input and output devices to listen on.", href: "/audio" },
    { icon: BracesIcon, title: "Prompts", text: "Tell Ai.Intvra about your role, CV and style.", href: "/system-prompts" },
  ];

  return (
    <PageLayout
      title="Overview"
      description="Your account, how answering works, and the shortcuts you'll use most."
    >
      <section className="phantom-hero flex-col items-stretch gap-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {planLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-medium text-primary">
                {user?.isAdmin ? <ShieldCheckIcon className="size-3.5" /> : null}
                {planLabel}
              </span>
            ) : null}
            {state?.offline ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-400">
                Offline
              </span>
            ) : null}
          </div>
          <h2 className="!text-3xl md:!text-4xl">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h2>
          <p>
            {user?.byok
              ? "Answers are generated with your own API keys, so there's no credit limit. Keep your providers set up and you're ready for the next call."
              : `Answers are generated through Ai.Intvra Cloud. Each answer uses ${perAnswer === 1 ? "one credit" : `${perAnswer} credits on the free plan`}, and you don't need any API keys.`}
          </p>
        </div>

        <div className="relative w-full shrink-0 rounded-xl border border-border bg-black/20 p-4 md:w-64">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {user?.byok ? <KeyRoundIcon className="size-3.5" /> : <CloudIcon className="size-3.5" />}
            {user?.byok ? "Answer source" : "Answers left"}
          </div>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold",
              lowCredits ? "text-amber-400" : "text-foreground"
            )}
          >
            {user ? (user.byok ? "Your own keys" : answers) : "–"}
          </p>
          {user && !user.byok ? (
            <p className="text-xs text-muted-foreground">
              {user.trialBlocked && answers <= 0
                ? `${trialBlockedMessage(user)} Choose a plan to keep going.`
                : answers <= 0
                ? "You're out of credits."
                : `${user.credits} credit${user.credits === 1 ? "" : "s"} · ${perAnswer} per answer`}
            </p>
          ) : null}
          {user ? (
            user.byok ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => navigate("/dev-space")}
              >
                Manage providers
              </Button>
            ) : (
              <Button size="sm" className="mt-3 w-full" onClick={() => void openUrl(user.upgradeUrl)}>
                {answers <= 0 ? "Get more credits" : "Upgrade"}
              </Button>
            )
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card key={step.title} className="phantom-stat-card shadow-none">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="phantom-card-icon">
                <step.icon className="size-4" />
              </div>
              <CardTitle className="text-sm">
                <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
                {step.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground">
              {step.text}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="shadow-none xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Shortcuts</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("/shortcuts")}>
              Customize
              <ArrowRightIcon className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm">{shortcut.label}</span>
                <ShortcutKeycaps shortcutKey={shortcut.key} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-1">
          {quickLinks.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => navigate(link.href)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
            >
              <div className="phantom-card-icon shrink-0">
                <link.icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{link.title}</p>
                <p className="truncate text-xs text-muted-foreground">{link.text}</p>
              </div>
              <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
