# Chrome Web Store kaydı

Geliştirici panelindeki her sekme için doldurulacak değerler. Görseller bu klasördedir;
`npm run store:assets` ile yeniden üretilir. Paket `npm run package` ile `dist/` altına çıkar.

## Paket (Package)

`dist/omer-baba-atlatici-<sürüm>.zip` dosyasını yükle. Zip'in kökünde `manifest.json` olmalı;
Finder'ın "Sıkıştır" özelliği dosyaları klasörün içine koyar ve `__MACOSX` çöpü ekler, kullanma.

## Mağaza girişi (Store listing)

**Açıklama (Detailed description)**

```
Kurtlar Vadisi Pusu izlerken Ömer Baba sahnelerini otomatik geçer.

Ömer Baba Atlatıcı, YouTube videolarında Ömer Baba'nın yakın ya da orta planda göründüğü sahneleri yüz tanımayla bulur ve atlar. Her şey bilgisayarında çalışır; hiçbir görüntü dışarı gönderilmez.

ÖZELLİKLER
• Görünmeden atlama: YouTube'un zaten indirdiği ileri kareleri önden tarar, Ömer Baba ekrana gelmeden sahnenin sonuna geçer.
• Canlı şerit: Popup'ta önümüzdeki 30 saniyeyi ve yaklaşan sahneleri görürsün.
• Yalnızca tek başınayken: İstersen Ömer Baba karede başka biriyle birlikteyken sahneyi atlamaz.
• Kanal filtresi: Varsayılan olarak yalnızca @KurtlarVadisi ve @KurtlarVadisiOfficial videolarında çalışır; listeyi sen düzenlersin.
• Ömer Baba'sız bölümler: Başlığında 235. bölüm ve sonrası yazan videolarda tarama yapmaz.
• Kaçış yolları: Perdede "Yine de izle", atlamadan sonra "Geri al".

GİZLİLİK
Video kareleri, eklentiyle birlikte gelen bir yüz tanıma modeliyle bilgisayarında analiz edilir; kaydedilmez ve hiçbir yere gönderilmez. Eklentinin sunucusu, analitiği ya da izleme kodu yoktur. Yalnızca YouTube izleme sayfalarında çalışır, Shorts'ta çalışmaz.

AÇIK KAYNAK
Kaynak kodu, model üretim hattı ve testler (MIT lisansı): https://github.com/kalaomer/omer-baba-detection

Bu eklenti YouTube, Kurtlar Vadisi'nin yapımcıları ya da oyuncularıyla bağlantılı değildir; bağımsız bir hayran projesidir.
```

| Alan | Değer |
|---|---|
| Kategori | Eğlence (Entertainment) |
| Dil | Türkçe |
| Mağaza ikonu | `store/icon-128.png` |
| Ekran görüntüleri (1280×800) | `store/screenshot-1-onden-tarama.png`, `screenshot-2-perde.png`, `screenshot-3-geri-al.png`, `screenshot-4-ayarlar.png` |
| Küçük tanıtım görseli (440×280) | `store/promo-small-440x280.png` |
| Büyük tanıtım görseli (1400×560, isteğe bağlı) | `store/promo-marquee-1400x560.png` |
| Ana sayfa URL'si | `https://github.com/kalaomer/omer-baba-detection` |
| Destek URL'si | `https://github.com/kalaomer/omer-baba-detection/issues` |
| Yetişkinlere yönelik içerik | Hayır |

Özet (kısa açıklama) `manifest.json` içindeki `description` alanından otomatik gelir.

## Gizlilik (Privacy practices)

**Tek amaç açıklaması (Single purpose)**

```
Skips scenes featuring the character Ömer Baba while watching Kurtlar Vadisi Pusu videos on YouTube. The extension analyzes the video frames on the user's device with a bundled face-recognition model; when Ömer Baba's face is detected, it seeks the video past that scene, or skips it before it appears by checking frames YouTube has already buffered. It only runs on YouTube watch pages of the channels the user selects, and all processing stays on the device.
```

**`storage` izin gerekçesi**

```
Stores the user's settings (on/off switch, recognition threshold, look-ahead, "only when alone" mode, episode cutoff, allowed channel list) and two counters (scenes skipped, time saved) in chrome.storage.local. This data stays on the user's device and is never transmitted.
```

**Ana makine (host) izni gerekçesi**

```
The extension only works on YouTube. Its content scripts need access to youtube.com pages to: read the frames of the playing video for on-device face detection; read the video's channel and title from the page to apply the user's channel and episode filters; seek the video past detected scenes; and show an overlay with "Watch anyway" and "Undo" buttons. A small script in the page context mirrors the video data YouTube has already buffered into a hidden video element so upcoming frames can be checked before they are shown; it makes no network requests. No other websites are accessed.
```

| Alan | Değer |
|---|---|
| Uzak kod | Hayır, uzak kod kullanmıyorum (tüm JS, WASM ve modeller pakette) |
| Veri kullanımı | Yalnızca **Web sitesi içeriği (Website content)** işaretli; diğer kategoriler boş |
| Taahhütler | Üçü de işaretli (satmıyorum; amaç dışı kullanmıyorum; kredi değerlendirmesinde kullanmıyorum) |
| Gizlilik politikası URL'si | `https://github.com/kalaomer/omer-baba-detection/blob/main/PRIVACY.md` |

"Web sitesi içeriği" beyanı gerekiyor çünkü Google, veri cihazdan çıkmasa bile yalnızca
yerelde işlenen verinin de beyan edilmesini istiyor; eklenti YouTube karelerini okuyor.

## Dağıtım (Distribution)

| Alan | Değer |
|---|---|
| Ödeme | Ücretsiz |
| Görünürlük | Herkese açık (Public) |
| Bölgeler | Tüm bölgeler |

## Test talimatları (Test instructions)

İnceleyiciler için; giriş ya da hesap gerekmez.

```
No account or login is needed. The UI is in Turkish.
1. Open https://www.youtube.com/watch?v=VDtf9lAmpvM (a Kurtlar Vadisi Pusu clip from the @KurtlarVadisi channel) and let it play.
2. Within a few seconds the extension skips the scenes where the character Ömer Baba appears. After each skip a notification "Ömer Baba sahnesi geçildi" (scene skipped) appears with a "Geri al" (Undo) button.
3. Click the toolbar icon: the popup shows "Çalışıyor" (active) and a strip of the next 30 seconds with upcoming scenes in red.
4. The extension stays inactive on other channels, e.g. https://www.youtube.com/watch?v=3kS_bojhZt8 shows "Taranmıyor" (not scanning), and on YouTube Shorts.
5. Optional: Popup > "Gelişmiş" > "Debug katmanı" draws face boxes and similarity scores on the video.
```
