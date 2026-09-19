// Sayfa bağlamında (world: MAIN) çalışır. Oynatıcının o an yüklü videosunun kanal ve başlık bilgisini
// content script'e verir: oynatıcı API'si (#movie_player.getPlayerResponse) yalnızca sayfa
// bağlamından görülebilir. Content script 'omer-baba:video-info' olayını gönderir; olaylar
// dünyalar arasında senkron işlendiği için sonucu hemen <html data-omer-baba-video> üzerinden okur.
//
// Not: YouTube içinde başka videoya geçildiğinde oynatıcı verisi ~300 ms boyunca eski videoyu
// gösterir; content script videoId'yi URL ile karşılaştırarak eski veriyi kullanmaz.
(() => {
  document.addEventListener('omer-baba:video-info', () => {
    let info = null;
    try {
      const r = document.getElementById('movie_player')?.getPlayerResponse?.();
      const d = r?.videoDetails;
      const owner = r?.microformat?.playerMicroformatRenderer?.ownerProfileUrl || '';
      const handle = owner.match(/\/@([^/?#]+)/)?.[1];
      if (d?.videoId) {
        info = {
          videoId: d.videoId,
          channelId: d.channelId || null,
          author: d.author || null,
          title: d.title || null,
          handle: handle ? decodeURIComponent(handle) : null,
        };
      }
    } catch {
      /* oynatıcı henüz hazır değil */
    }
    document.documentElement.dataset.omerBabaVideo = info ? JSON.stringify(info) : '';
  });
})();
