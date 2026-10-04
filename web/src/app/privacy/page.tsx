import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2, 2026">
      <p>Ai.Intvra is built to keep your interviews private. This policy explains what data is handled and why.</p>
      <h2>On your device</h2>
      <p>
        Your chat history and settings are stored locally on your computer. Only AI answers are saved to history — the
        interviewer&apos;s transcribed questions are not stored.
      </p>
      <h2>Audio and transcription</h2>
      <p>
        When listening is on, short clips of your computer&apos;s audio are sent to a speech-to-text provider to
        transcribe the interviewer, then discarded. Audio is never recorded or kept by Ai.Intvra.
      </p>
      <h2>AI answers</h2>
      <p>
        To generate an answer, the transcribed text (and any screenshot you choose to send) is passed to an AI model
        provider. If you use your own API key, requests go directly to your chosen provider under their privacy terms.
      </p>
      <h2>Accounts and billing</h2>
      <p>
        If you create an account, we store your email address and credit balance. Payments are processed by our payment
        provider; we never see or store your card details.
      </p>
      <h2>Analytics</h2>
      <p>The website may use privacy-friendly, cookie-less analytics to count visits. We do not sell your data.</p>
      <h2>Contact</h2>
      <p>
        To ask about or delete your data, email <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </LegalPage>
  );
}
