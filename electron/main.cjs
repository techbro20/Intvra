const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
  Tray,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Blob } = require("node:buffer");
const initSqlJs = require("sql.js");
const { createAuth } = require("./auth.cjs");

// Must run before app "ready": userData decides where settings, saved keys,
// and the chat database live. Older installs used earlier product folder names.
const USER_DATA_DIR = path.join(app.getPath("appData"), "Ai.Intvra");
const LEGACY_USER_DATA_DIR_NAMES = ["PruvoAI", "Phantom", "phantom"];

function migrateLegacyUserData() {
  if (fs.existsSync(USER_DATA_DIR)) return;
  const legacyDir = LEGACY_USER_DATA_DIR_NAMES
    .map((name) => path.join(app.getPath("appData"), name))
    .find((dir) => fs.existsSync(dir));
  if (!legacyDir) return;
  try {
    fs.cpSync(legacyDir, USER_DATA_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to migrate legacy user data:", error);
  }
}

migrateLegacyUserData();
app.setPath("userData", USER_DATA_DIR);

const DEV_URL = process.env.PHANTOM_DEV_URL || "http://127.0.0.1:1420";
const TOP_OFFSET = 54;
const MAIN_WINDOW_WIDTH = 560;
const MAIN_WINDOW_COLLAPSED_HEIGHT = 52;
const MAIN_WINDOW_EXPANDED_FALLBACK_HEIGHT = 720;
const RESPONSE_WINDOW_MAX_HEIGHT = 560;
const OVERLAY_SCALE_MIN = 0.85;
const OVERLAY_SCALE_MAX = 1.25;
const OVERLAY_SCALE_STEP = 0.05;
const ALWAYS_ON_TOP_LEVEL = "screen-saver";
const ALWAYS_ON_TOP_RELATIVE_LEVEL = 1;
const PROVIDER_API_KEY_VAULT_STORAGE_KEY = "provider_api_key_vault";
const DEFAULT_DISPLAY_SETTINGS = {
  overlayDisplayId: null,
  captureDisplayIds: [],
};

let mainWindow;
let dashboardWindow;
let responseWindow;
let responseWindowLoadPending = false;
let tray;
let lastResponseWindowState = null;
let alwaysOnTopEnabled = false;
let zOrderReassertTimer = null;
let sqlPromise;
let sqlDb;
let registeredShortcuts = new Map();
let captureImages = new Map();
let secureStorageCache;
let activeHttpRequests = new Map();
let ocrWorkerPromise = null;
let ocrQueue = Promise.resolve();
let auth;
const sessionModelCooldowns = new Map();
const DB_FILE_NAME = "phantom.db";
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function isDev() {
  return !app.isPackaged;
}

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function getAppIcon() {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconPath = path.join(app.getAppPath(), "build", iconFile);
  if (!fs.existsSync(iconPath)) return undefined;
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

function getTrayIcon() {
  const iconPath = path.join(app.getAppPath(), "build", "icon.ico");
  const fallbackPath = path.join(app.getAppPath(), "build", "icon.png");
  const candidatePath = fs.existsSync(iconPath) ? iconPath : fallbackPath;
  if (!fs.existsSync(candidatePath)) return undefined;
  const icon = nativeImage.createFromPath(candidatePath);
  return icon.isEmpty() ? undefined : icon;
}

function getIndexUrl(route = "/") {
  if (isDev()) {
    return `${DEV_URL}/#${route}`;
  }
  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  return `file://${indexPath.replace(/\\/g, "/")}#${route}`;
}

function sendToWindow(win, event, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("phantom:event", { event, payload });
  }
}

function normalizeCooldownPart(value) {
  return String(value || "").trim().toLowerCase();
}

function getCooldownKey(args = {}) {
  const providerId = normalizeCooldownPart(args.providerId || args.provider_id);
  const keyProfileId = normalizeCooldownPart(args.keyProfileId || args.key_profile_id);
  const model = normalizeCooldownPart(args.model);
  if (!providerId || !keyProfileId || !model) return "";
  return `${providerId}::${keyProfileId}::${model}`;
}

function cleanupExpiredModelCooldowns(now = Date.now()) {
  for (const [key, cooldown] of sessionModelCooldowns.entries()) {
    if (Number(cooldown.expiresAt || 0) <= now) {
      sessionModelCooldowns.delete(key);
    }
  }
}

function getSessionModelCooldowns() {
  cleanupExpiredModelCooldowns();
  return Array.from(sessionModelCooldowns.values()).sort(
    (a, b) => Number(a.expiresAt || 0) - Number(b.expiresAt || 0)
  );
}

function markSessionModelCooldown(args = {}) {
  const key = getCooldownKey(args);
  const expiresAt = Number(args.expiresAt || args.expires_at || 0);
  if (!key || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return getSessionModelCooldowns();
  }

  sessionModelCooldowns.set(key, {
    providerId: String(args.providerId || args.provider_id || ""),
    keyProfileId: String(args.keyProfileId || args.key_profile_id || ""),
    keyName: String(args.keyName || args.key_name || "saved key"),
    model: String(args.model || ""),
    reason: String(args.reason || "quota"),
    blockedAt: Number(args.blockedAt || args.blocked_at || Date.now()),
    expiresAt,
  });
  return getSessionModelCooldowns();
}

function clearSessionModelCooldown(args = {}) {
  const key = getCooldownKey(args);
  if (key) {
    sessionModelCooldowns.delete(key);
  }
  return getSessionModelCooldowns();
}

function clearAllSessionModelCooldowns() {
  sessionModelCooldowns.clear();
  emitToAll("session-model-cooldowns-cleared", {});
  return [];
}

function quitPhantom() {
  app.isQuitting = true;
  clearAllSessionModelCooldowns();
  app.quit();
}

function hasScreenRecordingPermission() {
  if (process.platform !== "darwin") return true;
  try {
    return systemPreferences.getMediaAccessStatus("screen") === "granted";
  } catch {
    return false;
  }
}

async function openScreenRecordingSettings() {
  if (process.platform !== "darwin") return null;
  await shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
  );
  return null;
}

function getScreenCaptureError() {
  if (process.platform === "darwin" && !hasScreenRecordingPermission()) {
    return new Error(
      "Screen Recording permission is required. Enable Ai.Intvra/Electron in System Settings > Privacy & Security > Screen & System Audio Recording, then restart the app."
    );
  }
  return new Error("Screen capture returned an empty image");
}

function emitToAll(event, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    sendToWindow(win, event, payload);
  }
}

function normalizeHttpHeaders(headers = {}) {
  if (!headers || typeof headers !== "object") return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined && value !== null)
  );
}

function removeHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
    }
  }
}

