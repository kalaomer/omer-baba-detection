// Ortak yüz hattı: SCRFD (det_500m) ile tespit + ArcFace (w600k_mbf) ile embedding.
// Saf JS; aynı kod hem Node'da (onnxruntime-node, referans çıkarma) hem de
// eklenti worker'ında (onnxruntime-web) çalışır. Böylece referans embedding'leri
// ile canlı embedding'ler aynı ön/son işlemden geçer.
//
// Frame formatı: { data: Uint8Array|Uint8ClampedArray, width, height, channels: 3|4 } (RGB/RGBA)

const DET_MEAN = 127.5;
const DET_STD = 128.0;
const REC_MEAN = 127.5;
const REC_STD = 127.5;
const REC_SIZE = 112;
const STRIDES = [8, 16, 32];
const ANCHORS_PER_CELL = 2;

// insightface arcface_dst: 112x112 hizalı yüzde 5 landmark'ın hedef konumları
const ARCFACE_DST = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export const DEFAULTS = {
  detLongSide: 320, // tespit girişi uzun kenarı (px); uzak/küçük yüzler zaten umursanmıyor
  detThresh: 0.5,
  nmsIou: 0.4,
  minFaceFrac: 0.1, // yüz yüksekliği / kare yüksekliği bunun altındaysa yok say
  maxFaces: 4, // karede embedding'i çıkarılacak en büyük N yüz
};

function sampleBilinear(frame, x, y, out, o) {
  const { data, width, height, channels: c } = frame;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let ch = 0; ch < 3; ch++) {
    let v = 0;
    for (let dy = 0; dy < 2; dy++) {
      const yy = y0 + dy;
      if (yy < 0 || yy >= height) continue;
      const wy = dy ? fy : 1 - fy;
      for (let dx = 0; dx < 2; dx++) {
        const xx = x0 + dx;
        if (xx < 0 || xx >= width) continue;
        const wx = dx ? fx : 1 - fx;
        v += data[(yy * width + xx) * c + ch] * wx * wy;
      }
    }
    out[o + ch] = v;
  }
}

// Kareyi uzun kenarı detLongSide olacak şekilde küçültür, 32'nin katına pad'ler,
// SCRFD normalizasyonuyla CHW Float32 tensör verisi döner.
export function makeDetInput(frame, longSide = DEFAULTS.detLongSide) {
  const scale = Math.min(1, longSide / Math.max(frame.width, frame.height));
  const rw = Math.round(frame.width * scale);
  const rh = Math.round(frame.height * scale);
  const iw = Math.ceil(rw / 32) * 32;
  const ih = Math.ceil(rh / 32) * 32;
  const plane = iw * ih;
  const input = new Float32Array(3 * plane).fill((0 - DET_MEAN) / DET_STD);
  const px = new Float32Array(3);
  const sx = frame.width / rw;
  const sy = frame.height / rh;
  for (let y = 0; y < rh; y++) {
    const srcY = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < rw; x++) {
      sampleBilinear(frame, (x + 0.5) * sx - 0.5, srcY, px, 0);
      const i = y * iw + x;
      input[i] = (px[0] - DET_MEAN) / DET_STD;
      input[plane + i] = (px[1] - DET_MEAN) / DET_STD;
      input[2 * plane + i] = (px[2] - DET_MEAN) / DET_STD;
    }
  }
  return { input, iw, ih, scaleX: rw / frame.width, scaleY: rh / frame.height };
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

// SCRFD çıktılarını (model sırasıyla: 3 skor, 3 bbox, 3 kps) kutulara çevirir.
export function decodeScrfd(outs, iw, ih, scaleX, scaleY, thresh = DEFAULTS.detThresh, nmsIou = DEFAULTS.nmsIou) {
  const cands = [];
  for (let k = 0; k < STRIDES.length; k++) {
    const st = STRIDES[k];
    const fw = Math.floor(iw / st);
    const fh = Math.floor(ih / st);
    const scores = outs[k];
    const bbox = outs[k + 3];
    const kps = outs[k + 6];
    const n = fw * fh * ANCHORS_PER_CELL;
    for (let i = 0; i < n; i++) {
      const s = scores[i];
      if (s < thresh) continue;
      const cell = Math.floor(i / ANCHORS_PER_CELL);
      const cx = (cell % fw) * st;
      const cy = Math.floor(cell / fw) * st;
      const b = [
        (cx - bbox[i * 4] * st) / scaleX,
        (cy - bbox[i * 4 + 1] * st) / scaleY,
        (cx + bbox[i * 4 + 2] * st) / scaleX,
        (cy + bbox[i * 4 + 3] * st) / scaleY,
      ];
      const pts = [];
      for (let j = 0; j < 5; j++) {
        pts.push([(cx + kps[i * 10 + 2 * j] * st) / scaleX, (cy + kps[i * 10 + 2 * j + 1] * st) / scaleY]);
      }
      cands.push({ box: b, score: s, kps: pts });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const c of cands) {
    if (keep.every((k) => iou(k.box, c.box) <= nmsIou)) keep.push(c);
  }
  return keep;
}

// 5 nokta -> ArcFace şablonu arası benzerlik dönüşümü (en küçük kareler, = Umeyama).
// Döner: [a, b, tx, ty]  =>  u = a*x - b*y + tx,  v = b*x + a*y + ty
export function estimateSimilarity(src, dst = ARCFACE_DST) {
  const n = src.length;
  let mx = 0, my = 0, ux = 0, uy = 0;
  for (let i = 0; i < n; i++) {
    mx += src[i][0]; my += src[i][1];
    ux += dst[i][0]; uy += dst[i][1];
  }
  mx /= n; my /= n; ux /= n; uy /= n;
  let v = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - mx, sy = src[i][1] - my;
    const dx = dst[i][0] - ux, dy = dst[i][1] - uy;
    v += sx * sx + sy * sy;
    sa += sx * dx + sy * dy;
    sb += sx * dy - sy * dx;
  }
  const a = sa / v;
  const b = sb / v;
  return [a, b, ux - (a * mx - b * my), uy - (b * mx + a * my)];
}

