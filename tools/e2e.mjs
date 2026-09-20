// Uçtan uca test: eklentiyi Playwright Chromium'a yükler, bir YouTube videosunu oynatır,
// eklentinin durumunu ve video zamanındaki sıçramaları (= atlanan sahneler) raporlar.
//
// Kullanım: node tools/e2e.mjs <videoId> [saniye=60] [ekran-görüntüsü-dizini] [--start=SANİYE] [--off] [--headed]
//            [--shorts] [--undo] [--quality=hd1080] [--ranges] [--alone] [--nofilter]
//   --off: eklenti yüklü ama kapalı (karşılaştırma için)
//   --shorts: /shorts/ sayfası (eklenti orada çalışmamalı)
//   --alone: "yalnızca tek başınayken geç" modu; --nofilter: kanal filtresi kapalı
//   --expert: bilirkişi modu (sahne atlanmaz, kutu çıkar; Ömer Baba'nın görülmesi beklenir)
//   --askskip: kutu çıkınca "Sahneyi geç"e bas (yalnızca --expert ile anlamlı)
//   --expertAt=N: N. saniyede bilirkişi modunu aç (video oynarken açma yolu)
//   --flipAt=N: N. saniyede kanal filtresini kapat; --noepisode: bölüm kuralı (235+ tarama) kapalı

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v = true] = a.slice(2).split('='); return [k, v]; }));
const [videoId, secondsArg = '60', shotDir] = args;
const seconds = Number(secondsArg);
const ext = path.resolve('extension');
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-e2e-'));
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