function buildHttpBody(serializedBody, headers) {
  if (!serializedBody || serializedBody.kind === "none") return undefined;
  if (serializedBody.kind === "text") return serializedBody.value || "";
  if (serializedBody.kind === "blob") {
    const bytes = Buffer.from(serializedBody.base64 || "", "base64");
    return new Blob([bytes], { type: serializedBody.type || "application/octet-stream" });
  }
  if (serializedBody.kind === "formData") {
    removeHeader(headers, "content-type");
    const form = new FormData();
    for (const entry of serializedBody.entries || []) {
      if (entry.file) {
        const bytes = Buffer.from(entry.file.base64 || "", "base64");
        const blob = new Blob([bytes], {
          type: entry.file.type || "application/octet-stream",
        });
        form.append(entry.name, blob, entry.file.name || "file");
      } else {
        form.append(entry.name, entry.value ?? "");
      }
    }
    return form;
  }
  return undefined;
}

async function streamHttpResponse(requestId, response) {
  try {
    if (!response.body) {
      emitToAll(`http-stream:${requestId}`, { type: "end" });
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      emitToAll(`http-stream:${requestId}`, {
        type: "chunk",
        chunk: Buffer.from(value).toString("base64"),
      });
    }
    emitToAll(`http-stream:${requestId}`, { type: "end" });
  } catch (error) {
    emitToAll(`http-stream:${requestId}`, {
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    activeHttpRequests.delete(requestId);
  }
}

async function handleHttpFetch(request) {
  const requestId = request?.id;
  const url = request?.url;
  if (!requestId || !url) {
    throw new Error("HTTP request id and URL are required");
  }

  const init = request.init || {};
  const headers = normalizeHttpHeaders(init.headers);
  const isApiRequest = Boolean(auth?.authorizeRequest(url, headers));
  const body = buildHttpBody(init.body, headers);
  const controller = new AbortController();
  activeHttpRequests.set(requestId, controller);

  let response;
  try {
    response = await fetch(url, {
      method: init.method || "GET",
      headers,
      body: ["GET", "HEAD"].includes(String(init.method || "GET").toUpperCase())
        ? undefined
        : body,
      signal: controller.signal,
    });
  } catch (error) {
    activeHttpRequests.delete(requestId);
    throw error;
  }

  if (isApiRequest) auth.observeApiResponse(response);
  streamHttpResponse(requestId, response);

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function getDisplayDescriptors() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    index,
    label: `Display ${index + 1}${display.id === primaryId ? " (Primary)" : ""}`,
    bounds: display.bounds,
    workArea: display.workArea,
    size: display.size,
    scaleFactor: display.scaleFactor,
    isPrimary: display.id === primaryId,
  }));
}

function normalizeDisplaySettings(settings = {}) {
  const displayIds = new Set(getDisplayDescriptors().map((display) => display.id));
  const primaryId = String(screen.getPrimaryDisplay().id);
  const overlayDisplayId = displayIds.has(String(settings.overlayDisplayId || ""))
    ? String(settings.overlayDisplayId)
    : primaryId;
  const captureDisplayIds = Array.isArray(settings.captureDisplayIds)
    ? settings.captureDisplayIds
        .map((id) => String(id))
        .filter((id) => displayIds.has(id))
    : [];

  return {
    overlayDisplayId,
    captureDisplayIds: captureDisplayIds.length
      ? [...new Set(captureDisplayIds)]
      : [overlayDisplayId],
  };
}

function readDisplaySettings() {
  return normalizeDisplaySettings(
    readAppSettings().displaySettings || DEFAULT_DISPLAY_SETTINGS
  );
}

function writeDisplaySettings(nextSettings) {
  const settings = readAppSettings();
  settings.displaySettings = normalizeDisplaySettings(nextSettings);
  writeAppSettings(settings);
  return settings.displaySettings;
}

function getDisplayById(displayId) {
  return (
    screen
      .getAllDisplays()
      .find((display) => String(display.id) === String(displayId)) ||
    screen.getPrimaryDisplay()
  );
}

function getOverlayDisplay() {
  return getDisplayById(readDisplaySettings().overlayDisplayId);
}

function getCaptureDisplays() {
  const settings = readDisplaySettings();
  return settings.captureDisplayIds.map((id) => getDisplayById(id));
}

function getDisplayConfigurationInfo() {
  return {
    displays: getDisplayDescriptors(),
    settings: readDisplaySettings(),
  };
}

function clampOverlayScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Number(
    Math.min(OVERLAY_SCALE_MAX, Math.max(OVERLAY_SCALE_MIN, numeric)).toFixed(2)
  );
}

function readOverlayScale() {
  return clampOverlayScale(readAppSettings().overlayScale ?? 1);
}

function writeOverlayScale(value) {
  const settings = readAppSettings();
  settings.overlayScale = clampOverlayScale(value);
  writeAppSettings(settings);
  return settings.overlayScale;
}

function getOverlayMetrics(scale = readOverlayScale()) {
  const normalizedScale = clampOverlayScale(scale);
  return {
    scale: normalizedScale,
    min: OVERLAY_SCALE_MIN,
    max: OVERLAY_SCALE_MAX,
    step: OVERLAY_SCALE_STEP,
    width: Math.round(MAIN_WINDOW_WIDTH * normalizedScale),
    collapsedHeight: Math.round(MAIN_WINDOW_COLLAPSED_HEIGHT * normalizedScale),
    expandedHeight: Math.round(
      MAIN_WINDOW_EXPANDED_FALLBACK_HEIGHT * normalizedScale
    ),
    responseHeight: Math.round(RESPONSE_WINDOW_MAX_HEIGHT * normalizedScale),
  };
}

function getOverlayScaleInfo() {
  return getOverlayMetrics();
}

function normalizeRequestedWindowHeight(height) {
  const metrics = getOverlayMetrics();
  const requestedHeight = Number(height);
  if (!Number.isFinite(requestedHeight)) return metrics.expandedHeight;
  if (requestedHeight <= MAIN_WINDOW_COLLAPSED_HEIGHT + 16) {
    return metrics.collapsedHeight;
  }
  if (requestedHeight >= MAIN_WINDOW_EXPANDED_FALLBACK_HEIGHT - 16) {
    return metrics.expandedHeight;
  }
  return requestedHeight;
}

function applyOverlayScale(value) {
  const scale = writeOverlayScale(value);
  const metrics = getOverlayMetrics(scale);

  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentBounds = mainWindow.getBounds();
    const nextHeight =
      currentBounds.height <= MAIN_WINDOW_COLLAPSED_HEIGHT + 24
        ? metrics.collapsedHeight
        : clampMainWindowHeight(currentBounds.height);
    resizeMainWindow(nextHeight);
  }

  syncResponseWindowToMain();
  emitToAll("overlay-scale-changed", metrics);
  scheduleZOrderReassertion();
  return metrics;
}

function positionMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = getOverlayDisplay();
  const bounds = display.workArea;
  const [width] = mainWindow.getSize();
  mainWindow.setPosition(
    Math.round(bounds.x + (bounds.width - width) / 2),
    Math.round(bounds.y + TOP_OFFSET)
  );
}

function clampMainWindowHeight(height) {
  const display = getOverlayDisplay();
  const metrics = getOverlayMetrics();
  const maxHeight = Math.max(
    metrics.collapsedHeight,
    display.workArea.height - TOP_OFFSET - 8
  );
  const requestedHeight = normalizeRequestedWindowHeight(height);

  return Math.round(
    Math.min(
      Math.max(requestedHeight, metrics.collapsedHeight),
      maxHeight
    )
  );
}

