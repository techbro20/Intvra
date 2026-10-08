import { config, googleEnabled } from "./config.js";

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const styles = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(ellipse at top,#0d2a6b 0%,#050B1E 55%);color:#EAF2FF;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .card{width:100%;max-width:400px;background:#0A1633;border:1px solid rgba(56,214,255,.18);border-radius:20px;
    padding:32px;box-shadow:0 20px 60px -20px rgba(30,107,255,.45)}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;margin-bottom:24px}
  .brand b{background:linear-gradient(90deg,#1E6BFF,#38D6FF);-webkit-background-clip:text;background-clip:text;color:transparent}
  h1{font-size:22px;margin:0 0 8px}
  p{color:#8FA3C7;font-size:14px;line-height:1.55;margin:0 0 20px}
  .btn{display:flex;width:100%;align-items:center;justify-content:center;gap:10px;border:0;border-radius:999px;
    padding:13px 18px;font-weight:600;font-size:15px;font-family:inherit;cursor:pointer;text-decoration:none}
  .btn-google{background:#fff;color:#1f1f1f}
  .btn-primary{background:linear-gradient(90deg,#1E6BFF,#38D6FF);color:#fff}
  .btn:hover{filter:brightness(1.06)}
  .divider{display:flex;align-items:center;gap:12px;color:#8FA3C7;font-size:12px;margin:20px 0}
  .divider:before,.divider:after{content:"";flex:1;height:1px;background:#1a2b55}
  label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
  input{width:100%;border:1px solid #1a2b55;background:#050B1E;color:#EAF2FF;border-radius:12px;padding:12px 14px;
    font-size:15px;font-family:inherit;margin-bottom:14px;outline:none}
  input:focus{border-color:rgba(56,214,255,.6)}
  .code{letter-spacing:.5em;text-align:center;font-size:22px;font-weight:700}
  .error{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);color:#fecaca;border-radius:12px;
    padding:10px 12px;font-size:13px;margin-bottom:16px}
  .muted{font-size:12px;color:#8FA3C7;text-align:center;margin-top:20px}
  a.link{color:#38D6FF}
`;

function layout(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} · Ai.Intvra</title><style>${styles}</style></head>
<body><main class="card"><div class="brand"><span><b>Ai.</b>Intvra</span></div>${body}</main></body></html>`;
}

const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

export function loginPage({ requestId, error = "", email = "" }) {
  const google = googleEnabled()
    ? `<a class="btn btn-google" href="/auth/google?req=${encodeURIComponent(requestId)}">${googleIcon}Continue with Google</a>
       <div class="divider">or</div>`
    : "";
  return layout(
    "Sign in",
    `<h1>Sign in or create your account</h1>
     <p>New accounts start with ${config.freeCredits} free credits.</p>
     ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
     ${google}
     <form method="post" action="/auth/email/start">
       <input type="hidden" name="req" value="${escapeHtml(requestId)}">
       <label for="email">Email</label>
       <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" value="${escapeHtml(email)}">
       <button class="btn btn-primary" type="submit">Continue with email</button>
     </form>
     <div class="muted">By continuing you agree to our <a class="link" href="https://ai.intvra.com/terms" target="_blank" rel="noopener">Terms</a>
       and <a class="link" href="https://ai.intvra.com/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</div>`
  );
}

export function codePage({ requestId, email, error = "" }) {
  return layout(
    "Check your email",
    `<h1>Check your email</h1>
     <p>We sent a 6-digit code to <strong style="color:#EAF2FF">${escapeHtml(email)}</strong>. It expires in 10 minutes.</p>
     ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
     <form method="post" action="/auth/email/verify">
       <input type="hidden" name="req" value="${escapeHtml(requestId)}">
       <input type="hidden" name="email" value="${escapeHtml(email)}">
       <label for="code">Verification code</label>
       <input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" autofocus>
       <button class="btn btn-primary" type="submit">Verify and sign in</button>
     </form>
     <div class="muted"><a class="link" href="/auth/login/${encodeURIComponent(requestId)}">Use a different email</a></div>`
  );
}

export function messagePage(title, message) {
  return layout(
    title,
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
     <div class="muted">Need help? <a class="link" href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a></div>`
  );
}
