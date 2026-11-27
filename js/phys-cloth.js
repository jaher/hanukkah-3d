/**
 * Position-Based Cloth Solver — faithful JavaScript port of `phys::Cloth`
 * from https://github.com/jaher/physics-engine (include/phys/cloth.h & demos/cloth3d.cpp).
 *
 * Uses Verlet integration + iterative structural, shear, and bend distance constraints,
 * sphere/oval-board/ground collision resolution, tangential contact friction, wind bias,
 * and per-vertex smooth normal recomputation.
 */

import * as THREE from 'three';

export class PhysCloth {
  /**
   * Build a W x H cloth particle grid in the plane spanned by (right, down) from `origin`.
   * Matches `phys::Cloth(W, H, spacing, origin, right, down)` in include/phys/cloth.h.
   */
  constructor(W, H, spacingX, spacingY, origin, right = new THREE.Vector3(1, 0, 0), down = new THREE.Vector3(0, 0, 1)) {
    this.W = W;
    this.H = H;
    const N = W * H;

    this.pos = new Float32Array(N * 3);
    this.prev = new Float32Array(N * 3);
    this.normal = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);

    this.gravity = { x: 0, y: -9.81, z: 0 };
    this.damping = 0.99;        // matches demos/cloth3d.cpp (0.99)
    this.iterations = 28;       // matches demos/cloth3d.cpp (28)
    this.groundY = 0.0;
    this.collisionMargin = 0.0022;
    this.friction = 0.45;       // matches include/phys/cloth.h (0.45)
    this.groundFriction = 0.16; // allows outer skirt to glide outward & flatten dead-flat on table

    /** @type {Array<{cx:number, cy:number, cz:number, r:number}>} */
    this.spheres = [];
    /** Optional oval table board collider { rx, rz, topY } */
    this.ovalBoard = null;

