# Gizlilik Politikası — Ömer Baba Atlatıcı

_Son güncelleme: 19 Eylül 2026_

Ömer Baba Atlatıcı, YouTube'da Kurtlar Vadisi Pusu izlerken Ömer Baba karakterinin göründüğü
sahneleri atlayan bir Chrome eklentisidir. Tüm işlem kullanıcının cihazında yapılır.

## Hangi verileri işler

- **Web sitesi içeriği (video kareleri):** Eklenti yalnızca `https://www.youtube.com/watch`
  sayfalarında ve kullanıcının seçtiği kanalların videolarında çalışır. Oynayan videonun
  karelerini ve YouTube'un zaten tamponladığı ileri kareleri, eklentiyle birlikte gelen bir yüz
  tanıma modeliyle cihazda analiz eder. Karelerdeki yüzler sayısal bir vektöre çevrilir ve tek
  bir referans vektörle karşılaştırılır. Kareler ve yüz vektörleri yalnızca bellekte, analiz
  süresince tutulur; kaydedilmez ve hiçbir yere gönderilmez.
- **Video bilgisi:** Kanal ve bölüm filtrelerini uygulamak için açık videonun kimliği, başlığı ve
  kanalı sayfadan okunur. Bu bilgi yalnızca bellekte tutulur, geçmiş olarak kaydedilmez.
- **Ayarlar ve sayaçlar:** Eklentinin ayarları (açık/kapalı, tanıma eşiği, kanal listesi vb.) ve
  iki sayaç (geçilen sahne sayısı, kazanılan süre) `chrome.storage.local` ile yalnızca kullanıcının
  cihazında saklanır.

## Hangi verileri toplamaz

Eklenti kişisel bilgi, kimlik doğrulama bilgisi, konum, iletişim, sağlık ya da finans bilgisi
toplamaz. Tarama geçmişi tutmaz. Analitik ya da izleme kodu içermez.

## Paylaşım

Eklentinin kendi sunucusu yoktur ve hiçbir veriyi cihazdan dışarı göndermez. Veriler satılmaz,
üçüncü taraflarla paylaşılmaz ve eklentinin amacı dışında kullanılmaz. Popup'taki "Kahve hediye
et" butonuna basıldığında yalnızca buymeacoffee.com sayfası yeni sekmede açılır; eklenti bu
sayfaya veri göndermez.

## Verilerin silinmesi

Eklenti kaldırıldığında cihazda saklanan ayarlar ve sayaçlar Chrome tarafından silinir.
Sayaçlar popup'taki "Gelişmiş → Sıfırla → Sayaçlar" ile de sıfırlanabilir.

## İletişim

Sorular için projenin GitHub sayfasında bir "issue" açabilirsiniz.

---

# Privacy Policy — Ömer Baba Atlatıcı

_Last updated: September 19, 2026_

Ömer Baba Atlatıcı is a Chrome extension that skips scenes featuring the TV character Ömer Baba
while watching Kurtlar Vadisi Pusu on YouTube. All processing happens on the user's device.

## Data the extension handles

- **Website content (video frames):** The extension only runs on `https://www.youtube.com/watch`
  pages, for videos from the channels the user selects. It analyzes the frames of the playing
  video, and the upcoming frames YouTube has already buffered, with a face-recognition model
  bundled with the extension. Faces in a frame are converted to a numeric vector and compared with
  a single reference vector. Frames and face vectors are kept in memory only while being analyzed;
  they are never stored or transmitted.
- **Video information:** To apply the channel and episode filters, the ID, title and channel of the
  open video are read from the page. This is kept in memory only and is not stored as history.
- **Settings and counters:** The extension's settings (on/off, recognition threshold, channel list,
  etc.) and two counters (scenes skipped, time saved) are stored only on the user's device with
  `chrome.storage.local`.

## Data the extension does not collect

The extension does not collect personal information, authentication information, location,
communications, health or financial information. It keeps no browsing history and contains no
analytics or tracking code.

## Sharing

The extension has no server and never sends any data off the user's device. Data is not sold,
not shared with third parties, and not used for any purpose other than the extension's single
purpose. Clicking the "Kahve hediye et" (Buy Me a Coffee) button in the popup only opens
buymeacoffee.com in a new tab; the extension sends no data to that page.

## Data deletion

Settings and counters stored on the device are removed by Chrome when the extension is
uninstalled. Counters can also be reset from the popup (Gelişmiş → Sıfırla → Sayaçlar).

## Contact

For questions, please open an issue on the project's GitHub page.
