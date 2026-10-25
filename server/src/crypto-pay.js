import { randomInt } from "node:crypto";
import { config } from "./config.js";
import { CRYPTO_METHODS, createPayment, fulfillPayment, getPayment, refTaken, setPaymentStatus } from "./billing.js";
import { db } from "./db.js";
import { PAID_PLANS } from "./plans.js";

const EVM_CHAINS = {
  bsc: {
    name: "BNB Smart Chain",
    networkHint: "BEP20",
    rpcUrl: () => config.crypto.bscRpcUrl,
    address: () => config.crypto.bscAddress,
    confirmations: () => config.crypto.bscConfirmations,
  },
  eth: {
    name: "Ethereum",
    networkHint: "ERC20",
    rpcUrl: () => config.crypto.ethRpcUrl,
    address: () => config.crypto.ethAddress,
    confirmations: () => config.crypto.ethConfirmations,
  },
};
const EVM_TOKENS = {
  usdt_bsc: { chain: "bsc", contract: "0x55d398326f99059ff775485246999027b3197955", decimals: 18n },
  usdc_bsc: { chain: "bsc", contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18n },
  usdc_eth: { chain: "eth", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6n },
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Transactions mined shortly before the order was opened still count (clock skew, fast payers).
const EARLY_GRACE_MS = 10 * 60 * 1000;
const LATE_GRACE_MS = 60 * 60 * 1000;

export class PaymentCheckError extends Error {}

export function cryptoMethodsAvailable() {
  const methods = [];
  if (config.crypto.bscAddress) methods.push("usdt_bsc", "usdc_bsc");
  if (config.crypto.ethAddress) methods.push("usdc_eth");
  if (config.crypto.ltcAddress) methods.push("ltc");
  return methods;
}

const addressFor = (method) =>
  method === "ltc" ? config.crypto.ltcAddress : EVM_CHAINS[EVM_TOKENS[method].chain].address();

/** Decimal string -> integer in the smallest unit. */
function toUnits(value, decimals) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(Number(decimals))).slice(0, Number(decimals)) || "0");
}

let ltcPriceCache = { usd: 0, at: 0 };
async function ltcUsdPrice() {
  if (Date.now() - ltcPriceCache.at < 60_000 && ltcPriceCache.usd) return ltcPriceCache.usd;
  const sources = [
    async () => {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd", {
        signal: AbortSignal.timeout(8000),
      });
      return Number((await res.json())?.litecoin?.usd);
    },
    async () => {
      const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT", { signal: AbortSignal.timeout(8000) });
      return Number((await res.json())?.price);
    },
  ];
  for (const source of sources) {
    try {
      const usd = await source();
      if (usd > 0) {
        ltcPriceCache = { usd, at: Date.now() };
        return usd;
      }
    } catch {}
  }
  throw new PaymentCheckError("We couldn't get the Litecoin price right now. Please try again or pay with USDT.");
}

function amountInUse(method, amount) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM payments WHERE method = ? AND amount = ? AND status IN ('pending', 'confirming') AND expires_at > ?")
      .get(method, amount, Date.now())
  );
}

/** Opens a crypto order with a unique amount so the payment can be matched to it. */
export async function createCryptoOrder(user, plan, method) {
  if (!cryptoMethodsAvailable().includes(method)) throw new PaymentCheckError("That payment method isn't available.");
  const usd = PAID_PLANS[plan].usd;
  const now = Date.now();

  let amount;
  let expiresAt;
  if (method === "ltc") {
    const price = await ltcUsdPrice();
    const base = Math.ceil((usd / price) * 1e5) / 1e5;
    for (let i = 0; i < 20 && (!amount || amountInUse(method, amount)); i++) {
      amount = (base + randomInt(1, 100) / 1e5).toFixed(5);
    }
    expiresAt = now + config.crypto.ltcQuoteMinutes * 60_000;
  } else {
    for (let i = 0; i < 20 && (!amount || amountInUse(method, amount)); i++) {
      amount = (usd + randomInt(1, 200) / 1000).toFixed(3);
    }
    expiresAt = now + config.crypto.orderMinutes * 60_000;
  }

  const info = CRYPTO_METHODS[method];
  const payment = createPayment({ userId: user.id, plan, method, amount, currency: info.currency, expiresAt });
  return { payment, address: addressFor(method), ...info };
}

