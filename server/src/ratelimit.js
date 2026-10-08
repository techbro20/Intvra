// In-memory sliding-window limiter; fine for a single server process.
export function createLimiter({ windowMs, max }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return function limited(key) {
    const now = Date.now();
    const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
    times.push(now);
    hits.set(key, times);
    return times.length > max;
  };
}
