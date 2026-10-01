#!/usr/bin/env python3
"""Local preview server for a celebration card.

Why not `python3 -m http.server`? It ignores HTTP Range requests, so browsers can't seek in the
song (scrubbing, ?t=, card.snap(), replay all break on audio files), and it lets the browser cache
ES modules so edits don't show up. This server supports Range (206 Partial Content), sends
no-cache headers, and serves correct MIME types.

Usage:  python3 serve.py <card-folder> [--port 8765] [--host 127.0.0.1]
Then open http://localhost:8765/  (add ?debug for the timeline overlay)
"""
import argparse
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

EXTRA_TYPES = {
    ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webp": "image/webp",
    ".avif": "image/avif", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav",
    ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".svg": "image/svg+xml",
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        size = os.path.getsize(path)
        if not m or (not m.group(1) and not m.group(2)):
            return super().send_head()
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:  # suffix range: last N bytes
            start = max(0, size - int(m.group(2)))
            end = size - 1
        if start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        try:
            while remaining > 0:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self._remaining = None

    def log_message(self, fmt, *args):  # quiet: only errors
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", default=".")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    folder = os.path.abspath(a.folder)
    if not os.path.exists(os.path.join(folder, "index.html")):
        print(f"warning: no index.html in {folder}", file=sys.stderr)
    httpd = None
    for port in range(a.port, a.port + 20):  # skip ports that are already taken
        try:
            httpd = ThreadingHTTPServer((a.host, port), partial(Handler, directory=folder))
            break
        except OSError:
            continue
    if not httpd:
        sys.exit(f"No free port in {a.port}–{a.port + 19}")
    print(f"Serving {folder} at http://localhost:{port}/  (Ctrl+C to stop)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
