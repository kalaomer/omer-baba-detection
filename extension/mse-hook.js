// Sayfa bağlamında (world: MAIN, document_start) çalışır.
// YouTube'un video SourceBuffer'ına yaptığı her işlemi gizli bir "gölge" <video>'ya aynalar.
// Gölge, YouTube'un zaten indirdiği tamponu (~20-40 sn ileri) içerir; content script onu
// ileri sarıp gelecekteki kareleri analiz eder. Ek ağ trafiği yoktur.
//
// Aynalama yalnızca content script izin verdiğinde yapılır: <html data-omer-baba-mirror="off">
// iken (izinli olmayan kanal, izleme sayfası dışı, eklenti kapalı) gölge tutulmaz; yalnızca son
// init segmenti hatırlanır ki aynalama sonradan açılırsa gölge hemen kurulabilsin.
//
// Gölge video, sayfa genelindeki querySelector('video') aramalarına karışmasın diye
// <omer-baba-shadow> elemanının (open) shadow root'u içinde durur.
(() => {
  if (window.__omerBabaHook) return;
  window.__omerBabaHook = true;

  const root = document.documentElement;
  const origCreateObjectURL = URL.createObjectURL;
  const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
  const SB = SourceBuffer.prototype;
  const orig = { append: SB.appendBuffer, remove: SB.remove, abort: SB.abort, changeType: SB.changeType };
  const MAX_QUEUE = 400;

  const urlOf = new WeakMap(); // MediaSource -> blob URL
  let current = null; // en yeni video SourceBuffer'ı: { target, mime, srcUrl, init }
  let shadow = null; // { target, ms, sb, video, host, queue, broken }
  let gen = 0;

  // Content script karar verene kadar (sayfa ilk yüklenirken) yalnızca izleme sayfasında aynala
  const mirrorOn = () => {
    const v = root.dataset.omerBabaMirror;
    return v ? v === 'on' : location.pathname === '/watch';
  };
  // MP4 init segmenti 'ftyp' kutusuyla, WebM init segmenti EBML başlığıyla başlar
  const isInit = (u8) =>
    u8.length >= 8 &&
    ((u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) ||
      (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3));

  URL.createObjectURL = function (obj) {
    const url = origCreateObjectURL.call(this, obj);
    if (obj instanceof MediaSource) urlOf.set(obj, url);
    return url;
  };

  function destroy() {
    if (!shadow) return;
    shadow.queue.length = 0;
    shadow.video.removeAttribute('src');
    shadow.video.load();
    shadow.host.remove();
    shadow = null;
  }

  function markBroken(s, err) {
    s.broken = true;
    s.queue.length = 0;
    s.video.dataset.broken = String(err?.name || err);
  }

  function create(cur, replayInit) {
    destroy();
    const host = document.createElement('omer-baba-shadow');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:16px;height:9px;opacity:0;pointer-events:none';
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.dataset.src = cur.srcUrl || '';
    video.dataset.gen = String(++gen);
    host.attachShadow({ mode: 'open' }).appendChild(video);
    root.appendChild(host);

    const ms = new MediaSource();
    const s = { target: cur.target, ms, sb: null, video, host, queue: [], broken: false };
    if (replayInit && cur.init) s.queue.push(appendOp(cur.target, cur.init));
    ms.addEventListener('sourceopen', () => {
      try {
        s.sb = origAddSourceBuffer.call(ms, cur.mime);
        s.sb.mode = cur.target.mode;
        s.sb.addEventListener('updateend', () => pump(s));
        pump(s);
      } catch (err) {
        markBroken(s, err);
      }
    }, { once: true });
    video.src = origCreateObjectURL.call(URL, ms);
    shadow = s;
  }

  const appendOp = (sb, data) => ({ type: 'append', data, tso: sb.timestampOffset, aws: sb.appendWindowStart, awe: sb.appendWindowEnd });

  function setWindow(sb, start, end) {
    // appendWindowStart < appendWindowEnd kuralını bozmadan sırayla ayarla
    if (start >= sb.appendWindowEnd) {
      sb.appendWindowEnd = end;
      sb.appendWindowStart = start;
    } else {
      sb.appendWindowStart = start;
      sb.appendWindowEnd = end;
    }
  }

  function pump(s) {
    const sb = s.sb;
    if (!sb || s.broken || sb.updating || !s.queue.length) return;
    const op = s.queue.shift();
    try {
      switch (op.type) {
        case 'append':
          if (sb.timestampOffset !== op.tso) sb.timestampOffset = op.tso;
          if (sb.appendWindowStart !== op.aws || sb.appendWindowEnd !== op.awe) setWindow(sb, op.aws, op.awe);
          orig.append.call(sb, op.data);
          break;
        case 'remove':
          orig.remove.call(sb, op.start, op.end);
          break;
        case 'abort':
          orig.abort.call(sb);
          pump(s); // abort updateend üretmez
          break;
        case 'changeType':
          orig.changeType.call(sb, op.mime);
          pump(s);
          break;
      }
    } catch (err) {
      markBroken(s, err);
    }
  }

  function enqueue(sb, op) {
    const s = shadow;
    if (!s || s.target !== sb || s.broken) return;
    if (s.queue.length >= MAX_QUEUE) return markBroken(s, 'queue-overflow');
    s.queue.push(op);
    pump(s);
  }

  // Content script aynalamayı kapatınca gölgeyi hemen bırak (duraklatılmış videoda append gelmeyebilir)
  new MutationObserver(() => {
    if (!mirrorOn()) destroy();
  }).observe(root, { attributes: true, attributeFilter: ['data-omer-baba-mirror'] });

  MediaSource.prototype.addSourceBuffer = function (mime) {
    const sb = origAddSourceBuffer.call(this, mime);
    // En yeni video SourceBuffer'ı esas alınır (kalite değişimi, yeni video, reklam -> içerik)
    if (/^video\//i.test(mime)) {
      try {
        current = { target: sb, mime, srcUrl: urlOf.get(this), init: null };
        if (mirrorOn()) create(current, false);
        else destroy();
      } catch {
        /* gölge kurulamazsa YouTube'u asla etkileme */
      }
    }
    return sb;
  };

  // Önce YouTube'un asıl çağrısı yapılır; hata fırlatırsa gölgeye hiç yansıtılmaz (tamponlar ayrışmasın).
  SB.appendBuffer = function (data) {
    const r = orig.append.call(this, data);
    if (current?.target === this) {
      try {
        const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const init = isInit(u8);
        const on = mirrorOn();
        const copy = init || on ? u8.slice().buffer : null; // aynalama kapalıyken yalnızca init kopyalanır
        if (init) current.init = copy;
        if (!on) destroy();
        else {
          // Gölge yoksa (aynalama sonradan açıldı) ya da bozulduysa yeni bir init'le yeniden kur
          if (!shadow || shadow.target !== this || (shadow.broken && init)) create(current, !init);
          enqueue(this, appendOp(this, copy));
        }
      } catch {
        /* yoksay */
      }
    }
    return r;
  };
  SB.remove = function (start, end) {
    const r = orig.remove.call(this, start, end);
    enqueue(this, { type: 'remove', start, end });
    return r;
  };
  SB.abort = function () {
    const r = orig.abort.call(this);
    enqueue(this, { type: 'abort' });
    return r;
  };
  if (orig.changeType) {
    SB.changeType = function (mime) {
      const r = orig.changeType.call(this, mime);
      if (current?.target === this) current.mime = mime;
      enqueue(this, { type: 'changeType', mime });
      return r;
    };
  }
})();
