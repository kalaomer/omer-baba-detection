// Eklenti ikonlarını tek bir SVG'den üretir: kırmızı zemin üzerinde "ileri sar" işareti.
import sharp from 'sharp';

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#cc0000"/>
  <path d="M30 36 L62 64 L30 92 Z M62 36 L94 64 L62 92 Z" fill="#fff"/>
  <rect x="94" y="36" width="10" height="56" rx="3" fill="#fff"/>
</svg>`);

for (const size of [16, 32, 48, 128]) {
  await sharp(svg).resize(size, size).png().toFile(`extension/icons/${size}.png`);
}
console.log('ikonlar hazır');
