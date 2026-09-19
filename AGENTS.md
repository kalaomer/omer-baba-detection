# Ajanlar için proje rehberi

Bu depoda çalışan kodlama ajanları için. Kullanıcıya dönük anlatım [README.md](README.md)'de;
burada yalnızca çalışırken bilmen gerekenler var.

## Proje nedir

YouTube'da Kurtlar Vadisi Pusu izlerken Ömer Baba sahnelerini yüz tanımayla atlayan bir Chrome
eklentisi (Manifest V3). Derleme adımı yoktur: `extension/` klasörü doğrudan yüklenir. Sunucu,
analitik ya da dış istek yoktur; her şey cihazda çalışır.

## Dil

- Kod yorumları, README, commit mesajları ve arayüz metinleri **Türkçe**.
- Yalnızca Chrome Web Store'da inceleyicilerin okuduğu alanlar İngilizce (`store/listing.md`).
- Türkçe karakterleri asla ASCII'ye indirgeme ("bölüm", "Bolum" değil).

## Dosya haritası

```
extension/
  core.js        Ortak yüz hattı: SCRFD tespit + 5 nokta hizalama + ArcFace embedding.
                 Hem tarayıcıda (onnxruntime-web) hem Node'da (onnxruntime-node) çalışır.
  content.js     İzole bağlam: canlı tespit, önden tarama zaman çizelgesi, perde, bildirim,
                 kanal ve bölüm kapısı, popup'a durum.
  mse-hook.js    Sayfa bağlamı (world: MAIN): YouTube'un video tamponunu gizli gölge <video>'ya aynalar.
  page-info.js   Sayfa bağlamı: oynatıcıdan kanal ve başlık bilgisi.
  worker.js      Çıkarım worker'ı (eklenti origin'i, onnxruntime-web).
  channels.js    Kanal listesi yardımcıları; content script ve popup ortak kullanır.
  popup.*        Arayüz.
tools/           Model üretimi, değerlendirme, testler, mağaza görselleri (bkz. README).
store/           Web Store görselleri ve panelin her alanının değeri (listing.md).
data/            Git dışı: indirilen videolar, yüzler, raporlar.
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm install` | Geliştirme bağımlılıkları |
| `npx playwright install chromium` | Uçtan uca testler için tarayıcı (bir kez) |
| `npm run package` | Web Store paketi -> `dist/` |
| `npm run store:assets` | İkonlar ve mağaza görselleri |
| `npm run data:download` / `data:faces` / `refs:build` / `refs:eval` | Model üretim hattı (README) |
| `node tools/e2e.mjs <videoId> <saniye> [--flags]` | Gerçek YouTube'da uçtan uca test |

Python araçları `uv run --python 3.12 --with-requirements tools/requirements.txt ...` ile çalışır;
ayrıca Python kurmaya gerek yok. `ffmpeg` gerekir.

## Değişmez kurallar

- **Tek çekirdek:** Referans embedding'leri ile canlı embedding'ler aynı `core.js`'ten geçmeli.
  Ön işlemeyi (yakalama çözünürlüğü 640, tespit girişi 320, hizalama, normalizasyon) değiştirirsen
  `extension/refs/omer.json` dosyasını **yeniden üret**; yoksa eşikler kayar.
- **Uzak kod yasak (MV3):** Tüm JS, WASM ve ONNX modelleri pakette. `extension/vendor` ve
  `extension/models` içeriği `npm run setup:vendor` ve `tools/fetch-models.py` ile üretilir.
- **Eşikler:** `omer.json` içindeki 0.36 ana eşik; sahne içinde histerezis 0.28'in altına inmez.
  Ömer Baba'nın olmadığı videolarda ölçülen en yüksek skor 0.26. Bu payı daraltma.
- **`data/` asla commit edilmez:** telifli video ve gerçek bir kişinin yüz verisi. Depoda yalnızca
  video kimlikleri (`tools/dataset.json`) ve tek bir merkez vektörü bulunur.
- **Paket:** Zip'in kökünde `manifest.json` olmalı. Finder'ın "Sıkıştır"ı dosyaları klasöre koyar ve
  `__MACOSX` çöpü ekler; her zaman `npm run package`.
