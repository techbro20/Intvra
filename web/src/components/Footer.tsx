import Link from "next/link";
import { site } from "@/lib/site";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo size={32} />
          <p className="mt-3 text-sm text-muted">{site.tagline}. Made for Windows.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold">Product</span>
            <Link href="/#features" className="text-muted hover:text-text">Features</Link>
            <Link href="/#pricing" className="text-muted hover:text-text">Pricing</Link>
            <Link href="/#faq" className="text-muted hover:text-text">FAQ</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold">Legal</span>
            <Link href="/terms" className="text-muted hover:text-text">Terms</Link>
            <Link href="/privacy" className="text-muted hover:text-text">Privacy</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-display font-semibold">Contact</span>
            <Link href="/contact" className="text-muted hover:text-text">Report a bug</Link>
            <Link href="/#waitlist" className="text-muted hover:text-text">Join the waitlist</Link>
            <Link href="/unsubscribe" className="text-muted hover:text-text">Unsubscribe</Link>
            <a href={`mailto:${site.email}`} className="text-muted hover:text-text">{site.email}</a>
          </div>
        </div>
      </div>
      <div className="border-t border-line/60 py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} Ai.Intvra. All rights reserved.
      </div>
    </footer>
  );
}
