// Chrome Web Store görsellerini üretir: 1280x800 ekran görüntüleri, 440x280 küçük ve 1400x560 büyük
// tanıtım görselleri -> store/. Popup görüntüleri gerçek ekran görüntüleridir (store/src/); perde ve
// bildirim eklentinin kendi CSS'iyle (extension/content.css) çizilir. Video alanı nötr bir zemindir,
// dizi karesi kullanılmaz.
//
// Kullanım: node tools/make-store-assets.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('.');
const url = (p) => 'file://' + path.join(root, p);
const OUT = path.join(root, 'store');

const GLYPH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.2c0-.8.9-1.3 1.6-.8l7.4 6.1c.5.4.5 1.1 0 1.5l-7.4 6.1c-.7.5-1.6 0-1.6-.8V5.2Zm8 0c0-.8.9-1.3 1.6-.8l7.4 6.1c.5.4.5 1.1 0 1.5l-7.4 6.1c-.7.5-1.6 0-1.6-.8V5.2Z"/><rect x="20" y="4.5" width="2.4" height="15" rx="1.2"/></svg>';

const BASE_CSS = `
@font-face { font-family: "BSD"; font-weight: 800; src: url(${url('extension/fonts/big-shoulders-display-latin-800-normal.woff2')}) format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F; }
@font-face { font-family: "BSD"; font-weight: 800; src: url(${url('extension/fonts/big-shoulders-display-latin-ext-800-normal.woff2')}) format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+1E00-1E9F; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { overflow: hidden; background: #111215; color: #eeeff1;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
.stage { position: relative; width: 100vw; height: 100vh; overflow: hidden;
  background: radial-gradient(70% 90% at 88% 12%, rgba(214, 40, 57, 0.20), transparent 60%),
              radial-gradient(60% 70% at 0% 100%, rgba(255, 255, 255, 0.04), transparent 60%), #111215; }
.brand { display: flex; align-items: center; gap: 12px; }
.mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: #d62839;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.1), 0 2px 8px rgba(214,40,57,.35); color: #fff; flex: none; }
.mark svg { width: 21px; height: 21px; margin-left: 1px; fill: currentColor; }
.word { font: 800 28px/1 "BSD", "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .01em; white-space: nowrap; }
.word em { font-style: normal; color: #ff4e5c; }
h1 { font: 800 68px/0.95 "BSD", "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .005em; margin: 0; text-wrap: balance; }
h1 em { font-style: normal; color: #ff4e5c; }
.lead { font-size: 21px; line-height: 1.45; color: #b9bcc5; margin: 0; text-wrap: pretty; }
.points { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.points li { display: flex; gap: 12px; align-items: baseline; font-size: 18px; line-height: 1.4; color: #d7d9de; }
.points li::before { content: ""; flex: none; width: 8px; height: 8px; border-radius: 50%; background: #ff4e5c; translate: 0 -2px; }
.popup { display: block; border-radius: 18px; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 30px 80px rgba(0,0,0,.55), 0 8px 24px rgba(0,0,0,.35); }
.player { position: relative; overflow: hidden; border-radius: 14px;
  background: radial-gradient(55% 75% at 28% 40%, #3d4d59 0%, transparent 70%),
              radial-gradient(45% 60% at 74% 58%, #5b4838 0%, transparent 70%),
              linear-gradient(160deg, #1d2329, #121417);
  box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 30px 80px rgba(0,0,0,.5); }
.player .bar { position: absolute; left: 16px; right: 16px; bottom: 34px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.25); }
.player .bar i { position: absolute; inset: 0 auto 0 0; width: 58%; border-radius: inherit; background: #ff0033; }
.player .time { position: absolute; left: 16px; bottom: 10px; font: 500 13px/1 Roboto, system-ui, sans-serif; color: rgba(255,255,255,.85); }
/* Mağaza önizlemesinde okunaklı olsun diye oynatıcı içi arayüz büyütülür */
.player .obs-cover-inner { zoom: 1.4; }
.player .obs-toast { zoom: 1.5; left: 11px; bottom: 36px; }
`;

const brand = `<div class="brand"><span class="mark">${GLYPH}</span><span class="word">Ömer Baba <em>Atlatıcı</em></span></div>`;

const cover = `
  <div class="obs-cover is-open" data-mode="skip">
    <div class="obs-cover-inner">
      <span class="obs-cover-icon">${GLYPH}</span>
      <div class="obs-cover-title">Ömer Baba sahnesi geçiliyor</div>
      <div class="obs-cover-sub">Sahne bitince oynatma devam eder</div>
      <span class="obs-cover-progress" aria-hidden="true"></span>
      <button type="button" class="obs-btn">Yine de izle</button>
    </div>
  </div>`;

const toast = `
  <div class="obs-toast is-open" style="animation: none">
    <span class="obs-toast-icon">${GLYPH}</span>
    <span class="obs-toast-text"><span class="obs-toast-title">Ömer Baba sahnesi geçildi</span><span class="obs-toast-detail">18 sn atlandı · görünmeden</span></span>
    <button type="button" class="obs-toast-action">Geri al</button>
    <span class="obs-toast-timer" style="animation: none; scale: .62 1"></span>
  </div>`;

