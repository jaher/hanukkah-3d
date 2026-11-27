#!/usr/bin/env python3
"""Capture the two README.md screenshots (Non-Shabbat Night 3 & Shabbat Night 8) from the live site."""

import base64
import io
import json
import os
import socket
import struct
import subprocess
import time
import urllib.request
from PIL import Image

REPO_ROOT = "/workspace"
OUT_DIR = os.path.join(REPO_ROOT, "docs", "screenshots")
LIVE_URL = os.environ.get("HANUKKAH_URL", "https://jaher.github.io/hanukkah-3d/")
CDP_PORT = 9236

SHOTS = [
    ("non-shabbat-night3.jpg", 3, False),
    ("shabbat-night8.jpg", 8, True),
]


class TinyCDP:
    def __init__(self, ws_url):
        rest = ws_url.replace("ws://", "")
        hostport, path = rest.split("/", 1)
        host, port = hostport.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=45)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {hostport}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.msg_id = 0

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError("WS closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _recv_message(self):
        chunks, msg_op = [], None
        while True:
            hdr = self._recv_exact(2)
            fin, op = bool(hdr[0] & 0x80), hdr[0] & 0x0F
            masked, length = bool(hdr[1] & 0x80), hdr[1] & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else None
            payload = self._recv_exact(length)
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if op == 8:
                raise EOFError("WS closed")
            if op == 9:
                continue
            if op != 0:
                msg_op = op
            chunks.append(payload)
            if fin:
                return msg_op, b"".join(chunks)

    def _send_text(self, text):
        data = text.encode("utf-8")
        mask = os.urandom(4)
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", n))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", n))
        header.extend(mask)
        self.sock.sendall(bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def call(self, method, params=None):
        self.msg_id += 1
        cid = self.msg_id
        self._send_text(json.dumps({"id": cid, "method": method, "params": params or {}}))
        while True:
            op, payload = self._recv_message()
            if op != 1:
                continue
            msg = json.loads(payload.decode("utf-8"))
            if msg.get("id") == cid:
                if "error" in msg:
                    raise RuntimeError(f"CDP error for {method}: {msg['error']}")
                return msg.get("result", {})

    def eval(self, expr):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        if "exceptionDetails" in r:
            raise RuntimeError(f"JS exception: {r['exceptionDetails']}")
        return r.get("result", {}).get("value")

    def save_jpg(self, path):
        r = self.call("Page.captureScreenshot", {"format": "png"})
        img = Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")
        img.save(path, "JPEG", quality=92, optimize=True)

    def close(self):
        self.sock.close()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    chrome = subprocess.Popen(
        [
            "chromium",
            "--headless",
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--window-size=1280,800",
            f"--remote-debugging-port={CDP_PORT}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/list", timeout=2) as resp:
                    for pg in json.loads(resp.read().decode()):
                        if pg.get("type") == "page" and pg.get("webSocketDebuggerUrl"):
                            ws_url = pg["webSocketDebuggerUrl"]
                            break
                if ws_url:
                    break
            except Exception:
                time.sleep(0.2)
        if not ws_url:
            raise RuntimeError("Could not connect to Chromium CDP")

        cdp = TinyCDP(ws_url)
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", {
            "width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False
        })
        cdp.call("Page.navigate", {"url": LIVE_URL})

        for _ in range(80):
            if cdp.eval("Boolean(window.hanukkahApp && window.hanukkahApp.isLoaded)"):
                break
            time.sleep(0.5)
        time.sleep(1.0)

        for jpg_name, night, expected_challah in SHOTS:
            info = cdp.eval(f"""(() => {{
                const app = window.hanukkahApp;
                const btn = document.querySelector('.night-btn[data-night="{night}"]');
                btn.click();
                btn.blur();
                let t = app.clock.getElapsedTime();
                for (let i = 0; i < 80; i++) {{
                    t += 0.05;
                    app.flameRig.update(0.05, t);
                }}
                document.querySelectorAll('.night-btn').forEach(b => {{
                    b.style.transition = 'none';
                    void b.offsetWidth;
                    b.style.transition = '';
                }});
                app.renderer.render(app.scene, app.camera);
                return {{
                    activeNight: app.activeNight,
                    challahVisible: app.challahRoot.visible,
                    litCount: app.candleFlames.filter(f => f.currentLit >= 0.99).length,
                }};
            }})()""")
            assert info["activeNight"] == night
            assert info["challahVisible"] is expected_challah
            assert info["litCount"] == night
            time.sleep(0.8)
            out_path = os.path.join(OUT_DIR, jpg_name)
            cdp.save_jpg(out_path)
            print(f"[screenshot] wrote {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB)")
        cdp.close()
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except Exception:
            chrome.kill()


if __name__ == "__main__":
    main()