// Yüzü 112x112'ye hizalar; RGB HWC float (0..255) döner.
export function alignFace(frame, kps) {
  const [a, b, tx, ty] = estimateSimilarity(kps);
  const det = a * a + b * b;
  const out = new Float32Array(REC_SIZE * REC_SIZE * 3);
  for (let v = 0; v < REC_SIZE; v++) {
    for (let u = 0; u < REC_SIZE; u++) {
      const du = u - tx, dv = v - ty;
      const x = (a * du + b * dv) / det;
      const y = (-b * du + a * dv) / det;
      sampleBilinear(frame, x, y, out, (v * REC_SIZE + u) * 3);
    }
  }
  return out;
}

function writeRecInput(aligned, dst, offset) {
  const plane = REC_SIZE * REC_SIZE;
  for (let i = 0; i < plane; i++) {
    dst[offset + i] = (aligned[i * 3] - REC_MEAN) / REC_STD;
    dst[offset + plane + i] = (aligned[i * 3 + 1] - REC_MEAN) / REC_STD;
    dst[offset + 2 * plane + i] = (aligned[i * 3 + 2] - REC_MEAN) / REC_STD;
  }
}

function l2normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export class FacePipeline {
  constructor(ort, det, rec, opts = {}) {
    this.ort = ort;
    this.det = det;
    this.rec = rec;
    this.opts = { ...DEFAULTS, ...opts };
  }

  // model: dosya yolu (Node) ya da ArrayBuffer/Uint8Array (tarayıcı)
  static async create(ort, detModel, recModel, sessionOptions = {}, opts = {}) {
    const det = await ort.InferenceSession.create(detModel, sessionOptions);
    const rec = await ort.InferenceSession.create(recModel, sessionOptions);
    return new FacePipeline(ort, det, rec, opts);
  }

  async release() {
    await this.det.release();
    await this.rec.release();
  }

  async detect(frame) {
    const { input, iw, ih, scaleX, scaleY } = makeDetInput(frame, this.opts.detLongSide);
    const feeds = { [this.det.inputNames[0]]: new this.ort.Tensor('float32', input, [1, 3, ih, iw]) };
    const res = await this.det.run(feeds);
    const outs = this.det.outputNames.map((n) => res[n].data);
    return decodeScrfd(outs, iw, ih, scaleX, scaleY, this.opts.detThresh, this.opts.nmsIou);
  }

  // faces[i].aligned (HWC float) doldurulmuş olmalı; embedding'leri L2-normalize döner
  async embed(faces) {
    if (!faces.length) return [];
    const per = 3 * REC_SIZE * REC_SIZE;
    const batch = new Float32Array(per * faces.length);
    faces.forEach((f, i) => writeRecInput(f.aligned, batch, i * per));
    const feeds = { [this.rec.inputNames[0]]: new this.ort.Tensor('float32', batch, [faces.length, 3, REC_SIZE, REC_SIZE]) };
    const res = await this.rec.run(feeds);
    const out = res[this.rec.outputNames[0]].data;
    const dim = out.length / faces.length;
    return faces.map((_, i) => l2normalize(Float32Array.from(out.subarray(i * dim, (i + 1) * dim))));
  }

  // Tespit + boyut filtresi + hizalama + embedding. Büyükten küçüğe sıralı yüzler döner.
  async analyze(frame) {
    const { minFaceFrac, maxFaces } = this.opts;
    const all = await this.detect(frame);
    const faces = all
      .map((f) => ({ ...f, h: f.box[3] - f.box[1] }))
      .filter((f) => f.h >= minFaceFrac * frame.height)
      .sort((a, b) => b.h - a.h)
      .slice(0, maxFaces);
    for (const f of faces) f.aligned = alignFace(frame, f.kps);
    const embs = await this.embed(faces);
    faces.forEach((f, i) => (f.emb = embs[i]));
    return { faces, totalDetected: all.length };
  }
}

// Referans prototiplerine göre skor: en yakın k prototipin kosinüs benzerliği ortalaması.
export function scoreEmbedding(emb, protos, dim = 512, topK = 3) {
  const n = protos.length / dim;
  const sims = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    let s = 0;
    const o = p * dim;
    for (let i = 0; i < dim; i++) s += emb[i] * protos[o + i];
    sims[p] = s;
  }
  sims.sort();
  const k = Math.min(topK, n);
  let t = 0;
  for (let i = n - k; i < n; i++) t += sims[i];
  return t / k;
}
