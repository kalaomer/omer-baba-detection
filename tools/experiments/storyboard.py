"""Storyboard deneyi (reddedildi, bkz. README).

fetch   : Bir videonun en yüksek çözünürlüklü storyboard sayfalarını ve özelliklerini indirir.
compare : storyboard-faces.mjs sonuçlarını, aynı bölümün tam çözünürlüklü yüz çıkarımından gelen
          gerçek zaman çizelgesiyle karşılaştırır (sahne yakalama, yanlış alarm, kapsama).

Kullanım:
  uv run --python 3.12 --with-requirements tools/requirements.txt tools/experiments/storyboard.py fetch mTZTz3yT3PA
  node tools/experiments/storyboard-faces.mjs data/storyboard/mTZTz3yT3PA
  uv run ... tools/experiments/storyboard.py compare data/storyboard/mTZTz3yT3PA data/faces/episode
"""

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from facedata import Faces  # noqa: E402


def fetch(a):
    info = json.loads(subprocess.run(
        [sys.executable, "-m", "yt_dlp", "--js-runtimes", "node", "--no-warnings", "-j",
         f"https://www.youtube.com/watch?v={a.video}"],
        check=True, capture_output=True, text=True).stdout)
    boards = [f for f in info["formats"] if f["format_id"].startswith("sb")]
    best = max(boards, key=lambda f: f["width"] * f["height"])
    out = Path(a.out) / a.video
    out.mkdir(parents=True, exist_ok=True)
    spec = {k: best.get(k) for k in ("width", "height", "fps", "columns", "rows")} | {"n": len(best["fragments"])}
    (out / "spec.json").write_text(json.dumps(spec))
    for i, fr in enumerate(best["fragments"]):
        (out / f"{i:03d}.webp").write_bytes(urllib.request.urlopen(fr["url"]).read())
    print(f"{spec['n']} sayfa, karo {spec['width']}x{spec['height']}, {1 / spec['fps']:.1f} sn'de bir -> {out}")


def compare(a):
    refs = json.loads(Path(a.refs).read_text())
    c = np.array(refs["centroid"], dtype=np.float32)
    faces = Faces([a.episode_faces])
    gt = {}
    for m, s in zip(faces.meta, faces.emb @ c):
        if m["hFrac"] >= 0.1:
            gt[round(m["t"], 3)] = max(gt.get(round(m["t"], 3), -1.0), float(s))
    dt = float(np.min(np.diff(sorted(gt))))
    times = np.arange(0, max(gt) + dt, dt)  # yüz bulunmayan kareler de ızgarada (Ömer Baba yok sayılır)
    gthit = np.array([gt.get(round(t, 3), -1.0) >= refs["threshold"] for t in times])
    scenes = []
    for t, h in zip(times, gthit):
        if not h:
            continue
        if scenes and t - scenes[-1][1] <= 12:
            scenes[-1][1] = t
            scenes[-1][2] += 1
        else:
            scenes.append([t, t, 1])
    scenes = [s for s in scenes if s[2] >= 2]
    print(f"Gerçek: {int(gthit.sum() * dt)} sn Ömer Baba, {len(scenes)} sahne")

    spec = json.loads((Path(a.storyboard) / "spec.json").read_text())
    interval = 1 / spec["fps"]
    rows = json.loads((Path(a.storyboard) / "faces.json").read_text())
    sbt = np.array([r["k"] * interval + interval / 2 for r in rows])  # karo, aralığın ortasını gösterir
    for th in (0.30, 0.36, 0.42):
        sbh = np.array([max([f["sim"] for f in r["faces"] if f["hPx"] >= 18] or [-1]) >= th for r in rows])
        caught = sum(1 for s, e, _ in scenes if sbh[(sbt >= s - interval / 2) & (sbt <= e + interval / 2)].any())
        false = sum(1 for t, h in zip(sbt, sbh) if h and not gthit[(times >= t - 7) & (times <= t + 7)].any())
        cover = np.zeros_like(gthit)
        for t, h in zip(sbt, sbh):
            if h:
                cover |= (times >= t - interval / 2) & (times < t + interval / 2)
        print(f"eşik {th:.2f}: sahne yakalama {caught}/{len(scenes)}, yanlış alarm karo {false}, "
              f"yalnızca haritayla: Ömer Baba süresinin %{100 * (cover & gthit).sum() / gthit.sum():.0f}'i kapsanır, "
              f"Ömer Baba'sız {int((cover & ~gthit).sum() * dt)} sn atlanır")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("video")
    f.add_argument("--out", default="data/storyboard")
    c = sub.add_parser("compare")
    c.add_argument("storyboard")
    c.add_argument("episode_faces")
    c.add_argument("--refs", default="extension/refs/omer.json")
    a = ap.parse_args()
    fetch(a) if a.cmd == "fetch" else compare(a)


if __name__ == "__main__":
    main()
