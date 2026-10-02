// Absolute URLs are required: onnxruntime resolves a relative wasm path against
// its own module URL, not the page, which breaks under Vite's dep optimizer.
export function getVadAssetOptions() {
  const base = new URL("./vad/", window.location.href).href;
  return {
    baseAssetPath: base,
    onnxWASMBasePath: base,
  };
}
