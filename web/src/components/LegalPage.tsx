import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { site } from "@/lib/site";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar downloadUrl={site.releases} />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-10 flex flex-col gap-6 leading-relaxed text-muted [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text [&_a]:text-cyan">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
