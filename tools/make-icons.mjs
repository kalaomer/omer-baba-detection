// Eklenti ikonlarını üretir: Pusu kırmızısı zemin üzerinde "ileri sar" işareti (popup'taki işaretle aynı).
// 128 px ikon Chrome Web Store kuralına göre 96 px çizim + her yanda 16 px şeffaf boşluktur;
// araç çubuğundaki küçük boyutlar (16/32/48) okunaklı olsun diye kenara kadar doludur.
import fs from 'node:fs';
import sharp from 'sharp';

const GLYPH =
  'M3 5.2c0-.8.9-1.3 1.6-.8l7.4 6.1c.5.4.5 1.1 0 1.5l-7.4 6.1c-.7.5-1.6 0-1.6-.8V5.2Zm8 0c0-.8.9-1.3 1.6-.8l7.4 6.1c.5.4.5 1.1 0 1.5l-7.4 6.1c-.7.5-1.6 0-1.6-.8V5.2Z';

// 96x96 çizim; offset ile 128'lik tuvale yerleştirilir
const art = (offset) => `
  <g transform="translate(${offset} ${offset})">
    <rect width="96" height="96" rx="22" fill="#d62839"/>
    <g transform="translate(22.5 21.6) scale(2.2)" fill="#fff">
      <path d="${GLYPH}"/><rect x="20" y="4.5" width="2.4" height="15" rx="1.2"/>
    </g>
  </g>`;

const padded = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${art(16)}</svg>`);
const full = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="512" height="512">${art(0)}</svg>`);

for (const size of [16, 32, 48]) {
  await sharp(full).resize(size, size).png().toFile(`extension/icons/${size}.png`);
}
await sharp(padded).png().toFile('extension/icons/128.png');
fs.mkdirSync('store', { recursive: true });
fs.copyFileSync('extension/icons/128.png', 'store/icon-128.png');
console.log('ikonlar hazır (extension/icons, store/icon-128.png)');