const ctx = await chromium.launchPersistentContext(userDir, {
  channel: 'chromium',
  headless: !flags.headed,
  viewport: { width: 1280, height: 800 },
  locale: 'tr-TR',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
// Paketlenmemiş eklentinin kimliği, klasör yolunun SHA-256'sından türetilir (a-p alfabesi).
const extId = [...crypto.createHash('sha256').update(ext).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');
// Ayarları video açılmadan önce yaz
{
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup.html`);
  await p.evaluate((f) => chrome.storage.local.set({ debug: true, enabled: !f.off, alone: !!f.alone, expert: !!f.expert, channelFilter: !f.nofilter, episodeCutoff: !f.noepisode }), flags);
  await p.close();
}
const page = await ctx.newPage();
page.on('console', (m) => m.text().includes('Ömer Baba') && console.log('  [konsol]', m.text()));

const url = flags.shorts
  ? `https://www.youtube.com/shorts/${videoId}`
  : `https://www.youtube.com/watch?v=${videoId}${flags.start ? `&t=${flags.start}s` : ''}`;
await page.goto(url);
const consent = page.locator('button:has-text("Tümünü kabul et"), button:has-text("Accept all")').first();
if (await consent.isVisible({ timeout: 6000 }).catch(() => false)) {
  await consent.click();
  console.log('çerez onayı geçildi');
}
await page.waitForSelector('video', { timeout: 30000 });

console.log('eklenti id:', extId);
if (flags.quality) {
  // Sayfa bağlamındaki oynatıcı API'si ile kaliteyi zorla (ör. --quality=hd1080)
  await page.evaluate((q) => document.getElementById('movie_player')?.setPlaybackQualityRange?.(q, q), flags.quality);
}

const status = () =>
  page.evaluate(() => {
    document.documentElement.dispatchEvent(new Event('omer-baba:status'));
    const v = [...document.querySelectorAll('video')].find((x) => x.videoWidth) || document.querySelector('video');
    const player = v?.closest('.html5-video-player');
    if (v?.paused && !player?.classList.contains('ad-showing')) v.play().catch(() => {});
    player?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern')?.click();
    return {
      t: v?.currentTime ?? null,
      paused: v?.paused,
      ad: !!player?.classList.contains('ad-showing'),
      ext: JSON.parse(document.documentElement.dataset.omerBaba || 'null'),
      toast: document.querySelector('.obs-toast:not([hidden])')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      ask: document.querySelector('.obs-ask:not([hidden])')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      path: location.pathname,
      ranges: (() => {
        const fmt = (x) => { const r = []; for (let i = 0; x && i < x.buffered.length; i++) r.push(`${x.buffered.start(i).toFixed(0)}-${x.buffered.end(i).toFixed(0)}`); return r.join(','); };
        const sv = document.querySelector('omer-baba-shadow')?.shadowRoot?.querySelector('video');
        return { main: fmt(v), shadow: fmt(sv), res: v ? `${v.videoWidth}x${v.videoHeight}` : '', broken: sv?.dataset.broken ?? null, srcMatch: sv ? sv.dataset.src === v?.src : null };
      })(),
      buf: (() => {
        for (let i = 0; v && i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.1 && v.buffered.end(i) >= v.currentTime) return v.buffered.end(i) - v.currentTime;
        }
        return 0;
      })(),
    };
  });

let prev = null;
let jumps = 0;
let undone = false;
let asked = false;
let liveHits = 0;
const msList = [];
for (let i = 0; i < seconds; i++) {
  await page.waitForTimeout(1000);
  const s = await status();
  const e = s.ext || {};
  if (e.lastMs) msList.push(e.lastMs);
  if (e.lastSims?.some((x) => x >= (e.threshold ?? 0.36))) liveHits++;
  const navigated = prev && prev.path !== s.path;
  if (navigated) console.log(`      -> sayfa değişti: ${prev.path} => ${s.path}`);
  const jumped = !navigated && prev?.t != null && s.t != null && !s.ad && s.t - prev.t > 2.5;
  if (jumped) jumps++;
  const line = `${String(i + 1).padStart(3)}s  t=${s.t?.toFixed(1).padStart(6)}  ${s.ad ? 'REKLAM ' : ''}${s.paused ? 'durdu ' : ''}` +
    `tampon=${s.buf?.toFixed(0).padStart(3)}s kanal=${e.channel?.handle ?? '?'}:${e.channel?.allowed === true ? 'izinli' : e.channel?.allowed === false ? `DIŞI(${e.channel.reason})` : 'bekliyor'}${e.channel?.episode ? ` bölüm=${e.channel.episode}` : ''} gölge=${e.shadowPresent ? 'var' : 'yok'} hazır=${e.detectorReady ? 'e' : 'h'} durum=${e.state} perde=${e.covered ? 'e' : 'h'} ` +
    `sims=${JSON.stringify(e.lastSims)} ms=${e.lastMs?.toFixed(0)}${e.detectorError ? ' HATA=' + e.detectorError : ''}` +
    `${e.la ? ` önden=+${e.la.ahead ?? '-'}s seek=${e.la.seekMs?.toFixed(0) ?? '-'}ms önceden=${e.la.preSkips}${e.la.scene ? ` sahne=${e.la.scene.start}-${e.la.scene.endKnown ? e.la.scene.resume : '?'}` : ''}` : ''}` +
    `${e.lastError ? ' sonHata=' + e.lastError : ''}${jumped ? `  <<< SIÇRAMA +${(s.t - prev.t).toFixed(1)}s` : ''}${s.toast ? `  [toast: ${s.toast}]` : ''}${s.ask ? `  [kutu: ${s.ask}]` : ''}`;
  console.log(line);
  if (flags.ranges && i % 5 === 0) console.log(`      tampon aralıkları: ana=[${s.ranges.main}] gölge=[${s.ranges.shadow}] çözünürlük=${s.ranges.res} bozuk=${s.ranges.broken} src-eşleşme=${s.ranges.srcMatch}`);
  if (flags.expertAt && i + 1 === Number(flags.expertAt)) {
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/popup.html`);
    await p.evaluate(() => chrome.storage.local.set({ expert: true }));
    await p.close();
    console.log('      -> bilirkişi modu açıldı');
  }
  if (flags.flipAt && i + 1 === Number(flags.flipAt)) {
    // Oynatma sırasında kanal filtresini kapat (gölge tamponun sonradan açılma yolunu test eder)
    const p = await ctx.newPage();
    await p.goto(`chrome-extension://${extId}/popup.html`);
    await p.evaluate(() => chrome.storage.local.set({ channelFilter: false }));
    await p.close();
    console.log('      -> kanal filtresi kapatıldı');
  }
  if (flags.askskip && s.ask && !asked) {
    asked = true;
    await page.locator('.obs-ask .obs-toast-action').click();
    console.log('      -> "Sahneyi geç" tıklandı');
  }
  if (flags.undo && s.toast && !undone) {
    undone = true;
    await page.locator('.obs-toast button').click();
    console.log('      -> "Geri al" tıklandı');
  }
  if (shotDir && (jumped || e.covered || i % 15 === 0)) {
    await page.locator(flags.shorts ? '#shorts-player' : '#movie_player').first().screenshot({ path: path.join(shotDir, `${String(i + 1).padStart(3, '0')}.jpg`), quality: 70, type: 'jpeg' }).catch(() => {});
  }
  prev = s;
}
msList.sort((a, b) => a - b);
console.log(`\nSıçrama sayısı: ${jumps} · ekranda Ömer Baba görülen örnek: ${liveHits}`);
if (msList.length) console.log(`Kare analiz süresi (ms): medyan=${msList[msList.length >> 1].toFixed(1)} p90=${msList[Math.floor(msList.length * 0.9)].toFixed(1)}`);
await ctx.close();
fs.rmSync(userDir, { recursive: true, force: true });
