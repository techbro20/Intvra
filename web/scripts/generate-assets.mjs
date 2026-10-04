// Builds the landing-page images from public/banner.jpg and the app icon.
// Uses sharp from the root project: run with `node web/scripts/generate-assets.mjs`.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(webDir, "..");
const sharp = createRequire(path.join(rootDir, "package.json"))("sharp");

const pub = path.join(webDir, "public");
const banner = path.join(pub, "banner.jpg");
const appIcon = path.join(rootDir, "build", "icon.png");

const meta = await sharp(banner).metadata();

await sharp(banner)
  .resize(1200, 630, { fit: "cover", position: "center" })
  .jpeg({ quality: 88 })
  .toFile(path.join(pub, "og-image.jpg"));

// Crop coordinates are relative to a 1024px-wide banner.
const scale = meta.width / 1024;
await sharp(banner)
  .extract({
    left: Math.round(40 * scale),
    top: Math.round(90 * scale),
    width: Math.round(372 * scale),
    height: Math.round(372 * scale),
  })
  .resize(800)
  .webp({ quality: 90 })
  .toFile(path.join(pub, "robot.webp"));

fs.copyFileSync(appIcon, path.join(pub, "logo.png"));
await sharp(appIcon).resize(512).png().toFile(path.join(pub, "icon.png"));
await sharp(appIcon).resize(180).png().toFile(path.join(pub, "apple-icon.png"));

console.log("assets written to", pub);
