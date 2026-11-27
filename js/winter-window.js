/**
 * Photorealistic Winter Night Window Exterior
 *
 * Combines:
 * 1. High-resolution photographic winter night neighborhood panorama seen outside the window
 *    (snow-blanketed residential street, real houses with warm glowing windows, amber streetlamps,
 *    snow-laden evergreens, natural starry winter night sky & cold atmospheric depth)
 * 2. Subtle frosted condensation rim around the window glass corners/muntins
 * 3. Organic wind-drifted snow mound resting along the exterior wooden window sill
 * 4. Two-depth live 3D falling snow particle system (foreground soft bokeh flakes + distant fine snow)
 */

import * as THREE from 'three';

function createSnowflakeTexture(softness = 0.45) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(248, 251, 255, 0.94)');
  g.addColorStop(softness, 'rgba(220, 234, 252, 0.56)');
  g.addColorStop(0.82, 'rgba(192, 214, 244, 0.14)');
  g.addColorStop(1.0, 'rgba(180, 206, 240, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWindowFrostTexture() {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Delicate cold frost/condensation clinging only to outer window corners & lower sill edge
  // (keeps center panes crystal-clear for an unobstructed photographic view!)
  const drawFrostCorner = (cx, cy, r) => {
    const g = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
    g.addColorStop(0.0, 'rgba(218, 234, 255, 0.34)');
    g.addColorStop(0.45, 'rgba(198, 220, 248, 0.14)');
    g.addColorStop(1.0, 'rgba(180, 206, 240, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  drawFrostCorner(0, 0, 175);
  drawFrostCorner(w, 0, 175);
  drawFrostCorner(0, h, 210);
  drawFrostCorner(w, h, 210);

  // Subtle icy condensation band right along the bottom edge near the exterior snow drift
  const botGrad = ctx.createLinearGradient(0, h, 0, h - 76);
  botGrad.addColorStop(0.0, 'rgba(226, 238, 255, 0.28)');
  botGrad.addColorStop(0.5, 'rgba(210, 228, 250, 0.09)');
  botGrad.addColorStop(1.0, 'rgba(200, 220, 245, 0.0)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, h - 76, w, 76);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSnowLayer({ count, xMin, xMax, yMin, yMax, zMin, zMax, size, speedMin, speedMax, opacity, color, softness }) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const drifts = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = xMin + Math.random() * (xMax - xMin);
    positions[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
    positions[i * 3 + 2] = zMin + Math.random() * (zMax - zMin);
    speeds[i] = speedMin + Math.random() * (speedMax - speedMin);
    phases[i] = Math.random() * Math.PI * 2;
    drifts[i] = 0.03 + Math.random() * 0.055;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: createSnowflakeTexture(softness),
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color,
  });

  const points = new THREE.Points(geo, mat);
  return {
    points,
    update(elapsed, dt) {
      const attr = geo.attributes.position;
      const arr = attr.array;
      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        arr[ix + 1] -= speeds[i] * dt;
        arr[ix + 0] += (Math.sin(elapsed * 0.72 + phases[i]) * drifts[i] + 0.018) * dt;
        if (arr[ix + 1] < yMin) {
          arr[ix + 1] = yMax;
          arr[ix + 0] = xMin + Math.random() * (xMax - xMin);
        }
        if (arr[ix + 0] > xMax) arr[ix + 0] = xMin;
        if (arr[ix + 0] < xMin) arr[ix + 0] = xMax;
      }
      attr.needsUpdate = true;
    },
  };
}

export function createWinterNightExterior(scene, backdropTexture) {
  const group = new THREE.Group();
  group.name = 'WinterNightExterior';

  // Ensure crisp anisotropic filtering on the photographic winter night panorama
  backdropTexture.anisotropy = 8;

  // 1. Gently curved photorealistic Jerusalem Old City winter night panorama outside the window
  // Sized & positioned so the golden limestone rooftops, Hurva dome, Western Wall (Kotel),
  // gleaming Dome of the Rock, and starry winter night sky frame cleanly inside the window panes!
  const backdropGeo = new THREE.PlaneGeometry(5.6, 3.22, 24, 2);
  const pos = backdropGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, (x * x) * 0.06);
  }
  backdropGeo.computeVertexNormals();

  const backdropMat = new THREE.MeshBasicMaterial({
    map: backdropTexture,
    color: new THREE.Color(0xd2dbf0), // rich authentic night dynamic range under ACES tone mapping
    toneMapped: true,
  });
  const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
  // Framed so the starry night sky fills seamlessly past the top window jamb while the gleaming golden Dome of the Rock,
  // floodlit Western Wall (Kotel), and snow-dusted Jerusalem stone rooftops sit cleanly unobstructed below the muntin!
  backdrop.position.set(-0.08, 1.60, -4.55);
  group.add(backdrop);

  // 2. Delicate cold frost/condensation layer inside outer window glass corners (Z = -2.33)
  const frostGeo = new THREE.PlaneGeometry(1.88, 1.56);
  const frostMat = new THREE.MeshBasicMaterial({
    map: createWindowFrostTexture(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const frostPane = new THREE.Mesh(frostGeo, frostMat);
  frostPane.position.set(0, 1.65, -2.33);
  group.add(frostPane);

  // 3. Natural organic wind-drifted snow bank accumulated on the exterior window sill (Z = -2.41)
  const snowSillGeo = new THREE.BoxGeometry(1.94, 0.048, 0.16, 24, 3, 6);
  const sp = snowSillGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    if (sp.getY(i) > 0) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      // Higher soft drift toward left/right jamb corners, wind-sculpted ripples across center
      const cornerDrift = 0.018 * Math.pow(Math.abs(x) / 0.97, 2.2);
      const ripple = 0.009 * Math.sin(x * 4.8 + 0.5) + 0.006 * Math.cos(x * 10.4) + 0.005 * Math.sin(z * 18.0);
      sp.setY(i, sp.getY(i) + cornerDrift + ripple);
    }
  }
  snowSillGeo.computeVertexNormals();
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xd8e4f6,
    roughness: 0.78,
    metalness: 0.02,
    emissive: 0x182644,
    emissiveIntensity: 0.42,
  });
  const snowSill = new THREE.Mesh(snowSillGeo, snowMat);
  snowSill.position.set(0, 0.878, -2.41);
  group.add(snowSill);

  // 4. Two-depth live 3D falling snow outside the window for genuine photographic parallax
  const nearSnow = createSnowLayer({
    count: 180,
    xMin: -1.45,
    xMax: 1.45,
    yMin: 0.72,
    yMax: 2.75,
    zMin: -3.25,
    zMax: -2.52,
    size: 0.042,
    speedMin: 0.18,
    speedMax: 0.29,
    opacity: 0.62,
    color: 0xe6efff,
    softness: 0.35,
  });
  const farSnow = createSnowLayer({
    count: 340,
    xMin: -2.15,
    xMax: 2.15,
    yMin: 0.65,
    yMax: 2.95,
    zMin: -4.45,
    zMax: -3.25,
    size: 0.022,
    speedMin: 0.11,
    speedMax: 0.19,
    opacity: 0.72,
    color: 0xcce0ff,
    softness: 0.50,
  });

  group.add(nearSnow.points);
  group.add(farSnow.points);
  scene.add(group);

  return {
    group,
    update(elapsed, dt) {
      nearSnow.update(elapsed, dt);
      farSnow.update(elapsed, dt);
    },
  };
}