async function evmRpc(chain, method, params) {
  const res = await fetch(chain.rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${chain.name} RPC ${method}: ${data.error.message}`);
  return data.result;
}

/** Reads a token transfer: amount sent to our address, confirmations and block time. */
async function inspectEvmTx(txid, method) {
  const token = EVM_TOKENS[method];
  const chain = EVM_CHAINS[token.chain];
  const receipt = await evmRpc(chain, "eth_getTransactionReceipt", [txid]);
  if (!receipt) return { found: false };
  if (receipt.status !== "0x1") return { found: true, failed: true };

  const ours = chain.address();
  let received = 0n;
  for (const log of receipt.logs || []) {
    if (
      log.address?.toLowerCase() === token.contract &&
      log.topics?.[0] === TRANSFER_TOPIC &&
      `0x${String(log.topics?.[2] || "").slice(26)}`.toLowerCase() === ours
    ) {
      received += BigInt(log.data);
    }
  }
  const [latest, block] = await Promise.all([
    evmRpc(chain, "eth_blockNumber", []),
    evmRpc(chain, "eth_getBlockByNumber", [receipt.blockNumber, false]),
  ]);
  return {
    found: true,
    received,
    confirmations: Number(BigInt(latest) - BigInt(receipt.blockNumber)) + 1,
    blockTime: Number(BigInt(block.timestamp)) * 1000,
    needed: chain.confirmations(),
  };
}

async function inspectLtcTx(txid) {
  const res = await fetch(`${config.crypto.ltcApiUrl}/tx/${txid}`, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404 || res.status === 400) return { found: false };
  if (!res.ok) throw new Error(`LTC API ${res.status}`);
  const tx = await res.json();

  let received = 0n;
  for (const out of tx.vout || []) {
    if (out.scriptpubkey_address === config.crypto.ltcAddress) received += BigInt(out.value);
  }
  let confirmations = 0;
  if (tx.status?.confirmed) {
    const tip = await fetch(`${config.crypto.ltcApiUrl}/blocks/tip/height`, { signal: AbortSignal.timeout(15000) });
    confirmations = Number(await tip.text()) - tx.status.block_height + 1;
  }
  return {
    found: true,
    received,
    confirmations,
    blockTime: tx.status?.block_time ? tx.status.block_time * 1000 : Date.now(),
    needed: config.crypto.ltcConfirmations,
  };
}

/**
 * Checks a transaction ID against an order. Returns { status, message } where status is
 * "paid", "confirming", "review" or "error". Safe to call repeatedly while confirming.
 */
export async function submitCryptoTx(user, paymentId, rawTxid) {
  const payment = getPayment(paymentId);
  if (!payment || payment.user_id !== user.id || !CRYPTO_METHODS[payment.method]) {
    return { status: "error", message: "We couldn't find this order. Please start again." };
  }
  if (payment.status === "paid") return { status: "paid", message: "Payment received." };
  if (payment.status === "review") return { status: "review", message: reviewMessage() };

  const isLtc = payment.method === "ltc";
  let txid = String(rawTxid || "").trim();
  if (isLtc) txid = txid.toLowerCase();
  else txid = (txid.startsWith("0x") ? txid : `0x${txid}`).toLowerCase();
  if (!(isLtc ? /^[0-9a-f]{64}$/ : /^0x[0-9a-f]{64}$/).test(txid)) {
    return { status: "error", message: "That doesn't look like a transaction ID. Copy it from your wallet's transaction details." };
  }

  const chain = isLtc ? null : EVM_CHAINS[EVM_TOKENS[payment.method].chain];
  const providerRef = `${isLtc ? "ltc" : EVM_TOKENS[payment.method].chain}:${txid}`;
  if (refTaken(providerRef, payment.id)) {
    return { status: "error", message: "This transaction has already been used for another order." };
  }

  let tx;
  try {
    tx = isLtc ? await inspectLtcTx(txid) : await inspectEvmTx(txid, payment.method);
  } catch (error) {
    console.error("Crypto check failed:", error);
    return { status: "error", message: "We couldn't reach the blockchain to check this. Please try again in a minute." };
  }

  if (!tx.found) {
    return {
      status: "error",
      message: isLtc
        ? "We can't see this transaction yet. If you just sent it, wait a minute and try again."
        : `We can't find this transaction on ${chain.name}. Make sure you sent it on the ${chain.networkHint} network.`,
    };
  }
  if (tx.failed) return { status: "error", message: "This transaction failed on the blockchain, so no funds were sent." };
  if (tx.received === 0n) {
    return {
      status: "error",
      message: isLtc
        ? "This transaction didn't send Litecoin to our address."
        : `This transaction didn't send ${CRYPTO_METHODS[payment.method].label} to our address on ${chain.name}.`,
    };
  }
  if (tx.blockTime < payment.created_at - EARLY_GRACE_MS) {
    return { status: "error", message: "This transaction was made before this order was opened. Please use a new payment." };
  }

  const decimals = isLtc ? 8n : EVM_TOKENS[payment.method].decimals;
  const expected = toUnits(payment.amount, decimals);
  // Stablecoins must match the order to the cent tail; Litecoin may be up to 1% over the quote.
  const tolerance = isLtc ? expected / 100n : toUnits("0.001", decimals);
  const exact = tx.received >= expected && tx.received < expected + tolerance;
  const late = payment.expires_at && tx.blockTime > payment.expires_at + LATE_GRACE_MS;

  try {
    if (!exact || late) {
      const sent = Number(tx.received) / 10 ** Number(decimals);
      setPaymentStatus(payment.id, "review", {
        providerRef,
        detail: late ? `Paid after the quote expired (${sent})` : `Amount ${sent} instead of ${payment.amount}`,
      });
      return { status: "review", message: reviewMessage() };
    }
    if (tx.confirmations < tx.needed) {
      setPaymentStatus(payment.id, "confirming", { providerRef });
      return {
        status: "confirming",
        message: `Payment found. Waiting for confirmations (${Math.max(tx.confirmations, 0)} of ${tx.needed})…`,
      };
    }
    const result = fulfillPayment(payment.id, { providerRef, detail: `${tx.confirmations} confirmations` });
    return result === "review" ? { status: "review", message: reviewMessage() } : { status: "paid", message: "Payment received." };
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return { status: "error", message: "This transaction has already been used for another order." };
    }
    throw error;
  }
}

function reviewMessage() {
  return `We received a payment that doesn't exactly match this order, so we're checking it by hand. You'll hear from us at your account email, usually within a day. Questions: ${config.supportEmail}`;
}