function resizeMainWindow(height) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const metrics = getOverlayMetrics();
  const nextHeight = clampMainWindowHeight(height);
  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const nextX = Math.round(
    currentBounds.x + (currentBounds.width - metrics.width) / 2
  );
  const maxX = workArea.x + workArea.width - metrics.width;
  const clampedX = Math.min(Math.max(nextX, workArea.x), Math.max(workArea.x, maxX));
  mainWindow.setBounds(
    {
      x: clampedX,
      y: currentBounds.y,
      width: metrics.width,
      height: nextHeight,
    },
    false
  );
  syncResponseWindowToMain();
}

function getResponseWindowBounds() {
  const metrics = getOverlayMetrics();
  const display =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : getOverlayDisplay();
  const workArea = display.workArea;
  const mainBounds =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.getBounds()
      : {
          x: Math.round(workArea.x + (workArea.width - metrics.width) / 2),
          y: Math.round(workArea.y + TOP_OFFSET),
          width: metrics.width,
          height: metrics.collapsedHeight,
        };
  const gap = 8;
  const y = mainBounds.y + metrics.collapsedHeight + gap;
  const maxHeight = Math.max(260, workArea.y + workArea.height - y - 12);

  return {
    x: mainBounds.x,
    y,
    width: metrics.width,
    height: Math.min(metrics.responseHeight, maxHeight),
  };
}

function syncResponseWindowToMain() {
  if (responseWindow && !responseWindow.isDestroyed()) {
    responseWindow.setBounds(getResponseWindowBounds(), false);
  }
}

function createBaseWindow(label, options) {
  const appIcon = getAppIcon();
  const win = new BrowserWindow({
    ...(appIcon ? { icon: appIcon } : {}),
    ...options,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      additionalArguments: [`--phantom-window-label=${label}`],
      ...(options.webPreferences || {}),
    },
  });
  win.setMenuBarVisibility(false);
  if (["main", "dashboard", "response"].includes(label)) {
    win.setContentProtection(true);
  }
  return win;
}

function readAlwaysOnTopSetting() {
  const settings = readAppSettings();
  if (!settings.alwaysOnTopDefaultEnabledMigrated) {
    settings.alwaysOnTopDefaultEnabledMigrated = true;
    if (settings.alwaysOnTopEnabled !== true) {
      settings.alwaysOnTopEnabled = true;
    }
    writeAppSettings(settings);
  }
  return settings.alwaysOnTopEnabled !== false;
}

function writeAlwaysOnTopSetting(enabled) {
  const settings = readAppSettings();
  settings.alwaysOnTopEnabled = Boolean(enabled);
  writeAppSettings(settings);
}

function isCaptureWindow(win) {
  const args = win.webContents.getLastWebPreferences?.()?.additionalArguments || [];
  return args.some((item) =>
    item.startsWith("--phantom-window-label=capture-overlay-")
  );
}

function applyOverlayZOrder(win, enabled, options = {}) {
  if (!win || win.isDestroyed()) return;

  const shouldFloat = Boolean(enabled);
  try {
    win.setAlwaysOnTop(
      shouldFloat,
      ALWAYS_ON_TOP_LEVEL,
      ALWAYS_ON_TOP_RELATIVE_LEVEL
    );
  } catch {
    win.setAlwaysOnTop(shouldFloat);
  }

  if (process.platform !== "win32") {
    try {
      win.setVisibleOnAllWorkspaces(shouldFloat, {
        visibleOnFullScreen: shouldFloat,
        skipTransformProcessType: true,
      });
    } catch {
      // Some platforms/window managers do not support fullscreen workspace pinning.
    }
  }

  if (shouldFloat && options.forceTop && win.isVisible()) {
    try {
      win.moveTop();
    } catch {
      // moveTop can fail while Electron is tearing down a window.
    }
  }
}

function applyAllOverlayZOrder(options = {}) {
  applyOverlayZOrder(mainWindow, alwaysOnTopEnabled, options);
  applyOverlayZOrder(responseWindow, true, options);

  for (const win of BrowserWindow.getAllWindows()) {
    if (win === mainWindow || win === dashboardWindow || win === responseWindow) {
      continue;
    }
    if (isCaptureWindow(win)) {
      applyOverlayZOrder(win, true, options);
    }
  }
}

function scheduleZOrderReassertion(delay = 60) {
  if (zOrderReassertTimer) {
    clearTimeout(zOrderReassertTimer);
  }
  zOrderReassertTimer = setTimeout(() => {
    zOrderReassertTimer = null;
    applyAllOverlayZOrder({ forceTop: true });
  }, delay);
}

function showMainWindowAndReassert(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const shouldFocus = options.focus !== false;
  mainWindow.show();
  applyOverlayZOrder(mainWindow, alwaysOnTopEnabled, { forceTop: true });
  if (shouldFocus) {
    mainWindow.focus();
  }
  scheduleZOrderReassertion();
}

function createMainWindow() {
  const metrics = getOverlayMetrics();
  mainWindow = createBaseWindow("main", {
    title: "Ai.Intvra - AI Assistant",
    width: metrics.width,
    height: metrics.collapsedHeight,
    frame: false,
    transparent: true,
    resizable: false,
    show: true,
    skipTaskbar: true,
    alwaysOnTop: alwaysOnTopEnabled,
    hasShadow: false,
    backgroundColor: "#00000000",
  });
  applyOverlayZOrder(mainWindow, alwaysOnTopEnabled);
  mainWindow.loadURL(getIndexUrl("/"));
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    positionMainWindow();
    mainWindow.show();
    applyOverlayZOrder(mainWindow, alwaysOnTopEnabled, { forceTop: true });
  });
  mainWindow.on("show", () => scheduleZOrderReassertion());
  mainWindow.on("restore", () => scheduleZOrderReassertion());
  mainWindow.on("focus", () => {
    sendToWindow(mainWindow, "focus-changed", true);
    scheduleZOrderReassertion();
  });
  mainWindow.on("blur", () => {
    sendToWindow(mainWindow, "focus-changed", false);
    scheduleZOrderReassertion();
  });
  mainWindow.on("move", () => {
    syncResponseWindowToMain();
    scheduleZOrderReassertion();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    return dashboardWindow;
  }
  dashboardWindow = createBaseWindow("dashboard", {
    title: "Ai.Intvra - Dashboard",
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: true,
    backgroundColor: "#0a0a0a",
  });
  dashboardWindow.loadURL(getIndexUrl("/chats"));
  dashboardWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      dashboardWindow.hide();
    }
  });
  dashboardWindow.on("focus", () =>
    sendToWindow(dashboardWindow, "focus-changed", true)
  );
  dashboardWindow.on("blur", () =>
    sendToWindow(dashboardWindow, "focus-changed", false)
  );
  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });
  return dashboardWindow;
}

