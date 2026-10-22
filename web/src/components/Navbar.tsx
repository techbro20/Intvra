import Link from "next/link";
import { Logo } from "./Logo";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/guide", label: "Guide" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function Navbar({ downloadUrl }: { downloadUrl: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-ink/75 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-text">
              {l.label}
            </Link>
          ))}
        </div>
        <a
          href={downloadUrl}
          className="btn-primary rounded-full px-4 py-2 text-sm font-semibold text-white"
        >
          Download
        </a>
      </nav>
    </header>
  );
}
