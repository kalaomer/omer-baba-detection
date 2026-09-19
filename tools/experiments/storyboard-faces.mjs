// Storyboard deneyi (reddedildi, bkz. README): YouTube'un ilerleme çubuğu önizleme karolarını
// eklentinin çekirdeğiyle analiz eder. storyboard.py fetch ile inen klasörü okur, faces.json yazar.
//
// Kullanım: node tools/experiments/storyboard-faces.mjs data/storyboard/<id> [--align <video dosyası>]
//   --align: karoların videodaki hangi ana denk geldiğini ölçer (ofset başına ortalama MSE)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { FacePipeline } from '../../extension/core.js';

const args = process.argv.slice(2);
const sbDir = args[0];
const align = args.includes('--align') ? args[args.indexOf('--align') + 1] : null;
if (!sbDir) {
  console.error('Kullanım: node tools/experiments/storyboard-faces.mjs <storyboard klasörü> [--align <video>]');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(path.join(sbDir, 'spec.json')));
const interval = 1 / spec.fps;
const refs = JSON.parse(fs.readFileSync('extension/refs/omer.json'));
const c = Float32Array.from(refs.centroid);
const pipe = await FacePipeline.create(ort, 'extension/models/det_500m.onnx', 'extension/models/w600k_mbf.onnx', {}, { minFaceFrac: 0.06, maxFaces: 6 });

// Karoları ayır: her sayfa columns x rows karodan oluşur
const tiles = [];
for (let s = 0; s < spec.n; s++) {
  const file = path.join(sbDir, `${String(s).padStart(3, '0')}.webp`);
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tw = info.width / spec.columns;
  const th = info.height / spec.rows;
  for (let r = 0; r < spec.rows; r++) {
    for (let col = 0; col < spec.columns; col++) {
      const buf = new Uint8Array(tw * th * 3);
      for (let y = 0; y < th; y++) {
        const from = ((r * th + y) * info.width + col * tw) * 3;
        buf.set(data.subarray(from, from + tw * 3), y * tw * 3);
      }
      tiles.push({ k: tiles.length, frame: { data: buf, width: tw, height: th, channels: 3 } });
    }
  }
}
console.log(`${tiles.length} karo, ${tiles[0].frame.width}x${tiles[0].frame.height}, ${interval.toFixed(3)} sn aralık`);

if (align) {
  const grab = (t, w, h) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', align, '-frames:v', '1', '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 24 });
  const mse = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length;
  const sample = [0.05, 0.15, 0.3, 0.5, 0.65, 0.85].map((f) => Math.floor(f * tiles.length));
  for (const off of [0, 0.25, 0.5, 0.75].map((f) => f * interval)) {
    const errs = sample.map((k) => mse(tiles[k].frame.data, grab(k * interval + off, tiles[k].frame.width, tiles[k].frame.height)));
    console.log(`ofset +${off.toFixed(1)} sn -> ortalama MSE ${(errs.reduce((a, b) => a + b) / errs.length).toFixed(0)}`);
  }
}

const dot = (e) => e.reduce((s, v, i) => s + v * c[i], 0);
const rows = [];
for (const t of tiles) {
  const { faces } = await pipe.analyze(t.frame);
  rows.push({ k: t.k, t: +(t.k * interval).toFixed(2), faces: faces.map((f) => ({ sim: +dot(f.emb).toFixed(3), hPx: Math.round(f.h) })) });
}
fs.writeFileSync(path.join(sbDir, 'faces.json'), JSON.stringify(rows));
console.log(`Yazıldı: ${path.join(sbDir, 'faces.json')}`);
await pipe.release(); // onnxruntime-node, oturumlar açıkken çıkışta çöküyor
