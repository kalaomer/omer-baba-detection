const $ = (id) => document.getElementById(id);
const { DEFAULT_CHANNELS, channelKey, displayChannel } = globalThis.OmerBabaChannels;

const DEFAULTS = {
  enabled: true, threshold: null, debug: false, lookahead: true,
  alone: false, expert: false, channelFilter: true, channels: DEFAULT_CHANNELS,
  episodeCutoff: true, episodeFrom: 235,
  stats: { skips: 0, seconds: 0 },
};
const TOGGLES = ['enabled', 'lookahead', 'alone', 'expert', 'episodeCutoff', 'channelFilter', 'debug'];

let channels = [];

// ---------- Biçimlendirme ----------

function formatDuration(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} dk ${s % 60} sn` : `${m} dk`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} sa ${m % 60} dk` : `${h} sa`;
}

function renderStats(st) {
  $('skips').textContent = st.skips;
  $('saved').textContent = formatDuration(st.seconds);
}

// ---------- Kanallar ----------

function renderChannels() {
  $('channelEmpty').hidden = channels.length > 0;
  $('channelList').replaceChildren(
    ...channels.map((c) => {
      const li = document.createElement('li');
      li.append(Object.assign(document.createElement('span'), { textContent: c }));
      const rm = Object.assign(document.createElement('button'), { type: 'button', textContent: '×' });
      rm.setAttribute('aria-label', `${c} kanalını çıkar`);
      rm.addEventListener('click', () => saveChannels(channels.filter((x) => x !== c)));
      li.append(rm);
      return li;
    }),
  );
}

function saveChannels(list) {
  channels = list;
  renderChannels();
  chrome.storage.local.set({ channels }).then(refreshStatus);
}

function setAddOpen(open) {
  $('channelForm').hidden = !open;
  $('channelAddToggle').textContent = open ? 'Vazgeç' : '+ Kanal ekle';
  $('channelAddToggle').setAttribute('aria-expanded', String(open));
  if (open) $('channelInput').focus();
  else $('channelInput').value = '';
}

// ---------- Etkin sekmenin durumu ----------

function setStatus({ tone, word, meta = '', line = '' }) {
  $('status').dataset.tone = tone;
  $('statusWord').textContent = word;
  $('statusMeta').textContent = meta;
  $('statusLine').textContent = line || ' ';
}

// expert: bilirkişi modunda sahne geçilmez, yalnızca ne kadar süreceği yazılır
function renderStrip(strip, expert = false) {
  const box = $('strip');
  if (!strip) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const W = strip.window;
  const pct = (x) => `${(Math.max(0, Math.min(W, x)) / W) * 100}%`;
  $('stripCovered').style.width = pct(strip.covered);

  // Art arda isabetli örnekleri tek blokta birleştir
  const blocks = [];
  strip.samples.forEach(([t, hit], i) => {
    if (!hit) return;
    const end = strip.samples[i + 1]?.[0] ?? t + 1;
    const last = blocks[blocks.length - 1];
    if (last && t - last[1] < 0.01) last[1] = end;
    else blocks.push([t, end]);
  });
  const track = $('stripTrack');
  track.querySelectorAll('.strip-hit').forEach((el) => el.remove());
  for (const [a, b] of blocks) {
    const el = document.createElement('span');
    el.className = 'strip-hit';
    el.style.left = pct(a);
    el.style.width = `max(3px, calc(${pct(b)} - ${pct(a)}))`;
    track.append(el);
  }

  const note = $('stripNote');
  const sc = strip.scene;
  delete note.dataset.alert;
  if (sc && sc.in <= W) {
    note.dataset.alert = '';
    note.textContent = sc.in < 0.5
      ? 'Ömer Baba şimdi'
      : `Ömer Baba ${Math.round(sc.in)} sn sonra${sc.len ? ` · ${Math.round(sc.len)} sn ${expert ? 'sürecek' : 'geçilecek'}` : ''}`;
  } else {
    note.textContent = strip.covered >= 1 ? 'Temiz' : 'Taranıyor…';
  }
}

