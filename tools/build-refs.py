"""Ömer Baba referans vektörünü üretir ve eşiği raporlar.

extract-faces.mjs çıktılarını okur:
  1. Pozitif klasörlerdeki büyük, net yüzleri kümeler; en büyük küme = Ömer Baba (tohum).
  2. Tohum merkezine yakın tüm yüzlerle merkezi bir tur iyileştirir
     (profil / karanlık sahne yüzleri de böylece dahil olur).
  3. Negatif klasörlerde (Ömer Baba'nın olmadığı videolar) skor dağılımını raporlar.
  4. extension/refs/omer.json dosyasını yazar.

--sheet verilirse en büyük kümelerden örnek yüzlerle bir kontak sayfası çizer. En üst satırın
gerçekten Ömer Baba olduğunu gözle doğrula; hattaki tek elle kontrol adımı budur.

Kullanım:
  uv run --python 3.12 --with-requirements tools/requirements.txt tools/build-refs.py \
      --pos data/faces/train data/faces/test --neg data/faces/neg [--threshold 0.36] [--sheet data/reports/tohum-kume.jpg]
"""

import argparse
import json
from pathlib import Path

import numpy as np

from facedata import Faces, centroid, contact_sheet, seed_cluster


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pos", nargs="+", required=True)
    ap.add_argument("--neg", nargs="+", required=True)
    ap.add_argument("--threshold", type=float, default=0.36)
    ap.add_argument("--refine-sim", type=float, default=0.45)
    ap.add_argument("--min-hfrac", type=float, default=0.1)
    ap.add_argument("--out", default="extension/refs/omer.json")
    ap.add_argument("--sheet", help="en büyük kümelerin kontak sayfası (JPEG)")
    a = ap.parse_args()

    pos = Faces(a.pos)
    c, seed_idx, refined_idx = centroid(pos, a.refine_sim, a.min_hfrac)
    vids = {pos.meta[i]["vid"] for i in seed_idx}
    print(f"Tohum küme: {len(seed_idx)} yüz, {len(vids)} video")
    print(f"İyileştirilmiş merkez: {len(refined_idx)} yüz (benzerlik >= {a.refine_sim})")

    ok = pos.mask(min_hfrac=a.min_hfrac)
    s_pos = pos.emb[ok] @ c
    s_pos = s_pos[s_pos >= 0.3]  # kabaca Ömer Baba olan yüzler
    print(f"Pozitif skor yüzdelikleri [1,5,25,50]: {np.percentile(s_pos, [1, 5, 25, 50]).round(3)}")
    for d in a.neg:
        neg = Faces([d])
        s = neg.emb[neg.mask(min_hfrac=a.min_hfrac)] @ c
        print(f"Negatif {d}: n={len(s)} max={s.max():.3f} p99.9={np.quantile(s, 0.999):.3f} "
              f"eşik üstü={int((s >= a.threshold).sum())}")

    if a.sheet:
        idx, labels = seed_cluster(pos)
        sizes = np.bincount(labels)
        rng = np.random.default_rng(0)
        rows = []
        for rank, lab in enumerate(np.argsort(-sizes)[:6]):
            members = idx[labels == lab]
            pick = rng.choice(members, size=min(10, len(members)), replace=False)
            title = f"{'TOHUM (Ömer Baba olmalı)' if rank == 0 else f'küme {rank + 1}'} - {sizes[lab]} yüz"
            rows.append((title, [(pos.crop[i], f"{pos.emb[i] @ c:.2f}") for i in pick]))
        print(f"Kontak sayfası: {contact_sheet(rows, a.sheet)}")

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "name": "Ömer Baba (Emin Olcay) - Kurtlar Vadisi Pusu",
        "model": "w600k_mbf",
        "dim": 512,
        "threshold": a.threshold,
        "faces": int(len(refined_idx)),
        "centroid": [round(float(x), 6) for x in c],
    }))
    print(f"Yazıldı: {out}")


if __name__ == "__main__":
    main()
