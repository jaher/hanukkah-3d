# Hanukkah 3D

A photorealistic, interactive Three.js Hanukkah room featuring an ornate sterling silver nine-branched hanukkiah (menorah), traditional Judaica modeled in Blender, animated candlelight, winter snowfall outside the window, and automatic night-by-night lighting for Hanukkah 2026 (December 4–12).

## Highlights

- **Ornate Sterling Silver Hanukkiah**: Modeled in headless Blender with stepped domed pedestal, filigree scrollwork, eight symmetrical equal-height branches with scalloped bobeches, and a distinctly raised central *shamash*.
- **Automatic Hanukkah 2026 Calendar**: Computes the active night from the live date (Night 1 on the evening of Friday, Dec 4, 2026 through Night 8 on Friday, Dec 11, ending at nightfall Saturday, Dec 12). The *shamash* remains lit at all times; candles are placed right-to-left and lit sequentially left-to-right per tradition. Includes an interactive night preview selector.
- **Traditional Judaica**: Large heirloom filigree dreidel on a stand, interactive playable dreidels with Hebrew letters (נ ג ה ש), embossed gold & silver chocolate gelt, powdered-sugar sufganiyot with ruby jam on a porcelain platter, sterling silver kiddush cup with kosher wine, braided challah beneath an embroidered challah cover, and Star of David decor.
- **Photorealistic Live Rendering**: Physically-based PBR materials, Cycles-baked GI/AO lightmaps, animated volumetric-style shader flames with warm flickering dynamic lighting, soft shadows, winter snowfall outside the window, and gated asset loading with Cancel/Retry controls.

## Local Development

No build step is required. Serve the static files locally:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
