import { site } from "./site";

export type LatestRelease = {
  version: string | null;
  downloadUrl: string;
  sizeMb: number | null;
  publishedAt: string | null;
};

type GithubAsset = { name: string; browser_download_url: string; size: number };
type GithubRelease = { tag_name: string; published_at: string; assets: GithubAsset[] };

const fallback: LatestRelease = {
  version: null,
  downloadUrl: site.releases,
  sizeMb: null,
  publishedAt: null,
};

export async function getLatestRelease(): Promise<LatestRelease> {
  try {
    const res = await fetch(site.githubApi, {
      headers: { Accept: "application/vnd.github+json" },
      // 5 minutes: new releases show on the download buttons without a long wait.
      next: { revalidate: 300 },
    });
    if (!res.ok) return fallback;

    const release = (await res.json()) as GithubRelease;
    const installer =
      release.assets.find((a) => /setup.*\.exe$/i.test(a.name)) ??
      release.assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
    if (!installer) return { ...fallback, version: release.tag_name };

    return {
      version: release.tag_name,
      downloadUrl: installer.browser_download_url,
      sizeMb: Math.round((installer.size / 1024 / 1024) * 10) / 10,
      publishedAt: release.published_at,
    };
  } catch {
    return fallback;
  }
}