    // Initialize particle positions
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i3 = (y * W + x) * 3;
        const px = origin.x + right.x * (spacingX * x) + down.x * (spacingY * y);
        const py = origin.y + right.y * (spacingX * x) + down.y * (spacingY * y);
        const pz = origin.z + right.z * (spacingX * x) + down.z * (spacingY * y);
        this.pos[i3] = this.prev[i3] = px;
        this.pos[i3 + 1] = this.prev[i3 + 1] = py;
        this.pos[i3 + 2] = this.prev[i3 + 2] = pz;
      }
    }

    // Build structural, shear, and bend distance constraints (exact match to include/phys/cloth.h!)
    const cA = [];
    const cB = [];
    const cRest = [];
    const add = (a, b) => {
      const a3 = a * 3;
      const b3 = b * 3;
      const dx = this.pos[a3] - this.pos[b3];
      const dy = this.pos[a3 + 1] - this.pos[b3 + 1];
      const dz = this.pos[a3 + 2] - this.pos[b3 + 2];
      cA.push(a);
      cB.push(b);
      cRest.push(Math.hypot(dx, dy, dz));
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cur = y * W + x;
        if (x + 1 < W) add(cur, cur + 1);                       // structural X
        if (y + 1 < H) add(cur, cur + W);                       // structural Y
        if (x + 1 < W && y + 1 < H) {
          add(cur, cur + W + 1);                                // shear diag 1
          add(cur + 1, cur + W);                                // shear diag 2
        }
        if (x + 2 < W) add(cur, cur + 2);                       // bend X
        if (y + 2 < H) add(cur, cur + 2 * W);                   // bend Y
      }
    }
    this.cCount = cA.length;
    this.cA = new Int32Array(cA);
    this.cB = new Int32Array(cB);
    this.cRest = new Float32Array(cRest);

    // Triangle index buffer (exact winding match to include/phys/cloth.h!)
    const tris = new Uint32Array((W - 1) * (H - 1) * 6);
    let ptr = 0;
    for (let y = 0; y + 1 < H; y++) {
      for (let x = 0; x + 1 < W; x++) {
        const a = y * W + x;
        const b = a + 1;
        const c = a + W;
        const d = c + 1;
        tris[ptr++] = a;
        tris[ptr++] = c;
        tris[ptr++] = b;
        tris[ptr++] = b;
        tris[ptr++] = c;
        tris[ptr++] = d;
      }
    }
    this.tris = tris;

    this.computeNormals();
  }

  idx(x, y) {
    return y * this.W + x;
  }

  pin(x, y) {
    this.pinned[this.idx(x, y)] = 1;
  }

  unpin(x, y) {
    this.pinned[this.idx(x, y)] = 0;
  }

  unpinAll() {
    this.pinned.fill(0);
  }

  setPin(x, y, px, py, pz) {
    const i = this.idx(x, y);
    const i3 = i * 3;
    this.pos[i3] = this.prev[i3] = px;
    this.pos[i3 + 1] = this.prev[i3 + 1] = py;
    this.pos[i3 + 2] = this.prev[i3 + 2] = pz;
    this.pinned[i] = 1;
  }

  /**
   * Single Verlet + iterative constraint + contact friction step.
   * Mirrors `phys::Cloth::step(dt, wind)` in include/phys/cloth.h.
   */
  step(dt, windX = 0, windY = 0, windZ = 0) {
    const N = this.W * this.H;
    const pos = this.pos;
    const prev = this.prev;
    const normal = this.normal;
    const pinned = this.pinned;
    const damp = this.damping;
    const dt2 = dt * dt;
    const gx = this.gravity.x;
    const gy = this.gravity.y;
    const gz = this.gravity.z;

    const wMag = Math.hypot(windX, windY, windZ);
    const hasWind = wMag > 1e-8;
    const wux = hasWind ? windX / wMag : 0;
    const wuy = hasWind ? windY / wMag : 0;
    const wuz = hasWind ? windZ / wMag : 0;

    // 1. Verlet integration with normal-biased wind
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      if (pinned[i]) {
        prev[i3] = pos[i3];
        prev[i3 + 1] = pos[i3 + 1];
        prev[i3 + 2] = pos[i3 + 2];
        continue;
      }
      let ax = gx;
      let ay = gy;
      let az = gz;
      if (hasWind) {
        const face = Math.abs(normal[i3] * wux + normal[i3 + 1] * wuy + normal[i3 + 2] * wuz);
        const bias = 0.4 + 0.6 * face;
        ax += windX * bias;
        ay += windY * bias;
        az += windZ * bias;
      }
      const tx = pos[i3];
      const ty = pos[i3 + 1];
      const tz = pos[i3 + 2];
      pos[i3] = tx + (tx - prev[i3]) * damp + ax * dt2;
      pos[i3 + 1] = ty + (ty - prev[i3 + 1]) * damp + ay * dt2;
      pos[i3 + 2] = tz + (tz - prev[i3 + 2]) * damp + az * dt2;
      prev[i3] = tx;
      prev[i3 + 1] = ty;
      prev[i3 + 2] = tz;
    }

    // 2. Iterative distance constraint relaxation + collision projection
    const cCount = this.cCount;
    const cA = this.cA;
    const cB = this.cB;
    const cRest = this.cRest;

    for (let it = 0; it < this.iterations; it++) {
      for (let k = 0; k < cCount; k++) {
        const a = cA[k];
        const b = cB[k];
        const pa = pinned[a];
        const pb = pinned[b];
        if (pa && pb) continue;

        const a3 = a * 3;
        const b3 = b * 3;
        const dx = pos[b3] - pos[a3];
        const dy = pos[b3 + 1] - pos[a3 + 1];
        const dz = pos[b3 + 2] - pos[a3 + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-9) continue;

        const diff = (len - cRest[k]) / len;
        if (!pa && !pb) {
          const half = diff * 0.5;
          const cx = dx * half;
          const cy = dy * half;
          const cz = dz * half;
          pos[a3] += cx;
          pos[a3 + 1] += cy;
          pos[a3 + 2] += cz;
          pos[b3] -= cx;
          pos[b3 + 1] -= cy;
          pos[b3 + 2] -= cz;
        } else if (pa) {
          pos[b3] -= dx * diff;
          pos[b3 + 1] -= dy * diff;
          pos[b3 + 2] -= dz * diff;
        } else {
          pos[a3] += dx * diff;
          pos[a3 + 1] += dy * diff;
          pos[a3 + 2] += dz * diff;
        }
      }
      this.collide();
    }

    // 3. Tangential contact friction & smooth vertex normals
    this.applyContactFriction();
    this.computeNormals();
  }

  /**
   * Project colliding particles outside all obstacle spheres, the oval walnut board, and the flat table plane.
   * Mirrors `phys::Cloth::collide()` in include/phys/cloth.h.
   */
  collide() {
    const N = this.W * this.H;
    const pos = this.pos;
    const pinned = this.pinned;
    const spheres = this.spheres;
    const nSph = spheres.length;
    const margin = this.collisionMargin;
    const minGroundY = this.groundY + margin;
    const board = this.ovalBoard;

    for (let i = 0; i < N; i++) {
      if (pinned[i]) continue;
      const i3 = i * 3;
      let px = pos[i3];
      let py = pos[i3 + 1];
      let pz = pos[i3 + 2];

      // 1. Bread sphere chain collisions (exact `phys::Cloth::spheres` logic!)
      for (let s = 0; s < nSph; s++) {
        const sp = spheres[s];
        const dx = px - sp.cx;
        const dy = py - sp.cy;
        const dz = pz - sp.cz;
        const r = sp.r + margin;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && d2 > 1e-12) {
          const invLen = r / Math.sqrt(d2);
          px = sp.cx + dx * invLen;
          py = sp.cy + dy * invLen;
          pz = sp.cz + dz * invLen;
        }
      }

      // 2. Oval carved walnut challah board collision (smooth top & beveled rim)
      if (board) {
        const ex = px / (board.rx + margin);
        const ez = pz / (board.rz + margin);
        const ell = ex * ex + ez * ez;
        const topLimit = board.topY + margin;
        if (ell < 1.0 && py < topLimit) {
          // If close to the outer beveled rim, push gently outward; otherwise rest on top of the board
          const radialGap = (1.0 - Math.sqrt(ell)) * Math.min(board.rx, board.rz);
          const vertGap = topLimit - py;
          if (vertGap <= radialGap * 1.4) {
            py = topLimit;
          } else if (ell > 1e-8) {
            const scale = 1.0 / Math.sqrt(ell);
            px *= scale;
            pz *= scale;
          }
        }
      }

      // 3. Flat table / runner ground plane collision (flattens outer cloth cleanly onto table!)
      if (py < minGroundY) {
        py = minGroundY;
      }

      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }
  }

  /**
   * Damp tangential velocity where the cloth touches an obstacle or table.
   * Mirrors `phys::Cloth::applyContactFriction()` in include/phys/cloth.h.
   */
  applyContactFriction() {
    const N = this.W * this.H;
    const pos = this.pos;
    const prev = this.prev;
    const pinned = this.pinned;
    const spheres = this.spheres;
    const nSph = spheres.length;
    const margin2 = this.collisionMargin * 2.0;
    const groundThresh = this.groundY + margin2;
    const board = this.ovalBoard;

    for (let i = 0; i < N; i++) {
      if (pinned[i]) continue;
      const i3 = i * 3;
      const px = pos[i3];
      const py = pos[i3 + 1];
      const pz = pos[i3 + 2];

      let nx = 0;
      let ny = 0;
      let nz = 0;
      let contact = false;
      let fric = this.friction;

      for (let s = 0; s < nSph; s++) {
        const sp = spheres[s];
        const dx = px - sp.cx;
        const dy = py - sp.cy;
        const dz = pz - sp.cz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < sp.r + margin2 && len > 1e-9) {
          const inv = 1.0 / len;
          nx = dx * inv;
          ny = dy * inv;
          nz = dz * inv;
          contact = true;
          fric = this.friction;
        }
      }

      if (!contact && board && py < board.topY + margin2) {
        const ex = px / (board.rx + margin2);
        const ez = pz / (board.rz + margin2);
        if (ex * ex + ez * ez < 1.0) {
          nx = 0;
          ny = 1;
          nz = 0;
          contact = true;
          fric = this.friction * 0.5;
        }
      }

      if (py < groundThresh) {
        nx = 0;
        ny = 1;
        nz = 0;
        contact = true;
        fric = this.groundFriction;
      }

      if (!contact) continue;

      const vx = px - prev[i3];
      const vy = py - prev[i3 + 1];
      const vz = pz - prev[i3 + 2];
      const vDotN = vx * nx + vy * ny + vz * nz;
      const vnx = nx * vDotN;
      const vny = ny * vDotN;
      const vnz = nz * vDotN;
      const vtx = vx - vnx;
      const vty = vy - vny;
      const vtz = vz - vnz;
      const keep = 1.0 - fric;
      prev[i3] = px - (vnx + vtx * keep);
      prev[i3 + 1] = py - (vny + vty * keep);
      prev[i3 + 2] = pz - (vnz + vtz * keep);
    }
  }

  /** Recompute area-weighted per-vertex smooth normals. Mirrors `phys::Cloth::computeNormals()`. */
  computeNormals() {
    const pos = this.pos;
    const normal = this.normal;
    const tris = this.tris;
    normal.fill(0);

    for (let t = 0; t < tris.length; t += 3) {
      const a3 = tris[t] * 3;
      const b3 = tris[t + 1] * 3;
      const c3 = tris[t + 2] * 3;

      const abx = pos[b3] - pos[a3];
      const aby = pos[b3 + 1] - pos[a3 + 1];
      const abz = pos[b3 + 2] - pos[a3 + 2];
      const acx = pos[c3] - pos[a3];
      const acy = pos[c3 + 1] - pos[a3 + 1];
      const acz = pos[c3 + 2] - pos[a3 + 2];

      // Cross product (b - a) x (c - a)
      const fnx = aby * acz - abz * acy;
      const fny = abz * acx - abx * acz;
      const fnz = abx * acy - aby * acx;

      normal[a3] += fnx;
      normal[a3 + 1] += fny;
      normal[a3 + 2] += fnz;
      normal[b3] += fnx;
      normal[b3 + 1] += fny;
      normal[b3 + 2] += fnz;
      normal[c3] += fnx;
      normal[c3 + 1] += fny;
      normal[c3 + 2] += fnz;
    }

    const N = this.W * this.H;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const nx = normal[i3];
      const ny = normal[i3 + 1];
      const nz = normal[i3 + 2];
      const sq = nx * nx + ny * ny + nz * nz;
      if (sq > 1e-12) {
        const inv = 1.0 / Math.sqrt(sq);
        normal[i3] = nx * inv;
        normal[i3 + 1] = ny * inv;
        normal[i3 + 2] = nz * inv;
      } else {
        normal[i3] = 0;
        normal[i3 + 1] = 1;
        normal[i3 + 2] = 0;
      }
    }
  }
}

