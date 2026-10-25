process.env.AI_API_KEYS = "k1,k2,k3";
process.env.AI_MODELS = "model-a,model-b,model-c,model-d,model-e,model-f";
process.env.AI_BASE_URL = "https://example.test/v1";
process.env.AI_VISION_MODELS = "";
process.env.VISION_API_KEYS = "";

const calls = [];
let mode = "same-org";

global.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  const key = options.headers.Authorization.replace("Bearer ", "");
  calls.push({ mode, model: body.model, key, chars: body.messages.reduce((n, message) => n + String(message.content).length, 0), max: body.max_completion_tokens ?? body.max_tokens });
  const fail = (status, detail) => ({
    ok: false,
    status,
    body: null,
    headers: { get: (name) => (name === "retry-after" ? "2" : null) },
    text: async () => detail,
  });
  if (mode === "same-org" && body.model === "model-a") {
    return fail(429, "Rate limit reached for model `model-a` in organization `org_same` on tokens per minute (TPM): Limit 6000, Requested 50. Please try again in 2s.");
  }
  if (mode === "different-org" && key !== "k3") {
    return fail(429, `Rate limit reached in organization \`org_${key}\` on requests per minute (RPM). Please try again in 2s.`);
  }
  if (mode === "bad-model" && body.model !== "model-d") {
    return fail(404, `The model \`${body.model}\` does not exist`);
  }
  if (mode === "shrink" && calls.filter((call) => call.mode === "shrink").length === 1) {
    return fail(413, "Request too large for model `model-f` on tokens per minute (TPM): Limit 6000, Requested 9000.");
  }
  return { ok: true, status: 200, body: { stream: true }, headers: { get: () => null }, text: async () => "" };
};

const { streamChat } = await import("../src/ai.js");
const user = (text) => [{ role: "user", content: [{ type: "text", text }] }];

mode = "same-org";
const same = await streamChat({ messages: user("hello"), hasImages: false, maxTokens: 200 });
const sameCalls = calls.filter((call) => call.mode === "same-org");
if (sameCalls.length !== 3) throw new Error(`same-org calls ${sameCalls.length}: ${JSON.stringify(sameCalls)}`);
if (sameCalls.filter((call) => call.model === "model-a").length !== 2) throw new Error("third key was used for a shared account");
if (same.model !== "model-b") throw new Error(`expected model-b, got ${same.model}`);

mode = "different-org";
const different = await streamChat({ messages: user("hello"), hasImages: false, maxTokens: 200 });
const differentCalls = calls.filter((call) => call.mode === "different-org");
if (!differentCalls.some((call) => call.key === "k3")) {
  throw new Error(`different orgs did not reach the spare key: ${JSON.stringify(differentCalls)}`);
}
if (differentCalls.length < 2) throw new Error("different orgs stopped too early");

mode = "bad-model";
const retired = await streamChat({ messages: user("hello"), hasImages: false, maxTokens: 200 });
const retiredCalls = calls.filter((call) => call.mode === "bad-model" && call.model !== "model-d");
if (!retiredCalls.length || retiredCalls.some((call, index) => retiredCalls.findIndex((other) => other.model === call.model) !== index)) {
  throw new Error(`bad model was retried on other keys: ${JSON.stringify(retiredCalls)}`);
}
if (retired.model !== "model-d") throw new Error(`expected model-d, got ${retired.model}`);

mode = "shrink";
const shrunk = await streamChat({ messages: user("x".repeat(20_000)), hasImages: false, maxTokens: 2000 });
const shrinkCalls = calls.filter((call) => call.mode === "shrink");
if (shrinkCalls.length !== 2) throw new Error(`shrink calls ${shrinkCalls.length}`);
if (!(shrinkCalls[1].chars < shrinkCalls[0].chars) || shrinkCalls[1].chars > 12_000) {
  throw new Error(`transcript was not shortened: ${JSON.stringify(shrinkCalls)}`);
}
if (shrinkCalls[1].max !== 768) throw new Error(`output cap ${shrinkCalls[1].max}`);
void different;
void shrunk;

console.log("failover checks passed");
