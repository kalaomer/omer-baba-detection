// YouTube sayfasına gizli iframe olarak gömülür. Tek görevi: eklenti origin'inde bir
// worker başlatmak ve content script'in MessagePort'unu ona devretmek. Sonrasında
// content script <-> worker doğrudan konuşur (ImageBitmap transfer, kopya yok).
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

window.addEventListener('message', (e) => {
  if (e.origin !== 'https://www.youtube.com') return;
  if (e.data?.type !== 'omer-baba:connect' || !e.ports[0]) return;
  worker.postMessage({ type: 'port' }, [e.ports[0]]);
});
