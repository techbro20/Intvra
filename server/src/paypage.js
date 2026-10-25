import { config } from "./config.js";
import { escapeHtml } from "./pages.js";

const styles = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;padding:32px 16px;background:radial-gradient(ellipse at top,#0d2a6b 0%,#050B1E 55%);
    color:#EAF2FF;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:820px;margin:0 auto}
  .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px;flex-wrap:wrap}
  .brand{font-weight:700;font-size:20px}
  .brand b{background:linear-gradient(90deg,#1E6BFF,#38D6FF);-webkit-background-clip:text;background-clip:text;color:transparent}
  .who{font-size:13px;color:#8FA3C7;display:flex;align-items:center;gap:10px}
  .who button{background:none;border:0;color:#38D6FF;cursor:pointer;font:inherit;padding:0}
  .card{background:#0A1633;border:1px solid rgba(56,214,255,.18);border-radius:20px;padding:24px;
    box-shadow:0 20px 60px -20px rgba(30,107,255,.45);margin-bottom:16px}
  h1{font-size:24px;margin:0 0 6px} h2{font-size:16px;margin:0 0 14px}
  p{color:#8FA3C7;font-size:14px;line-height:1.55;margin:0}
  .plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:18px}
  .plan{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;border:1px solid #1a2b55;
    border-radius:16px;padding:16px;cursor:pointer;background:#050B1E;text-align:left;color:inherit;font:inherit}
  .plan:hover{border-color:rgba(56,214,255,.4)}
  .plan.sel{border-color:#38D6FF;box-shadow:0 0 0 1px #38D6FF inset}
  .plan[disabled]{opacity:.45;cursor:not-allowed}
  .plan .name{font-weight:600} .plan .price{font-size:22px;font-weight:700;margin:6px 0 2px}
  .plan .alt{font-size:12px;color:#8FA3C7} .plan .sum{font-size:13px;color:#8FA3C7;margin-top:8px;line-height:1.45}
  .tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
  .tab{border:1px solid #1a2b55;background:transparent;color:#8FA3C7;border-radius:999px;padding:8px 14px;font:inherit;font-size:14px;cursor:pointer}
  .tab.sel{background:rgba(56,214,255,.12);border-color:#38D6FF;color:#EAF2FF}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;padding:13px 22px;
    font-weight:600;font-size:15px;font-family:inherit;cursor:pointer;background:linear-gradient(90deg,#1E6BFF,#38D6FF);color:#fff}
  .btn:disabled{opacity:.6;cursor:wait} .btn.ghost{background:transparent;border:1px solid #1a2b55;color:#EAF2FF}
  .coins{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .order{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:start;border:1px solid #1a2b55;border-radius:16px;padding:16px;margin-top:6px}
  .order .qr{background:#fff;border-radius:12px;padding:8px;width:176px;height:176px}
  .order .qr svg{width:100%;height:100%}
  .field{margin-bottom:12px} .field label{display:block;font-size:12px;color:#8FA3C7;margin-bottom:4px}
  .copy{display:flex;gap:8px;align-items:center;background:#050B1E;border:1px solid #1a2b55;border-radius:10px;padding:8px 10px;
    font-family:ui-monospace,Consolas,monospace;font-size:13px;word-break:break-all}
  .copy span{flex:1} .copy button{background:none;border:0;color:#38D6FF;cursor:pointer;font:inherit;font-family:Inter,system-ui,sans-serif;font-size:12px}
  .warn{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35);color:#fde68a;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.5;margin:12px 0}
  input{width:100%;border:1px solid #1a2b55;background:#050B1E;color:#EAF2FF;border-radius:12px;padding:12px 14px;font-size:14px;
    font-family:ui-monospace,Consolas,monospace;outline:none;margin-bottom:10px}
  input:focus{border-color:rgba(56,214,255,.6)}
  .status{font-size:14px;margin-top:12px;line-height:1.5;min-height:1em}
  .status.err{color:#fecaca} .status.ok{color:#86efac}
  .muted{font-size:12px;color:#8FA3C7;margin-top:14px}
  .hidden{display:none!important}
  a{color:#38D6FF}
  @media (max-width:560px){.order{grid-template-columns:1fr}.order .qr{margin:0 auto}}
`;

const page = (title, body, extraHead = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} · Ai.Intvra</title><style>${styles}</style>${extraHead}</head>
<body><main>${body}</main></body></html>`;

const header = (user) => `
  <div class="top">
    <div class="brand"><b>Ai.</b>Intvra</div>
    ${
      user
        ? `<form class="who" method="post" action="/pay/logout"><span>Signed in as ${escapeHtml(user.email)}</span><button type="submit">Not you?</button></form>`
        : ""
    }
  </div>`;

/** JSON safe to embed in a <script> tag. */
const embed = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

export function checkoutPage({ user, currentPlan, plans, selected, paystack, cryptoMethods }) {
  const nothingEnabled = !paystack && !cryptoMethods.length;
  const body = `
    ${header(user)}
    <section class="card">
      <h1>Choose your plan</h1>
      <p>Current plan: <strong style="color:#EAF2FF">${escapeHtml(currentPlan)}</strong></p>
      <div class="plans" id="plans">
        ${plans
          .map(
            (plan) => `
          <button type="button" class="plan" data-plan="${plan.id}" ${plan.blocked ? "disabled" : ""} title="${escapeHtml(plan.blocked)}">
            <div class="name">${escapeHtml(plan.name)}</div>
            <div class="price">$${plan.usd}</div>
            <div class="alt">${plan.id === "pro" ? "30-day pass, no auto-charge" : plan.id === "lifetime" ? "One-time payment" : "One-time top-up"}</div>
            <div class="sum">${escapeHtml(plan.summary)}</div>
          </button>`
          )
          .join("")}
      </div>
    </section>

    <section class="card" id="pay-card">
      <h2>Pay</h2>
      ${
        nothingEnabled
          ? `<p>Payments aren't available yet. Email <a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a> and we'll set you up.</p>`
          : `
      <div class="tabs">
        ${paystack ? `<button type="button" class="tab" data-tab="paystack">M-Pesa, card or Apple Pay</button>` : ""}
        ${cryptoMethods.length ? `<button type="button" class="tab" data-tab="crypto">Crypto</button>` : ""}
      </div>

      <div id="tab-paystack" class="hidden">
        <p style="margin-bottom:16px">Pay securely with Paystack using M-Pesa, a card or Apple Pay (in Safari).</p>
        <button type="button" class="btn" id="paystack-btn">Pay</button>
        <button type="button" class="btn ghost hidden" id="paystack-check" style="margin-left:8px">I've paid, check again</button>
        <div class="status" id="paystack-status"></div>
      </div>

      <div id="tab-crypto" class="hidden">
        <p style="margin-bottom:14px">Choose a coin. You'll get an exact amount and address to send to.</p>
        <div class="coins">
          ${cryptoMethods
            .map((m) => `<button type="button" class="tab" data-coin="${m.id}">${escapeHtml(m.label)} <span style="opacity:.7">· ${escapeHtml(m.short)}</span></button>`)
            .join("")}
        </div>
        <div class="status" id="order-status"></div>
        <div id="order" class="hidden">
          <div class="order">
            <div>
              <div class="field"><label>Send exactly</label><div class="copy"><span id="o-amount"></span><button type="button" data-copy="o-amount-raw">Copy</button></div></div>
              <div class="field"><label>To this address</label><div class="copy"><span id="o-address"></span><button type="button" data-copy="o-address">Copy</button></div></div>
              <div class="field"><label>Network</label><div id="o-network" style="font-size:14px;font-weight:600"></div></div>
              <p id="o-expiry" style="font-size:12px"></p>
            </div>
            <div class="qr" id="o-qr"></div>
          </div>
          <div class="warn" id="o-warn"></div>
          <label for="txid" style="font-size:13px;font-weight:600;display:block;margin:14px 0 6px">After sending, paste the transaction ID (hash)</label>
          <input id="txid" placeholder="Transaction ID" autocomplete="off" spellcheck="false">
          <button type="button" class="btn" id="tx-btn">Confirm payment</button>
          <div class="status" id="crypto-status"></div>
        </div>
      </div>`
      }
      <p class="muted">Questions or problems paying? Email <a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a>.
        By paying you agree to our <a href="${config.siteUrl}/terms" target="_blank" rel="noopener">Terms</a>. Crypto payments can't be refunded.</p>
    </section>
    <span id="o-amount-raw" class="hidden"></span>
    <script type="application/json" id="pay-data">${embed({ plans, selected })}</script>
    <script>${clientScript}</script>`;

  return page("Checkout", body, paystack ? `<script src="https://js.paystack.co/v2/inline.js" defer></script>` : "");
}

export function donePage({ user, title, message, showDownload }) {
  return page(
    title,
    `${header(user)}
     <section class="card" style="max-width:520px;margin:40px auto;text-align:center">
       <div style="font-size:40px;margin-bottom:8px">✓</div>
       <h1>${escapeHtml(title)}</h1>
       <p style="margin-top:8px">${escapeHtml(message)}</p>
       ${
         showDownload
           ? `<p style="margin-top:20px">Don't have the app yet?</p>
              <a class="btn" style="margin-top:12px;text-decoration:none" href="${config.siteUrl}/#download">Download Ai.Intvra</a>`
           : ""
       }
       <p class="muted"><a href="/pay">Back to plans</a></p>
     </section>`
  );
}

const clientScript = `
(() => {
  const data = JSON.parse(document.getElementById("pay-data").textContent);
  const $ = (id) => document.getElementById(id);
  let plan = data.selected;
  let paystackRef = null;
  let order = null;
  let pollTimer = null;

  async function post(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
    return json;
  }
  const setStatus = (el, text, kind) => { if (!el) return; el.textContent = text || ""; el.className = "status" + (kind ? " " + kind : ""); };

  function selectPlan(id) {
    const info = data.plans.find((p) => p.id === id && !p.blocked);
    if (!info) return;
    plan = id;
    document.querySelectorAll(".plan").forEach((el) => el.classList.toggle("sel", el.dataset.plan === id));
    const btn = $("paystack-btn");
    if (btn) btn.textContent = "Pay " + info.payLabel;
    resetOrder();
    setStatus($("paystack-status"), "");
  }

  function selectTab(name) {
    document.querySelectorAll("[data-tab]").forEach((el) => el.classList.toggle("sel", el.dataset.tab === name));
    ["paystack", "crypto"].forEach((t) => { const el = $("tab-" + t); if (el) el.classList.toggle("hidden", t !== name); });
  }

  function resetOrder() {
    order = null;
    clearTimeout(pollTimer);
    document.querySelectorAll("[data-coin]").forEach((el) => el.classList.remove("sel"));
    const box = $("order"); if (box) box.classList.add("hidden");
    setStatus($("crypto-status"), "");
    setStatus($("order-status"), "");
  }

  async function payWithPaystack() {
    const btn = $("paystack-btn");
    btn.disabled = true;
    setStatus($("paystack-status"), "Opening Paystack…");
    try {
      const tx = await post("/pay/paystack/init", { plan });
      paystackRef = tx.paymentId;
      if (window.PaystackPop) {
        setStatus($("paystack-status"), "");
        const popup = new window.PaystackPop();
        popup.resumeTransaction(tx.accessCode, {
          onSuccess: () => checkPaystack(),
          onCancel: () => { $("paystack-check").classList.remove("hidden"); setStatus($("paystack-status"), "Payment window closed. If you completed the payment, click “I've paid, check again”."); },
          onError: () => { window.location.href = tx.authorizationUrl; },
        });
      } else {
        window.location.href = tx.authorizationUrl;
      }
    } catch (error) {
      setStatus($("paystack-status"), error.message, "err");
    } finally {
      btn.disabled = false;
    }
  }

  async function checkPaystack() {
    if (!paystackRef) return;
    setStatus($("paystack-status"), "Confirming your payment…");
    for (let i = 0; i < 12; i++) {
      try {
        const r = await post("/pay/paystack/verify", { reference: paystackRef });
        if (r.status === "paid" || r.status === "already_paid") { window.location.href = "/pay/done?payment=" + encodeURIComponent(paystackRef); return; }
        if (r.status === "review" || r.status === "failed") { setStatus($("paystack-status"), r.message, "err"); return; }
      } catch (error) { setStatus($("paystack-status"), error.message, "err"); return; }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    $("paystack-check").classList.remove("hidden");
    setStatus($("paystack-status"), "We haven't received confirmation yet. M-Pesa can take a minute: approve the prompt on your phone, then click “I've paid, check again”.");
  }

  async function startCrypto(method, el) {
    resetOrder();
    el.classList.add("sel");
    setStatus($("order-status"), "Preparing your order…");
    try {
      order = await post("/pay/crypto/order", { plan, method });
      $("o-amount").textContent = order.amount + " " + order.currency;
      $("o-amount-raw").textContent = order.amount;
      $("o-address").textContent = order.address;
      $("o-network").textContent = order.network;
      $("o-qr").innerHTML = order.qrSvg;
      $("o-expiry").textContent = order.method === "ltc"
        ? "This Litecoin price is held until " + new Date(order.expiresAt).toLocaleTimeString() + "."
        : "Send within " + Math.round((order.expiresAt - Date.now()) / 60000) + " minutes.";
      $("o-warn").textContent = order.warning;
      $("txid").value = "";
      $("order").classList.remove("hidden");
      setStatus($("order-status"), "");
    } catch (error) {
      setStatus($("order-status"), error.message, "err");
    }
  }

  async function submitTx() {
    if (!order) return;
    const txid = $("txid").value.trim();
    if (!txid) { setStatus($("crypto-status"), "Paste the transaction ID first.", "err"); return; }
    const btn = $("tx-btn");
    btn.disabled = true;
    clearTimeout(pollTimer);
    setStatus($("crypto-status"), "Checking the blockchain…");
    try {
      const r = await post("/pay/crypto/submit", { paymentId: order.paymentId, txid });
      if (r.status === "paid") { window.location.href = "/pay/done?payment=" + encodeURIComponent(order.paymentId); return; }
      if (r.status === "confirming") { setStatus($("crypto-status"), r.message, "ok"); pollTimer = setTimeout(submitTx, 15000); }
      else setStatus($("crypto-status"), r.message, r.status === "review" ? "" : "err");
    } catch (error) {
      setStatus($("crypto-status"), error.message, "err");
    } finally {
      btn.disabled = false;
    }
  }

  document.querySelectorAll(".plan").forEach((el) => el.addEventListener("click", () => selectPlan(el.dataset.plan)));
  document.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => selectTab(el.dataset.tab)));
  document.querySelectorAll("[data-coin]").forEach((el) => el.addEventListener("click", () => startCrypto(el.dataset.coin, el)));
  document.querySelectorAll("[data-copy]").forEach((el) => el.addEventListener("click", async () => {
    await navigator.clipboard.writeText($(el.dataset.copy).textContent);
    const label = el.textContent; el.textContent = "Copied"; setTimeout(() => (el.textContent = label), 1500);
  }));
  $("paystack-btn")?.addEventListener("click", payWithPaystack);
  $("paystack-check")?.addEventListener("click", checkPaystack);
  $("tx-btn")?.addEventListener("click", submitTx);

  const firstTab = document.querySelector("[data-tab]");
  if (firstTab) selectTab(firstTab.dataset.tab);
  selectPlan(plan);
})();
`;
