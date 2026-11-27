# Hanukkah 3D — Festival of Lights

### **[Launch the Live 3D Hanukkah Room → https://jaher.github.io/hanukkah-3d/](https://jaher.github.io/hanukkah-3d/)**

A photorealistic, interactive **Three.js** Hanukkah room featuring a deeply carved 925 sterling silver nine-branched *hanukkiah* (menorah), traditional Judaica modeled in headless Blender, live animated candlelight, a photorealistic winter night view of Jerusalem's Old City through the window, traditional Hanukkah music, and automatic night-by-night lighting for **Hanukkah 2026 (December 4–12)**.

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

### Jerusalem Old City Winter Night Window
![Photorealistic Jerusalem Old City Winter Night Skyline — Golden Limestone Rooftops, Western Wall, and Dome of the Rock through the Window](docs/screenshots/winter-window.jpg)

---

## Features

- **Carved 925 Sterling Silver Hanukkiah**: Stepped gadrooned domed pedestal on four baroque scrolled acanthus feet, repoussé floral & grapevine chasing with dark oxidized patina crevices, spiral-roped branches, double-tier filigree scrollwork, floral rosettes, scalloped bobeches, unobstructed 3D Star of David crest with sapphire cabochon, and a distinctly elevated *shamash*.
- **Photorealistic Fire & Lighting**: Custom GLSL teardrop flame shader with subtle translucent blue combustion base, incandescent core, golden-amber flickering tip, soft additive glow halos, and shadow-casting flickering dynamic point lights.
- **Interactive Controls**:
  - **Orbit & Zoom**: Smooth damped camera controls with 5 curated viewpoints (`Room`, `Hanukkiah`, `Dreidel & Gelt`, `Feast`, `Jerusalem`).
  - **Every Object in the Room Is Interactive** (with synthesized Web Audio foley):
    - **Dreidels**: Six blue and carved wooden dreidels rest naturally tilted on their sides across the table; click or tap any one directly (or press `Space`) to spin them independently—multiple dreidels can spin simultaneously until each completes its wobble and topples back tilted with its winning letter (**נ ג ה ש**) facing up. Click the large silver heirloom dreidel to spin it 360° on its pedestal with a chime.
    - **Sufganiyot**: Click any jelly doughnut to take progressive bites exposing fluffy brioche crumb and a single live oozing strand of ruby strawberry jelly flowing down onto the platter (click the empty platter after finishing all five to serve a fresh batch).
    - **Chocolate Gelt & Pouch**: Click any of the 22 individual gold & silver coins to flip and spin it with 3D rigid-body table, stack, and prop collisions plus metallic **coin clink** audio; click the velvet pouch for a coin-bag jingle that pops nearby coins.
    - **Kiddush Cup & Wine**: Click the sterling silver Kiddush cup to raise a celebratory **"L'Chaim!"** toast with a real male Hebrew voice recording and clinking cups while sipping the transmissive red wine down level by level until empty (click again to refill).
    - **Challah & Cover**: Powered live in Three.js by a JavaScript port of [`jaher/physics-engine`](https://github.com/jaher/physics-engine)'s `phys::Cloth` Verlet + iterative constraint solver—draping organically over the braided challah, flattening cleanly onto the table, and physically peeling back / re-draping when clicked.
    - **Hanukkiah, Candles, Votives & Matchbox**: Click any lit candle or cobalt votive for a dancing flame flicker flare; click the silver hanukkiah body to advance and light the next night; click the candle box & matches for a match-strike flare across all candles.
    - **Rebbe Portrait, Stars, Window, Sconces & Curtains**: Click the framed Lubavitcher Rebbe portrait to read Hanukkah teachings, the Star of David wall medallion or crystal window ornament for chimes & sparkle, the Jerusalem window for a swirling winter snow gust, the wall sconces/lamp to toggle warm candlelight dimmer mood, or the velvet drapes for a soft breeze ripple.
  - **Subtle Traditional Hanukkah Music**: Built-in polyphonic Web Audio synthesizer playing public-domain arrangements of *Ma'oz Tzur*, *The Dreidel Song*, and *Hanukkah, Oh Hanukkah* with warm room reverb at a subtle background volume—starts automatically on your first click/tap anywhere on the page, with a clear **♪ Music: On / Off** control (`M` key) and next-track switcher (`⏭`).
  - **Gated Loading with Cancel / Retry**: The scene remains hidden until all 18 required `.glb` models, metadata, and lightmaps finish loading, backed by real `AbortController` cancellation and clean retry.
  - **Keyboard Shortcuts**: `0`–`8` select night, `A` returns to Auto calendar mode, `R` resets camera, `Space` spins a dreidel, `M` toggles music, `H` toggles the HUD.

## Local Development

Zero build step — static HTML/CSS/ES modules loading Three.js via CDN import map:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser. To refresh all README screenshots after visual changes:

```bash
python3 scripts/capture_screenshots.py
```