async function refreshStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let st = null;
  try {
    st = tab?.id != null ? await chrome.tabs.sendMessage(tab.id, { type: 'omer-baba:status' }) : null;
  } catch {
    /* bu sekmede content script yok */
  }
  renderStrip(null);
  if (!st) return setStatus({ tone: 'idle', word: 'YouTube videosu yok', line: 'YouTube açıksa sayfayı yenile.' });
  if (!st.enabled) return setStatus({ tone: 'idle', word: 'Kapalı', line: 'Açmak için sağ üstteki anahtarı kullan.' });
  if (st.page === 'shorts') return setStatus({ tone: 'idle', word: 'Shorts', line: "Shorts'ta çalışmaz, yalnızca normal videolarda." });
  if (st.page !== 'watch') return setStatus({ tone: 'idle', word: 'Beklemede', line: 'Bir Kurtlar Vadisi videosu aç.' });

  const meta = st.episode ? `${st.episode}. bölüm` : '';
  const who = st.info ? [st.info.author, st.info.handle && `@${st.info.handle}`].filter(Boolean).join(' · ') : '';
  if (st.allowed === true) {
    setStatus({ tone: 'on', word: st.expert ? 'Bilirkişi modu' : 'Çalışıyor', meta, line: who });
    if (st.lookahead) renderStrip(st.strip ?? { window: 30, samples: [], covered: 0, scene: null }, st.expert);
  } else if (st.reason === 'episode') {
    setStatus({ tone: 'idle', word: 'Taranmıyor', meta, line: 'Bu bölümde Ömer Baba yok.' });
  } else if (st.allowed === false) {
    setStatus({ tone: 'idle', word: 'Taranmıyor', meta, line: `${who || 'Bu kanal'} listende değil.` });
  } else {
    setStatus({ tone: 'wait', word: 'Bekleniyor', line: 'Video bilgisi okunuyor…' });
  }
}

// ---------- Kurulum ----------

async function init() {
  const refs = await fetch('refs/omer.json').then((r) => r.json());
  const s = await chrome.storage.local.get(DEFAULTS);

  for (const k of TOGGLES) {
    $(k).checked = s[k];
    $(k).addEventListener('change', (e) => chrome.storage.local.set({ [k]: e.target.checked }).then(refreshStatus));
  }

  // Bölüm sınırı
  const syncEpisode = () => ($('episodeFrom').disabled = !$('episodeCutoff').checked);
  $('episodeFrom').value = s.episodeFrom;
  syncEpisode();
  $('episodeCutoff').addEventListener('change', syncEpisode);
  $('episodeFrom').addEventListener('change', (e) => {
    const n = Math.round(Number(e.target.value));
    if (!Number.isFinite(n) || n < 1 || n > 999) {
      e.target.value = s.episodeFrom; // geçersiz girişi geri al
      return;
    }
    s.episodeFrom = n;
    e.target.value = n;
    chrome.storage.local.set({ episodeFrom: n }).then(refreshStatus);
  });

  // Eşik
  const renderThreshold = (v) => {
    $('threshold').value = v;
    $('thresholdOut').textContent = Number(v).toFixed(2);
  };
  renderThreshold(s.threshold ?? refs.threshold);
  $('threshold').addEventListener('input', (e) => {
    renderThreshold(e.target.value);
    chrome.storage.local.set({ threshold: Number(e.target.value) });
  });
  $('resetThreshold').addEventListener('click', () => {
    renderThreshold(refs.threshold);
    chrome.storage.local.set({ threshold: null });
  });

  // Kanallar
  channels = s.channels;
  renderChannels();
  $('channelAddToggle').addEventListener('click', () => setAddOpen($('channelForm').hidden));
  $('channelInput').addEventListener('keydown', (e) => e.key === 'Escape' && (e.preventDefault(), setAddOpen(false)));
  $('channelForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const shown = displayChannel($('channelInput').value);
    if (shown && !channels.some((c) => channelKey(c) === channelKey(shown))) saveChannels([...channels, shown]);
    setAddOpen(false);
  });
  $('resetChannels').addEventListener('click', () => saveChannels([...DEFAULT_CHANNELS]));

  // Sayaçlar
  renderStats(s.stats);
  $('resetStats').addEventListener('click', () => chrome.storage.local.set({ stats: { skips: 0, seconds: 0 } }));
  chrome.storage.onChanged.addListener((ch) => ch.stats && renderStats(ch.stats.newValue));

  refreshStatus();
  setInterval(refreshStatus, 700);
}

init();
