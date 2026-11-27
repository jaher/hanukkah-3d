#!/usr/bin/env python3
"""Capture current live Three.js WebGL screenshots for README.md using headless Chromium."""

import http.server
import os
import socketserver
import subprocess
import threading
from PIL import Image

REPO_ROOT = "/workspace"
OUT_DIR = os.path.join(REPO_ROOT, "docs", "screenshots")
PORT = 8130

SHOTS = [
    ("room-overview.jpg", "/?night=8&cam=overview&clean=1"),
    ("hanukkiah-night8.jpg", "/?night=8&cam=hanukkiah"),
    ("hanukkiah-night5.jpg", "/?night=5&cam=hanukkiah"),
    ("hanukkiah-night1.jpg", "/?night=1&cam=hanukkiah"),
    ("hanukkiah-shamash.jpg", "/?night=0&cam=hanukkiah"),
    ("dreidel-gelt.jpg", "/?night=8&cam=dreidel&clean=1"),
    ("feast-table.jpg", "/?night=8&cam=feast&clean=1"),
    ("winter-window.jpg", "/?night=8&cam=window&clean=1"),
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except BrokenPipeError:
            pass


class ReusableServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def main():
    os.chdir(REPO_ROOT)
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp_dir = os.path.join(REPO_ROOT, "tmp", "readme_shots")
    os.makedirs(tmp_dir, exist_ok=True)

    httpd = ReusableServer(("127.0.0.1", PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    try:
        for jpg_name, path in SHOTS:
            tmp_png = os.path.join(tmp_dir, jpg_name.replace(".jpg", ".png"))
            out_jpg = os.path.join(OUT_DIR, jpg_name)
            url = f"http://127.0.0.1:{PORT}{path}"
            cmd = [
                "chromium",
                "--headless",
                "--no-sandbox",
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
                "--window-size=1280,800",
                "--virtual-time-budget=9500",
                f"--screenshot={tmp_png}",
                url,
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if res.returncode != 0 or not os.path.exists(tmp_png):
                raise RuntimeError(f"Chromium failed for {jpg_name}: rc={res.returncode}")
            img = Image.open(tmp_png).convert("RGB")
            img.save(out_jpg, "JPEG", quality=92, optimize=True)
            os.remove(tmp_png)
            print(f"[screenshot] wrote {out_jpg} ({os.path.getsize(out_jpg) / 1024:.1f} KB)")
    finally:
        httpd.shutdown()
        if os.path.isdir(tmp_dir):
            try:
                os.rmdir(tmp_dir)
                os.rmdir(os.path.join(REPO_ROOT, "tmp"))
            except OSError:
                pass


if __name__ == "__main__":
    main()