/**
 * Interactive Three.js Challah Cover driven live by `PhysCloth` (jaher/physics-engine).
 * Pre-settles into a natural flat-resting drape over the braided challah on startup,
 * and physically peels back / re-drapes in real time when clicked!
 */
export class ChallahClothCover {
  constructor(challahRoot, material) {
    const W = 44;
    const H = 36;
    const width = 0.45;   // 45 cm embroidered linen cover over 24 cm braided loaf
    const depth = 0.36;   // 36 cm depth so front/back margins & all 4 corners lie completely flat on table!
    const spacingX = width / (W - 1);
    const spacingZ = depth / (H - 1);

    this.width = width;
    this.depth = depth;
    this.cloth = new PhysCloth(
      W,
      H,
      spacingX,
      spacingZ,
      new THREE.Vector3(-width * 0.5, 0.108, -depth * 0.5),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1)
    );
    this.cloth.iterations = 28;
    this.cloth.damping = 0.988;
    this.cloth.friction = 0.48;
    this.cloth.groundFriction = 0.14;
    this.cloth.groundY = 0.0;
    this.cloth.collisionMargin = 0.0022;

    // Exact multi-sphere collider matching the 4-strand braided challah loaf in challah.glb!
    // Loaf spans X in [-0.118, +0.118], resting on walnut board (top Y = 0.015), max height ~0.084
    const numLoafSpheres = 13;
    for (let k = 0; k < numLoafSpheres; k++) {
      const u = (k + 0.5) / numLoafSpheres;
      const sx = -0.116 + u * 0.232;
      const env = Math.pow(Math.sin(Math.PI * u), 0.55);
      // Loaf vertical crown & horizontal half-width along X
      const loafTop = 0.015 + 0.014 + 0.036 * env + (0.012 + 0.015 * env) * 1.12;
      const loafHalfW = 0.024 * env + (0.012 + 0.015 * env);
      const r = Math.max(0.024, (loafTop - 0.015) * 0.62);
      const cy = loafTop - r;
      // Central crown sphere + gentle side shoulder spheres where loaf is wide
      this.cloth.spheres.push({ cx: sx, cy, cz: 0.0, r });
      if (loafHalfW > r * 0.92) {
        const sideR = r * 0.78;
        const zOff = loafHalfW - sideR;
        this.cloth.spheres.push({ cx: sx, cy: 0.015 + sideR * 0.85, cz: zOff, r: sideR });
        this.cloth.spheres.push({ cx: sx, cy: 0.015 + sideR * 0.85, cz: -zOff, r: sideR });
      }
    }