function createResponseWindow() {
  if (responseWindow && !responseWindow.isDestroyed()) {
    return responseWindow;
  }

  responseWindow = createBaseWindow("response", {
    title: "Ai.Intvra - Response",
    ...getResponseWindowBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
  });

  responseWindow.loadURL(getIndexUrl("/response-overlay"));
  applyOverlayZOrder(responseWindow, true, { forceTop: true });
  responseWindow.on("closed", () => {
    responseWindow = null;
    responseWindowLoadPending = false;
  });
  responseWindow.on("show", () => scheduleZOrderReassertion());
  responseWindow.on("blur", () => {
    sendToWindow(responseWindow, "focus-changed", false);
    scheduleZOrderReassertion();
  });
  responseWindow.on("focus", () => {
    sendToWindow(responseWindow, "focus-changed", true);
    scheduleZOrderReassertion();
  });

  return responseWindow;
}

function updateResponseWindow(state) {
  lastResponseWindowState = state || null;

  if (!state?.open) {
    hideResponseWindow();
    return null;
  }

  const win = createResponseWindow();
  syncResponseWindowToMain();
  win.setIgnoreMouseEvents(false);
  applyOverlayZOrder(win, true, { forceTop: true });

  const sendState = () =>
    sendToWindow(win, "response-window-state", lastResponseWindowState);

  if (win.webContents.isLoading()) {
    if (!responseWindowLoadPending) {
      responseWindowLoadPending = true;
      win.webContents.once("did-finish-load", () => {
        responseWindowLoadPending = false;
        sendState();
      });
    }
  } else {
    sendState();
  }

  if (!win.isVisible()) {
    win.showInactive();
    scheduleZOrderReassertion();
  }

  return null;
}

function isResponseWindowVisible() {
  return Boolean(
    responseWindow &&
      !responseWindow.isDestroyed() &&
      responseWindow.isVisible()
  );
}

function hideResponseWindow(options = {}) {
  const { preserveState = false, destroy = false } = options;
  if (!preserveState) {
    lastResponseWindowState = null;
  }
  if (responseWindow && !responseWindow.isDestroyed()) {
    responseWindow.setIgnoreMouseEvents(true, { forward: true });
    responseWindow.hide();
    if (destroy) {
      responseWindow.destroy();
      responseWindow = null;
    }
  }
}

function closeResponseWindowFromShortcut() {
  sendToWindow(mainWindow, "response-window-action", { action: "close" });
  hideResponseWindow({ destroy: true });
}

function showDashboard() {
  const win = createDashboardWindow();
  win.show();
  win.focus();
}

function toggleDashboard() {
  const win = createDashboardWindow();
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function hidePhantomWindows() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  hideResponseWindow({ destroy: true });
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.hide();
  }
}

function setupTray() {
  if (tray && !tray.isDestroyed()) return tray;

  const trayIcon = getTrayIcon();
  if (!trayIcon) return undefined;

  tray = new Tray(trayIcon);
  tray.setToolTip("Ai.Intvra");
  tray.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    }
    showMainWindowAndReassert({ focus: false });
  });

  const rebuildTrayMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: "Show Ai.Intvra",
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createMainWindow();
          }
          showMainWindowAndReassert();
        },
      },
      {
        label: "Hide Ai.Intvra",
        click: () => hidePhantomWindows(),
      },
      { type: "separator" },
      {
        label: "Open Dashboard",
        click: () => showDashboard(),
      },
      {
        label: "Clear Session Model Cooldowns",
        click: () => {
          clearAllSessionModelCooldowns();
          rebuildTrayMenu();
        },
      },
      { type: "separator" },
      {
        label: "Exit Ai.Intvra",
        click: () => quitPhantom(),
      },
    ]);
    tray.setContextMenu(menu);
  };

  rebuildTrayMenu();
  return tray;
}

function normalizeAccelerator(key) {
  if (!key || typeof key !== "string") return "";
  return key
    .split("+")
    .map((part) => {
      const value = part.trim().toLowerCase();
      const map = {
        cmd: "CommandOrControl",
        command: "CommandOrControl",
        meta: "CommandOrControl",
        ctrl: "CommandOrControl",
        control: "CommandOrControl",
        shift: "Shift",
        alt: "Alt",
        option: "Alt",
        backslash: "\\",
        up: "Up",
        down: "Down",
        left: "Left",
        right: "Right",
        enter: "Enter",
        return: "Enter",
        escape: "Esc",
        esc: "Esc",
        space: "Space",
      };
      return map[value] || value.toUpperCase();
    })
    .join("+");
}

function moveMainWindow(direction, step = 12) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [x, y] = mainWindow.getPosition();
  const next = {
    up: [x, y - step],
    down: [x, y + step],
    left: [x - step, y],
    right: [x + step, y],
  }[direction];
  if (next) {
    mainWindow.setPosition(next[0], next[1]);
    syncResponseWindowToMain();
    scheduleZOrderReassertion();
  }
}

function handleShortcut(actionId) {
  if (actionId === "toggle_dashboard") {
    toggleDashboard();
    return;
  }
  if (actionId === "toggle_window") {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isResponseWindowVisible()) {
      closeResponseWindowFromShortcut();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
      hideResponseWindow({ destroy: true });
      emitToAll("toggle-window-visibility", true);
    } else {
      showMainWindowAndReassert();
      emitToAll("toggle-window-visibility", false);
      sendToWindow(mainWindow, "focus-text-input", {});
    }
    return;
  }
  if (actionId === "focus_input") {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindowAndReassert();
      sendToWindow(mainWindow, "focus-text-input", {});
    }
    return;
  }
  if (actionId.startsWith("move_window_")) {
    moveMainWindow(actionId.replace("move_window_", ""));
    return;
  }
  if (actionId === "audio_recording") {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindowAndReassert();
      sendToWindow(mainWindow, "start-audio-recording", {});
    }
    return;
  }
  if (actionId === "screenshot") {
    emitToAll("trigger-screenshot", {});
    return;
  }
  if (actionId === "system_audio") {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindowAndReassert();
      sendToWindow(mainWindow, "toggle-system-audio", {});
    }
    return;
  }
  emitToAll("custom-shortcut-triggered", { action: actionId });
}

function updateShortcuts(config) {
  globalShortcut.unregisterAll();
  registeredShortcuts = new Map();
  const failures = [];
  const bindings = config?.bindings || {};

  for (const [actionId, binding] of Object.entries(bindings)) {
    if (!binding?.enabled || !binding.key) continue;
    if (actionId === "move_window") {
      for (const direction of ["up", "down", "left", "right"]) {
        const key = normalizeAccelerator(`${binding.key}+${direction}`);
        const ok = globalShortcut.register(key, () =>
          handleShortcut(`move_window_${direction}`)
        );
        if (ok) {
          registeredShortcuts.set(`move_window_${direction}`, key);
        } else {
          failures.push([`move_window_${direction}`, key, "registration failed"]);
        }
      }
      continue;
    }
    const key = normalizeAccelerator(binding.key);
    const ok = globalShortcut.register(key, () => handleShortcut(actionId));
    if (ok) {
      registeredShortcuts.set(actionId, key);
    } else {
      failures.push([actionId, key, "registration failed"]);
    }
  }

  if (failures.length) {
    emitToAll("shortcut-registration-error", failures);
    console.warn(
      `Some shortcuts could not be registered: ${failures
        .map(([action, key]) => `${action} (${key})`)
        .join("; ")}`
    );
  }

  return {
    registered: Object.fromEntries(registeredShortcuts.entries()),
    failures,
  };
}