const assets = [
  {
    file: 'screenshot-1-onden-tarama.png', w: 1280, h: 800,
    html: `<div class="stage">
      <div style="position:absolute;left:96px;top:84px;width:560px;display:grid;gap:30px">
        ${brand}
        <h1>Ömer Baba <em>görünmeden</em> geçilir</h1>
        <p class="lead">YouTube'un zaten indirdiği ileri kareleri önden tarar; Ömer Baba ekrana gelmeden sahnenin sonuna atlar.</p>
        <ul class="points">
          <li>Popup'taki canlı şerit önümüzdeki 30 saniyeyi gösterir</li>
          <li>Yüz tanıma tamamen bilgisayarında çalışır</li>
          <li>Hiçbir görüntü dışarı gönderilmez</li>
        </ul>
      </div>
      <img class="popup" src="${url('store/src/popup-light.png')}" style="position:absolute;right:104px;top:62px;width:376px">
    </div>`,
  },
  {
    file: 'screenshot-2-perde.png', w: 1280, h: 800,
    html: `<div class="stage">
      <div style="position:absolute;left:96px;top:72px;right:96px;display:flex;justify-content:space-between;align-items:flex-end;gap:40px">
        <div style="display:grid;gap:22px">${brand}<h1 style="font-size:56px">Sahne geçilirken <em>perde iner</em></h1></div>
        <p class="lead" style="max-width:380px;font-size:19px">Ses kapanır, sahne bitince oynatma kendiliğinden devam eder. "Yine de izle" ile istediğin an iptal edersin.</p>
      </div>
      <div class="player" style="position:absolute;left:176px;top:262px;width:928px;height:490px">${cover}</div>
    </div>`,
  },
  {
    file: 'screenshot-3-geri-al.png', w: 1280, h: 800,
    html: `<div class="stage">
      <div style="position:absolute;left:96px;top:72px;right:96px;display:flex;justify-content:space-between;align-items:flex-end;gap:40px">
        <div style="display:grid;gap:22px">${brand}<h1 style="font-size:56px">Fikrini değiştirirsen <em>geri al</em></h1></div>
        <p class="lead" style="max-width:380px;font-size:19px">Her atlamadan sonra 6 saniye boyunca "Geri al" çıkar; o sahne bölünmeden oynar.</p>
      </div>
      <div class="player" style="position:absolute;left:176px;top:262px;width:928px;height:490px">
        <div class="bar"><i></i></div><div class="time">70:52 / 1:59:42</div>
        ${toast}
      </div>
    </div>`,
  },
  {
    file: 'screenshot-4-ayarlar.png', w: 1280, h: 800,
    html: `<div class="stage">
      <img class="popup" src="${url('store/src/popup-dark.png')}" style="position:absolute;left:112px;top:62px;width:376px">
      <div style="position:absolute;left:600px;top:150px;width:584px;display:grid;gap:30px">
        <h1>Kontrol <em>sende</em></h1>
        <ul class="points">
          <li>Yalnızca seçtiğin kanallarda çalışır: varsayılan @KurtlarVadisi ve @KurtlarVadisiOfficial</li>
          <li>235. bölüm ve sonrasında, Ömer Baba'nın olmadığı videolarda taramaz</li>
          <li>İstersen yalnızca Ömer Baba karede tek başınayken atlar</li>
          <li>Açık kaynak, MIT lisanslı; Shorts'ta çalışmaz</li>
        </ul>
      </div>
    </div>`,
  },
  {
    file: 'promo-small-440x280.png', w: 440, h: 280,
    html: `<div class="stage" style="display:grid;place-items:center">
      <div style="display:flex;align-items:center;gap:20px">
        <span class="mark" style="width:92px;height:92px;border-radius:24px"><span style="display:grid;place-items:center">${GLYPH.replace('<svg', '<svg style="width:50px;height:50px;margin-left:2px"')}</span></span>
        <div class="word" style="font-size:46px;line-height:.92">Ömer Baba<br><em>Atlatıcı</em></div>
      </div>
    </div>`,
  },
  {
    file: 'promo-marquee-1400x560.png', w: 1400, h: 560,
    html: `<div class="stage">
      <div style="position:absolute;left:120px;top:150px;display:grid;gap:26px;width:640px">
        <div style="display:flex;align-items:center;gap:22px">
          <span class="mark" style="width:84px;height:84px;border-radius:22px">${GLYPH.replace('<svg', '<svg style="width:44px;height:44px;margin-left:2px"')}</span>
          <div class="word" style="font-size:72px">Ömer Baba <em>Atlatıcı</em></div>
        </div>
        <p class="lead" style="font-size:24px">Kurtlar Vadisi Pusu'da Ömer Baba sahneleri, o ekrana gelmeden geçilir.</p>
      </div>
      <img class="popup" src="${url('store/src/popup-light.png')}" style="position:absolute;right:130px;top:48px;width:360px">
    </div>`,
  },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-assets-'));
const browser = await chromium.launch({ channel: 'chromium' });
for (const a of assets) {
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
  const file = path.join(tmp, a.file.replace('.png', '.html'));
  fs.writeFileSync(file, `<!doctype html><html lang="tr"><meta charset="utf-8">
    <link rel="stylesheet" href="${url('extension/content.css')}"><style>${BASE_CSS}</style><body>${a.html}</body></html>`);
  await page.goto('file://' + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, a.file) });
  await page.close();
  console.log(`store/${a.file} (${a.w}x${a.h})`);
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
