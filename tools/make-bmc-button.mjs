// README'deki "Kahve hediye et" butonunu üretir: popup'taki butonla aynı (#FFDD00, siyah çerçeve, Lato Bold).
// Yazı çizgiye (path) çevrilir; GitHub SVG'leri sıkı bir güvenlik politikasıyla sunduğu için
// gömülü font yüklenmeyebilir, çizgiler her yerde aynı görünür.
import fs from 'node:fs';
import opentype from 'opentype.js';

const TEXT = 'Kahve hediye et';
const SIZE = 16;
const buf = fs.readFileSync('node_modules/@fontsource/lato/files/lato-latin-700-normal.woff');
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const textX = 45;
const baseline = 27.5;
const glyphs = font.getPath(TEXT, textX, baseline, SIZE);
const width = Math.ceil(textX + font.getAdvanceWidth(TEXT, SIZE) + 16);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="46" viewBox="0 0 ${width} 46" role="img" aria-label="${TEXT}">
  <title>${TEXT}</title>
  <rect x="1" y="3" width="${width - 2}" height="42" rx="10" fill="#000"/>
  <rect x="1.75" y="1.75" width="${width - 3.5}" height="40.5" rx="9.25" fill="#FFDD00" stroke="#000" stroke-width="1.5"/>
  <g transform="translate(13 9.5)">
    <path d="M4.5 9.5h11.2v5.3a4.7 4.7 0 0 1-4.7 4.7H9.2a4.7 4.7 0 0 1-4.7-4.7V9.5Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M15.7 11h1.4a2.4 2.4 0 0 1 0 4.8h-1.8" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M8 3.8c-.6.8.6 1.4 0 2.4M11.2 3.8c-.6.8.6 1.4 0 2.4" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round"/>
  </g>
  <path d="${glyphs.toPathData(2)}" fill="#000"/>
</svg>
`;
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/kahve-hediye-et.svg', svg);
console.log(`assets/kahve-hediye-et.svg (${width}x46, ${(svg.length / 1024).toFixed(1)} KB)`);
