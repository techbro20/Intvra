const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function findRcedit(projectDir) {
  const candidates = [
    path.join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe"),
    path.join(projectDir, "node_modules", "app-builder-lib", "templates", "nsis", "rcedit.exe"),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

/** Embed build/icon.ico into the Windows exe when electron-builder skips rcedit. */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const exePath = path.join(context.appOutDir, "AiIntvra.exe");
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  const rcedit = findRcedit(context.packager.projectDir);

  if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
    console.warn(`[after-pack] skip icon embed (missing exe or icon)`);
    return;
  }
  if (!rcedit) {
    console.warn("[after-pack] rcedit.exe not found; exe icon unchanged");
    return;
  }

  execFileSync(rcedit, [exePath, "--set-icon", iconPath], { stdio: "inherit" });
  console.log("[after-pack] embedded icon into AiIntvra.exe");
};
