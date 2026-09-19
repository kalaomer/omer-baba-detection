"""tools/dataset.json'daki YouTube videolarını data/videos/<bölüm>/<id>.<uzantı> olarak indirir.

Yalnızca görüntü akışı indirilir (ses gerekmez); zaten inmiş videolar atlanır.
YouTube için güncel yt-dlp ve bir JavaScript çalışma ortamı (Node) gerekir; eski yt-dlp 403 alır.

Kullanım:
  uv run --python 3.12 --with-requirements tools/requirements.txt tools/download-videos.py \
      [--splits train test neg episode] [--out data/videos]
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

MAX_HEIGHT = {"episode": 360}  # tam bölüm yalnızca zaman çizelgesi için; 360p yeter (varsayılan 480p)
VIDEO_EXTS = {".mp4", ".webm", ".mkv"}  # yarım kalan indirmelerin .part dosyaları sayılmaz


def downloaded(folder, vid):
    return any(p.suffix in VIDEO_EXTS for p in folder.glob(f"{vid}.*"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="tools/dataset.json")
    ap.add_argument("--out", default="data/videos")
    ap.add_argument("--splits", nargs="+", default=["train", "test", "neg", "episode"])
    a = ap.parse_args()

    dataset = json.loads(Path(a.dataset).read_text())
    failed = []
    for split in a.splits:
        out = Path(a.out) / split
        out.mkdir(parents=True, exist_ok=True)
        for vid in dataset[split]:
            if downloaded(out, vid):
                print(f"zaten var: {split}/{vid}")
                continue
            height = MAX_HEIGHT.get(split, 480)
            print(f"indiriliyor: {split}/{vid} (en fazla {height}p)")
            cmd = [
                sys.executable, "-m", "yt_dlp", "--js-runtimes", "node", "-q", "--no-warnings",
                "-f", f"bv*[height<={height}]", "-o", str(out / "%(id)s.%(ext)s"),
                f"https://www.youtube.com/watch?v={vid}",
            ]
            if subprocess.run(cmd).returncode != 0:
                failed.append(f"{split}/{vid}")
    if failed:
        print("İndirilemeyenler (video kaldırılmış ya da erişime kapanmış olabilir):", ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
