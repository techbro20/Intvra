import net from "node:net";

function expandIPv6(ip) {
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - left.length - right.length : 0;
  return [...left, ...Array(missing).fill("0"), ...right].map((part) => part.padStart(4, "0").toLowerCase());
}

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * Groups an IP into the network it represents: the full IPv4 address, or the /64 prefix for IPv6
 * (one home usually gets a whole /64). Returns null for loopback, private and unknown addresses.
 */
export function networkKey(rawIp) {
  let ip = String(rawIp || "").trim();
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) ip = ip.slice(7);

  if (net.isIPv4(ip)) return isPrivateIPv4(ip) ? null : ip;
  if (net.isIPv6(ip)) {
    const groups = expandIPv6(ip.split("%")[0]);
    const first = groups[0];
    if (groups.every((g, i) => (i === 7 ? g === "0001" : g === "0000"))) return null;
    if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb")) return null;
    if (first.startsWith("fc") || first.startsWith("fd")) return null;
    return `${groups.slice(0, 4).join(":")}::/64`;
  }
  return null;
}