function getSecureStoragePath() {
  return path.join(app.getPath("userData"), "secure_storage.json");
}

function readSecureStorage() {
  if (secureStorageCache) return secureStorageCache;
  const file = getSecureStoragePath();
  if (!fs.existsSync(file)) {
    secureStorageCache = {};
    return secureStorageCache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    secureStorageCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    secureStorageCache = {};
  }
  return secureStorageCache;
}

function writeSecureStorage(data) {
  secureStorageCache = data;
  fs.mkdirSync(path.dirname(getSecureStoragePath()), { recursive: true });
  fs.writeFileSync(getSecureStoragePath(), JSON.stringify(data, null, 2));
}

function encodeSecret(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      value: safeStorage.encryptString(String(value)).toString("base64"),
    };
  }
  return { encrypted: false, value: String(value) };
}

function decodeSecret(item) {
  if (!item) return undefined;
  if (item.encrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(item.value, "base64"));
    } catch {
      return undefined;
    }
  }
  return item.value;
}

function getEmptyProviderApiKeyVault() {
  return { ai: {}, stt: {} };
}

function normalizeProviderModelProfiles(models) {
  if (!Array.isArray(models)) return [];

  const now = new Date().toISOString();
  const seen = new Set();
  return models
    .filter((model) => model && typeof model === "object")
    .map((model) => {
      const modelCode = String(model.model || "").trim();
      return {
        id: String(model.id || `model-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        label: String(model.label || modelCode || "Model"),
        model: modelCode,
        enabled: model.enabled !== false,
        source: ["suggested", "custom", "discovered"].includes(model.source)
          ? model.source
          : "custom",
        createdAt: String(model.createdAt || now),
        updatedAt: String(model.updatedAt || now),
      };
    })
    .filter((model) => {
      const key = model.model.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeProviderApiKeyVault(vault) {
  const normalized = getEmptyProviderApiKeyVault();
  if (!vault || typeof vault !== "object") return normalized;

  for (const kind of ["ai", "stt"]) {
    const providers = vault[kind];
    if (!providers || typeof providers !== "object") continue;
    for (const [providerId, profiles] of Object.entries(providers)) {
      if (!providerId || !Array.isArray(profiles)) continue;
      normalized[kind][providerId] = profiles
        .filter((profile) => profile && typeof profile === "object")
        .map((profile) => ({
          id: String(profile.id || `${providerId}-${Date.now()}`),
          name: String(profile.name || "API key"),
          value: String(profile.value || ""),
          models: normalizeProviderModelProfiles(profile.models),
          createdAt: String(profile.createdAt || new Date().toISOString()),
          updatedAt: String(profile.updatedAt || new Date().toISOString()),
        }))
        .filter((profile) => profile.value.trim());
    }
  }

  return normalized;
}

function readProviderApiKeyVault() {
  const data = readSecureStorage();
  const decoded = decodeSecret(data[PROVIDER_API_KEY_VAULT_STORAGE_KEY]);
  if (!decoded) return getEmptyProviderApiKeyVault();

  try {
    return normalizeProviderApiKeyVault(JSON.parse(decoded));
  } catch {
    return getEmptyProviderApiKeyVault();
  }
}

function writeProviderApiKeyVault(vault) {
  const data = readSecureStorage();
  data[PROVIDER_API_KEY_VAULT_STORAGE_KEY] = encodeSecret(
    JSON.stringify(normalizeProviderApiKeyVault(vault))
  );
  writeSecureStorage(data);
}

function resolveUnpackedPath(filePath) {
  if (!app.isPackaged || !filePath.includes("app.asar")) {
    return filePath;
  }
  const unpackedPath = filePath.replace("app.asar", "app.asar.unpacked");
  return fs.existsSync(unpackedPath) ? unpackedPath : filePath;
}

function getModuleDir(moduleName) {
  return resolveUnpackedPath(
    path.dirname(require.resolve(path.join(moduleName, "package.json")))
  );
}

async function getOcrWorker(language = "eng") {
  const normalizedLanguage = language === "eng" ? "eng" : "eng";
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker, OEM, PSM } = require("tesseract.js");
      const tesseractDir = getModuleDir("tesseract.js");
      const coreDir = getModuleDir("tesseract.js-core");
      const langDir = path.join(
        getModuleDir("@tesseract.js-data/eng"),
        "4.0.0_best_int"
      );
      const worker = await createWorker(normalizedLanguage, OEM.LSTM_ONLY, {
        workerPath: path.join(
          tesseractDir,
          "src",
          "worker-script",
          "node",
          "index.js"
        ),
        corePath: coreDir,
        langPath: langDir,
        cacheMethod: "none",
        gzip: true,
        logger: () => {},
      });
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: "300",
      });
      return worker;
    })().catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractOcrText(args = {}) {
  const rawBase64 = String(args.imageBase64 || args.image_base64 || "");
  const imageBase64 = rawBase64.includes(",")
    ? rawBase64.split(",").pop()
    : rawBase64;
  if (!imageBase64.trim()) {
    throw new Error("OCR requires a screenshot image");
  }

  const startedAt = Date.now();
  const worker = await getOcrWorker(args.language || "eng");
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const result = await worker.recognize(imageBuffer);
  return {
    text: normalizeOcrText(result?.data?.text || ""),
    confidence: Number(result?.data?.confidence || 0),
    durationMs: Date.now() - startedAt,
  };
}

function enqueueOcrExtraction(args) {
  const run = ocrQueue
    .catch(() => {})
    .then(() => extractOcrText(args));
  ocrQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function terminateOcrWorker() {
  const workerPromise = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    // The OCR worker may already be torn down during app shutdown.
  }
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getPowerShellPath() {
  if (process.platform !== "win32") return "powershell";
  return process.env.SystemRoot
    ? path.join(
        process.env.SystemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe"
      )
    : "powershell.exe";
}

function getAccessibilityScriptPath() {
  return resolveUnpackedPath(path.join(__dirname, "accessibility-text.ps1"));
}

function normalizeAccessibilityText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runPowerShell(command, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      getPowerShellPath(),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Windows accessibility text extraction timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `PowerShell exited with code ${code}`
          )
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function extractAccessibilityText(args = {}) {
  const startedAt = Date.now();
  if (process.platform !== "win32") {
    return {
      text: "",
      windowTitle: "",
      processId: 0,
      elementCount: 0,
      durationMs: 0,
      truncated: false,
      unsupportedPlatform: true,
      error: "Ai.Intvra Ultra Instinct Mode is only available on Windows.",
    };
  }

  const maxChars = Math.max(
    1,
    Math.min(Number(args.maxChars || args.max_chars || 8000), 20000)
  );
  const config = {
    maxChars,
    excludeProcessId: process.pid,
    appName: app.getName() || "Ai.Intvra",
  };

  const scriptPath = getAccessibilityScriptPath();
  const command = `. ${quotePowerShellSingle(
    scriptPath
  )}; Invoke-PhantomAccessibilityText -ConfigJson ${quotePowerShellSingle(
    JSON.stringify(config)
  )}`;
  const raw = await runPowerShell(command);
  if (!raw) {
    throw new Error("Windows accessibility text extraction returned no data.");
  }

  const parsed = JSON.parse(raw);
  return {
    text: normalizeAccessibilityText(parsed.text),
    windowTitle: String(parsed.windowTitle || ""),
    processId: Number(parsed.processId || 0),
    elementCount: Number(parsed.elementCount || 0),
    durationMs: Number(parsed.durationMs || Date.now() - startedAt),
    truncated: Boolean(parsed.truncated),
    unsupportedPlatform: false,
    error: parsed.error ? String(parsed.error) : null,
  };
}

function getAppSettingsPath() {
  return path.join(app.getPath("userData"), "phantom-settings.json");
}

function readAppSettings() {
  try {
    const settingsPath = getAppSettingsPath();
    if (!fs.existsSync(settingsPath)) return {};
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function writeAppSettings(settings) {
  const settingsPath = getAppSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function getInstallStorageDir() {
  return isDev() ? app.getAppPath() : path.dirname(app.getPath("exe"));
}

function getConversationStorageDir() {
  const settings = readAppSettings();
  return settings.conversationStorageDir || getInstallStorageDir();
}

function getDatabasePath() {
  return path.join(getConversationStorageDir(), DB_FILE_NAME);
}

function getLegacyDatabasePath() {
  return path.join(app.getPath("userData"), DB_FILE_NAME);
}

function ensureDatabaseFolder() {
  const folder = getConversationStorageDir();
  fs.mkdirSync(folder, { recursive: true });
}

function copyDatabaseIfMissing(sourcePath, targetPath) {
  if (
    sourcePath &&
    targetPath &&
    sourcePath !== targetPath &&
    fs.existsSync(sourcePath) &&
    !fs.existsSync(targetPath)
  ) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function getConversationStorageInfo() {
  const settings = readAppSettings();
  const folderPath = getConversationStorageDir();
  return {
    folderPath,
    databasePath: path.join(folderPath, DB_FILE_NAME),
    defaultFolderPath: getInstallStorageDir(),
    isDefault: !settings.conversationStorageDir,
  };
}

function switchConversationStorageDir(folderPath) {
  const previousPath = getDatabasePath();
  persistDbSync();

  const settings = readAppSettings();
  if (folderPath) {
    settings.conversationStorageDir = folderPath;
  } else {
    delete settings.conversationStorageDir;
  }
  writeAppSettings(settings);

  const nextPath = getDatabasePath();
  copyDatabaseIfMissing(previousPath, nextPath);
  sqlDb = null;
  return getConversationStorageInfo();
}

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
    });
  }
  return sqlPromise;
}

async function getDb() {
  if (sqlDb) return sqlDb;
  const SQL = await getSql();
  ensureDatabaseFolder();
  const dbPath = getDatabasePath();
  copyDatabaseIfMissing(getLegacyDatabasePath(), dbPath);
  if (fs.existsSync(dbPath)) {
    sqlDb = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    sqlDb = new SQL.Database();
  }
  sqlDb.run("PRAGMA foreign_keys = ON");
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      attached_files TEXT,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);
  persistDb();
  return sqlDb;
}

const DB_PERSIST_DELAY_MS = 750;
let dbPersistTimer = null;
let dbPersistDirty = false;
let dbPersistGeneration = 0;
let dbPersistInFlight = null;

// sql.js keeps the whole database in memory, so every save rewrites the full
// file. Writes are coalesced and done asynchronously to keep the main process
// (and therefore every window) responsive.
function persistDb() {
  if (!sqlDb) return;
  dbPersistDirty = true;
  if (dbPersistTimer) return;
  dbPersistTimer = setTimeout(() => {
    dbPersistTimer = null;
    void flushDbAsync();
  }, DB_PERSIST_DELAY_MS);
}

async function flushDbAsync() {
  if (dbPersistInFlight) {
    await dbPersistInFlight;
  }
  if (!sqlDb || !dbPersistDirty) return;

  dbPersistDirty = false;
  const generation = ++dbPersistGeneration;
  const data = Buffer.from(sqlDb.export());
  const dbPath = getDatabasePath();
  const tempPath = `${dbPath}.tmp`;

  dbPersistInFlight = (async () => {
    await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.promises.writeFile(tempPath, data);
    if (generation !== dbPersistGeneration) return;
    try {
      await fs.promises.rename(tempPath, dbPath);
    } catch {
      await fs.promises.writeFile(dbPath, data);
    }
  })()
    .catch((error) => {
      dbPersistDirty = true;
      console.error("Failed to persist database:", error);
    })
    .finally(() => {
      dbPersistInFlight = null;
    });

  await dbPersistInFlight;
}

function persistDbSync() {
  if (dbPersistTimer) {
    clearTimeout(dbPersistTimer);
    dbPersistTimer = null;
  }
  if (!sqlDb) return;
  dbPersistGeneration += 1;
  dbPersistDirty = false;
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()));
}

async function dbExecute(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) {
      // exhaust statement
    }
  } finally {
    stmt.free();
  }
  const rowsAffected = db.getRowsModified();
  const lastInsert = db.exec("SELECT last_insert_rowid() AS id")[0]?.values?.[0]?.[0] || 0;
  persistDb();
  return { rowsAffected, lastInsertId: lastInsert };
}

async function dbSelect(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }
  return rows;
}

function getCaptureThumbnailSizes(display) {
  const scaleFactor = Number(display.scaleFactor || 1);
  const bounds = display.bounds || display.size || { width: 1920, height: 1080 };
  const size = display.size || bounds;
  return [
    {
      width: Math.round(size.width * scaleFactor),
      height: Math.round(size.height * scaleFactor),
    },
    {
      width: Math.round(bounds.width * scaleFactor),
      height: Math.round(bounds.height * scaleFactor),
    },
    {
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ].filter(
    (thumbnailSize, index, sizes) =>
      thumbnailSize.width > 0 &&
      thumbnailSize.height > 0 &&
      sizes.findIndex(
        (sizeItem) =>
          sizeItem.width === thumbnailSize.width &&
          sizeItem.height === thumbnailSize.height
      ) === index
  );
}

async function getScreenSourceForDisplay(display) {
  let fallbackSource;
  for (const thumbnailSize of getCaptureThumbnailSizes(display)) {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
    });
    const source =
      sources.find((item) => String(item.display_id) === String(display.id)) ||
      sources[0];
    if (!fallbackSource && source) {
      fallbackSource = source;
    }
    if (source?.thumbnail && !source.thumbnail.isEmpty()) {
      return source;
    }
  }

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
  });
  return (
    sources.find((source) => String(source.display_id) === String(display.id)) ||
    sources[0] ||
    fallbackSource
  );
}

async function captureDisplayBase64(display) {
  if (!hasScreenRecordingPermission()) {
    throw getScreenCaptureError();
  }
  const source = await getScreenSourceForDisplay(display);
  if (!source?.thumbnail || source.thumbnail.isEmpty()) {
    throw getScreenCaptureError();
  }
  return source.thumbnail.toPNG().toString("base64");
}

async function startSelectionCapture() {
  if (!hasScreenRecordingPermission()) {
    throw getScreenCaptureError();
  }
  captureImages.clear();
  const displays = screen.getAllDisplays();
  const selectedDisplayIds = new Set(
    getCaptureDisplays().map((display) => String(display.id))
  );
  for (let index = 0; index < displays.length; index += 1) {
    const display = displays[index];
    if (!selectedDisplayIds.has(String(display.id))) continue;

    const source = await getScreenSourceForDisplay(display);
    if (!source?.thumbnail || source.thumbnail.isEmpty()) {
      throw getScreenCaptureError();
    }
    captureImages.set(index, {
      image: source.thumbnail,
      display,
    });
    const label = `capture-overlay-${index}`;
    const win = createBaseWindow(label, {
      title: "Ai.Intvra Screen Capture",
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      backgroundColor: "#00000000",
    });
    applyOverlayZOrder(win, true, { forceTop: true });
    win.loadURL(getIndexUrl("/"));
    win.once("ready-to-show", () => {
      win.show();
      win.focus();
      applyOverlayZOrder(win, true, { forceTop: true });
    });
  }
}

function closeCaptureWindows() {
  for (const win of BrowserWindow.getAllWindows()) {
    const label = win.webContents.getURL();
    const arg = win.webContents.mainFrame?.url || label;
    if (win !== mainWindow && win !== dashboardWindow) {
      const args = win.webContents.getLastWebPreferences?.()?.additionalArguments || [];
      if (args.some((item) => item.startsWith("--phantom-window-label=capture-overlay-"))) {
        win.destroy();
      }
    }
    void arg;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win !== mainWindow && win !== dashboardWindow && !win.isDestroyed()) {
      win.destroy();
    }
  }
  captureImages.clear();
  emitToAll("capture-closed", {});
}

function getTargetDisplayForMainWindow() {
  return getOverlayDisplay();
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
}

const defaultModels = [
  { provider: "openai", name: "OpenAI", id: "gpt-4.1-mini", model: "gpt-4.1-mini", description: "OpenAI-compatible chat model", modality: "text,image", isAvailable: true },
  { provider: "gemini", name: "Gemini", id: "gemini-3.5-flash", model: "gemini-3.5-flash", description: "Google Gemini OpenAI-compatible chat model", modality: "text,image", isAvailable: true },
  { provider: "nvidia-nim", name: "NVIDIA NIM", id: "moonshotai/kimi-k2.6", model: "moonshotai/kimi-k2.6", description: "NVIDIA hosted NIM OpenAI-compatible model", modality: "text,image", isAvailable: true },
  { provider: "openrouter", name: "OpenRouter", id: "openrouter", model: "openai/gpt-4.1-mini", description: "OpenRouter model", modality: "text,image", isAvailable: true },
  { provider: "ollama", name: "Ollama", id: "llama3.2", model: "llama3.2", description: "Local Ollama model", modality: "text", isAvailable: true },
];

const defaultPrompts = [
  {
    title: "Interview Copilot",
    prompt: "Give concise, practical answers suitable for a live technical interview.",
    modelId: "gpt-4.1-mini",
    modelName: "OpenAI-compatible",
  },
  {
    title: "Meeting Assistant",
    prompt: "Summarize what matters, suggest a brief response, and list next actions.",
    modelId: "gpt-4.1-mini",
    modelName: "OpenAI-compatible",
  },
  {
    title: "Screen Analyst",
    prompt: "Analyze the attached screenshot and explain the important details clearly.",
    modelId: "gpt-4.1-mini",
    modelName: "OpenAI-compatible vision",
  },
];

async function handleInvoke(command, args = {}) {
  switch (command) {
    case "get_app_version":
      return app.getVersion();
    case "auth_get_state":
      return auth.getState({ refresh: args.refresh !== false });
    case "auth_refresh":
      return auth.refresh();
    case "auth_start_login":
      return auth.startLogin();
    case "auth_cancel_login":
      auth.cancelLogin();
      return auth.getState({ refresh: false });
    case "auth_logout":
      return auth.logout();
    case "set_window_height":
      resizeMainWindow(args.height);
      return null;
    case "open_dashboard":
      showDashboard();
      return null;
    case "toggle_dashboard":
      toggleDashboard();
      return null;
    case "update_response_window":
      return updateResponseWindow(args.state);
    case "hide_response_window":
      hideResponseWindow({ destroy: true });
      return null;
    case "get_response_window_state":
      return lastResponseWindowState;
    case "response_window_action":
      sendToWindow(mainWindow, "response-window-action", args);
      return null;
    case "move_window":
      moveMainWindow(args.direction, args.step || 12);
      return null;
    case "set_app_icon_visibility":
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSkipTaskbar(!args.visible);
      }
      return null;
    case "get_display_configuration":
      return getDisplayConfigurationInfo();
    case "get_overlay_scale":
      return getOverlayScaleInfo();
    case "set_overlay_scale":
      return applyOverlayScale(args.scale);
    case "adjust_overlay_scale":
      return applyOverlayScale(readOverlayScale() + Number(args.delta || 0));
    case "update_display_configuration": {
      const settings = writeDisplaySettings(args.settings || {});
      positionMainWindow();
      syncResponseWindowToMain();
      scheduleZOrderReassertion();
      return {
        displays: getDisplayDescriptors(),
        settings,
      };
    }
    case "set_always_on_top":
      alwaysOnTopEnabled = Boolean(args.enabled);
      writeAlwaysOnTopSetting(alwaysOnTopEnabled);
      applyAllOverlayZOrder({ forceTop: alwaysOnTopEnabled });
      return { enabled: alwaysOnTopEnabled };
    case "exit_app":
      quitPhantom();
      return null;
    case "check_shortcuts_registered":
      return registeredShortcuts.size > 0;
    case "get_registered_shortcuts":
      return Object.fromEntries(registeredShortcuts.entries());
    case "update_shortcuts":
      return updateShortcuts(args.config);
    case "validate_shortcut_key":
      return Boolean(normalizeAccelerator(args.key || ""));
    case "set_license_status":
    case "activate_license_api":
    case "deactivate_license_api":
      return { activated: true, is_dev_license: true, instance: { id: "local", name: "local", created_at: new Date().toISOString() } };
    case "validate_license_api":
      return { is_active: true, last_validated_at: new Date().toISOString(), is_dev_license: true };
    case "check_license_status":
      return true;
    case "mask_license_key_cmd":
      return maskKey(args.licenseKey || args.license_key || "");
    case "get_checkout_url":
      return { success: false, checkout_url: null, error: "Payment is disabled in Ai.Intvra." };
    case "secure_storage_save": {
      const data = readSecureStorage();
      for (const item of args.items || []) {
        data[item.key] = encodeSecret(item.value);
      }
      writeSecureStorage(data);
      return null;
    }
    case "secure_storage_get": {
      const data = readSecureStorage();
      return {
        license_key: decodeSecret(data.phantom_license_key),
        instance_id: decodeSecret(data.phantom_instance_id),
        selected_provider_model: decodeSecret(data.selected_provider_model),
      };
    }
    case "secure_storage_remove": {
      const data = readSecureStorage();
      for (const key of args.keys || []) {
        delete data[key];
      }
      writeSecureStorage(data);
      return null;
    }
    case "provider_key_vault_get":
      return readProviderApiKeyVault();
    case "provider_key_vault_save":
      writeProviderApiKeyVault(args.vault);
      return readProviderApiKeyVault();
    case "provider_model_cooldowns_get":
      return getSessionModelCooldowns();
    case "provider_model_cooldown_mark":
      return markSessionModelCooldown(args);
    case "provider_model_cooldown_clear":
      return clearSessionModelCooldown(args);
    case "provider_model_cooldowns_clear_all":
      return clearAllSessionModelCooldowns();
    case "accessibility_extract_text":
      return extractAccessibilityText(args);
    case "ocr_extract_text":
      return enqueueOcrExtraction(args);
    case "fetch_models":
      return defaultModels;
    case "fetch_prompts":
      return { prompts: defaultPrompts, total: defaultPrompts.length, last_updated: new Date().toISOString() };
    case "create_system_prompt":
      return {
        prompt_name: "Generated Prompt",
        system_prompt: `You are Ai.Intvra. Follow this user intent carefully: ${args.userPrompt || args.user_prompt || ""}`,
      };
    case "get_activity":
      return { success: true, data: [], total_tokens_used: 0 };
    case "capture_to_base64":
    case "capture_screenshot":
      return captureDisplayBase64(getTargetDisplayForMainWindow());
    case "start_screen_capture":
      await startSelectionCapture();
      return null;
    case "check_screen_recording_permission":
      return hasScreenRecordingPermission();
    case "request_screen_recording_permission":
      return openScreenRecordingSettings();
    case "capture_selected_area": {
      const monitorIndex = Number(args.monitorIndex ?? args.monitor_index ?? 0);
      const stored = captureImages.get(monitorIndex);
      if (!stored) throw new Error(`No captured image for monitor ${monitorIndex}`);
      const coords = args.coords || {};
      const imageSize = stored.image.getSize();
      const rect = {
        x: Math.max(0, Math.min(Number(coords.x || 0), imageSize.width - 1)),
        y: Math.max(0, Math.min(Number(coords.y || 0), imageSize.height - 1)),
        width: Math.max(
          1,
          Math.min(Number(coords.width || 1), imageSize.width - Number(coords.x || 0))
        ),
        height: Math.max(
          1,
          Math.min(Number(coords.height || 1), imageSize.height - Number(coords.y || 0))
        ),
      };
      const base64 = stored.image.crop(rect).toPNG().toString("base64");
      emitToAll("captured-selection", base64);
      closeCaptureWindows();
      return base64;
    }
    case "close_overlay_window":
      closeCaptureWindows();
      return null;
    case "db_execute":
      return dbExecute(args.sql, args.params || []);
    case "db_select":
      return dbSelect(args.sql, args.params || []);
    case "get_conversation_storage_info":
      return getConversationStorageInfo();
    case "choose_conversation_storage_folder": {
      const result = await dialog.showOpenDialog(dashboardWindow || mainWindow, {
        title: "Choose conversation storage folder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return getConversationStorageInfo();
      }
      return switchConversationStorageDir(result.filePaths[0]);
    }
    case "reset_conversation_storage_folder":
      return switchConversationStorageDir(null);
    case "open_conversation_storage_folder": {
      const info = getConversationStorageInfo();
      fs.mkdirSync(info.folderPath, { recursive: true });
      await shell.openPath(info.folderPath);
      return info;
    }
    case "check_system_audio_access":
      return true;
    case "request_system_audio_access":
      shell.openExternal("ms-settings:sound");
      return null;
    case "get_vad_config":
      return {
        enabled: true,
        hop_size: 1024,
        sensitivity_rms: 0.012,
        peak_threshold: 0.035,
        silence_chunks: 45,
        min_speech_chunks: 7,
        pre_speech_chunks: 12,
        noise_gate_threshold: 0.003,
        max_recording_duration_secs: 180,
      };
    case "update_vad_config":
    case "get_capture_status":
      return false;
    case "get_audio_sample_rate":
      return 48000;
    case "get_input_devices":
    case "get_output_devices":
      return [];
    case "start_system_audio_capture":
    case "stop_system_audio_capture":
    case "manual_stop_continuous":
      emitToAll(command.replace("start_system_audio_capture", "capture-started").replace("stop_system_audio_capture", "capture-stopped"), {});
      return null;
    default:
      throw new Error(`Unknown Ai.Intvra command: ${command}`);
  }
}

app.whenReady().then(async () => {
  app.setName("Ai.Intvra");
  alwaysOnTopEnabled = readAlwaysOnTopSetting();

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    });
  });

  const handleDisplayChange = () => {
    positionMainWindow();
    syncResponseWindowToMain();
    scheduleZOrderReassertion();
    emitToAll("display-configuration-changed", getDisplayConfigurationInfo());
  };
  screen.on("display-added", handleDisplayChange);
  screen.on("display-removed", handleDisplayChange);
  screen.on("display-metrics-changed", handleDisplayChange);

  ipcMain.handle("phantom:invoke", (_event, command, args) =>
    handleInvoke(command, args)
  );
  ipcMain.handle("phantom:open-external", (_event, url) => shell.openExternal(url));
  ipcMain.handle("phantom:http-fetch", (_event, request) =>
    handleHttpFetch(request)
  );
  ipcMain.handle("phantom:http-abort", (_event, requestId) => {
    activeHttpRequests.get(requestId)?.abort();
    activeHttpRequests.delete(requestId);
    return null;
  });

  auth = createAuth({
    app,
    shell,
    readSecureStorage,
    writeSecureStorage,
    encodeSecret,
    decodeSecret,
    emit: emitToAll,
    onSignedIn: () => showDashboard(),
  });

  createMainWindow();
  createDashboardWindow();
  setupTray();
  // Signed-out users land on the dashboard's sign-in screen.
  if (!(await auth.getState({ refresh: false })).user) showDashboard();
  await getDb();
});

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  showMainWindowAndReassert();
});

app.on("window-all-closed", () => {
  if (!app.isQuitting && tray && !tray.isDestroyed()) {
    return;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  sessionModelCooldowns.clear();
  void terminateOcrWorker();
  for (const controller of activeHttpRequests.values()) {
    controller.abort();
  }
  activeHttpRequests.clear();
  if (zOrderReassertTimer) {
    clearTimeout(zOrderReassertTimer);
    zOrderReassertTimer = null;
  }
  globalShortcut.unregisterAll();
  persistDbSync();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
});
