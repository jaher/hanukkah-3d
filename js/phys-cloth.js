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
    this.selfCollision = true;
    this.selfMinDist = 0.0082;  // non-adjacent particle separation (< grid spacing ~0.0103 m)
    this.selfTriDist = 0.0036;  // exact point-to-non-adjacent-triangle layer thickness

    // Pre-allocated flat spatial hash structures for zero-GC self-collision
    this._hashSize = 4096;
    this._hashHead = new Int32Array(this._hashSize);
    this._hashNext = new Int32Array(N);
    this._triHashHead = new Int32Array(this._hashSize);
    this._triHashNext = new Int32Array((W - 1) * (H - 1) * 2);

    /** @type {Array<{cx:number, cy:number, cz:number, r:number}>} */
    this.spheres = [];
    /** Optional oval table board collider { rx, rz, topY } */
    this.ovalBoard = null;
    /**
     * Optional finite dining-table solid footprint collider in WORLD coordinates,
     * paired with local<->world matrices so overhanging cloth drapes down the sides of the table under gravity!
     * { minX, maxX, minZ, maxZ, topY, runnerMinZ, runnerMaxZ, runnerTopY, botY, bevelR, floorY, toWorld, toLocal }
     */
    this.tableBox = null;

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
      if (this.selfCollision && (it === this.iterations - 1 || it % 7 === 6)) {
        this.collideSelfParticles();
      }
    }

    // 2b. Exact side-consistent point-vs-triangle self-collision prevention (eliminates cloth layer crossing!)
    if (this.selfCollision) {
      this.collideSelfTriangles();
      this.collide();
      this.collideSelfTriangles();
      this.collide();
    }

    // 3. Tangential contact friction & smooth vertex normals
    this.applyContactFriction();
    this.computeNormals();
  }

  _hashCell(ix, iy, iz) {
    return (((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0) & (this._hashSize - 1);
  }

  /**
   * Spatial-hash non-adjacent particle-particle self-collision pass.
   * Keeps folded cloth layers cleanly separated without disturbing immediate grid neighbors.
   */
  collideSelfParticles() {
    const W = this.W;
    const H = this.H;
    const N = W * H;
    const pos = this.pos;
    const prev = this.prev;
    const pinned = this.pinned;
    const minDist = this.selfMinDist;
    const minDist2 = minDist * minDist;
    const invCell = 1.0 / (minDist * 1.45);
    const head = this._hashHead;
    const next = this._hashNext;
    head.fill(-1);

    // Insert all particles into spatial hash
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const h = this._hashCell(
        Math.floor(pos[i3] * invCell),
        Math.floor(pos[i3 + 1] * invCell),
        Math.floor(pos[i3 + 2] * invCell)
      );
      next[i] = head[h];
      head[h] = i;
    }

    const groundFloor = this.groundY + this.collisionMargin;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const gxi = i % W;
      const gyi = (i / W) | 0;
      const cx = Math.floor(pos[i3] * invCell);
      const cy = Math.floor(pos[i3 + 1] * invCell);
      const cz = Math.floor(pos[i3 + 2] * invCell);

      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            let j = head[this._hashCell(cx + dx, cy + dy, cz + dz)];
            while (j !== -1) {
              if (j > i) {
                const gxj = j % W;
                const gyj = (j / W) | 0;
                // Only separate truly non-adjacent cloth regions (Chebyshev grid distance >= 2)
                if (Math.abs(gxi - gxj) > 1 || Math.abs(gyi - gyj) > 1) {
                  const pa = pinned[i];
                  const pb = pinned[j];
                  if (!(pa && pb)) {
                    const j3 = j * 3;
                    let rx = pos[j3] - pos[i3];
                    let ry = pos[j3 + 1] - pos[i3 + 1];
                    let rz = pos[j3 + 2] - pos[i3 + 2];
                    const d2 = rx * rx + ry * ry + rz * rz;
                    if (d2 < minDist2) {
                      let len = Math.sqrt(d2);
                      if (len < 1e-7) {
                        rx = 0;
                        ry = 1;
                        rz = 0;
                        len = 1;
                      }
                      const invL = 1.0 / len;
                      let nx = rx * invL;
                      let ny = ry * invL;
                      let nz = rz * invL;
                      const pen = minDist - len;

                      // If both particles are near the table surface, gently bias separation vertically so
                      // upper fold rides cleanly ON TOP of lower layer rather than sliding under it!
                      if (pos[i3 + 1] < groundFloor + 0.012 && pos[j3 + 1] < groundFloor + 0.012 && Math.abs(ny) < 0.25) {
                        ny = pos[j3 + 1] >= pos[i3 + 1] ? 0.45 : -0.45;
                        const nl = Math.hypot(nx, ny, nz) || 1;
                        nx /= nl;
                        ny /= nl;
                        nz /= nl;
                      }

                      if (!pa && !pb) {
                        const half = pen * 0.5;
                        pos[i3] -= nx * half;
                        pos[i3 + 1] -= ny * half;
                        pos[i3 + 2] -= nz * half;
                        pos[j3] += nx * half;
                        pos[j3 + 1] += ny * half;
                        pos[j3 + 2] += nz * half;
                      } else if (pa) {
                        pos[j3] += nx * pen;
                        pos[j3 + 1] += ny * pen;
                        pos[j3 + 2] += nz * pen;
                      } else {
                        pos[i3] -= nx * pen;
                        pos[i3 + 1] -= ny * pen;
                        pos[i3 + 2] -= nz * pen;
                      }

                      // Subtle self-collision damping to keep folds calm & silky
                      const rvx = (pos[j3] - prev[j3]) - (pos[i3] - prev[i3]);
                      const rvy = (pos[j3 + 1] - prev[j3 + 1]) - (pos[i3 + 1] - prev[i3 + 1]);
                      const rvz = (pos[j3 + 2] - prev[j3 + 2]) - (pos[i3 + 2] - prev[i3 + 2]);
                      const damp = 0.12;
                      if (!pa) {
                        prev[i3] -= rvx * damp;
                        prev[i3 + 1] -= rvy * damp;
                        prev[i3 + 2] -= rvz * damp;
                      }
                      if (!pb) {
                        prev[j3] += rvx * damp;
                        prev[j3 + 1] += rvy * damp;
                        prev[j3 + 2] += rvz * damp;
                      }
                    }
                  }
                }
              }
              j = next[j];
            }
          }
        }
      }
    }
  }

  /**
   * Exact side-consistent point-vs-non-adjacent-triangle self-collision projection.
   * Detects both proximity (< selfTriDist) AND continuous tunneling (sign flip from prev to pos)
   * so no cloth vertex can ever cross through another part of the fabric!
   */
  collideSelfTriangles() {
    const W = this.W;
    const H = this.H;
    const N = W * H;
    const pos = this.pos;
    const prev = this.prev;
    const pinned = this.pinned;
    const tris = this.tris;
    const triCount = (tris.length / 3) | 0;
    const thick = this.selfTriDist;
    const thick2 = thick * thick;
    const cellSize = 0.018;
    const invCell = 1.0 / cellSize;

    const tHead = this._triHashHead;
    const tNext = this._triHashNext;
    tHead.fill(-1);

    // Hash every triangle by its centroid
    for (let t = 0; t < triCount; t++) {
      const a3 = tris[t * 3] * 3;
      const b3 = tris[t * 3 + 1] * 3;
      const c3 = tris[t * 3 + 2] * 3;
      const mx = (pos[a3] + pos[b3] + pos[c3]) * (1 / 3);
      const my = (pos[a3 + 1] + pos[b3 + 1] + pos[c3 + 1]) * (1 / 3);
      const mz = (pos[a3 + 2] + pos[b3 + 2] + pos[c3 + 2]) * (1 / 3);
      const h = this._hashCell(Math.floor(mx * invCell), Math.floor(my * invCell), Math.floor(mz * invCell));
      tNext[t] = tHead[h];
      tHead[h] = t;
    }

    for (let i = 0; i < N; i++) {
      if (pinned[i]) continue;
      const i3 = i * 3;
      const gxi = i % W;
      const gyi = (i / W) | 0;
      const px = pos[i3];
      const py = pos[i3 + 1];
      const pz = pos[i3 + 2];
      const cx = Math.floor(px * invCell);
      const cy = Math.floor(py * invCell);
      const cz = Math.floor(pz * invCell);

      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            let t = tHead[this._hashCell(cx + dx, cy + dy, cz + dz)];
            while (t !== -1) {
              const ia = tris[t * 3];
              const ib = tris[t * 3 + 1];
              const ic = tris[t * 3 + 2];

              // Skip triangles within 1 grid cell of particle i
              if (
                (Math.abs(gxi - (ia % W)) > 1 || Math.abs(gyi - ((ia / W) | 0)) > 1) &&
                (Math.abs(gxi - (ib % W)) > 1 || Math.abs(gyi - ((ib / W) | 0)) > 1) &&
                (Math.abs(gxi - (ic % W)) > 1 || Math.abs(gyi - ((ic / W) | 0)) > 1)
              ) {
                const a3 = ia * 3;
                const b3 = ib * 3;
                const c3 = ic * 3;
                const ax = pos[a3], ay = pos[a3 + 1], az = pos[a3 + 2];
                const bx = pos[b3], by = pos[b3 + 1], bz = pos[b3 + 2];
                const cxp = pos[c3], cyp = pos[c3 + 1], czp = pos[c3 + 2];

                // Quick AABB reject
                const minX = Math.min(ax, bx, cxp) - thick;
                const maxX = Math.max(ax, bx, cxp) + thick;
                if (px >= minX && px <= maxX) {
                  const minY = Math.min(ay, by, cyp) - thick;
                  const maxY = Math.max(ay, by, cyp) + thick;
                  if (py >= minY && py <= maxY) {
                    const minZ = Math.min(az, bz, czp) - thick;
                    const maxZ = Math.max(az, bz, czp) + thick;
                    if (pz >= minZ && pz <= maxZ) {
                      // Triangle normal
                      const abx = bx - ax, aby = by - ay, abz = bz - az;
                      const acx = cxp - ax, acy = cyp - ay, acz = czp - az;
                      let fnx = aby * acz - abz * acy;
                      let fny = abz * acx - abx * acz;
                      let fnz = abx * acy - aby * acx;
                      const fnLen = Math.hypot(fnx, fny, fnz);
                      if (fnLen > 1e-10) {
                        fnx /= fnLen;
                        fny /= fnLen;
                        fnz /= fnLen;

                        // Signed distance of current and previous particle positions to triangle plane
                        const sdCur = (px - ax) * fnx + (py - ay) * fny + (pz - az) * fnz;
                        const sdPrev = (prev[i3] - ax) * fnx + (prev[i3 + 1] - ay) * fny + (prev[i3 + 2] - az) * fnz;
                        const crossed = (sdCur >= 0 && sdPrev < 0) || (sdCur < 0 && sdPrev >= 0);

                        if (Math.abs(sdCur) < thick || crossed) {
                          // Project P onto triangle plane & test barycentric containment
                          const qx = px - sdCur * fnx;
                          const qy = py - sdCur * fny;
                          const qz = pz - sdCur * fnz;
                          const v0x = acx, v0y = acy, v0z = acz;
                          const v1x = abx, v1y = aby, v1z = abz;
                          const v2x = qx - ax, v2y = qy - ay, v2z = qz - az;
                          const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
                          const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
                          const d02 = v0x * v2x + v0y * v2y + v0z * v2z;
                          const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
                          const d12 = v1x * v2x + v1y * v2y + v1z * v2z;
                          const denom = d00 * d11 - d01 * d01;
                          if (Math.abs(denom) > 1e-12) {
                            const invD = 1.0 / denom;
                            const u = (d11 * d02 - d01 * d12) * invD;
                            const v = (d00 * d12 - d01 * d02) * invD;
                            if (u >= -0.05 && v >= -0.05 && u + v <= 1.05) {
                              // Keep particle strictly on its previous side (or upper side if ambiguous!)
                              let side = sdPrev >= 0 ? 1.0 : -1.0;
                              if (Math.abs(sdPrev) < 1e-6) side = fny >= 0 ? 1.0 : -1.0;
                              const targetSigned = side * thick;
                              const push = targetSigned - sdCur;
                              if (push * side > 0) {
                                // Split correction between particle & triangle vertices
                                const pStep = push * 0.6;
                                const tStep = -push * 0.4 * (1 / 3);
                                pos[i3] += fnx * pStep;
                                pos[i3 + 1] += fny * pStep;
                                pos[i3 + 2] += fnz * pStep;
                                if (!pinned[ia]) {
                                  pos[a3] += fnx * tStep;
                                  pos[a3 + 1] += fny * tStep;
                                  pos[a3 + 2] += fnz * tStep;
                                }
                                if (!pinned[ib]) {
                                  pos[b3] += fnx * tStep;
                                  pos[b3 + 1] += fny * tStep;
                                  pos[b3 + 2] += fnz * tStep;
                                }
                                if (!pinned[ic]) {
                                  pos[c3] += fnx * tStep;
                                  pos[c3 + 1] += fny * tStep;
                                  pos[c3 + 2] += fnz * tStep;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              t = tNext[t];
            }
          }
        }
      }
    }
  }

  /**
   * Exact Möller-style segment-triangle self-intersection audit across all non-adjacent triangle pairs.
   * Returns exact count of crossing triangle pairs (0 = completely self-intersection-free cloth!).
   */
  countSelfIntersections() {
    const pos = this.pos;
    const tris = this.tris;
    const triCount = (tris.length / 3) | 0;
    const aabb = new Float32Array(triCount * 6);

    for (let t = 0; t < triCount; t++) {
      const a3 = tris[t * 3] * 3;
      const b3 = tris[t * 3 + 1] * 3;
      const c3 = tris[t * 3 + 2] * 3;
      aabb[t * 6] = Math.min(pos[a3], pos[b3], pos[c3]);
      aabb[t * 6 + 1] = Math.max(pos[a3], pos[b3], pos[c3]);
      aabb[t * 6 + 2] = Math.min(pos[a3 + 1], pos[b3 + 1], pos[c3 + 1]);
      aabb[t * 6 + 3] = Math.max(pos[a3 + 1], pos[b3 + 1], pos[c3 + 1]);
      aabb[t * 6 + 4] = Math.min(pos[a3 + 2], pos[b3 + 2], pos[c3 + 2]);
      aabb[t * 6 + 5] = Math.max(pos[a3 + 2], pos[b3 + 2], pos[c3 + 2]);
    }

    const segHitsTri = (p0, p1, a, b, c) => {
      const p0x = pos[p0], p0y = pos[p0 + 1], p0z = pos[p0 + 2];
      const dx = pos[p1] - p0x, dy = pos[p1 + 1] - p0y, dz = pos[p1 + 2] - p0z;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
      const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
      const hx = dy * e2z - dz * e2y;
      const hy = dz * e2x - dx * e2z;
      const hz = dx * e2y - dy * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-10) return false;
      const invDet = 1.0 / det;
      const sx = p0x - ax, sy = p0y - ay, sz = p0z - az;
      const u = invDet * (sx * hx + sy * hy + sz * hz);
      if (u < 1e-4 || u > 1.0 - 1e-4) return false;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = invDet * (dx * qx + dy * qy + dz * qz);
      if (v < 1e-4 || u + v > 1.0 - 1e-4) return false;
      const tHit = invDet * (e2x * qx + e2y * qy + e2z * qz);
      return tHit > 1e-4 && tHit < 1.0 - 1e-4;
    };

    let crossings = 0;
    for (let t1 = 0; t1 < triCount; t1++) {
      const b1 = t1 * 6;
      const i1a = tris[t1 * 3], i1b = tris[t1 * 3 + 1], i1c = tris[t1 * 3 + 2];
      const a1 = i1a * 3, b1p = i1b * 3, c1 = i1c * 3;
      for (let t2 = t1 + 1; t2 < triCount; t2++) {
        const b2 = t2 * 6;
        if (
          aabb[b1 + 1] < aabb[b2] || aabb[b1] > aabb[b2 + 1] ||
          aabb[b1 + 3] < aabb[b2 + 2] || aabb[b1 + 2] > aabb[b2 + 3] ||
          aabb[b1 + 5] < aabb[b2 + 4] || aabb[b1 + 4] > aabb[b2 + 5]
        ) continue;
        const i2a = tris[t2 * 3], i2b = tris[t2 * 3 + 1], i2c = tris[t2 * 3 + 2];
        // Skip triangles sharing any vertex
        if (
          i1a === i2a || i1a === i2b || i1a === i2c ||
          i1b === i2a || i1b === i2b || i1b === i2c ||
          i1c === i2a || i1c === i2b || i1c === i2c
        ) continue;
        const a2 = i2a * 3, b2p = i2b * 3, c2 = i2c * 3;
        if (
          segHitsTri(a1, b1p, a2, b2p, c2) ||
          segHitsTri(b1p, c1, a2, b2p, c2) ||
          segHitsTri(c1, a1, a2, b2p, c2) ||
          segHitsTri(a2, b2p, a1, b1p, c1) ||
          segHitsTri(b2p, c2, a1, b1p, c1) ||
          segHitsTri(c2, a2, a1, b1p, c1)
        ) {
          crossings++;
        }
      }
    }
    return crossings;
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

      // 2. Solid 3D Rounded-Rim Oval Challah Plate/Board Collider (ZERO plate clipping or chord cutting!)
      if (board) {
        const bMargin = margin + 0.0025; // extra chord clearance so triangle edges never slice the rounded plate rim
        const bevel = 0.0055;
        const innerRx = Math.max(0.01, board.rx - bevel);
        const innerRz = Math.max(0.01, board.rz - bevel);
        const innerTop = Math.max(0.002, board.topY - bevel);
        const shellR = bevel + bMargin;

        // Closest point on the inner elliptical prism (0 .. innerTop)
        const ex = px / innerRx;
        const ez = pz / innerRz;
        const ell = Math.sqrt(ex * ex + ez * ez);
        let qx = px;
        let qz = pz;
        if (ell > 1.0) {
          qx = px / ell;
          qz = pz / ell;
        }
        const qy = py < 0.0 ? 0.0 : py > innerTop ? innerTop : py;

        const dx = px - qx;
        const dy = py - qy;
        const dz = pz - qz;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (d2 === 0) {
          // Inside inner plate volume: push straight up onto plate surface (or out rim if closer)
          const dTop = (board.topY + bMargin) - py;
          const dRad = (1.0 - ell) * Math.min(innerRx, innerRz) + shellR;
          if (dTop <= dRad) {
            py = board.topY + bMargin;
          } else if (ell > 1e-6) {
            const sc = (board.rx + bMargin) / (Math.hypot(px, pz * (board.rx / board.rz)) || 1);
            px *= sc;
            pz *= sc;
          } else {
            py = board.topY + bMargin;
          }
        } else if (d2 < shellR * shellR) {
          const invD = shellR / Math.sqrt(d2);
          px = qx + dx * invD;
          py = qy + dy * invD;
          pz = qz + dz * invD;
        }
      }

      // 3. Finite Dining Table Footprint + Beveled Rim + Room Floor Collider!
      //    Cloth over the table rests cleanly on it; cloth hanging past ANY table edge falls & drapes down under gravity!
      if (this.tableBox) {
        const tb = this.tableBox;
        const mW = tb.toWorld;
        // Local -> World
        let wx = mW[0] * px + mW[4] * py + mW[8] * pz + mW[12];
        let wy = mW[1] * px + mW[5] * py + mW[9] * pz + mW[13];
        let wz = mW[2] * px + mW[6] * py + mW[10] * pz + mW[14];

        const onRunnerZ = wz >= tb.runnerMinZ && wz <= tb.runnerMaxZ;
        const surfTopY = onRunnerZ ? tb.runnerTopY : tb.topY;
        const bevel = tb.bevelR;

        // Inner core box shrunk by `bevel`, then expanded outward by `bevel + margin` -> smooth rounded walnut rim!
        const cxMin = tb.minX + bevel;
        const cxMax = tb.maxX - bevel;
        const czMin = tb.minZ + bevel;
        const czMax = tb.maxZ - bevel;
        const cyMin = tb.botY + bevel;
        const cyMax = surfTopY - bevel;
        const shellR = bevel + margin;

        // Closest point on inner core box
        const qx = wx < cxMin ? cxMin : wx > cxMax ? cxMax : wx;
        const qy = wy < cyMin ? cyMin : wy > cyMax ? cyMax : wy;
        const qz = wz < czMin ? czMin : wz > czMax ? czMax : wz;

        const dx = wx - qx;
        const dy = wy - qy;
        const dz = wz - qz;
        const d2 = dx * dx + dy * dy + dz * dz;

        let changed = false;
        if (d2 === 0) {
          // Deep inside core box: push to nearest face (top or closest side)
          const dTop = (surfTopY + margin) - wy;
          const dR = (tb.maxX + margin) - wx;
          const dL = wx - (tb.minX - margin);
          const dF = (tb.maxZ + margin) - wz;
          const dB = wz - (tb.minZ - margin);
          const mMin = Math.min(dTop, dR, dL, dF, dB);
          if (mMin === dTop) wy = surfTopY + margin;
          else if (mMin === dR) wx = tb.maxX + margin;
          else if (mMin === dL) wx = tb.minX - margin;
          else if (mMin === dF) wz = tb.maxZ + margin;
          else wz = tb.minZ - margin;
          changed = true;
        } else if (d2 < shellR * shellR) {
          // Within rounded beveled shell -> push cleanly outward along smooth bevel normal!
          const invD = shellR / Math.sqrt(d2);
          wx = qx + dx * invD;
          wy = qy + dy * invD;
          wz = qz + dz * invD;
          changed = true;
        }

        // Also collide with recessed wooden apron directly below tabletop (world Y in [0.640, 0.724])
        if (wy < tb.botY && wy > tb.apronBotY - margin) {
          const axMin = tb.apronMinX - margin;
          const axMax = tb.apronMaxX + margin;
          const azMin = tb.apronMinZ - margin;
          const azMax = tb.apronMaxZ + margin;
          if (wx > axMin && wx < axMax && wz > azMin && wz < azMax) {
            const dR = axMax - wx;
            const dL = wx - axMin;
            const dF = azMax - wz;
            const dB = wz - azMin;
            const mMin = Math.min(dR, dL, dF, dB);
            if (mMin === dR) wx = axMax;
            else if (mMin === dL) wx = axMin;
            else if (mMin === dF) wz = azMax;
            else wz = azMin;
            changed = true;
          }
        }

        // Room floor safety plane far below the table (world Y = 0)
        if (wy < tb.floorY + margin) {
          wy = tb.floorY + margin;
          changed = true;
        }

        if (changed) {
          const mL = tb.toLocal;
          px = mL[0] * wx + mL[4] * wy + mL[8] * wz + mL[12];
          py = mL[1] * wx + mL[5] * wy + mL[9] * wz + mL[13];
          pz = mL[2] * wx + mL[6] * wy + mL[10] * wz + mL[14];
        }
      } else if (py < minGroundY) {
        py = minGroundY;
      }

      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }

    // 2c. Edge-midpoint guard against the oval walnut plate rim so stretched triangle chords NEVER cut the plate!
    if (board) {
      const rxP = board.rx + margin + 0.0008;
      const rzP = board.rz + margin + 0.0008;
      const topP = board.topY + margin + 0.0008;
      const W = this.W;
      const H = this.H;
      const liftEdge = (a, b) => {
        if (pinned[a] && pinned[b]) return;
        const a3 = a * 3;
        const b3 = b * 3;
        const mx = 0.5 * (pos[a3] + pos[b3]);
        const my = 0.5 * (pos[a3 + 1] + pos[b3 + 1]);
        const mz = 0.5 * (pos[a3 + 2] + pos[b3 + 2]);
        if (my >= topP) return;
        const e2 = (mx * mx) / (rxP * rxP) + (mz * mz) / (rzP * rzP);
        if (e2 < 1.0) {
          const lift = (topP - my) * 0.9;
          if (!pinned[a]) pos[a3 + 1] += lift;
          if (!pinned[b]) pos[b3 + 1] += lift;
        }
      };
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const cur = y * W + x;
          if (x + 1 < W) liftEdge(cur, cur + 1);
          if (y + 1 < H) liftEdge(cur, cur + W);
        }
      }
    }
  }

  /** Audit helper: count any cloth particles or edge midpoints intersecting the solid oval challah plate. */
  countPlateIntersections() {
    const board = this.ovalBoard;
    if (!board) return 0;
    const pos = this.pos;
    const W = this.W;
    const H = this.H;
    const inside = (x, y, z) =>
      y > 0.0005 &&
      y < board.topY - 0.0002 &&
      (x * x) / (board.rx * board.rx) + (z * z) / (board.rz * board.rz) < 0.995;

    let hits = 0;
    for (let i = 0; i < W * H; i++) {
      const i3 = i * 3;
      if (inside(pos[i3], pos[i3 + 1], pos[i3 + 2])) hits++;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cur = y * W + x;
        if (x + 1 < W) {
          const a3 = cur * 3, b3 = (cur + 1) * 3;
          if (inside(0.5 * (pos[a3] + pos[b3]), 0.5 * (pos[a3 + 1] + pos[b3 + 1]), 0.5 * (pos[a3 + 2] + pos[b3 + 2]))) hits++;
        }
        if (y + 1 < H) {
          const a3 = cur * 3, b3 = (cur + W) * 3;
          if (inside(0.5 * (pos[a3] + pos[b3]), 0.5 * (pos[a3 + 1] + pos[b3 + 1]), 0.5 * (pos[a3 + 2] + pos[b3 + 2]))) hits++;
        }
      }
    }
    return hits;
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

      if (this.tableBox) {
        const tb = this.tableBox;
        const mW = tb.toWorld;
        const wx = mW[0] * px + mW[4] * py + mW[8] * pz + mW[12];
        const wy = mW[1] * px + mW[5] * py + mW[9] * pz + mW[13];
        const wz = mW[2] * px + mW[6] * py + mW[10] * pz + mW[14];
        const onRunnerZ = wz >= tb.runnerMinZ && wz <= tb.runnerMaxZ;
        const surfTopY = onRunnerZ ? tb.runnerTopY : tb.topY;
        const overTable =
          wx >= tb.minX - margin2 &&
          wx <= tb.maxX + margin2 &&
          wz >= tb.minZ - margin2 &&
          wz <= tb.maxZ + margin2;
        if (overTable && wy <= surfTopY + margin2 && wy >= tb.botY - margin2) {
          nx = 0;
          ny = 1;
          nz = 0;
          contact = true;
          fric = this.groundFriction;
        }
      } else if (py < groundThresh) {
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
  constructor(challahRoot, material, tableBounds = null) {
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
    this.cloth.damping = 0.978;         // calm, restrained linen damping (no wild sweeping or bouncing!)
    this.cloth.friction = 0.52;
    this.cloth.groundFriction = 0.28;   // realistic linen-on-runner grip so cloth settles calmly in place
    this.cloth.groundY = 0.0;
    this.cloth.collisionMargin = 0.0022;
    this.cloth.selfMinDist = 0.0088;
    this.cloth.selfTriDist = 0.0042;

    // Bind exact finite walnut dining-table footprint in world coordinates so overhanging cloth drapes down the side!
    if (tableBounds) {
      challahRoot.updateMatrixWorld(true);
      const invMat = new THREE.Matrix4().copy(challahRoot.matrixWorld).invert();
      this.cloth.tableBox = {
        ...tableBounds,
        toWorld: Float32Array.from(challahRoot.matrixWorld.elements),
        toLocal: Float32Array.from(invMat.elements),
      };
    }

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
    // Snapshot current edge positions at gesture start so the lift begins seamlessly with zero jump!
    const W = this.cloth.W;
    const H = this.cloth.H;
    const edgeRow = uncover ? 0 : H - 1;
    this._edgeStart = new Float32Array(W * 3);
    for (let x = 0; x < W; x++) {
      const i3 = (edgeRow * W + x) * 3;
      this._edgeStart[x * 3] = this.cloth.pos[i3];
      this._edgeStart[x * 3 + 1] = this.cloth.pos[i3 + 1];
      this._edgeStart[x * 3 + 2] = this.cloth.pos[i3 + 2];
    }
  }

  update(dt, elapsed) {
    const W = this.cloth.W;
    const H = this.cloth.H;
    const subDt = 1 / 200;

    if (this.animMode === 'uncovering') {
      this.animTime += dt;
      const dur = 0.78;
      const p = Math.min(1.0, this.animTime / dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      // Restrained, gentle draw-back of the back edge (just 18 cm behind the loaf) so the challah is unveiled
      // gracefully while the cloth stays composed on the back of the table rather than flying off!
      for (let x = 0; x < W; x++) {
        const sx = this._edgeStart ? this._edgeStart[x * 3] : (x / (W - 1) - 0.5) * this.width;
        const sy = this._edgeStart ? this._edgeStart[x * 3 + 1] : 0.003;
        const sz = this._edgeStart ? this._edgeStart[x * 3 + 2] : -this.depth * 0.5;
        const tx = (x / (W - 1) - 0.5) * this.width * 0.96;
        const tz = -this.depth * 0.5 - 0.18;
        const lx = sx + (tx - sx) * ease;
        const lz = sz + (tz - sz) * ease;
        const ly = sy + 0.048 * Math.sin(ease * Math.PI) + 0.002 * ease;
        this.cloth.setPin(x, 0, lx, ly, lz);
      }
      for (let s = 0; s < 3; s++) this.cloth.step(subDt, 0, 0, 0);

      if (p >= 1.0) {
        this.cloth.unpinAll();
        this.animMode = 'settling';
        this.settleTime = 1.1;
      }
      this.syncMesh();
      return;
    }

    if (this.animMode === 'covering') {
      this.animTime += dt;
      const dur = 0.85;
      const p = Math.min(1.0, this.animTime / dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      // Gentle, restrained lift just clearing the 8.4 cm braided challah crown, settling calmly back over the loaf!
      for (let x = 0; x < W; x++) {
        const sx = this._edgeStart ? this._edgeStart[x * 3] : (x / (W - 1) - 0.5) * this.width;
        const sy = this._edgeStart ? this._edgeStart[x * 3 + 1] : 0.004;
        const sz = this._edgeStart ? this._edgeStart[x * 3 + 2] : -0.02;
        const tx = (x / (W - 1) - 0.5) * this.width;
        const tz = this.depth * 0.48;
        const lx = sx + (tx - sx) * ease;
        const lz = sz + (tz - sz) * ease;
        const ly = sy + (0.008 - sy) * ease + 0.102 * Math.sin(ease * Math.PI);
        this.cloth.setPin(x, H - 1, lx, ly, lz);
      }
      for (let s = 0; s < 3; s++) this.cloth.step(subDt, 0, 0, 0);

      if (p >= 1.0) {
        this.cloth.unpinAll();
        this.animMode = 'settling';
        this.settleTime = 1.5;
      }
      this.syncMesh();
      return;
    }

    if (this.animMode === 'settling') {
      this.settleTime -= dt;
      for (let s = 0; s < 3; s++) this.cloth.step(subDt, 0, 0, 0);
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
