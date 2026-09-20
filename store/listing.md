# Chrome Web Store kaydı

Geliştirici panelindeki her sekme için doldurulacak değerler. Görseller bu klasördedir;
`npm run store:assets` ile yeniden üretilir. Paket `npm run package` ile `dist/` altına çıkar.

## Paket (Package)

`dist/omer-baba-atlatici-<sürüm>.zip` dosyasını yükle. Zip'in kökünde `manifest.json` olmalı;
Finder'ın "Sıkıştır" özelliği dosyaları klasörün içine koyar ve `__MACOSX` çöpü ekler, kullanma.

## Mağaza girişi (Store listing)

**Açıklama (Detailed description)**

```
Ömer Baba'nın sahnelerini geçmek için artık vakit harcamaya gerek yok. Ömer Baba ile eğitilmiş model sizin için sahneleri otomatik geçer.

Ömer Baba Atlatıcı, YouTube'da Kurtlar Vadisi Pusu izlerken Ömer Baba'nın yakın ya da orta planda göründüğü sahneleri yüz tanımayla bulur ve atlar. Her şey bilgisayarınızda çalışır; hiçbir görüntü dışarı gönderilmez.

ÖZELLİKLER
• Görünmeden atlama: YouTube'un zaten indirdiği ileri kareleri önden tarar, Ömer Baba ekrana gelmeden sahnenin sonuna geçer.
• Canlı şerit: Popup'ta önümüzdeki 30 saniyeyi ve yaklaşan sahneleri görürsünüz.
• Yalnızca tek başınayken: İsterseniz Ömer Baba karede başka biriyle birlikteyken sahneyi atlamaz.
• Bilirkişi modu: Sahne hiç atlanmaz; onun yerine kalan süreyi sayan bir kutu çıkar, geçmek isterseniz tek tık.
• Kanal filtresi: Varsayılan olarak yalnızca @KurtlarVadisi ve @KurtlarVadisiOfficial videolarında çalışır; listeyi siz düzenlersiniz.
• Ömer Baba'sız bölümler: Başlığında 235. bölüm ve sonrası yazan videolarda tarama yapmaz.
• Kaçış yolları: Perdede "Yine de izle", atlamadan sonra "Geri al".

GİZLİLİK
Video kareleri, eklentiyle birlikte gelen bir yüz tanıma modeliyle bilgisayarınızda analiz edilir; kaydedilmez ve hiçbir yere gönderilmez. Eklentinin sunucusu, analitiği ya da izleme kodu yoktur. Yalnızca YouTube izleme sayfalarında çalışır, Shorts'ta çalışmaz.

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
Stores the user's settings (on/off switch, recognition threshold, look-ahead, "only when alone" mode, expert-witness mode, episode cutoff, allowed channel list) and two counters (scenes skipped, time saved) in chrome.storage.local. This data stays on the user's device and is never transmitted.
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

İnceleyiciler için; giriş ya da hesap gerekmez. Alan en fazla 500 karakter; kullanıcı adı ve şifre boş kalır.

```
No login needed; the UI is in Turkish. Open https://www.youtube.com/watch?v=VDtf9lAmpvM (Kurtlar Vadisi Pusu, @KurtlarVadisi channel) and play it. Within seconds the extension skips the scenes with the character Ömer Baba and shows "Ömer Baba sahnesi geçildi" with an Undo ("Geri al") button. The toolbar popup shows "Çalışıyor" and a 30 s look-ahead strip. It stays inactive on other channels and on Shorts. Popup > Gelişmiş > Debug katmanı draws face boxes.
```

## Yayıncı ayarları (Settings)

Hesap düzeyindedir, eklentiye özel değildir.

| Alan | Değer |
|---|---|
| Yayıncı görünen adı | kalaomer |
| İletişim e-postası (herkese açık görünür, doğrulanmalı) | me@kalaomer.com |
| Tacir beyanı | Tacir değil (non-trader) |
