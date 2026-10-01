#!/usr/bin/env python3
"""Prepare photos and videos for a celebration card.

- Images: fix EXIF rotation, strip ALL metadata (GPS!), resize, save as WebP (+ a small thumb),
  read capture dates (for chronological ordering) and dominant colours (for the palette).
- Videos: transcode to H.264/AAC MP4 (plays everywhere incl. iPhone .mov/HEVC sources),
  tone-map HDR to SDR when possible, cap resolution, +faststart, extract a poster frame.
- Writes media.json describing everything (sizes, aspect, orientation, date, colours) — read it
  when planning scenes. Files get neutral names (img-01.webp …) so no original filenames leak.

Usage:
  python3 prepare_media.py INPUT [INPUT ...] --out card/assets/media
      [--max 1920] [--thumb 480] [--quality 82] [--video-max 1280] [--mute-video] [--trim START:END]

INPUT can be files or folders (searched recursively). Requires Pillow; videos need ffmpeg.
HEIC: uses pillow-heif if installed, else macOS `sips`, else ImageMagick `magick`.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("The Pillow package (Python imaging) is required. Install it with pip and run this again.")

try:  # optional HEIC support
    import pillow_heif  # type: ignore
    pillow_heif.register_heif_opener()
    HEIF_NATIVE = True
except Exception:
    HEIF_NATIVE = False

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".gif"}
VID_EXT = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".3gp"}


def collect(inputs):
    files = []
    for raw in inputs:
        p = Path(raw).expanduser()
        if p.is_dir():
            files += [f for f in sorted(p.rglob("*")) if f.suffix.lower() in IMG_EXT | VID_EXT and not f.name.startswith(".")]
        elif p.exists():
            files.append(p)
        else:
            print(f"  ! not found: {raw}", file=sys.stderr)
    return files


def open_image(path):
    """Open an image, converting HEIC via sips/magick when Pillow can't read it."""
    try:
        return Image.open(path)
    except Exception:
        if path.suffix.lower() not in {".heic", ".heif"}:
            raise
    with tempfile.TemporaryDirectory() as tmp:  # holds the converted JPEG; removed once it has been read
        jpg = Path(tmp) / (path.stem + ".jpg")
        if shutil.which("sips"):
            subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(jpg)], check=True, capture_output=True)
        elif shutil.which("magick"):
            subprocess.run(["magick", str(path), str(jpg)], check=True, capture_output=True)
        else:
            raise RuntimeError("HEIC needs the pillow-heif package, macOS sips, or ImageMagick")
        img = Image.open(jpg)
        img.load()  # read it fully now: the file goes away with the temporary folder
        return img


def exif_date(img):
    try:
        ex = img.getexif()
        sub = ex.get_ifd(0x8769) if hasattr(ex, "get_ifd") else {}
        raw = sub.get(36867) or sub.get(36868) or ex.get(306)  # DateTimeOriginal, DateTimeDigitized, DateTime
        if raw:
            return datetime.strptime(str(raw).strip()[:19], "%Y:%m:%d %H:%M:%S").isoformat()
    except Exception:
        pass
    return None


def credit_info(img):
    """Photographer / copyright tags (EXIF Artist 0x013B, Copyright 0x8298), read before stripping.
    If present, the photo may not be the sender's own — worth asking before publishing it."""
    try:
        ex = img.getexif()
        bits = [str(ex.get(t)).strip(" \x00") for t in (0x013B, 0x8298) if ex.get(t)]
        return " / ".join(b for b in bits if b) or None
    except Exception:
        return None


def has_gps(img):
    try:
        ex = img.getexif()
        return bool(ex.get_ifd(0x8825)) if hasattr(ex, "get_ifd") else 34853 in ex
    except Exception:
        return False


def palette(img, k=5):
    """Dominant colours via Pillow's median-cut quantiser, most common first."""
    small = img.convert("RGB").copy()
    small.thumbnail((96, 96))
    q = small.quantize(colors=k, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: k * 3]
    counts = sorted(q.getcolors(), reverse=True)
    out, rgb = [], []
    for _, idx in counts:
        c = pal[idx * 3: idx * 3 + 3]
        if all(sum((a - b) ** 2 for a, b in zip(c, o)) > 28 ** 2 for o in rgb):  # skip near-duplicates
            rgb.append(c)
            out.append("#%02x%02x%02x" % tuple(c))
    return out


def luminance(img):
    g = img.convert("L").copy()
    g.thumbnail((64, 64))
    px = list(g.getdata())
    return round(sum(px) / len(px) / 255, 3)


def process_image(src, out_dir, idx, args):
    img = open_image(src)
    date = exif_date(img)
    gps = has_gps(img)
    credit = credit_info(img)
    img = ImageOps.exif_transpose(img)
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if has_alpha else "RGB")
    img.thumbnail((args.max, args.max), Image.Resampling.LANCZOS)
    name = f"img-{idx:02d}.webp"
    # Saving a fresh image without exif= drops every metadata block (EXIF, GPS, XMP).
    img.save(out_dir / name, "WEBP", quality=args.quality, method=6)
    thumb = img.copy()
    thumb.thumbnail((args.thumb, args.thumb), Image.Resampling.LANCZOS)
    (out_dir / "thumbs").mkdir(exist_ok=True)
    thumb.save(out_dir / "thumbs" / name, "WEBP", quality=78, method=6)
    w, h = img.size
    return {
        "type": "image", "src": f"{args.prefix}{name}", "thumb": f"{args.prefix}thumbs/{name}",
        "w": w, "h": h, "aspect": round(w / h, 4),
        "orientation": "landscape" if w > h * 1.05 else "portrait" if h > w * 1.05 else "square",
        "date": date, "colors": palette(img), "luma": luminance(img),
        "original": src.name, "gpsRemoved": gps, "credit": credit, "bytes": (out_dir / name).stat().st_size,
    }


