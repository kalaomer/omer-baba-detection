// Eklentinin dışarıdan yükleyemeyeceği dosyaları (MV3 uzaktan kod/istek istemiyoruz) kopyalar:
// onnxruntime-web'in WASM sürümü ve popup fontları.
import fs from 'node:fs';
import path from 'node:path';

const copies = [
  ['node_modules/onnxruntime-web/dist', 'extension/vendor/ort', ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']],
  ['node_modules/@fontsource/big-shoulders-display/files', 'extension/fonts', ['big-shoulders-display-latin-800-normal.woff2', 'big-shoulders-display-latin-ext-800-normal.woff2']],
  ['node_modules/@fontsource/lato/files', 'extension/fonts', ['lato-latin-700-normal.woff2', 'lato-latin-ext-700-normal.woff2']],
];

// OFL, lisans metninin font dosyalarıyla birlikte dağıtılmasını şart koşar
const licenses = [
  ['node_modules/@fontsource/big-shoulders-display/LICENSE', 'extension/fonts/OFL-BigShouldersDisplay.txt'],
  ['node_modules/@fontsource/lato/LICENSE', 'extension/fonts/OFL-Lato.txt'],
];

for (const [src, dst, files] of copies) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
    console.log(`${f} -> ${dst}`);
  }
}
for (const [src, dst] of licenses) {
  fs.copyFileSync(src, dst);
  console.log(`${path.basename(dst)} -> ${path.dirname(dst)}`);
}
// onnxruntime-web paketi lisans dosyası içermiyor; MIT metni extension/vendor/ort/LICENSE olarak depoda duruyor.
