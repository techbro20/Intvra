import Image from "next/image";
import Link from "next/link";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Ai.Intvra home">
      <Image src="/logo.png" alt="" width={size} height={size} className="rounded-xl" priority />
      <span className="font-display text-xl font-bold tracking-tight">
        <span className="text-gradient">Ai.</span>
        <span className="text-text">Intvra</span>
      </span>
    </Link>
  );
}
