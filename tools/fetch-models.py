"""InsightFace buffalo_sc modellerini indirir ve eklenti için hazırlar.

Orijinal ONNX dosyalarında çıktı boyutları 640x640 giriş / batch=1 için sabitlenmiş;
dinamik boyutla çalışınca onnxruntime her karede uyarı basıyor. Burada çıktıların ilk
boyutu sembolik ('N') yapılır.

Kullanım: uv run --with onnx tools/fetch-models.py [--out extension/models]
"""

import argparse
import io
import urllib.request
import zipfile
from pathlib import Path

import onnx

URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
MODELS = ["det_500m.onnx", "w600k_mbf.onnx"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="extension/models")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"İndiriliyor: {URL}")
    data = urllib.request.urlopen(URL).read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in MODELS:
            member = next(n for n in z.namelist() if n.endswith(name))
            model = onnx.load_from_string(z.read(member))
            for o in model.graph.output:
                d = o.type.tensor_type.shape.dim[0]
                d.ClearField("dim_value")
                d.dim_param = "N"
            onnx.checker.check_model(model)
            onnx.save(model, out / name)
            print(f"Yazıldı: {out / name}")


if __name__ == "__main__":
    main()
