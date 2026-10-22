import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { UnsubscribeForm } from "@/components/UnsubscribeForm";
import { getLatestRelease } from "@/lib/release";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Leave the Ai.Intvra waitlist and stop marketing emails.",
  robots: { index: false, follow: false },
};

export const revalidate = 300;

export default async function UnsubscribePage() {
  const release = await getLatestRelease();

  return (
    <>
      <Navbar downloadUrl={release.downloadUrl} />
      <main className="mx-auto grid max-w-3xl gap-10 px-5 py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan">Email preferences</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Unsubscribe</h1>
          <p className="mt-4 text-muted">
            Enter the email you used for the waitlist or newsletter. We&apos;ll stop marketing and launch emails to that
            address. To delete your account data instead, use{" "}
            <Link href="/contact" className="text-cyan hover:underline">
              Contact
            </Link>{" "}
            and choose &ldquo;Delete my data,&rdquo; or email{" "}
            <a href={`mailto:${site.email}`} className="text-cyan hover:underline">
              {site.email}
            </a>
            .
          </p>
        </div>
        <UnsubscribeForm />
      </main>
      <Footer />
    </>
  );
}
