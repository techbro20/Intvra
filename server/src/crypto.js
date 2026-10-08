import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const sha256Base64Url = (value) => createHash("sha256").update(value).digest("base64url");

export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
