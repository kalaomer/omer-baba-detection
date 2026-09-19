"""Tam bir bölümün yüz çıkarımından Ömer Baba zaman çizelgesi çıkarır.

- Sahneler: eşik üstü örnekler, aralarında 12 sn'den kısa boşluk varsa aynı sahne sayılır
  (en az 2 isabet). Uçtan uca testlerde başlangıç zamanı seçmek için kullanışlıdır.
- "Tek başına" istatistiği: Ömer Baba'nın göründüğü anların ne kadarında karede başka biri de var.

Kullanım:
  uv run --python 3.12 --with-requirements tools/requirements.txt tools/episode-report.py data/faces/episode \
      [--refs extension/refs/omer.json] [--json data/reports/bolum.json]
"""

import argparse
import collections
import json
from pathlib import Path

import numpy as np

from facedata import Faces

MIN_HFRAC = 0.1


def fmt(t):
    t = int(t)
    return f"{t // 60}:{t % 60:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("faces")
    ap.add_argument("--refs", default="extension/refs/omer.json")
    ap.add_argument("--gap", type=float, default=12)
    ap.add_argument("--json", help="sahne listesini JSON olarak da yaz")
    a = ap.parse_args()

    refs = json.loads(Path(a.refs).read_text())
    c = np.array(refs["centroid"], dtype=np.float32)
    th = refs["threshold"]
    faces = Faces([a.faces])
    scores = faces.emb @ c

    per = collections.defaultdict(lambda: collections.defaultdict(list))  # video -> zaman -> skorlar
    for m, s in zip(faces.meta, scores):
        if m["hFrac"] >= MIN_HFRAC:
            per[m["vid"]][m["t"]].append(float(s))

    report = {}
    for vid, frames in sorted(per.items()):
        times = sorted(frames)
        dt = float(np.min(np.diff(times))) if len(times) > 1 else 1.0
        omer = [t for t in times if max(frames[t]) >= th]
        alone = [t for t in omer if len(frames[t]) == 1]
        scenes = []
        for t in omer:
            if scenes and t - scenes[-1][1] <= a.gap:
                scenes[-1][1] = t
                scenes[-1][2] += 1
            else:
                scenes.append([t, t, 1])
        scenes = [s for s in scenes if s[2] >= 2]
        print(f"\n{vid}: örnekleme aralığı {dt:g} sn, Ömer Baba görünen örnek {len(omer)}")
        if omer:
            print(f"  tek başına {len(alone)} (%{100 * len(alone) / len(omer):.0f}), "
                  f"başka biriyle {len(omer) - len(alone)} (%{100 * (len(omer) - len(alone)) / len(omer):.0f})")
        for start, end, n in scenes:
            print(f"  {fmt(start):>7}  [{start:.0f}-{end:.0f}]  {end - start + dt:.0f} sn  {n} isabet")
        report[vid] = {"interval": dt, "scenes": [[s, e] for s, e, _ in scenes],
                       "omer": len(omer), "alone": len(alone)}
    if a.json:
        Path(a.json).parent.mkdir(parents=True, exist_ok=True)
        Path(a.json).write_text(json.dumps(report, indent=2))
        print(f"\nYazıldı: {a.json}")


if __name__ == "__main__":
    main()
