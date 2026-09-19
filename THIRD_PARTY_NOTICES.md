# Üçüncü taraf bileşenler

Proje kodu MIT lisanslıdır (`LICENSE`). Aşağıdaki bileşenler bu lisansın kapsamında değildir;
her biri kendi lisansıyla dağıtılır.

## Eklentiyle dağıtılanlar

| Bileşen | Dosyalar | Lisans | Not |
|---|---|---|---|
| [InsightFace](https://github.com/deepinsight/insightface) `buffalo_sc` modelleri: SCRFD `det_500m`, ArcFace `w600k_mbf` | `extension/models/*.onnx` | Yalnızca ticari olmayan araştırma ve kişisel kullanım | Çıktı boyutları dinamik yapılmıştır (`tools/fetch-models.py`); ağırlıklar değiştirilmemiştir. Ticari kullanım için InsightFace'ten ayrıca lisans gerekir. |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | `extension/vendor/ort/` | MIT | Lisans metni: `extension/vendor/ort/LICENSE` |
| [Big Shoulders Display](https://github.com/xotypeco/big_shoulders) (fontsource üzerinden) | `extension/fonts/big-shoulders-display-*.woff2` | SIL Open Font License 1.1 | Lisans metni: `extension/fonts/OFL-BigShouldersDisplay.txt` |
| [Lato](https://www.latofonts.com/) (fontsource üzerinden) | `extension/fonts/lato-*.woff2`; `assets/kahve-hediye-et.svg` içinde yazı çizgiye çevrilmiş olarak | SIL Open Font License 1.1 | Lisans metni: `extension/fonts/OFL-Lato.txt` |

## Yalnızca geliştirmede kullanılanlar

| Bileşen | Kullanım | Lisans |
|---|---|---|
| onnxruntime-node | Referans üretiminde yüz çıkarma | MIT |
| sharp | Görüntü okuma/yazma, ikon üretimi | Apache-2.0 |
| opentype.js | README butonundaki yazıyı çizgiye çevirme | MIT |
| Playwright | Uçtan uca testler | Apache-2.0 |
| numpy, scikit-learn, Pillow, onnx | Referans üretimi ve değerlendirme | BSD-3-Clause, BSD-3-Clause, MIT-CMU, Apache-2.0 |
| yt-dlp | Veri setindeki videoların indirilmesi | Unlicense |

## Veri

- `tools/dataset.json` yalnızca YouTube video kimliklerini içerir. Videolar, kareler ve yüz
  kırpıntıları depoda yoktur; `npm run data:download` ile kullanıcının kendi makinesinde indirilir
  ve `data/` altında (git dışı) tutulur.
- `extension/refs/omer.json` yüz görüntüsü içermez; 1.788 yüzün ArcFace embedding'lerinin
  ortalaması olan tek bir 512 boyutlu vektördür.
- "Buy Me a Coffee" adı ve renkleri Buy Me a Coffee'ye aittir; buton yalnızca bağış sayfasına
  bağlantı verir.
