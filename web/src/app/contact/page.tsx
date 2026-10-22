import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { getLatestRelease } from "@/lib/release";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & support",
  description: "Report a bug or get help with Ai.Intvra.",
};

export const revalidate = 300;

export default async function ContactPage() {
  const release = await getLatestRelease();

  return (
    <>
      <Navbar downloadUrl={release.downloadUrl} />
      <main className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Support</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">How can we help?</h1>
          <p className="mt-4 text-muted">
            Found a bug, have a billing question, need help getting set up, or want your data deleted? Send us a message
            and we&apos;ll get back to you by email. For waitlist or newsletter emails, use{" "}
            <a href="/unsubscribe" className="text-cyan hover:underline">
              Unsubscribe
            </a>
            .
          </p>
          <div className="mt-8 rounded-2xl border border-line bg-panel/60 p-6">
            <h2 className="font-display font-semibold">Email us directly</h2>
            <a href={`mailto:${site.email}`} className="mt-2 inline-block text-cyan hover:underline">
              {site.email}
            </a>
            <p className="mt-3 text-sm text-muted">We usually reply within one business day.</p>
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-panel/60 p-6">
            <h2 className="font-display font-semibold">Reporting a bug?</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
              <li>What you were doing when it happened</li>
              <li>What you expected vs. what you saw</li>
              <li>Your app version and Windows version</li>
            </ul>
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-panel/60 p-6">
            <h2 className="font-display font-semibold">Delete my data</h2>
            <p className="mt-2 text-sm text-muted">
              Choose the topic &ldquo;Delete my data&rdquo; in the form. We&apos;ll confirm by email and remove your
              account data from our servers (billing records we must keep for tax or fraud may remain for a limited
              time).
            </p>
          </div>
        </div>
        <ContactForm />
      </main>
      <Footer />
    </>
  );
}
