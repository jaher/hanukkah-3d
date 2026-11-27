/**
 * Winter Night Window Exterior — Starry indigo sky, crescent moon, snowy evergreens,
 * distant cozy village lights, and gentle live 3D falling snow outside the window glass.
 */

import * as THREE from 'three';

function createSnowflakeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(242, 248, 255, 0.96)');
  g.addColorStop(0.42, 'rgba(214, 232, 255, 0.65)');
  g.addColorStop(1.0, 'rgba(180, 210, 255, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWinterNightExterior(scene, backdropTexture) {
  const group = new THREE.Group();
  group.name = 'WinterNightExterior';

  // 1. Curved winter night sky & distant snowy town backdrop placed outside window (Z = -4.2)
  const backdropGeo = new THREE.PlaneGeometry(5.6, 3.6, 16, 1);
  // Subtle concave wrap so viewing from left or right angles never clips backdrop edge!
  const pos = backdropGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, (x * x) * 0.085);
  }
  backdropGeo.computeVertexNormals();

  const backdropMat = new THREE.MeshBasicMaterial({
    map: backdropTexture,
    toneMapped: true,
  });
  const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
  backdrop.position.set(0, 1.78, -4.35);
  group.add(backdrop);

  // 2. Snowy exterior window ledge drift resting outside the window pane (Z = -2.36)
  const snowSillGeo = new THREE.BoxGeometry(1.94, 0.042, 0.14, 16, 2, 4);
  const sp = snowSillGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    if (sp.getY(i) > 0) {
      const x = sp.getX(i);
      sp.setY(i, sp.getY(i) + 0.012 * Math.sin(x * 4.5) + 0.008 * Math.cos(x * 9.2));
    }
  }
  snowSillGeo.computeVertexNormals();
  const snowMat = new THREE.MeshStandardMaterial({
    color: 0xd8e6fa,
    roughness: 0.72,
    metalness: 0.04,
    emissive: 0x162442,
    emissiveIntensity: 0.45,
  });
  const snowSill = new THREE.Mesh(snowSillGeo, snowMat);
  snowSill.position.set(0, 0.875, -2.39);
  group.add(snowSill);

  // 3. Live 3D Falling Snow Particles strictly outside the window (Z in [-4.0, -2.55])
  const count = 520;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);

  const xMin = -1.75;
  const xMax = 1.75;
  const yMin = 0.65;
  const yMax = 2.85;
  const zMin = -4.05;
  const zMax = -2.55;

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = xMin + Math.random() * (xMax - xMin);
    positions[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
    positions[i * 3 + 2] = zMin + Math.random() * (zMax - zMin);
    speeds[i] = 0.16 + Math.random() * 0.24;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const snowPointsMat = new THREE.PointsMaterial({
    map: createSnowflakeTexture(),
    size: 0.036,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xdceaff,
  });

  const snowPoints = new THREE.Points(snowGeo, snowPointsMat);
  group.add(snowPoints);

  scene.add(group);

  return {
    group,
    update(elapsed, dt) {
      const attr = snowGeo.attributes.position;
      const arr = attr.array;
      for (let i = 0; i < count; i++) {
        const ix = i * 3;
        arr[ix + 1] -= speeds[i] * dt;
        arr[ix + 0] += (Math.sin(elapsed * 0.85 + phases[i]) * 0.075 + 0.025) * dt;
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
