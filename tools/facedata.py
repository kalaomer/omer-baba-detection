"""extract-faces.mjs çıktılarını okuma, Ömer Baba kümesini bulma ve kontak sayfası çizme yardımcıları.

build-refs.py ve evaluate.py aynı yöntemi kullansın diye burada toplandı.
Bir yüz klasörü: meta.jsonl (yüz başına bir satır), emb.f32 (N x 512 float32), crops/<i>.jpg.
"""

import json
from pathlib import Path

import numpy as np
from sklearn.cluster import AgglomerativeClustering

DIM = 512


class Faces:
    """Bir ya da daha fazla yüz klasörünü tek dizi gibi yükler; kırpıntı yolunu da hatırlar."""

    def __init__(self, dirs):
        self.meta, embs, self.crop = [], [], []
        for d in map(Path, dirs):
            meta = [json.loads(line) for line in open(d / "meta.jsonl")]
            self.meta += meta
            self.crop += [d / "crops" / f"{m['i']}.jpg" for m in meta]
            embs.append(np.fromfile(d / "emb.f32", dtype=np.float32).reshape(-1, DIM))
        self.emb = np.concatenate(embs) if embs else np.zeros((0, DIM), np.float32)

    def __len__(self):
        return len(self.meta)

    def mask(self, min_hfrac=0.0, min_score=0.0):
        return np.array([m["hFrac"] >= min_hfrac and m["score"] >= min_score for m in self.meta], dtype=bool)


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def cluster(emb, distance=0.65):
    """Kosinüs mesafesiyle ortalama bağlantılı kümeleme; etiketler döner."""
    return AgglomerativeClustering(
        n_clusters=None, metric="cosine", linkage="average", distance_threshold=distance
    ).fit(emb).labels_


def seed_cluster(faces):
    """Büyük ve net yüzleri kümeler. Döner: (yüz indeksleri, etiketler); en büyük küme = Ömer Baba adayı."""
    idx = np.where(faces.mask(min_hfrac=0.12, min_score=0.6))[0]
    return idx, cluster(faces.emb[idx])


def centroid(faces, refine_sim=0.45, min_hfrac=0.1):
    """Tohum kümenin merkezini, ona yakın tüm yüzlerle bir tur iyileştirir (profil/karanlık yüzler de girer)."""
    idx, labels = seed_cluster(faces)
    seed_idx = idx[labels == np.bincount(labels).argmax()]
    seed = unit(faces.emb[seed_idx].mean(0))
    ok = faces.mask(min_hfrac=min_hfrac)
    refined = np.where(ok & (faces.emb @ seed >= refine_sim))[0]
    return unit(faces.emb[refined].mean(0)), seed_idx, refined


# Pillow'un varsayılan yazı tipinde Türkçe karakterler yok; bilinen sistem yazı tiplerini dene
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def _font(size):
    from PIL import ImageFont

    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def contact_sheet(rows, out, tile=112, cols=10):
    """rows: [(başlık, [(kırpıntı yolu, etiket|None), ...]), ...] -> tek JPEG."""
    from PIL import Image, ImageDraw

    title_font, label_font = _font(13), _font(11)
    head = 20
    height = sum(head + tile * ((len(items) + cols - 1) // cols) for _, items in rows)
    sheet = Image.new("RGB", (tile * cols, max(height, 1)), "white")
    draw = ImageDraw.Draw(sheet)
    y = 0
    for title, items in rows:
        draw.text((4, y + 3), title, fill="black", font=title_font)
        y += head
        for k, (path, label) in enumerate(items):
            im = Image.open(path).convert("RGB")
            if label:
                d = ImageDraw.Draw(im)
                d.rectangle([0, 0, d.textlength(label, font=label_font) + 5, 14], fill="black")
                d.text((2, 1), label, fill="yellow", font=label_font)
            sheet.paste(im, ((k % cols) * tile, y + (k // cols) * tile))
        y += tile * ((len(items) + cols - 1) // cols)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=88)
    return out
