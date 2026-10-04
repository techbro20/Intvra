"use client";

import { useEffect, useState } from "react";

const script = [
  {
    heard: "Tell me about a time you handled a difficult deadline.",
    answer:
      "Sure. In my last role we had two weeks to ship a payments integration that was scoped for six. I split it into a must-have core, negotiated the extras into a second release, and paired daily with QA so nothing slipped. We launched on time and the follow-up shipped a week later.",
  },
  {
    heard: "Why do you want to work here?",
    answer:
      "Honestly, it's the product. I've used it for a year, and the way your team ships small, focused improvements every week is exactly how I like to work. I want to help build the next set of features, not just maintain them.",
  },
];

type Phase = "listening" | "thinking" | "streaming" | "done";

export function OverlayDemo() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("listening");
  const [shown, setShown] = useState(0);
  const answer = script[index].answer;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("done");
      setShown(answer.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    if (phase === "listening") timer = setTimeout(() => setPhase("thinking"), 2200);
    else if (phase === "thinking") timer = setTimeout(() => setPhase("streaming"), 900);
    else if (phase === "streaming") {
      if (shown < answer.length) timer = setTimeout(() => setShown((n) => Math.min(n + 3, answer.length)), 28);
      else setPhase("done");
    } else {
      timer = setTimeout(() => {
        setIndex((i) => (i + 1) % script.length);
        setShown(0);
        setPhase("listening");
      }, 4000);
    }
    return () => clearTimeout(timer);
  }, [phase, shown, answer.length]);

  const status =
    phase === "listening"
      ? { label: "Listening", color: "bg-cyan" }
      : phase === "thinking"
        ? { label: "Thinking", color: "bg-amber-400" }
        : phase === "streaming"
          ? { label: "Answering", color: "bg-electric" }
          : { label: "Ready", color: "bg-emerald-400" };

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 -z-10 rounded-[2rem] bg-electric/20 blur-3xl" />

      {/* Fake call window behind the overlay */}
      <div className="glow-border overflow-hidden rounded-2xl bg-panel/80">
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-xs text-muted">Video call — Interview</span>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="flex aspect-video items-center justify-center rounded-xl bg-panel-2">
            <div className="relative">
              {phase === "listening" && (
                <span className="pulse-ring absolute inset-0 rounded-full border-2 border-cyan" />
              )}
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-electric to-cyan font-display font-bold text-white">
                IV
              </div>
            </div>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-xl bg-panel-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-line font-display font-bold text-muted">
              You
            </div>
          </div>
        </div>

        <p className="px-4 pb-4 text-center text-xs italic text-muted">
          Interviewer: &ldquo;{script[index].heard}&rdquo;
        </p>
      </div>

      {/* The private overlay */}
      <div className="glow-border relative -mt-10 ml-6 mr-2 rounded-2xl bg-ink/95 p-4 backdrop-blur sm:-mr-4 sm:ml-16">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs font-semibold tracking-wide text-muted">
            Ai.Intvra · only visible to you
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-[11px] font-medium text-text">
            <span className={`h-1.5 w-1.5 rounded-full ${status.color}`} />
            {status.label}
          </span>
        </div>
        <p className="min-h-[6.5rem] text-sm leading-relaxed text-text">
          {phase === "listening" || phase === "thinking" ? (
            <span className="text-muted">
              {phase === "listening" ? "Listening to the interviewer…" : "Writing your answer…"}
            </span>
          ) : (
            <span className={phase === "streaming" ? "caret" : ""}>{answer.slice(0, shown)}</span>
          )}
        </p>
      </div>
    </div>
  );
}
