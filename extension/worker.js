// Çıkarım worker'ı: content script'ten gelen kareleri (ImageBitmap) analiz eder.
// Eklenti origin'inde çalışır; YouTube'un ana thread'ini ve CSP'sini etkilemez.
import * as ort from './vendor/ort/ort.wasm.min.mjs';
import { FacePipeline } from './core.js';

ort.env.wasm.wasmPaths = new URL('./vendor/ort/', import.meta.url).href;
ort.env.wasm.numThreads = 1; // YouTube içinde cross-origin isolation yok -> tek thread
ort.env.logLevel = 'error';

let pipe = null;
let centroid = null;
let canvas = null;
let ctx = null;

const ready = (async () => {
  const load = (p) => fetch(new URL(p, import.meta.url)).then((r) => r.arrayBuffer());
  const [det, rec, refs] = await Promise.all([
    load('./models/det_500m.onnx'),
    load('./models/w600k_mbf.onnx'),
    fetch(new URL('./refs/omer.json', import.meta.url)).then((r) => r.json()),
  ]);
  const so = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  pipe = await FacePipeline.create(ort, new Uint8Array(det), new Uint8Array(rec), so);
  centroid = Float32Array.from(refs.centroid);
  return refs;
})();

function readPixels(bitmap) {
  const { width, height } = bitmap;
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height, channels: 4 };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function handle(port, msg) {
  if (msg.type !== 'frame') return;
  const t0 = performance.now();
  try {
    await ready;
    const frame = readPixels(msg.bitmap);
    if (msg.minFaceFrac != null) pipe.opts.minFaceFrac = msg.minFaceFrac;
    const { faces, totalDetected } = await pipe.analyze(frame);
    port.postMessage({
      type: 'result',
      id: msg.id,
      width: frame.width,
      height: frame.height,
      totalDetected,
      faces: faces.map((f) => ({ box: f.box, score: f.score, sim: dot(f.emb, centroid) })),
      ms: performance.now() - t0,
    });
  } catch (err) {
    msg.bitmap?.close?.();
    port.postMessage({ type: 'error', id: msg.id, error: String(err?.message || err) });
  }
}

self.onmessage = (e) => {
  if (e.data?.type !== 'port') return;
  const port = e.ports[0];
  // Kareler sırayla işlenir; content script zaten bir seferde tek kare gönderiyor.
  let chain = Promise.resolve();
  port.onmessage = (ev) => (chain = chain.then(() => handle(port, ev.data)));
  ready
    .then((refs) => port.postMessage({ type: 'ready', threshold: refs.threshold, faces: refs.faces }))
    .catch((err) => port.postMessage({ type: 'fatal', error: String(err?.message || err) }));
};
