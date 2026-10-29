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
        If you create an account, we store your email address and credit balance. To allow one free trial per computer,
        the app also sends a one-way hash of your computer&apos;s device ID; it can&apos;t be used to identify you or
        your hardware. We also keep a one-way hash of the network address used when a free trial is claimed, to limit
        how many trials one network can receive. For crypto payments we store the transaction ID you submit, which is
        public on the blockchain. Card, M-Pesa and Apple Pay payments are processed by our payment
        provider; we never see or store your card details.
      </p>
      <h2>Analytics</h2>
      <p>
        The website uses Google Analytics to understand how visitors use the site. Google Analytics sets cookies and
        collects usage data such as pages visited and approximate location, subject to Google&apos;s privacy policy. We
        do not sell your data.
      </p>
      <h2>Contact and deletion</h2>
      <p>
        To ask about your data or request deletion, use the{" "}
        <a href="/contact">Contact</a> form and choose &ldquo;Delete my data,&rdquo; or email{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a>. To leave the waitlist or stop marketing emails, use{" "}
        <a href="/unsubscribe">Unsubscribe</a>.
      </p>
    </LegalPage>
  );
}
