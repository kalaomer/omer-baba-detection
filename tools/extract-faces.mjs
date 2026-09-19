// Videolardan yüz çıkarma: ffmpeg ile kareleri ham RGB olarak okur, eklentinin
// kullandığı çekirdekle (extension/core.js) tespit + hizalama + embedding yapar.
//
// Kullanım: node tools/extract-faces.mjs <video-dizini> <çıktı-dizini> [fps=1] [minFaceFrac=0.06]
// Çıktı: meta.jsonl (yüz başına bir satır), emb.f32 (N x 512 float32), crops/<i>.jpg (112x112 hizalı yüz)

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { FacePipeline } from '../extension/core.js';

const [videoDir, outDir, fpsArg = '1', minFaceArg = '0.06'] = process.argv.slice(2);
if (!videoDir || !outDir) {
  console.error('Kullanım: node tools/extract-faces.mjs <video-dizini> <çıktı-dizini> [fps] [minFaceFrac]');
  process.exit(1);
}
const MODELS = path.resolve('extension/models');
const LONG_SIDE = 640; // tarayıcıda da kareler bu uzun kenarla yakalanıyor

const pipe = await FacePipeline.create(
  ort,
  path.join(MODELS, 'det_500m.onnx'),
  path.join(MODELS, 'w600k_mbf.onnx'),
  {},
  { minFaceFrac: Number(minFaceArg), maxFaces: 6 },
);

fs.mkdirSync(path.join(outDir, 'crops'), { recursive: true });
const metaOut = fs.createWriteStream(path.join(outDir, 'meta.jsonl'));
const embOut = fs.createWriteStream(path.join(outDir, 'emb.f32'));
let faceIdx = 0;

function probeSize(file) {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
    .toString().trim().split(',').map(Number);
  const s = LONG_SIDE / Math.max(w, h);
  const even = (v) => Math.round(v / 2) * 2;
  return [even(w * s), even(h * s)];
}

async function* frames(file, w, h, fps) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const size = w * h * 3;
  let buf = Buffer.alloc(0);
  let n = 0;
  for await (const chunk of ff.stdout) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= size) {
      yield { t: n++ / fps, frame: { data: new Uint8Array(buf.subarray(0, size)), width: w, height: h, channels: 3 } };
      buf = buf.subarray(size);
    }
  }
}

const files = fs.readdirSync(videoDir).filter((f) => /\.(mp4|webm|mkv)$/.test(f)).sort();
for (const f of files) {
  const vid = f.replace(/\.[^.]+$/, '');
  const file = path.join(videoDir, f);
  const [w, h] = probeSize(file);
  const t0 = Date.now();
  let nFrames = 0, nFaces = 0;
  for await (const { t, frame } of frames(file, w, h, Number(fpsArg))) {
    nFrames++;
    const { faces } = await pipe.analyze(frame);
    for (const face of faces) {
      const crop = Buffer.from(Uint8Array.from(face.aligned, (v) => Math.max(0, Math.min(255, Math.round(v)))));
      await sharp(crop, { raw: { width: 112, height: 112, channels: 3 } }).jpeg({ quality: 85 }).toFile(path.join(outDir, 'crops', `${faceIdx}.jpg`));
      embOut.write(Buffer.from(face.emb.buffer));
      metaOut.write(JSON.stringify({
        i: faceIdx, vid, t: +t.toFixed(2), score: +face.score.toFixed(3),
        hFrac: +(face.h / h).toFixed(3), box: face.box.map((v) => Math.round(v)), W: w, H: h,
      }) + '\n');
      faceIdx++;
      nFaces++;
    }
  }
  console.log(`${vid}: ${nFrames} kare, ${nFaces} yüz, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
}
metaOut.end();
embOut.end();
console.log(`Toplam ${faceIdx} yüz -> ${outDir}`);
await pipe.release(); // onnxruntime-node, oturumlar açıkken çıkışta çöküyor
