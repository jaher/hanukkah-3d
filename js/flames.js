/**
 * Photorealistic Procedural Candle Flame System
 *
 * Renders each lit flame with:
 * 1. Sculpted 3D volumetric-style teardrop flame mesh with custom GLSL shader:
 *    - Translucent cobalt-blue combustion base hugging the wick
 *    - Incandescent white-gold hot core
 *    - Luminous amber-orange flickering teardrop outer body
 *    - Organic multi-harmonic upward turbulence & gentle room draft sway
 * 2. Soft photographic additive warm glow halo sprite around the flame
 * 3. Smooth ignition animation (0 -> 1) supporting traditional left-to-right lighting order
 */

import * as THREE from 'three';

function createFlameGeometry() {
  // Lathe teardrop with smooth organic proportions (~4.4 cm realistic candle flame)
  const points = [];
  const steps = 28;
  const height = 0.044;
  const maxR = 0.0068;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = wick base, 1 = flame tip
    const r = maxR * Math.sin(Math.pow(t, 0.54) * Math.PI) * Math.pow(1.0 - t * 0.28, 0.55);
    points.push(new THREE.Vector2(Math.max(0.0001, r), t * height));
  }

  const geo = new THREE.LatheGeometry(points, 22);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setY(i, Math.min(1.0, Math.max(0.0, pos.getY(i) / height)));
  }
  geo.computeVertexNormals();
  return geo;
}

function createHaloTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0.0, 'rgba(255, 228, 165, 0.85)');
  grad.addColorStop(0.18, 'rgba(255, 178, 72, 0.48)');
  grad.addColorStop(0.45, 'rgba(255, 118, 28, 0.16)');
  grad.addColorStop(0.76, 'rgba(220, 74, 12, 0.04)');
  grad.addColorStop(1.0, 'rgba(180, 45, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const FLAME_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  varying float vHeight;
  varying float vFresnel;

  void main() {
    vHeight = uv.y;
    vec3 p = position;

    // Gentle upward breath + organic multi-harmonic draft sway (anchored at wick y=0!)
    float t = uTime * 3.8 + uSeed * 17.3;
    float swayX = (sin(t * 1.15 + p.y * 55.0) * 0.65 + sin(t * 2.6 + uSeed) * 0.35) * 0.0026;
    float swayZ = (cos(t * 0.92 + p.y * 48.0) * 0.65 + cos(t * 2.1 - uSeed) * 0.35) * 0.0022;
    float stretch = 1.0 + 0.09 * sin(t * 2.3 + uSeed * 3.1) + 0.05 * cos(t * 5.1);

    float bend = vHeight * vHeight;
    p.x += swayX * bend;
    p.z += swayZ * bend;
    p.y *= stretch;

    // Scale cleanly by ignition intensity (0..1)
    p *= max(0.0001, uIntensity);

    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
    vec3 viewDir = normalize(-mvPos.xyz);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vFresnel = abs(dot(viewDir, viewNormal));

    gl_Position = projectionMatrix * mvPos;
  }
`;

const FLAME_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  varying float vHeight;
  varying float vFresnel;

  void main() {
    if (uIntensity < 0.01) discard;

    float t = uTime * 5.0 + uSeed * 11.7;
    float shimmer = 0.94 + 0.06 * sin(t * 1.9 + vHeight * 8.0);

    // Physically authentic photographic candle flame color gradient:
    // 0.00..0.15: delicate translucent blue combustion base hugging the wick
    // 0.14..0.46: incandescent cream-gold heart
    // 0.42..0.82: rich warm golden-amber flame body
    // 0.78..1.00: deep glowing tangerine-orange tip
    vec3 colBlue   = vec3(0.22, 0.46, 0.92);
    vec3 colCore   = vec3(1.00, 0.94, 0.70);
    vec3 colGold   = vec3(1.00, 0.62, 0.12);
    vec3 colOrange = vec3(0.92, 0.24, 0.02);

    vec3 color = mix(colBlue, colCore, smoothstep(0.05, 0.18, vHeight));
    color = mix(color, colGold, smoothstep(0.30, 0.68, vHeight));
    color = mix(color, colOrange, smoothstep(0.70, 0.96, vHeight));

    // Hot white-gold center core facing the camera (without blowing out the amber rim!)
    float coreBoost = pow(clamp(vFresnel, 0.0, 1.0), 2.1) * smoothstep(0.16, 0.34, vHeight) * (1.0 - smoothstep(0.56, 0.84, vHeight));
    color = mix(color, vec3(1.0, 0.98, 0.86), coreBoost * 0.85);

    // Subtle rim warming for photographic edge depth
    float rim = 1.0 - clamp(vFresnel, 0.0, 1.0);
    color = mix(color, colOrange, rim * 0.42 * smoothstep(0.22, 0.50, vHeight));

    // Soft feathered edges + smooth tip fade
    float edgeFade = smoothstep(0.04, 0.42, vFresnel);
    float baseFade = smoothstep(0.0, 0.07, vHeight);
    float tipFade  = 1.0 - smoothstep(0.86, 1.0, vHeight);
    float alpha = clamp(edgeFade * baseFade * tipFade * 0.98 * uIntensity, 0.0, 1.0);

    gl_FragColor = vec4(color * 1.48 * shimmer, alpha);
  }
`;

export class CandleFlameRig {
  constructor() {
    this.flameGeo = createFlameGeometry();
    this.haloTex = createHaloTexture();
    this.flames = [];
  }

  /**
   * Create a complete animated flame + additive warm halo at localPos inside parentGroup.
   */
  createFlame(parentGroup, localPos, { scale = 1.0, seed = Math.random() * 100, isShamash = false } = {}) {
    const group = new THREE.Group();
    group.position.copy(localPos);
    group.position.y -= 0.0028 * scale;
    parentGroup.add(group);

    const mat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERTEX_SHADER,
      fragmentShader: FLAME_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uIntensity: { value: isShamash ? 1.0 : 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(this.flameGeo, mat);
    mesh.scale.setScalar(scale);
    mesh.renderOrder = 11;
    group.add(mesh);

    // Soft photographic warm amber halo glow sprite (tight so individual flames stay distinct!)
    const haloMat = new THREE.SpriteMaterial({
      map: this.haloTex,
      color: isShamash ? new THREE.Color(0xffb85c) : new THREE.Color(0xffa43c),
      transparent: true,
      opacity: isShamash ? 0.36 : 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(0, 0.020 * scale, 0);
    const haloBaseSize = (isShamash ? 0.115 : 0.095) * scale;
    halo.scale.set(haloBaseSize, haloBaseSize * 1.15, 1);
    halo.renderOrder = 9;
    group.add(halo);

    const entry = {
      group,
      mesh,
      mat,
      halo,
      haloMat,
      haloBaseSize,
      seed,
      scale,
      isShamash,
      targetLit: isShamash ? 1.0 : 0.0,
      currentLit: isShamash ? 1.0 : 0.0,
      igniteDelay: 0.0,
      flareTimer: 0.0,
    };
    this.flames.push(entry);
    return entry;
  }

  /** Trigger a tactile lively flicker gust & warm flame flare on a specific flame (or all lit flames). */
  flareFlame(entry = null) {
    const list = entry ? [entry] : this.flames;
    for (const f of list) {
      if (f.currentLit > 0.05) {
        f.flareTimer = 1.15;
      }
    }
  }

  /** Increase warm halo glow slightly when room electric lights are off so flames feel luminous in darkness. */
  setDarkRoomBoost(amount) {
    this.darkRoomBoost = Math.max(0, Math.min(1, amount));
  }

  /**
   * Update all flames smoothly every frame, returning aggregate flicker energy (0..1+) for lights.
   */
  update(elapsed, dt) {
    let totalLitEnergy = 0;
    let shamashFlicker = 1.0;
    const darkBoost = this.darkRoomBoost || 0.0;

    for (const f of this.flames) {
      if (f.igniteDelay > 0) {
        f.igniteDelay = Math.max(0, f.igniteDelay - dt);
      } else {
        const speed = f.targetLit > f.currentLit ? 4.8 : 7.5;
        f.currentLit += (f.targetLit - f.currentLit) * Math.min(1.0, dt * speed);
        if (Math.abs(f.targetLit - f.currentLit) < 0.002) {
          f.currentLit = f.targetLit;
        }
      }

      if (f.flareTimer > 0) {
        f.flareTimer = Math.max(0, f.flareTimer - dt);
      }
      const flareBoost = f.flareTimer > 0 ? Math.sin((f.flareTimer / 1.15) * Math.PI) : 0.0;
      const lit = f.currentLit;
      const flicker =
        1.0 +
        0.055 * Math.sin(elapsed * 7.3 + f.seed * 5.1) +
        0.035 * Math.sin(elapsed * 13.7 + f.seed * 9.3) +
        0.025 * Math.cos(elapsed * 21.1 - f.seed) +
        0.38 * flareBoost * (0.7 + 0.3 * Math.sin(elapsed * 28.0 + f.seed));

      f.mat.uniforms.uTime.value = elapsed + flareBoost * 0.45;
      f.mat.uniforms.uIntensity.value = lit * (1.0 + 0.32 * flareBoost);
      f.mesh.visible = lit > 0.01;

      f.halo.visible = lit > 0.01;
      const haloOp = (f.isShamash ? 0.38 : 0.31) * lit * flicker * (1.0 + 0.45 * flareBoost) * (1.0 + 0.55 * darkBoost);
      f.haloMat.opacity = Math.min(0.92, haloOp);
      const hs = f.haloBaseSize * (0.94 + 0.08 * flicker + 0.25 * flareBoost) * (0.55 + 0.45 * lit) * (1.0 + 0.38 * darkBoost);
      f.halo.scale.set(hs, hs * 1.12, 1);

      if (f.isShamash) {
        shamashFlicker = flicker;
      } else {
        totalLitEnergy += lit * flicker;
      }
    }

    return { shamashFlicker, totalLitEnergy };
  }
}
