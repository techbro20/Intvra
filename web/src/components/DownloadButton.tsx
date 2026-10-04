"use client";

import { useEffect, useState } from "react";
import type { LatestRelease } from "@/lib/release";

function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M3 5.5 10.5 4.5v7H3v-6Zm0 13 7.5 1v-7H3v6Zm8.5 1.1L21 21V12.5h-9.5v7.1Zm0-15.2v7.1H21V3l-9.5 1.4Z" />
    </svg>
  );
}

export function DownloadButton({ release }: { release: LatestRelease }) {
  const [isWindows, setIsWindows] = useState(true);

  useEffect(() => {
    setIsWindows(/windows/i.test(navigator.userAgent));
  }, []);

  const meta = [release.version, release.sizeMb ? `${release.sizeMb} MB` : null, "Windows 10/11"]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <a
        href={release.downloadUrl}
        className="btn-primary inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-base font-semibold text-white"
      >
        <WindowsIcon />
        Download for Windows
      </a>
      <p className="text-xs text-muted">
        {isWindows ? meta : "Windows only for now — macOS is on the roadmap."}
      </p>
    </div>
  );
}
