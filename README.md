# Hanukkah 3D — Festival of Lights

A photorealistic, interactive **Three.js** Hanukkah room featuring a deeply carved 925 sterling silver nine-branched *hanukkiah* (menorah), traditional Judaica modeled in headless Blender, live animated candlelight, winter snowfall outside the window, and automatic night-by-night lighting for **Hanukkah 2026 (December 4–12)**.

![Hanukkah 3D — Warm Room Overview on Night 8](docs/screenshots/room-overview.jpg)

---

## Night-by-Night Lighting (Hanukkah 2026: Dec 4–12)

The site computes the active night automatically from the current date (Night 1 beginning the evening of **Friday, Dec 4, 2026** through Night 8 on **Friday, Dec 11**, ending at nightfall on **Saturday, Dec 12**). Per tradition:

- The raised central ***shamash*** stays lit at all times.
- On Night *N*, *N* candles are placed **right-to-left** and ignited sequentially **left-to-right** (starting from the newest leftmost candle).
- Use the on-screen night selector (`Auto`, `0`, `1`–`8`) or keys `0`–`8` to preview any night.

| Shamash Only (Always Lit) | Night 1 — Fri, Dec 4 (Far Right + Shamash) |
| :---: | :---: |
| ![Shamash Lit Only](docs/screenshots/hanukkiah-shamash.jpg) | ![Night 1 — One Candle Far Right plus Shamash](docs/screenshots/hanukkiah-night1.jpg) |

| Night 5 — Tue, Dec 8 (5 Candles Right-to-Left + Shamash) | Night 8 — Fri, Dec 11 (All 8 Candles + Shamash) |
| :---: | :---: |
| ![Night 5 — Five Candles plus Shamash](docs/screenshots/hanukkiah-night5.jpg) | ![Night 8 — Full Hanukkiah Lit](docs/screenshots/hanukkiah-night8.jpg) |

---

## Room Views & Traditional Judaica

Every prop in the room was modeled in headless Blender (`scripts/blender/`) with PBR materials and tangent-space normal maps, exported to `.glb`, paired with Cycles-baked GI/AO architectural lightmaps, and rendered live in WebGL via Three.js.

| Dreidels, Embossed Chocolate Gelt & Velvet Pouch | Sufganiyot, Carved Kiddush Cup & Braided Challah |
| :---: | :---: |
| ![Heirloom Filigree Dreidel, Playable Dreidels, and Chocolate Gelt](docs/screenshots/dreidel-gelt.jpg) | ![Sufganiyot Platter, Sterling Silver Kiddush Cup, and Challah with Embroidered Cover](docs/screenshots/feast-table.jpg) |

### Winter Night Window
![Winter Night Window with Snowfall, Crescent Moon, and Crystal Star of David](docs/screenshots/winter-window.jpg)

---

## Features

- **Carved 925 Sterling Silver Hanukkiah**: Stepped gadrooned domed pedestal on four baroque scrolled acanthus feet, repoussé floral & grapevine chasing with dark oxidized patina crevices, spiral-roped branches, double-tier filigree scrollwork, floral rosettes, scalloped bobeches, unobstructed 3D Star of David crest with sapphire cabochon, and a distinctly elevated *shamash*.
- **Photorealistic Fire & Lighting**: Custom GLSL teardrop flame shader with subtle translucent blue combustion base, incandescent core, golden-amber flickering tip, soft additive glow halos, and shadow-casting flickering dynamic point lights.
- **Interactive Controls**:
  - **Orbit & Zoom**: Smooth damped camera controls with 5 curated viewpoints (`Room`, `Hanukkiah`, `Dreidel & Gelt`, `Feast`, `Winter Night`).
  - **Interactive Dreidel**: Click the upright blue dreidel on the table (or press `Space` / **Spin Dreidel**) to spin it with wobble physics and see which Hebrew letter lands up (**נ Nun**, **ג Gimel**, **ה Hey**, or **ש Shin**).
  - **Gated Loading with Cancel / Retry**: The scene remains hidden until all 18 required `.glb` models, metadata, and lightmaps finish loading, backed by real `AbortController` cancellation and clean retry.
  - **Keyboard Shortcuts**: `0`–`8` select night, `A` returns to Auto calendar mode, `R` resets camera, `Space` spins the dreidel, `H` toggles the HUD.

## Local Development

Zero build step — static HTML/CSS/ES modules loading Three.js via CDN import map:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser. To refresh all README screenshots after visual changes:

```bash
python3 scripts/capture_screenshots.py
```
