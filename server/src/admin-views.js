import { escapeHtml as h } from "./pages.js";

const styles = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:#050B1E;color:#EAF2FF;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;-webkit-text-size-adjust:100%}
  a{color:#38D6FF;text-decoration:none} a:hover{text-decoration:underline}
  .shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
  nav{background:#081230;border-right:1px solid #13234a;padding:22px 14px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column}
  .brand{font-weight:700;font-size:18px;padding:0 10px 4px}
  .brand b{background:linear-gradient(90deg,#1E6BFF,#38D6FF);-webkit-background-clip:text;background-clip:text;color:transparent}
  .brand small{display:block;font-size:11px;font-weight:500;color:#8FA3C7;margin-top:2px}
  nav ul{list-style:none;padding:0;margin:22px 0;flex:1}
  nav li a{display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border-radius:10px;color:#B8C7E3;font-weight:500}
  nav li a:hover{background:#0E1C42;text-decoration:none}
  nav li a.on{background:rgba(56,214,255,.12);color:#EAF2FF}
  .pill{background:#f59e0b;color:#111;border-radius:999px;font-size:11px;font-weight:700;padding:1px 7px}
  nav .me{margin-top:auto;font-size:12px;color:#8FA3C7;padding:0 10px;word-break:break-all}
  nav .me .email{display:block;margin-bottom:4px}
  nav .me button{background:none;border:0;color:#38D6FF;cursor:pointer;padding:0;font:inherit;min-height:44px}
  main{padding:26px 30px;max-width:1200px;width:100%;min-width:0}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:0 0 12px}
  .sub{color:#8FA3C7;margin:0 0 22px}
  .grid{display:grid;gap:14px;margin-bottom:14px} .grid>.card{margin-bottom:0} .g4{grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))} .g2{grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))}
  .card{background:#0A1633;border:1px solid #13234a;border-radius:16px;padding:18px;margin-bottom:14px;min-width:0}
  .stat .k{color:#8FA3C7;font-size:12px} .stat .v{font-size:26px;font-weight:700;margin-top:4px;word-break:break-word} .stat .d{color:#8FA3C7;font-size:12px;margin-top:2px}
  .stat.warn{border-color:rgba(245,158,11,.5)} .stat.warn .v{color:#fbbf24}
  .table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -2px;padding-bottom:2px}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8FA3C7;font-weight:600;padding:8px 10px;border-bottom:1px solid #13234a;white-space:nowrap}
  td{padding:9px 10px;border-bottom:1px solid #0F1C3F;vertical-align:top}
  tr:last-child td{border-bottom:0}
  .mono{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}
  .muted{color:#8FA3C7} .small{font-size:12px}
  .badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;background:#13234a;color:#B8C7E3}
  .b-paid{background:rgba(34,197,94,.15);color:#86efac} .b-review{background:rgba(245,158,11,.18);color:#fcd34d}
  .b-confirming,.b-pending{background:rgba(56,214,255,.12);color:#7dd3fc} .b-failed{background:rgba(248,113,113,.15);color:#fca5a5}
  .b-expired{background:#13234a;color:#8FA3C7}
  .b-pro{background:rgba(56,214,255,.15);color:#7dd3fc} .b-lifetime{background:rgba(168,85,247,.18);color:#d8b4fe}
  .b-payg{background:rgba(34,197,94,.15);color:#86efac}
  .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
  .tabs a{border:1px solid #13234a;border-radius:999px;padding:8px 14px;color:#B8C7E3;min-height:40px;display:inline-flex;align-items:center;flex:0 0 auto}
  .tabs a.on{background:rgba(56,214,255,.12);border-color:#38D6FF;color:#EAF2FF}
  form.inline,form.pay-act{display:inline-flex;gap:6px;align-items:center;margin:0;flex-wrap:wrap}
  .pay-actions{min-width:7rem}
  .pay-actions details{margin:0}
  .pay-actions .pay-act{display:flex;margin-top:6px;width:100%}
  .pay-actions .pay-act:first-child{margin-top:0}
  .pay-actions input[name=reason]{width:120px;min-width:0;flex:1}
  .row-fields{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .row-fields input[name=amount]{width:100px}
  .row-fields input[name=reason],.row-fields input[name=renews],.row-fields select{flex:1;min-width:120px}
  .action-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
  input,select{background:#050B1E;border:1px solid #1a2b55;color:#EAF2FF;border-radius:9px;padding:10px 12px;font:inherit;font-size:16px;outline:none;max-width:100%}
  input:focus,select:focus{border-color:rgba(56,214,255,.6)}
  .btn{border:0;border-radius:9px;padding:10px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;background:linear-gradient(90deg,#1E6BFF,#38D6FF);color:#fff;min-height:44px}
  .btn.ghost{background:transparent;border:1px solid #1a2b55;color:#EAF2FF} .btn.danger{background:rgba(248,113,113,.15);color:#fca5a5;border:1px solid rgba(248,113,113,.35)}
  .flash{border-radius:12px;padding:10px 14px;margin-bottom:16px} .flash.ok{background:rgba(34,197,94,.12);color:#86efac} .flash.err{background:rgba(248,113,113,.12);color:#fecaca}
  .bars{display:flex;align-items:flex-end;gap:4px;height:110px;margin-top:8px}
  .bars div{flex:1;background:linear-gradient(180deg,#38D6FF,#1E6BFF);border-radius:4px 4px 0 0;min-height:2px;position:relative}
  .bars div:hover:after{content:attr(data-tip);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#0E1C42;border:1px solid #1a2b55;padding:3px 7px;border-radius:6px;font-size:11px;white-space:nowrap;margin-bottom:4px}
  .axis{display:flex;justify-content:space-between;color:#8FA3C7;font-size:11px;margin-top:4px}
  dl{display:grid;grid-template-columns:140px 1fr;gap:8px 12px;margin:0} dt{color:#8FA3C7} dd{margin:0;min-width:0;word-break:break-word}
  .actions form{margin-bottom:10px}
  .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
  .filters input,.filters select{flex:1 1 140px}
  .ok-dot,.no-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px} .ok-dot{background:#22c55e} .no-dot{background:#ef4444}
  @media (max-width:820px){
    .shell{grid-template-columns:1fr}
    nav{position:static;height:auto;display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;padding:12px 14px 10px;border-right:0;border-bottom:1px solid #13234a}
    .brand{padding:0;grid-column:1;grid-row:1}
    nav .me{grid-column:2;grid-row:1;margin:0;padding:0;text-align:right;justify-self:end}
    nav .me .email{display:none}
    nav .me button{min-height:40px;padding:8px 4px;font-weight:600}
    nav ul{display:flex;flex-wrap:nowrap;gap:6px;margin:0;padding:2px 0 4px;grid-column:1 / -1;grid-row:2;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
    nav li{flex:0 0 auto}
    nav li a{padding:10px 12px;gap:6px;min-height:44px;white-space:nowrap}
    .tabs{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;padding-bottom:4px}
    main{padding:16px 14px}
    .g2,.g4{grid-template-columns:1fr}
    .card{padding:14px}
    .card > table,.table-scroll > table{min-width:520px}
    dl{grid-template-columns:1fr;gap:2px 0}
    dl dt{margin-top:8px;font-size:12px}
    dl dt:first-child{margin-top:0}
    form.inline,form.pay-act{display:flex;width:100%}
    form.inline .btn,form.inline input,form.inline select,form.pay-act .btn,form.pay-act input{flex:1 1 auto}
    .pay-actions{white-space:normal;min-width:0}
    .pay-actions input[name=reason]{width:auto}
    .row-fields{flex-direction:column;align-items:stretch}
    .row-fields input,.row-fields select,.row-fields .btn{width:100%;flex:none}
    .row-fields input[name=amount]{width:100%}
    .action-row{flex-direction:column;align-items:stretch}
    .action-row form,.action-row .btn{width:100%}
    .actions form{display:flex;flex-direction:column;align-items:stretch;gap:8px}
    .actions .btn{width:100%}
    .filters{flex-direction:column;align-items:stretch}
    .filters input,.filters select,.filters .btn{width:100%;flex:none}
    .stat .v{font-size:22px}
    .bars{height:88px}
  }
  @media (max-width:480px){
    body{font-size:13px}
    h1{font-size:20px}
    main{padding:14px 12px}
    nav{padding:10px 12px 8px;gap:6px}
    nav li a{padding:9px 10px;font-size:13px}
    .card > table,.table-scroll > table{min-width:460px}
    th,td{padding:8px}
  }
`;

export const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
export const fmtDay = (ms) => (ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");
export const usd = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const badge = (text, kind = text) => `<span class="badge b-${h(kind)}">${h(text)}</span>`;

const NAV = [
  ["overview", "/admin", "Overview"],
  ["payments", "/admin/payments", "Payments"],
  ["users", "/admin/users", "Users"],
  ["activity", "/admin/activity", "Activity"],
];

export function layout({ admin, active, title, flash, reviewCount, body }) {
  const nav = NAV.map(
    ([id, href, label]) =>
      `<li><a href="${href}" class="${id === active ? "on" : ""}">${label}${
        id === "payments" && reviewCount ? `<span class="pill" title="Payments to review">${reviewCount}</span>` : ""
      }</a></li>`
  ).join("");
  const flashHtml = flash?.text ? `<div class="flash ${flash.kind === "err" ? "err" : "ok"}">${h(flash.text)}</div>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${h(title)} · Admin · Ai.Intvra</title><style>${styles}</style></head>
<body><div class="shell">
<nav>
  <div class="brand"><b>Ai.</b>Intvra<small>Admin</small></div>
  <ul>${nav}</ul>
  <form class="me" method="post" action="/admin/logout"><span class="email">${h(admin.email)}</span><button type="submit">Sign out</button></form>
</nav>
<main>${flashHtml}${body}</main>
</div>
<script>
document.addEventListener("submit", (e) => { const m = e.target.dataset.confirm; if (m && !confirm(m)) e.preventDefault(); });
if (/[?&](ok|err)=/.test(location.search)) history.replaceState(null, "", location.pathname + location.search.replace(/[?&](ok|err)=[^&]*/g, "").replace(/^&/, "?"));
</script></body></html>`;
}

/** A small bar chart: [{ label, value, tip }]. */
export function bars(points) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return `<div class="bars">${points
    .map((p) => `<div style="height:${Math.round((p.value / max) * 100)}%" data-tip="${h(p.tip)}"></div>`)
    .join("")}</div><div class="axis"><span>${h(points[0]?.label || "")}</span><span>${h(points.at(-1)?.label || "")}</span></div>`;
}

export const stat = (label, value, detail = "", warn = false) =>
  `<div class="card stat${warn ? " warn" : ""}"><div class="k">${h(label)}</div><div class="v">${h(value)}</div>${
    detail ? `<div class="d">${h(detail)}</div>` : ""
  }</div>`;

export const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="muted">${h(text)}</td></tr>`;

export function trialLabel(user) {
  if (user.trial_claimed_at) return "Received";
  if (user.trial_denied_at) return user.trial_denied_reason === "network" ? "Blocked (network limit)" : "Blocked (device already used)";
  return "Not claimed yet";
}
