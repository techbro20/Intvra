const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const TOKEN_KEY = "intvra_session_token";
const USER_KEY = "intvra_session_user";
const DEVICE_KEY = "intvra_device_id";
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const ME_TIMEOUT_MS = 8000;

const callbackPage = (title, message) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050B1E;color:#EAF2FF;
font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.card{max-width:380px;text-align:center;background:#0A1633;
border:1px solid rgba(56,214,255,.18);border-radius:20px;padding:32px}h1{font-size:22px;margin:0 0 8px}p{color:#8FA3C7;margin:0}
b{background:linear-gradient(90deg,#1E6BFF,#38D6FF);-webkit-background-clip:text;background-clip:text;color:transparent}</style>
</head><body><div class="card"><p style="font-weight:700;font-size:20px;color:#EAF2FF;margin-bottom:20px"><b>Ai.</b>Intvra</p>
<h1>${title}</h1><p>${message}</p></div></body></html>`;

function readMachineId() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "reg",
        ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
        { encoding: "utf8", windowsHide: true, timeout: 5000 }
      );
      return out.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i)?.[1] || "";
    }
    if (process.platform === "darwin") {
      const out = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8", timeout: 5000 });
      return out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] || "";
    }
    for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    }
  } catch {}
  return "";
}

/**
 * Account sign-in for the desktop app. The browser completes Google/email sign-in on the
 * server, which redirects a one-time code to a loopback port here; the code is exchanged
 * with a PKCE verifier for a session token kept in encrypted local storage.
 */
function createAuth({ app, shell, readSecureStorage, writeSecureStorage, encodeSecret, decodeSecret, emit, onSignedIn }) {
  let pendingLogin = null;
  let cachedUser = null;

  const apiBase = () =>
    (process.env.INTVRA_API_URL || (app.isPackaged ? "https://api.intvra.com" : "http://127.0.0.1:8787")).replace(/\/+$/, "");

  // The OS machine ID survives reinstalls; the stored random ID is only a fallback.
  function getDeviceId() {
    const machineId = readMachineId();
    if (machineId) return crypto.createHash("sha256").update(`intvra-device:${machineId}`).digest("hex");
    const data = readSecureStorage();
    let stored = decodeSecret(data[DEVICE_KEY]);
    if (!stored) {
      stored = crypto.randomBytes(32).toString("hex");
      data[DEVICE_KEY] = encodeSecret(stored);
      writeSecureStorage(data);
    }
    return stored;
  }

  function getToken() {
    return decodeSecret(readSecureStorage()[TOKEN_KEY]) || "";
  }

  function getStoredUser() {
    if (cachedUser) return cachedUser;
    try {
      cachedUser = JSON.parse(decodeSecret(readSecureStorage()[USER_KEY]) || "null");
    } catch {
      cachedUser = null;
    }
    return cachedUser;
  }

  function saveSession(token, user) {
    const data = readSecureStorage();
    if (token !== undefined) data[TOKEN_KEY] = encodeSecret(token);
    data[USER_KEY] = encodeSecret(JSON.stringify(user));
    writeSecureStorage(data);
    cachedUser = user;
  }

  function clearSession() {
    const data = readSecureStorage();
    delete data[TOKEN_KEY];
    delete data[USER_KEY];
    writeSecureStorage(data);
    cachedUser = null;
  }

  function signedOutState(extra = {}) {
    return { status: "signed_out", user: null, apiBase: apiBase(), loginPending: Boolean(pendingLogin), ...extra };
  }

  function signedInState(user, extra = {}) {
    return { status: "signed_in", user, apiBase: apiBase(), loginPending: false, ...extra };
  }

  function emitState(state) {
    emit("auth-changed", state);
    return state;
  }

  /** Current session, refreshed from the server; falls back to the last known user when offline. */
  async function getState({ refresh = true } = {}) {
    const token = getToken();
    if (!token) return signedOutState();
    if (!refresh && getStoredUser()) return signedInState(getStoredUser());

    try {
      const res = await fetch(`${apiBase()}/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(ME_TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) {
        clearSession();
        return signedOutState({ error: res.status === 403 ? "This account is unavailable." : "" });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { user } = await res.json();
      saveSession(undefined, user);
      return signedInState(user);
    } catch {
      const user = getStoredUser();
      return user ? signedInState(user, { offline: true }) : signedOutState({ error: "Can't reach Ai.Intvra right now." });
    }
  }

  async function refresh() {
    return emitState(await getState());
  }

  function cancelLogin() {
    if (!pendingLogin) return;
    clearTimeout(pendingLogin.timer);
    pendingLogin.server.close();
    pendingLogin = null;
  }

  async function exchangeCode(code, verifier) {
    const res = await fetch(`${apiBase()}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        device: `${os.hostname()} (${process.platform})`,
        device_id: getDeviceId(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw new Error(data?.error?.message || "Sign-in failed. Please try again.");
    return data;
  }

  /** Opens the browser sign-in page and waits for the loopback callback. */
  async function startLogin() {
    cancelLogin();

    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = crypto.randomBytes(24).toString("base64url");

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const respond = (status, title, message) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(callbackPage(title, message));
      };

      if (url.searchParams.get("state") !== state || !url.searchParams.get("code")) {
        respond(400, "Sign-in link mismatch", "Please start signing in again from the Ai.Intvra app.");
        return;
      }

      const code = url.searchParams.get("code");
      cancelLogin();
      try {
        const { token, user } = await exchangeCode(code, verifier);
        saveSession(token, user);
        respond(200, "You're signed in", "You can close this tab and return to Ai.Intvra.");
        emitState(signedInState(user));
        onSignedIn?.(user);
      } catch (error) {
        respond(400, "Sign-in failed", error.message);
        emitState(signedOutState({ error: error.message }));
      }
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();
    pendingLogin = {
      server,
      timer: setTimeout(() => {
        cancelLogin();
        emitState(signedOutState({ error: "Sign-in timed out. Please try again." }));
      }, LOGIN_TIMEOUT_MS),
    };

    const loginUrl = new URL(`${apiBase()}/auth/login`);
    loginUrl.searchParams.set("challenge", challenge);
    loginUrl.searchParams.set("state", state);
    loginUrl.searchParams.set("redirect_uri", `http://127.0.0.1:${port}/callback`);
    await shell.openExternal(loginUrl.toString());

    return emitState(signedOutState({ loginPending: true }));
  }

  async function logout() {
    cancelLogin();
    const token = getToken();
    if (token) {
      fetch(`${apiBase()}/v1/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    clearSession();
    return emitState(signedOutState());
  }

  /** Adds the session token to requests bound for the Ai.Intvra API. */
  function authorizeRequest(url, headers) {
    if (!String(url).startsWith(`${apiBase()}/v1/`)) return false;
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return true;
  }

  /** Keeps the cached balance in sync with API responses so the UI updates live. */
  function observeApiResponse(response) {
    if (response.status === 401) {
      clearSession();
      emitState(signedOutState({ error: "Your session has expired. Please sign in again." }));
      return;
    }
    const remaining = response.headers.get("x-credits-remaining");
    const user = getStoredUser();
    if (remaining !== null && user) {
      const updated = { ...user, credits: Number(remaining) };
      saveSession(undefined, updated);
      emitState(signedInState(updated));
    } else if (response.status === 402) {
      void refresh();
    }
  }

  return { getState, refresh, startLogin, cancelLogin, logout, authorizeRequest, observeApiResponse };
}

module.exports = { createAuth };