- **Sürüm:** `git tag v<manifest sürümü>` gönderince GitHub Actions paketi üretip Release açar;
  etiket manifest sürümüyle uyuşmazsa iş akışı hata verir.
- **Gizlilik iddiaları:** README, `PRIVACY.md` ve mağaza metni "hiçbir şey cihazdan çıkmaz" diyor.
  Ağ isteği ekleyen bir değişiklik bu üç belgeyi de değiştirmeyi gerektirir.

## Tuzaklar (hepsi bu projede yaşandı)

- **YouTube otomasyon tarayıcısına ~60 saniyeden fazla akış vermez** (bot doğrulaması; eklenti
  kapalıyken de olur). Uçtan uca testleri kısa ve hedefli kur: `--start=<saniye>` ile sahnenin
  hemen öncesinden başla. Uzun senaryolar ancak gerçek Chrome'da doğrulanır.
- **Sayfa bağlamında `innerHTML` çalışmaz:** YouTube Trusted Types zorunlu tutuyor. `mse-hook.js` ve
  `page-info.js` yalnızca DOM API'leriyle eleman kurmalı. İzole bağlam (content.js) bundan etkilenmez.
- **Chrome Web Store sayfaları eklentilere kapalı** ("The extensions gallery cannot be scripted").
  Panelde iş yapılacaksa tarayıcı otomasyonu değil, işletim sistemi düzeyinde kontrol gerekir.
- **SPA geçişlerinde oynatıcı verisi ~300 ms geride kalır.** Kanal ve bölüm kararı, oynatıcıdaki
  videoId URL'dekiyle eşleşene kadar verilmez; bu kontrolü kaldırma, yanlış videoya karar verirsin.
- **Zaman çizelgesi örnek başına `{sim, n}` saklar** (n = boyut filtresinden geçen yüz sayısı).
  Böylece "tek başına" modu açılıp kapanınca tarama baştan yapılmaz. Yalnızca skor saklama.
- **Gölge tampon aynalaması:** YouTube'un asıl `appendBuffer` çağrısı başarılı olmadan aynalama
  yapılmaz (tamponlar ayrışmasın), son init segmenti hep saklanır (aynalama sonradan açılabilir) ve
  izleme sayfası dışında aynalama kapalıdır.
- **onnxruntime-node çıkışta çöker** oturumlar kapatılmazsa: Node araçlarında iş bitince
  `await pipe.release()`.
- **Pillow'un varsayılan yazı tipinde Türkçe karakter yok.** Kontak sayfalarında `facedata._font`
  sistem yazı tiplerini dener; yeni bir çizim aracı yazarsan aynısını yap.
- **Popup 600 px'i aşarsa** Chrome kaydırma çubuğu gösterir ve düzen kayar. Yeni satır eklerken
  `tools/` altındaki ekran görüntüsü script'leriyle yüksekliği ölç; hedef ≤ 575 px.

## Değişiklikten sonra doğrulama

Davranışa dokunduysan gerçek YouTube'da en az şunları koş ve çıktıdaki
"ekranda Ömer Baba görülen örnek" sayısının 0 kaldığını gör:

```bash
node tools/e2e.mjs mTZTz3yT3PA 45 --start=4225   # önden tarama: sahne görünmeden atlanmalı
node tools/e2e.mjs IPwAfYRNtlA 45                # Ömer Baba yok: hiç atlama olmamalı
node tools/e2e.mjs 3kS_bojhZt8 40 --start=300    # liste dışı kanal: eklenti tamamen pasif
```

Modelle ya da veriyle oynadıysan `npm run refs:eval` çıktısındaki iki sayıyı koru: ayrı tutulmuş
test kliplerinde yakalama ~%99.8, negatif videolarda eşik üstü yüz sayısı 0.

## Stil

- Sade JavaScript, çerçeve yok. `core.js` ve `worker.js` ES modülü; content script'ler klasik.
- 2 boşluk girinti, tek tırnak, noktalı virgül, ~120 sütun.
- Yorumlar "neden"i anlatır, "ne"yi değil. Kısa ve gerektiği kadar.
- Yeni ayar eklerken: `content.js` içindeki `settings` varsayılanı, `popup.js` içindeki `DEFAULTS`
  ve popup arayüzü birlikte güncellenir; `storage.onChanged` zaten hepsini dinler.
