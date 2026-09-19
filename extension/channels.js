// Kanal listesi yardımcıları; hem content script hem popup kullanır.
// Girdi olarak '@KurtlarVadisi', 'KurtlarVadisi', kanal bağlantısı ya da 'UC…' kanal kimliği kabul edilir.
globalThis.OmerBabaChannels = (() => {
  const DEFAULT_CHANNELS = ['@KurtlarVadisi', '@KurtlarVadisiOfficial'];

  function parse(entry) {
    let s = String(entry ?? '').trim();
    try {
      s = decodeURIComponent(s);
    } catch {
      /* olduğu gibi kullan */
    }
    s = s.replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//i, '');
    const id = s.match(/^(?:channel\/)?(UC[\w-]{22})\b/);
    if (id) return { id: id[1] };
    s = s.replace(/^@/, '').replace(/[/?#].*$/, '');
    return s ? { handle: s } : null;
  }

  // Karşılaştırma anahtarı: kimlikler büyük/küçük harfe duyarlı, handle'lar değil
  function channelKey(entry) {
    const p = parse(entry);
    return p ? (p.id ? `id:${p.id}` : `h:${p.handle.toLowerCase()}`) : null;
  }

  // Listede gösterilecek/saklanacak biçim
  function displayChannel(entry) {
    const p = parse(entry);
    return p ? (p.id ?? `@${p.handle}`) : null;
  }

  return { DEFAULT_CHANNELS, channelKey, displayChannel };
})();
