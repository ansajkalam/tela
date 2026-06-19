import json
from pathlib import Path

from PIL import Image, ImageOps, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "approved-alphabet-images.json"
OUT_DIR = ROOT / "tiles"
OUT_DIR.mkdir(exist_ok=True)

TARGET_W = 600
TARGET_H = 900
PngImagePlugin.MAX_TEXT_CHUNK = 128 * 1024 * 1024


def source_box(width, height, crop):
    zoom = float(crop.get("zoom", 1) or 1)
    pan_x = float(crop.get("panX", 50)) / 100
    pan_y = float(crop.get("panY", 50)) / 100

    src_w = width / zoom
    src_h = src_w * (TARGET_H / TARGET_W)

    if src_h > height:
        src_h = height / zoom
        src_w = src_h * (TARGET_W / TARGET_H)

    max_x = max(width - src_w, 0)
    max_y = max(height - src_h, 0)
    left = max_x * pan_x
    top = max_y * pan_y
    return (round(left), round(top), round(left + src_w), round(top + src_h))


def slug(value):
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:46] or "tile"


with DATASET.open("r", encoding="utf-8") as handle:
    data = json.load(handle)

for index, item in enumerate(data, start=1):
    source_ref = item.get("fullImageUrl") or item["imageUrl"]
    if not source_ref.startswith(("images/", "tiles/")):
        source_ref = item["imageUrl"]
    source = ROOT / source_ref
    title = item.get("title") or item.get("description") or "image"
    name = f"{index:03d}-{item['letter']}-{slug(title)}.jpg"
    output = OUT_DIR / name

    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        box = source_box(img.width, img.height, item.get("crop") or {})
        cropped = img.crop(box)
        cropped = ImageOps.fit(cropped, (TARGET_W, TARGET_H), method=Image.Resampling.LANCZOS)
        cropped.save(output, "JPEG", quality=82, optimize=True, progressive=True)

    item["originalImageUrl"] = item.get("originalImageUrl") or item["imageUrl"]
    item["fullImageUrl"] = item["imageUrl"]
    item["imageUrl"] = f"tiles/{name}"
    item["thumbnailUrl"] = f"tiles/{name}"
    item["optimizedTile"] = True
    item["optimizedSize"] = {"width": TARGET_W, "height": TARGET_H}

with DATASET.open("w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")

print(f"Optimized {len(data)} images into {OUT_DIR}")