    // Oval carved walnut challah board collider (rx = 0.150, rz = 0.095, topY = 0.015)
    this.cloth.ovalBoard = { rx: 0.150, rz: 0.095, topY: 0.015 };

    // Build Three.js BufferGeometry directly backed by PhysCloth typed arrays!
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.cloth.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.normAttr = new THREE.BufferAttribute(this.cloth.normal, 3);
    this.normAttr.setUsage(THREE.DynamicDrawUsage);

    const uvs = new Float32Array(W * H * 2);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx2 = (y * W + x) * 2;
        uvs[idx2] = x / (W - 1);
        uvs[idx2 + 1] = 1.0 - y / (H - 1);
      }
    }
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('normal', this.normAttr);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(this.cloth.tris, 1));

    material.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'Challah_PhysCloth_Cover';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    challahRoot.add(this.mesh);

    // Pre-settle cloth under gravity (matching demos/cloth3d.cpp dt = 1/240!) so Frame 1 is naturally draped & flat!
    this.preSettle(340);

    // Save natural draped front-edge reference positions for smooth uncover/re-cover animation
    this.uncovered = false;
    this.animMode = 'idle'; // 'idle' | 'uncovering' | 'covering' | 'settling'
    this.animTime = 0;
    this.settleTime = 0;
  }

  preSettle(steps = 340) {
    const dt = 1 / 200;
    for (let i = 0; i < steps; i++) {
      this.cloth.step(dt, 0, 0, 0);
    }
    // Zero residual velocity once naturally settled
    this.cloth.prev.set(this.cloth.pos);
    this.posAttr.needsUpdate = true;
    this.normAttr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  setUncovered(uncover) {
    this.uncovered = uncover;
    this.animTime = 0;
    this.settleTime = 0;
    this.animMode = uncover ? 'uncovering' : 'covering';
    this.cloth.unpinAll();
  }

  update(dt, elapsed) {
    const W = this.cloth.W;
    const H = this.cloth.H;
    const subDt = 1 / 200;

    if (this.animMode === 'uncovering') {
      this.animTime += dt;
      const dur = 0.85;
      const p = Math.min(1.0, this.animTime / dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      // Pin the front edge (y = H - 1) and peel it smoothly up, over the challah, and back behind the board!
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1) - 0.5;
        const lx = u * this.width * (1.0 - 0.25 * ease);
        const lz = (this.depth * 0.5) * (1.0 - ease) + (-this.depth * 0.62) * ease;
        const ly = 0.005 + 0.135 * Math.sin(ease * Math.PI) + 0.010 * ease;
        this.cloth.setPin(x, H - 1, lx, ly, lz);
      }
      for (let s = 0; s < 3; s++) this.cloth.step(subDt, 0, 0, -0.35);

      if (p >= 1.0) {
        this.cloth.unpinAll();
        this.animMode = 'settling';
        this.settleTime = 1.6;
      }
      this.syncMesh();
      return;
    }

    if (this.animMode === 'covering') {
      this.animTime += dt;
      const dur = 0.85;
      const p = Math.min(1.0, this.animTime / dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      // Lift front edge smoothly back over the braided challah and release so gravity drapes it naturally!
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1) - 0.5;
        const lx = u * this.width;
        const lz = (-this.depth * 0.62) * (1.0 - ease) + (this.depth * 0.48) * ease;
        const ly = 0.015 + 0.135 * Math.sin(ease * Math.PI) + 0.018 * (1.0 - ease);
        this.cloth.setPin(x, H - 1, lx, ly, lz);
      }
      for (let s = 0; s < 3; s++) this.cloth.step(subDt, 0, 0, 0.25);

      if (p >= 1.0) {
        this.cloth.unpinAll();
        this.animMode = 'settling';
        this.settleTime = 2.4;
      }
      this.syncMesh();
      return;
    }

    if (this.animMode === 'settling') {
      this.settleTime -= dt;
      const windX = Math.sin(elapsed * 0.7) * 0.02;
      for (let s = 0; s < 3; s++) this.cloth.step(subDt, windX, 0, 0);
      this.syncMesh();
      if (this.settleTime <= 0) {
        this.cloth.prev.set(this.cloth.pos);
        this.animMode = 'idle';
      }
    }
  }

  syncMesh() {
    this.posAttr.needsUpdate = true;
    this.normAttr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}
