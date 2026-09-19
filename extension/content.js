// Ömer Baba Atlatıcı — YouTube content script.
// Oynayan videodan saniyede ~4 kare yakalar, eklenti worker'ına gönderir; Ömer Baba
// yoğun bir sahne tespit edilince perdeyi çekip sesi kapatır ve sahne bitene kadar ileri sarar.
(() => {
  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const CAPTURE_LONG_SIDE = 640; // referanslar da bu çözünürlükte çıkarıldı
  const SAMPLE_MS = 250;
  const MIN_FACE_FRAC = 0.1; // uzak çekimler umursanmıyor
  const WINDOW = 3; // son N örnek
  const TRIGGER_HITS = 2; // N örnekten kaçı isabetse sahne "Ömer Baba sahnesi"
  const PROBE_STEP = 2; // atlarken kaç saniyede bir bakılacak
  const CLEAN_PROBES = 3; // art arda bu kadar temiz bakış = sahne bitti
  const DEFAULT_THRESHOLD = 0.36;
  const SUPPRESS_GRACE = 10; // "izle" dendikten sonra Ömer Baba bu kadar sn görünmezse koruma biter
  // Önden tarama (gölge video, bkz. mse-hook.js)
  const LA_STEP = 1; // tarama ızgarası (sn); sahne başı ayrıca 0.5 sn'ye inceltilir
  const LA_MIN_AHEAD = 0.5; // şu andan en az bu kadar ilerisi taranır
  const LA_LEAD = 0.15; // sahneden önceki son temiz örnekten bu kadar önce atla
  const SCENE_GAP = 10; // Ömer Baba bu kadar sn görünmezse sahne bitti (diyalogdaki karşı çekimler sahneye dahil)
  const SCENE_MIN_HITS = 2; // tek karelik isabetle önceden atlama yapma
  const HYST = 0.08; // sahne içindeyken eşik bu kadar düşer (dönüp giden / profil Ömer Baba kuyruğu)
  const RESUME_PAD = 0.25; // sahne sonrası devam noktasına eklenen pay (sn)
  const LIVE_MS_COVERED = 1000; // zaman çizelgesi şu anı kapsıyorsa canlı örnekleme aralığı
  const { DEFAULT_CHANNELS, channelKey } = globalThis.OmerBabaChannels; // channels.js

  // alone: yalnızca Ömer Baba karede tek başınayken geç; channelFilter: yalnızca listedeki kanallarda çalış
  const settings = {
    enabled: true, threshold: null, debug: false, lookahead: true,
    alone: false, channelFilter: true, channels: DEFAULT_CHANNELS,
    // episodeCutoff: başlığındaki bölüm numarası episodeFrom ve üstündeyse tarama (Ömer Baba 233. bölümde vefat ediyor)
    episodeCutoff: true, episodeFrom: 235,
  };
  let refsThreshold = DEFAULT_THRESHOLD;
  const threshold = () => settings.threshold ?? refsThreshold;
  // Sahne içi (histerezis) eşik; negatif videolardaki en yüksek skorun (0.26) altına inmez
  const weakThreshold = () => Math.max(threshold() - HYST, 0.28);

  chrome.storage.local.get(settings).then((s) => Object.assign(settings, s));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const k of Object.keys(settings)) if (changes[k]) settings[k] = changes[k].newValue;
    if (changes.channels || changes.channelFilter || changes.episodeCutoff || changes.episodeFrom) gate = { vid: null, allowed: null, info: null };
    if (!settings.debug) debugLayer?.remove();
    if (!settings.enabled && state === 'watch') uncover();
  });

  // ---------------- Dedektör bağlantısı (gizli eklenti iframe'i + worker) ----------------
  let port = null;
  let detectorReady = false;
  let detectorError = null;
  let nextId = 1;
  const pending = new Map();

  function ensureDetector() {
    if (port) return;
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('detector.html');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = onWorkerMessage;
    iframe.addEventListener('load', () => {
      iframe.contentWindow.postMessage({ type: 'omer-baba:connect' }, EXT_ORIGIN, [channel.port2]);
    }, { once: true });
    document.documentElement.appendChild(iframe);
  }

  function onWorkerMessage(e) {
    const m = e.data;
    if (m.type === 'ready') {
      detectorReady = true;
      refsThreshold = m.threshold ?? DEFAULT_THRESHOLD;
      console.info(`[Ömer Baba Atlatıcı] dedektör hazır (${m.faces} referans yüz, eşik ${refsThreshold})`);
    } else if (m.type === 'fatal') {
      detectorError = m.error;
      console.error('[Ömer Baba Atlatıcı] dedektör başlatılamadı:', m.error);
    } else if (pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  }

  function captureSize(video) {
    const s = Math.min(1, CAPTURE_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    return [Math.round(video.videoWidth * s), Math.round(video.videoHeight * s)];
  }

  async function analyze(video) {
    const [w, h] = captureSize(video);
    const bitmap = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ type: 'error', error: 'timeout' });
      }, 5000);
      pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      port.postMessage({ type: 'frame', id, bitmap, minFaceFrac: MIN_FACE_FRAC }, [bitmap]);
    });
  }

  // Bir kare/örnek için Ömer Baba skoru. Tek başına modunda karede başka (büyük) yüz varsa sayılmaz.
  // n: boyut filtresinden (%10) geçen yüz sayısı; uzaktaki yüzler zaten hesaba katılmıyor.
  const omerScore = (sim, n) => (n === 0 || (settings.alone && n !== 1) ? -1 : sim);
  const frameScore = (r) => (r.type === 'result' ? omerScore(Math.max(-1, ...r.faces.map((f) => f.sim)), r.faces.length) : -1);
  const isHit = (r) => frameScore(r) >= threshold();

  // ---------------- Video / oynatıcı yardımcıları ----------------
  const isVideoPage = () => location.pathname === '/watch'; // Shorts'ta çalışmaz
  const playerOf = (video) => video.closest('.html5-video-player') || video.parentElement;
  const isAd = (video) => playerOf(video)?.classList.contains('ad-showing');

  function findVideo() {
    let best = null;
    let bestScore = 0;
    for (const v of document.querySelectorAll('video')) {
      if (!v.videoWidth) continue;
      const r = v.getBoundingClientRect();
      const score = r.width * r.height * (v.paused ? 1 : 10);
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best;
  }

  // Seek eder ve yeni kare ekrana gelene kadar bekler. Kare gelmezse (takılma) false döner.
  function seekTo(video, t, timeoutMs = 6000, waitFrame = true) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('canplay', onCanPlay);
        resolve(ok);
      };
      const onCanPlay = () => finish(video.readyState >= 2);
      const onSeeked = () => {
        if (video.readyState >= 2 && !waitFrame) finish(true);
        else if (video.readyState >= 2 && 'requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => finish(true));
        else video.addEventListener('canplay', onCanPlay, { once: true });
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      video.addEventListener('seeked', onSeeked);
      video.currentTime = t;
    });
  }

  // ---------------- Perde, ses, toast ----------------
  const SKIP_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.2c0-.8.9-1.3 1.6-.8l7.4 6.1c.5.4.5 1.1 0 1.5l-7.4 6.1c-.7.5-1.6 0-1.6-.8V5.2Zm8 0c0-.8.9-1.3 1.6-.8l7.4 6.1c.5.4.5 1.1 0 1.5l-7.4 6.1c-.7.5-1.6 0-1.6-.8V5.2Z"/><rect x="20" y="4.5" width="2.4" height="15" rx="1.2"/></svg>';
  const COVER_TEXT = {
    detect: ['Ömer Baba tespit edildi', 'Emin olunca sahne geçilecek'],
    skip: ['Ömer Baba sahnesi geçiliyor', 'Sahne bitince oynatma devam eder'],
  };
  const TOAST_MS = 6000;

  let overlay = null;
  let toast = null;
  let covered = false;
  let muteRestore = null; // { video, muted }

  // Perde/toast üzerindeki tıklamalar YouTube oynatıcısına geçip videoyu durdurmasın
  const swallow = (el) => {
    for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      el.addEventListener(ev, (e) => e.stopPropagation());
    }
  };

  // mode: 'detect' (ilk isabet, doğrulanıyor) | 'skip' (sahne geçiliyor)
  function cover(video, mode = 'skip') {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'obs-cover';
      overlay.setAttribute('role', 'status');
      overlay.innerHTML = `
        <div class="obs-cover-inner">
          <span class="obs-cover-icon">${SKIP_ICON}</span>
          <div class="obs-cover-title"></div>
          <div class="obs-cover-sub"></div>
          <span class="obs-cover-progress" aria-hidden="true"></span>
          <button type="button" class="obs-btn">Yine de izle</button>
        </div>`;
      overlay.querySelector('button').addEventListener('click', watchAnyway);
      swallow(overlay);
    }
    const [title, sub] = COVER_TEXT[mode];
    overlay.querySelector('.obs-cover-title').textContent = title;
    overlay.querySelector('.obs-cover-sub').textContent = sub;
    overlay.dataset.mode = mode;
    const host = playerOf(video);
    if (overlay.parentElement !== host) host.appendChild(overlay);
    clearTimeout(overlay._hideTimer);
    overlay.hidden = false;
    overlay.classList.add('is-open'); // geçişsiz: Ömer Baba bir kare bile görünmesin
    covered = true;
    if (!muteRestore) {
      muteRestore = { video, muted: video.muted };
      video.muted = true;
    }
  }

  function uncover() {
    if (overlay && !overlay.hidden) {
      overlay.classList.remove('is-open'); // kalkarken yumuşak
      clearTimeout(overlay._hideTimer);
      overlay._hideTimer = setTimeout(() => (overlay.hidden = true), 200);
    }
    covered = false;
    if (muteRestore) {
      muteRestore.video.muted = muteRestore.muted;
      muteRestore = null;
    }
  }

  function armToastTimer(ms) {
    clearTimeout(toast._timer);
    toast._deadline = performance.now() + ms;
    toast._timer = setTimeout(hideToast, ms);
  }

  function hideToast() {
    if (!toast || toast.hidden) return;
    clearTimeout(toast._timer);
    toast.classList.remove('is-open');
    toast.classList.add('is-leaving');
    setTimeout(() => {
      if (!toast.classList.contains('is-leaving')) return;
      toast.hidden = true;
      toast.classList.remove('is-leaving');
    }, 180);
  }

  function showToast(video, { title, detail, action }) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'obs-toast';
      toast.setAttribute('role', 'status');
      toast.hidden = true;
      toast.innerHTML = `
        <span class="obs-toast-icon">${SKIP_ICON}</span>
        <span class="obs-toast-text"><span class="obs-toast-title"></span><span class="obs-toast-detail"></span></span>
        <button type="button" class="obs-toast-action"></button>
        <span class="obs-toast-timer" aria-hidden="true"></span>`;
      swallow(toast);
      toast.querySelector('.obs-toast-action').addEventListener('click', () => {
        hideToast();
        toast._action?.();
      });
      // Üzerine gelince süre durur, çıkınca kaldığı yerden devam eder
      toast.addEventListener('mouseenter', () => {
        clearTimeout(toast._timer);
        toast._remaining = Math.max(0, toast._deadline - performance.now());
      });
      toast.addEventListener('mouseleave', () => armToastTimer(toast._remaining ?? TOAST_MS));
    }
    toast.querySelector('.obs-toast-title').textContent = title;
    toast.querySelector('.obs-toast-detail').textContent = ` ${detail}`; // baştaki boşluk görünmez, ekran okuyucu ayırır
    const btn = toast.querySelector('.obs-toast-action');
    btn.hidden = !action;
    if (action) {
      btn.textContent = action.label;
      toast._action = action.run;
    }
    const host = playerOf(video);
    if (toast.parentElement !== host) host.appendChild(toast);
    const timer = toast.querySelector('.obs-toast-timer');
    timer.style.animation = 'none'; // süre çubuğunu baştan başlat
    toast.classList.remove('is-open', 'is-leaving');
    toast.hidden = false;
    void toast.offsetWidth; // giriş animasyonu başlangıç durumundan başlasın
    timer.style.animation = '';
    toast.classList.add('is-open');
    armToastTimer(TOAST_MS);
  }

  // ---------------- Debug katmanı ----------------
  let debugLayer = null;

  function drawDebug(video, r) {
    const host = playerOf(video);
    if (!debugLayer) {
      debugLayer = document.createElement('canvas');
      debugLayer.className = 'obs-debug';
    }
    if (debugLayer.parentElement !== host) host.appendChild(debugLayer);
    const hr = host.getBoundingClientRect();
    const vr = video.getBoundingClientRect();
    debugLayer.width = hr.width;
    debugLayer.height = hr.height;
    const ctx = debugLayer.getContext('2d');
    ctx.clearRect(0, 0, hr.width, hr.height);
    // object-fit: contain -> içerik dikdörtgeni
    const s = Math.min(vr.width / video.videoWidth, vr.height / video.videoHeight);
    const cw = video.videoWidth * s;
    const ch = video.videoHeight * s;
    const ox = vr.left - hr.left + (vr.width - cw) / 2;
    const oy = vr.top - hr.top + (vr.height - ch) / 2;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.lineWidth = 3;
    if (r.type === 'result') {
      for (const f of r.faces) {
        const [x1, y1, x2, y2] = f.box;
        const hit = f.sim >= threshold();
        const counted = hit && !(settings.alone && r.faces.length !== 1); // tek başına modunda yanında biri varsa sayılmaz
        ctx.strokeStyle = counted ? '#ff3b30' : hit ? '#ff9f0a' : '#34c759';
        ctx.fillStyle = ctx.strokeStyle;
        const x = ox + (x1 / r.width) * cw;
        const y = oy + (y1 / r.height) * ch;
        ctx.strokeRect(x, y, ((x2 - x1) / r.width) * cw, ((y2 - y1) / r.height) * ch);
        ctx.fillText(`${hit ? (counted ? 'ÖMER BABA ' : 'ÖMER BABA (yalnız değil) ') : ''}${f.sim.toFixed(2)}`, x, Math.max(14, y - 6));
      }
    }
    const info = r.type === 'result'
      ? `${r.ms.toFixed(0)} ms · ${r.faces.length}/${r.totalDetected} yüz · eşik ${threshold().toFixed(2)}${settings.alone ? ' · tek başına modu' : ''} · ${state} · pencere ${win.map((h) => (h ? '■' : '□')).join('')}`
      : `hata: ${r.error}`;
    const lines = [info, lookaheadSummary(video)];
    lines.forEach((text, i) => {
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(8, 8 + i * 26, ctx.measureText(text).width + 16, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, 16, 25 + i * 26);
    });
  }

  // ---------------- Durum makinesi ----------------
  let state = 'watch'; // 'watch' | 'skip'
  let win = [];
  let busy = false;
  let abortSkip = false;
  let lastResult = null;
  let lastLiveAt = 0;
  // { href, from, to }: bu aralıkta tetikleme yok (geri al / yine de izle). Ömer Baba görünmeye
  // devam ettikçe 'to' uzar; böylece kullanıcının izlemeyi seçtiği sahne bölünmez.
  let suppress = null;

  const suppressed = (video) =>
    suppress && suppress.href === location.href && video.currentTime >= suppress.from && video.currentTime <= suppress.to;

  function watchAnyway() {
    const video = findVideo();
    abortSkip = true;
    win = [];
    if (video) suppress = { href: location.href, from: video.currentTime - 5, to: video.currentTime + SUPPRESS_GRACE };
    uncover();
  }

  async function bumpStats(seconds) {
    const { stats } = await chrome.storage.local.get({ stats: { skips: 0, seconds: 0 } });
    stats.skips += 1;
    stats.seconds += seconds;
    await chrome.storage.local.set({ stats });
  }

  // pre: önden taramayla, Ömer Baba hiç görünmeden geçildi
  function finishSkip(video, href, start, pre = false) {
    const skipped = Math.max(0, video.currentTime - start);
    uncover();
    bumpStats(skipped);
    showToast(video, {
      title: 'Ömer Baba sahnesi geçildi',
      detail: `${Math.round(skipped)} sn atlandı${pre ? ' · görünmeden' : ''}`,
      action: {
        label: 'Geri al',
        run: () => {
          suppress = { href, from: start - 5, to: start + skipped + SUPPRESS_GRACE };
          video.currentTime = start;
        },
      },
    });
  }

  // origin: atlamanın kullanıcı açısından başladığı an (geri al buraya döner)
  async function skipScene(video, origin = video.currentTime) {
    state = 'skip';
    win = [];
    abortSkip = false;
    const href = location.href;
    const start = origin;
    cover(video, 'skip');

    // Önden tarama sahnenin sonunu zaten biliyorsa tek seferde oraya atla
    const sc = sceneAt(video.currentTime);
    const known = sc?.endKnown && sc.start <= video.currentTime + LA_STEP ? sc : null;
    if (known) await seekTo(video, known.resume + RESUME_PAD);

    let p = video.currentTime;
    let clean = known ? CLEAN_PROBES : 0;
    while (clean < CLEAN_PROBES && !abortSkip && location.href === href) {
      const end = video.duration - 0.5;
      if (p >= end) break;
      p = Math.min(p + PROBE_STEP, end);
      const ok = await seekTo(video, p);
      if (abortSkip || location.href !== href) break;
      if (!ok) break; // video takıldı; eski kareyle karar verme, olduğu yerde bırak
      const r = await analyze(video);
      if (settings.debug) drawDebug(video, r);
      if (settings.alone && r.type === 'result' && r.faces.length > 1 && Math.max(...r.faces.map((f) => f.sim)) >= weakThreshold()) break; // ikili çekim: burada dur
      clean = frameScore(r) >= weakThreshold() ? 0 : clean + 1;
    }

    if (location.href === href && !abortSkip) finishSkip(video, href, start);
    else if (!abortSkip) uncover();
    state = 'watch';
  }

  // ---------------- Önden tarama ----------------
  // YouTube'un tamponu gölge videoya aynalanır (mse-hook.js). Burada gölge video tamponun
  // ilerisine sarılıp analiz edilir; sonuçlar video zamanına göre bir zaman çizelgesinde tutulur.
  // samples: ms -> { sim: en yüksek benzerlik, n: yüz sayısı }; times: sıralı örnek zamanları (ms)
  const timeline = { key: null, samples: new Map(), times: [] };
  const laStats = { shadow: false, seekMs: null, scanned: 0, preSkips: 0 };
  const tkey = (t) => Math.round(t * 1000);
  const videoKey = () => (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null);

  function shadowFor(video) {
    const sv = document.querySelector('omer-baba-shadow')?.shadowRoot?.querySelector('video');
    if (!sv || sv.dataset.broken || !video.src || sv.dataset.src !== video.src) return null;
    return sv;
  }

  function bufferedEnd(v, t) {
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= t + 0.05 && v.buffered.end(i) > t) return v.buffered.end(i);
    }
    return null;
  }

  const sampleScore = (k) => {
    const v = timeline.samples.get(k);
    return v ? omerScore(v.sim, v.n) : -1;
  };
  const sampleHit = (t) => sampleScore(tkey(t)) >= threshold();
  const sampleWeak = (t) => sampleScore(tkey(t)) >= weakThreshold();

  // Sıradaki taranacak zaman: 1 sn'lik ızgara; sahne başı ve sonu geçişleri 0.5 sn'ye inceltilir
  function nextScanTime(now, sv) {
    const from = now + LA_MIN_AHEAD;
    const end = bufferedEnd(sv, from);
    if (end == null) return null;
    let prevT = null;
    for (let g = Math.ceil(from / LA_STEP) * LA_STEP; g < end - 0.1; g += LA_STEP) {
      if (!timeline.samples.has(tkey(g))) return g;
      const mid = g - LA_STEP / 2;
      if (prevT != null && !timeline.samples.has(tkey(mid))) {
        if (sampleWeak(g) && !sampleWeak(prevT)) return mid; // sahne başı (zayıf eşikle)
        if (sampleWeak(prevT) && !sampleWeak(g)) return mid; // sahne sonu
      }
      prevT = g;
    }
    return null;
  }

  function lowerBound(arr, v) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function recordSample(t, value) {
    const k = tkey(t);
    if (!timeline.samples.has(k)) timeline.times.splice(lowerBound(timeline.times, k), 0, k);
    timeline.samples.set(k, value);
  }

  function resetTimeline(key) {
    timeline.key = key;
    timeline.samples.clear();
    timeline.times.length = 0;
  }

  // t anındaki (ya da hemen sonrasındaki) ilk Ömer Baba sahnesini, kesintisiz taranmış örneklerden çıkarır.
  // Arama t'den önceki son örnekten başlar: o örnek temizse t'den önceki isabetler hesaba katılmaz
  // (az önce atlanmış bir sahnenin kuyruğu yeniden tetiklenmesin).
  // Döner: { start, prevMiss, lastHit, resume, endKnown, hits, covered } | { none, covered } | null (kapsama yok)
  function sceneAt(t) {
    if (timeline.key !== videoKey()) return null;
    const ts = timeline.times;
    let i = lowerBound(ts, tkey(t) + 1); // t'den sonraki ilk örnek
    if (i > 0 && ts[i - 1] >= tkey(t - LA_STEP) - 10) i--; // t'den önceki yakın örnekten başla
    if (i >= ts.length || ts[i] > tkey(t + LA_MIN_AHEAD + LA_STEP)) return null;
    let covered = ts[i] / 1000;
    let start = null, prevMiss = null, lastHit = null, resume = null, hits = 0;
    let runStart = null, lastClean = null; // sahne öncesi: kesintisiz zayıf isabet dizisinin başı, son temiz örnek
    for (; i < ts.length; i++) {
      const x = ts[i] / 1000;
      if (x - covered > LA_STEP + 0.01) break; // boşluk: kapsama bitti
      covered = x;
      const sim = sampleScore(ts[i]);
      const hit = sim >= threshold();
      const weak = sim >= weakThreshold();
      if (start == null) {
        // Sahne güçlü bir isabetle başlar, ama hemen önündeki zayıf isabetler de sahneye dahildir
        // (Ömer Baba'nın çekime ilk girdiği kareler çoğu zaman eşiğin biraz altında kalır).
        if (hit) {
          start = runStart ?? x;
          prevMiss = lastClean;
          lastHit = x;
          hits = 1;
        } else if (weak) {
          runStart ??= x;
        } else {
          runStart = null;
          lastClean = x;
        }
        continue;
      }
      // Tek başına modu: Ömer Baba karede başka biriyle görünüyorsa sahne burada biter (ikili çekim izlenir)
      const v = timeline.samples.get(ts[i]);
      if (settings.alone && v.n > 1 && v.sim >= weakThreshold()) {
        return { start, prevMiss, lastHit, resume: resume ?? x, endKnown: true, hits, covered };
      }
      if (weak) {
        lastHit = x;
        if (hit) hits++;
        resume = null;
      } else {
        if (resume == null) resume = x;
        if (x - lastHit >= SCENE_GAP) return { start, prevMiss, lastHit, resume, endKnown: true, hits, covered };
      }
    }
    return start == null ? { none: true, covered } : { start, prevMiss, lastHit, resume, endKnown: false, hits, covered };
  }

  function lookaheadSummary(video) {
    if (!settings.lookahead) return 'önden tarama: kapalı';
    if (!laStats.shadow) return 'önden tarama: gölge tampon yok (yalnızca canlı tespit)';
    const sc = sceneAt(video.currentTime);
    const ahead = sc ? Math.max(0, sc.covered - video.currentTime).toFixed(0) : '0';
    const scene = sc && !sc.none ? ` · sahne ${sc.start.toFixed(1)}–${sc.endKnown ? sc.resume.toFixed(1) : '?'} (${sc.hits} isabet)` : '';
    return `önden: +${ahead} sn tarandı · seek ${laStats.seekMs?.toFixed(0) ?? '-'} ms · önceden atlama ${laStats.preSkips}${scene}`;
  }

  async function scanStep() {
    let wait = 400;
    try {
      if (!settings.lookahead || !detectorReady || state !== 'watch' || !active()) return;
      const video = findVideo();
      if (!video || isAd(video)) return;
      const sv = shadowFor(video);
      laStats.shadow = !!sv;
      if (!sv) return;
      if (timeline.key !== videoKey()) resetTimeline(videoKey());
      const t = nextScanTime(video.currentTime, sv);
      if (t == null) return;
      const t0 = performance.now();
      if (!(await seekTo(sv, t, 3000, false))) return;
      laStats.seekMs = performance.now() - t0;
      const r = await analyze(sv);
      if (r.type !== 'result' || timeline.key !== videoKey()) return;
      recordSample(t, { sim: r.faces.length ? Math.max(...r.faces.map((f) => f.sim)) : -1, n: r.faces.length });
      laStats.scanned++;
      wait = 0;
    } catch (err) {
      console.warn('[Ömer Baba Atlatıcı] önden tarama:', err);
    } finally {
      setTimeout(scanStep, wait);
    }
  }

  // ---------------- Kanal filtresi ----------------
  let gate = { vid: null, allowed: null, info: null }; // allowed: true | false | null (kanal henüz belli değil)

  // Oynatıcının yüklü videosunun kanal bilgisi (sayfa bağlamındaki page-info.js üzerinden).
  // Oynatıcı verisi henüz yeni videoya geçmediyse null döner.
  function videoInfo() {
    document.dispatchEvent(new CustomEvent('omer-baba:video-info'));
    try {
      const info = JSON.parse(document.documentElement.dataset.omerBabaVideo || 'null');
      return info && info.videoId === videoKey() ? info : null;
    } catch {
      return null;
    }
  }

  // Başlıktaki bölüm numarası: "233. Bölüm", "215.Bölüm", "235 BÖLÜM", "236. Bölümde", "Bölüm 233".
  // Aralıkta ("235-240 Arası Tüm Bölümler") alt sınır alınır: aralığın tamamı kuraldan sonraysa taranmaz.
  // Numara yoksa null (video taranır).
  function episodeOf(title) {
    const t = String(title || '');
    const m =
      t.match(/(\d{1,3})\s*-\s*\d{1,3}\s*aras[ıi]/iu) ||
      t.match(/(\d{1,3})\s*\.?\s*b[öo]l[üu]m(?!ler)/iu) ||
      t.match(/\bb[öo]l[üu]m\s*(\d{1,3})\b/iu);
    return m ? Number(m[1]) : null;
  }

  // Bu videoda çalışılsın mı? reason: 'channel' (liste dışı kanal) | 'episode' (Ömer Baba'sız bölüm)
  function channelGate() {
    const vid = videoKey();
    if (!vid) return (gate = { vid: null, allowed: false, info: null });
    if (gate.vid === vid && gate.allowed != null) return gate;
    const info = videoInfo();
    if (!info) return { vid, allowed: null, info: null }; // kanal bekleniyor: hiçbir şey yapma
    const keys = new Set((settings.channels || []).map(channelKey).filter(Boolean));
    const channelOk = !settings.channelFilter || !keys.size ||
      keys.has(`id:${info.channelId}`) || (info.handle != null && keys.has(`h:${info.handle.toLowerCase()}`));
    const episode = episodeOf(info.title);
    const episodeOk = !settings.episodeCutoff || episode == null || episode < settings.episodeFrom;
    const reason = !channelOk ? 'channel' : !episodeOk ? 'episode' : null;
    gate = { vid, allowed: !reason, info, reason, episode };
    return gate;
  }

  // Eklenti bu videoda çalışmalı mı? Gölge tampon da buna göre açılır/kapanır (mse-hook.js).
  function active() {
    const on = settings.enabled && isVideoPage() && channelGate().allowed === true;
    const mirror = settings.enabled && settings.lookahead && isVideoPage() && channelGate().allowed !== false;
    document.documentElement.dataset.omerBabaMirror = mirror ? 'on' : 'off';
    return on;
  }

  // Popup'taki önden tarama şeridi: şu andan itibaren STRIP_S saniyelik pencere
  const STRIP_S = 30;
  function stripData(video) {
    if (!video || timeline.key !== videoKey()) return null;
    const now = video.currentTime;
    const ts = timeline.times;
    const samples = [];
    for (let i = lowerBound(ts, tkey(now)); i < ts.length && ts[i] <= tkey(now + STRIP_S); i++) {
      samples.push([+(ts[i] / 1000 - now).toFixed(2), sampleScore(ts[i]) >= threshold() ? 1 : 0]);
    }
    const sc = sceneAt(now);
    return {
      window: STRIP_S,
      samples,
      covered: sc ? Math.max(0, sc.covered - now) : 0,
      scene: sc && !sc.none ? { in: Math.max(0, sc.start - now), len: sc.endKnown ? sc.resume - sc.start : null } : null,
    };
  }

  const inSuppress = (t) => suppress && suppress.href === location.href && t >= suppress.from && t <= suppress.to;

  // Her karede: yaklaşan bir sahnenin başına gelindiyse, Ömer Baba görünmeden atla
  function guard(video) {
    if (!settings.lookahead || state !== 'watch' || video.paused || isAd(video) || gate.allowed !== true || gate.vid !== videoKey()) return;
    const now = video.currentTime;
    const sc = sceneAt(now);
    if (!sc || sc.none || sc.hits < SCENE_MIN_HITS) return;
    if (now < (sc.prevMiss ?? sc.start) - LA_LEAD) return;
    if (inSuppress(now) || inSuppress(sc.start)) return;
    preSkip(video, sc);
  }

  async function preSkip(video, sc) {
    state = 'skip';
    win = [];
    laStats.preSkips++;
    const href = location.href;
    const start = video.currentTime;
    if (sc.endKnown) {
      await seekTo(video, sc.resume + RESUME_PAD);
      if (location.href === href) finishSkip(video, href, start, true);
      state = 'watch';
      return;
    }
    // Sahne taranan bölgenin ötesine uzanıyor: perdeyi indir, bilinen son isabete atla, oradan adım adım devam
    abortSkip = false;
    cover(video, 'skip');
    await seekTo(video, sc.lastHit);
    if (abortSkip || location.href !== href) {
      state = 'watch'; // "Yine de izle" ya da sayfa değişti
      return;
    }
    await skipScene(video, start);
  }

  let guardVideo = null;
  function armGuard() {
    const v = findVideo();
    if (!v || v === guardVideo || !('requestVideoFrameCallback' in v)) return;
    guardVideo = v;
    const onFrame = () => {
      if (guardVideo !== v) return;
      try {
        guard(v);
      } catch (err) {
        console.warn('[Ömer Baba Atlatıcı]', err);
      }
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  }

  async function tick() {
    if (!active() || busy || state !== 'watch') return;
    const video = findVideo();
    if (!video || video.paused || video.ended || video.readyState < 2 || isAd(video)) return;
    ensureDetector();
    if (!detectorReady) return;
    const sc = settings.lookahead ? sceneAt(video.currentTime) : null;
    if (sc && sc.covered > video.currentTime + 1 && performance.now() - lastLiveAt < LIVE_MS_COVERED) return;
    lastLiveAt = performance.now();
    busy = true;
    try {
      const r = await analyze(video);
      lastResult = r;
      if (settings.debug) drawDebug(video, r);
      if (r.type !== 'result' || state !== 'watch') return;
      const hit = isHit(r);
      if (suppressed(video)) {
        if (hit) suppress.to = Math.max(suppress.to, video.currentTime + SUPPRESS_GRACE);
        win = [];
        return;
      }
      win = [...win, hit].slice(-WINDOW);
      if (hit && !covered) cover(video, 'detect');
      if (win.filter(Boolean).length >= TRIGGER_HITS) await skipScene(video);
      else if (covered && win.length >= 2 && !win[win.length - 1] && !win[win.length - 2]) uncover();
    } catch (err) {
      console.warn('[Ömer Baba Atlatıcı]', err);
    } finally {
      busy = false;
    }
  }

  document.addEventListener('yt-navigate-finish', () => {
    gate = { vid: null, allowed: null, info: null };
    abortSkip = true;
    win = [];
    uncover();
    debugLayer?.remove();
  });

  setInterval(tick, SAMPLE_MS);
  setInterval(armGuard, 1000);
  scanStep();

  // Popup, etkin sekmedeki videonun durumunu sorar
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'omer-baba:status') return;
    const page = isVideoPage() ? 'watch' : location.pathname.startsWith('/shorts/') ? 'shorts' : 'other';
    const g = page === 'watch' ? channelGate() : null;
    sendResponse({
      page, enabled: settings.enabled, lookahead: settings.lookahead,
      allowed: g?.allowed ?? null, reason: g?.reason ?? null, episode: g?.episode ?? null,
      info: g?.info ?? (page === 'watch' ? videoInfo() : null), detectorReady, shadow: laStats.shadow,
      strip: g?.allowed && settings.enabled && settings.lookahead ? stripData(findVideo()) : null,
    });
  });

  // E2E testleri ve konsoldan inceleme için küçük bir durum özeti
  document.documentElement.addEventListener('omer-baba:status', () => {
    document.documentElement.dataset.omerBaba = JSON.stringify({
      detectorReady, detectorError, state, covered, win, threshold: threshold(),
      channel: { allowed: gate.allowed, handle: gate.info?.handle ?? null, reason: gate.reason ?? null, episode: gate.episode ?? null }, alone: settings.alone,
      mirror: document.documentElement.dataset.omerBabaMirror ?? null,
      shadowPresent: !!document.querySelector('omer-baba-shadow'),
      lastMs: lastResult?.ms ?? null, lastSims: lastResult?.faces?.map((f) => +f.sim.toFixed(3)) ?? null,
      lastError: lastResult?.error ?? null,
      la: (() => {
        const v = findVideo();
        const sc = v ? sceneAt(v.currentTime) : null;
        return { ...laStats, ahead: sc ? +(sc.covered - v.currentTime).toFixed(1) : null, scene: sc && !sc.none ? sc : null };
      })(),
    });
  });
})();
