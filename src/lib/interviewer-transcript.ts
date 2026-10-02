type TranscriptEntry = {
  text: string;
  at: number;
};

export const INTERVIEWER_SPEECH_EVENT = "interviewer-speech";

const MAX_AGE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 12;

let entries: TranscriptEntry[] = [];

function pruneEntries(now = Date.now()) {
  entries = entries
    .filter((entry) => now - entry.at <= MAX_AGE_MS)
    .slice(-MAX_ENTRIES);
}

export function addInterviewerTranscript(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  entries.push({ text: trimmed, at: Date.now() });
  pruneEntries();
}

export function clearInterviewerTranscript() {
  entries = [];
}

export function getRecentInterviewerTranscript(): string {
  pruneEntries();
  return entries.map((entry) => entry.text).join("\n");
}

export function withInterviewerContext(systemPrompt?: string) {
  const transcript = getRecentInterviewerTranscript();
  if (!transcript) return systemPrompt || undefined;

  const context = [
    "Recent speech captured from the other party on the call (the interviewer), oldest first:",
    '"""',
    transcript,
    '"""',
    "If the user asks what to say or how to answer, respond to the interviewer's most recent question above as the candidate would.",
  ].join("\n");

  return systemPrompt ? `${systemPrompt}\n\n${context}` : context;
}
