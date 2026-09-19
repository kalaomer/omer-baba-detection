"""Referans yönteminin daha önce görmediği verideki başarısını ölçer.

Merkez yalnızca eğitim yüzlerinden kurulur (build-refs.py ile aynı yöntem), sonra:
  - test: Ömer Baba sahneleri olan ama merkeze girmemiş klipler. Etiketler kümelemeyle çıkarılır:
    en büyük küme = Ömer Baba (pozitif), en az 5 yüzlü diğer kümeler = başka kişiler (negatif).
  - neg: Ömer Baba'nın hiç olmadığı videolar (kesin negatif).

Rapor: AUC, eşikte yakalama ve yanlış pozitif, belli yanlış-pozitif oranlarında yakalama, negatif
videolardaki en yüksek skor ve canlı tespit mantığının sahne düzeyinde simülasyonu.

--report verilirse sınırdaki yüzlerin kontak sayfası yazılır. Kümelemenin "başka kişi" dediği en
yüksek skorlu yüzler çoğunlukla profilden ya da karanlıkta görünen Ömer Baba'dır; gözle bakmak
gerçek hatayı etiket gürültüsünden ayırır.

Kullanım:
  uv run --python 3.12 --with-requirements tools/requirements.txt tools/evaluate.py \
      --train data/faces/train --test data/faces/test --neg data/faces/neg [--threshold 0.36] [--report data/reports]
"""

import argparse
import collections
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

from facedata import Faces, centroid, cluster, contact_sheet

MIN_HFRAC = 0.1  # eklentideki boyut filtresi: uzak yüzler sayılmaz


def per_second(faces, scores):
    """video -> {zaman: o karedeki en yüksek skor} (yalnızca boyut filtresinden geçen yüzler)."""
    out = collections.defaultdict(dict)
    for m, s in zip(faces.meta, scores):
        if m["hFrac"] >= MIN_HFRAC:
            out[m["vid"]][m["t"]] = max(out[m["vid"]].get(m["t"], -1.0), float(s))
    return out


def simulate(series, threshold, step=2.0, clean_needed=3):
    """Canlı tespit mantığı: son 3 örneğin 2'si isabetse sahneyi atla, art arda 3 temiz bakışta dur."""
    times = sorted(series)
    if not times:
        return 0, 0.0, 0
    # Yalnızca yüz bulunan kareler kayıtlı; örnekleme aralığı ardışık kayıtların en küçük farkıdır
    dt = float(np.min(np.diff(times))) if len(times) > 1 else 1.0
    hit = lambda t: series.get(round(t / dt) * dt, -1) >= threshold  # noqa: E731
    t, end, win = 0.0, times[-1] + dt, []
    triggers, skipped, seen = 0, 0.0, 0
    while t < end:
        win = (win + [hit(t)])[-3:]
        if sum(win) >= 2:
            triggers += 1
            start, p, clean = t, t, 0
            while p < end and clean < clean_needed:
                p += max(step, dt)
                clean = 0 if hit(p) else clean + 1
            skipped += p - start
            t, win = p, []
            continue
        seen += win[-1]
        t += dt
    return triggers, skipped, seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", nargs="+", required=True)
    ap.add_argument("--test", nargs="+", required=True)
    ap.add_argument("--neg", nargs="+", required=True)
    ap.add_argument("--threshold", type=float, default=0.36)
    ap.add_argument("--report", help="kontak sayfalarının yazılacağı klasör")
    a = ap.parse_args()
    th = a.threshold

    train, test, neg = Faces(a.train), Faces(a.test), Faces(a.neg)
    c, _, refined = centroid(train)
    print(f"Merkez yalnızca eğitim verisinden: {len(refined)} yüz")

    # Test etiketleri (kümeleme)
    idx = np.where(test.mask(min_hfrac=MIN_HFRAC))[0]
    labels = cluster(test.emb[idx])
    sizes = np.bincount(labels)
    om = sizes.argmax()
    pos_i = idx[labels == om]
    oth_i = idx[(labels != om) & (sizes[labels] >= 5)]
    neg_i = np.where(neg.mask(min_hfrac=MIN_HFRAC))[0]
    s_test, s_neg = test.emb @ c, neg.emb @ c
    sp, so, sn = s_test[pos_i], s_test[oth_i], s_neg[neg_i]
    negatives = np.r_[so, sn]
    print(f"Test: {len(pos_i)} Ömer Baba yüzü, {len(oth_i)} başka kişi yüzü | Negatif videolar: {len(neg_i)} yüz")

    auc = roc_auc_score(np.r_[np.ones(len(sp)), np.zeros(len(negatives))], np.r_[sp, negatives])
    print(f"\nAUC: {auc:.4f}")
    print(f"Eşik {th:.2f}: yakalama %{100 * np.mean(sp >= th):.1f} | test'teki başka kişilerde eşik üstü "
          f"%{100 * np.mean(so >= th):.2f} | negatif videolarda eşik üstü {int((sn >= th).sum())} yüz (en yüksek {sn.max():.3f})")
    for fpr in (0.001, 0.005, 0.01):
        t = np.quantile(negatives, 1 - fpr)
        print(f"  yanlış pozitif %{100 * fpr:.1f} -> eşik {t:.3f}, yakalama %{100 * np.mean(sp > t):.1f}")
    print(f"Ömer Baba skor yüzdelikleri [5, 25, 50]: {np.percentile(sp, [5, 25, 50]).round(3)}")

    print("\nSahne simülasyonu (canlı tespit mantığı):")
    for name, faces, scores in (("test", test, s_test), ("neg", neg, s_neg)):
        for vid, series in sorted(per_second(faces, scores).items()):
            n_omer = sum(v >= th for v in series.values())
            tr, sk, seen = simulate(series, th)
            print(f"  {name:4s} {vid}: Ömer Baba örneği {n_omer:4d} | tetik {tr:3d} | atlanan {sk:6.0f} sn | "
                  f"tetiklemeden önce görülen örnek {seen}")

    if a.report:
        lab = lambda s: f"{s:.2f}"  # noqa: E731
        top_oth = oth_i[np.argsort(-s_test[oth_i])][:20]
        low_pos = pos_i[np.argsort(s_test[pos_i])][:10]
        top_neg = neg_i[np.argsort(-s_neg[neg_i])][:10]
        rows = [
            ("Test: 'başka kişi' kümelerinde en yüksek skorlular (çoğu profil/karanlık Ömer Baba olabilir)",
             [(test.crop[i], lab(s_test[i])) for i in top_oth]),
            ("Test: Ömer Baba kümesinin en düşük skorluları", [(test.crop[i], lab(s_test[i])) for i in low_pos]),
            ("Negatif videolar: en yüksek skorlu yüzler", [(neg.crop[i], lab(s_neg[i])) for i in top_neg]),
        ]
        print(f"\nKontak sayfası: {contact_sheet(rows, Path(a.report) / 'sinir-yuzler.jpg')}")


if __name__ == "__main__":
    main()