def ffprobe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)], capture_output=True, text=True)
    return json.loads(r.stdout or "{}")


def process_video(src, out_dir, idx, args):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required for videos (brew install ffmpeg / apt install ffmpeg)")
    info = ffprobe(src)
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    transfer = v.get("color_transfer", "")
    hdr = transfer in ("smpte2084", "arib-std-b67")
    name = f"vid-{idx:02d}.mp4"
    scale = f"scale='min({args.video_max},iw)':'min({args.video_max},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2"
    tonemap = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,"
    trim = []
    if args.trim:
        a, _, b = args.trim.partition(":")
        trim = ["-ss", a] + (["-to", b] if b else [])

    def run(vf):
        cmd = ["ffmpeg", "-y", "-v", "error", *trim, "-i", str(src), "-vf", vf + "format=yuv420p",
               "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-profile:v", "high", "-movflags", "+faststart",
               "-map_metadata", "-1"]
        cmd += ["-an"] if (args.mute_video or not has_audio) else ["-c:a", "aac", "-b:a", "128k"]
        cmd.append(str(out_dir / name))
        return subprocess.run(cmd, capture_output=True, text=True)

    r = run((tonemap if hdr else "") + scale + ",")
    if r.returncode != 0 and hdr:
        print(f"  ! HDR tone-mapping unavailable (ffmpeg without zimg?) — converting {src.name} without it", file=sys.stderr)
        r = run(scale + ",")
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-400:])
    out = ffprobe(out_dir / name)
    ov = next((s for s in out.get("streams", []) if s.get("codec_type") == "video"), {})
    dur = float(out.get("format", {}).get("duration", 0) or 0)
    poster = f"vid-{idx:02d}.jpg"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(min(1.0, dur / 3)), "-i", str(out_dir / name), "-frames:v", "1", "-q:v", "3", str(out_dir / poster)], capture_output=True)
    w, h = int(ov.get("width", 0)), int(ov.get("height", 0))
    return {
        "type": "video", "src": f"{args.prefix}{name}", "poster": f"{args.prefix}{poster}", "w": w, "h": h,
        "aspect": round(w / h, 4) if h else None, "duration": round(dur, 2),
        "hasAudio": has_audio and not args.mute_video, "hdrSource": hdr, "original": src.name,
        "bytes": (out_dir / name).stat().st_size,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--out", required=True, help="output folder, e.g. my-card/assets/media")
    ap.add_argument("--prefix", default=None, help="URL prefix written into media.json (default: assets/media/)")
    ap.add_argument("--max", type=int, default=1920, help="longest image edge (px)")
    ap.add_argument("--thumb", type=int, default=480)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--video-max", type=int, default=1280, help="longest video edge (px)")
    ap.add_argument("--mute-video", action="store_true", help="drop video audio (music keeps playing over clips)")
    ap.add_argument("--trim", help="START:END seconds for videos (applies to all inputs)")
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.prefix is None:
        parts = out_dir.as_posix().split("/")
        args.prefix = "/".join(parts[parts.index("assets"):]) + "/" if "assets" in parts else ""

    files = collect(args.inputs)
    if not files:
        sys.exit("No images or videos found.")
    items, n_img, n_vid = [], 0, 0
    for f in files:
        try:
            if f.suffix.lower() in VID_EXT:
                n_vid += 1
                items.append(process_video(f, out_dir, n_vid, args))
            else:
                n_img += 1
                items.append(process_image(f, out_dir, n_img, args))
            it = items[-1]
            print(f"  ✓ {f.name} → {Path(it['src']).name}  {it['w']}×{it['h']}  {it.get('date') or ''}{'  (GPS removed)' if it.get('gpsRemoved') else ''}"
                  + (f"  ⚠ credit in metadata: {it['credit']}" if it.get('credit') else ""))
        except Exception as e:
            print(f"  ✗ {f.name}: {e}", file=sys.stderr)

    # Chronological when dates exist (nice for "through the years" stories); undated keep input order.
    dated = [i for i in items if i.get("date")]
    if len(dated) >= max(2, len(items) // 2):
        items.sort(key=lambda i: (i.get("date") or "9999"))
    colors = [c for i in items for c in i.get("colors", [])[:2]]
    manifest = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "count": {"images": sum(i["type"] == "image" for i in items), "videos": sum(i["type"] == "video" for i in items)},
        "totalBytes": sum(i["bytes"] for i in items),
        "palette": list(dict.fromkeys(colors))[:12],
        "items": items,
    }
    (out_dir / "media.json").write_text(json.dumps(manifest, indent=2))
    mb = manifest["totalBytes"] / 1e6
    print(f"\n{manifest['count']['images']} images, {manifest['count']['videos']} videos, {mb:.1f} MB → {out_dir}/media.json")
    if any(i.get("gpsRemoved") for i in items):
        print("Location data was removed from photos that had it.")
    credited = [i for i in items if i.get("credit")]
    if credited:
        print(f"{len(credited)} photo(s) carry photographer/copyright metadata (kept in media.json → credit). They may not be the sender's own:\n"
              "  ask before publishing, and credit them in CREDITS.md if kept.")
    if mb > 25:
        print("Heads-up: over 25 MB of media. Consider fewer/shorter videos, --max 1600, or --video-max 960.")


if __name__ == "__main__":
    main()
