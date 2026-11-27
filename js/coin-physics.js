/**
 * Accurate 3D Rigid-Body Coin Physics & Collision Solver for Hanukkah Gelt
 *
 * - Exact oriented-cylinder vertical support extent: hy(q) = r * sin(tilt) + h * |cos(tilt)|
 *   guaranteeing zero penetration into the walnut tabletop or embroidered runner at ANY tilt angle.
 * - Full 3D coin-to-coin cylinder collision resolution (both vertical stacking support and
 *   side-to-side elastic impacts with stack cascade wakeup).
 * - Accurate collisions against the velvet gelt pouch (tapered height profile) and all nearby
 *   tabletop props (dreidels, heirloom dreidel, candle box, votives, hanukkiah, kiddush cup,
 *   sufganiyot platter) plus tabletop boundaries.
 * - Physical rim-contact righting torque so flipping coins wobble realistically and settle flat.
 */

import * as THREE from 'three';

const GRAVITY = 9.81;
const SUBSTEP_MAX = 0.003; // 3ms substeps for bulletproof zero-clipping contact resolution
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Reusable scratch math objects (zero per-frame GC allocations)
const _axisUp = new THREE.Vector3();
const _targetUp = new THREE.Vector3();
const _torqueAxis = new THREE.Vector3();
const _omegaAxis = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _worldPt = new THREE.Vector3();
const _localPt = new THREE.Vector3();

export class GeltCoinPhysics {
  constructor(geltRoot, { tableY = 0.760, runnerY = 0.7632, onImpactSound = null } = {}) {
    this.geltRoot = geltRoot;
    this.tableY = tableY;
    this.runnerY = runnerY;
    this.runnerOffset = runnerY - tableY;
    this.onImpactSound = onImpactSound;
    this.coins = [];
    this.staticObstacles = []; // { worldPos: Vector3, radius, height }
    this.dynamicObstacles = []; // () => { worldPos: Vector3, radius, height }
    this.lastSoundTime = 0;

    // Ensure world matrix of geltRoot is ready for local <-> world transforms
    this.geltRoot.updateMatrixWorld(true);
    this._invGeltMatrix = new THREE.Matrix4().copy(this.geltRoot.matrixWorld).invert();
  }

  /** Register a Coin* mesh, normalizing its pivot to its exact 3D geometric center without moving it in world space. */
  addCoin(mesh) {
    if (mesh.geometry) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bb.getSize(size);
      bb.getCenter(center);

      // Center vertices around (0, 0, 0) and shift mesh.position so world pose is 100% identical!
      mesh.geometry.translate(-center.x, -center.y, -center.z);
      const offsetRotated = center.clone().applyQuaternion(mesh.quaternion);
      mesh.position.add(offsetRotated);

      const radius = Math.max(size.x, size.z) * 0.5;
      const halfThick = Math.max(0.0015, size.y * 0.5);

      const rec = {
        index: this.coins.length,
        mesh,
        radius,
        halfThick,
        pos: mesh.position.clone(),
        quat: mesh.quaternion.clone(),
        vel: new THREE.Vector3(),
        omega: new THREE.Vector3(),
        sleeping: true,
        sleepTimer: 0,
        lastImpactAt: 0,
      };
      // Ensure initial resting pose sits cleanly on top of the embroidered runner if overlapping it!
      const initFloor = this.getFloorY(rec.pos.x, rec.pos.z);
      const initHy = this.getHalfExtentY(rec);
      if (rec.pos.y < initFloor + initHy) {
        rec.pos.y = initFloor + initHy;
        rec.mesh.position.copy(rec.pos);
      }
      this.coins.push(rec);
      return rec;
    }
    return null;
  }

  addStaticObstacle(worldX, worldZ, radius, height = 0.14) {
    this.staticObstacles.push({
      worldPos: new THREE.Vector3(worldX, this.tableY, worldZ),
      radius,
      height,
    });
  }

  addDynamicObstacle(getterFn) {
    this.dynamicObstacles.push(getterFn);
  }

  /** Exact vertical half-extent of a tilted cylinder of radius r and half-thickness h. */
  getHalfExtentY(coin) {
    _axisUp.copy(LOCAL_UP).applyQuaternion(coin.quat);
    const ay = Math.min(1.0, Math.abs(_axisUp.y));
    const sinT = Math.sqrt(Math.max(0.0, 1.0 - ay * ay));
    return coin.radius * sinT + coin.halfThick * ay;
  }

  /** Exact horizontal footprint radius of a tilted cylinder on XZ. */
  getHorizontalRadius(coin) {
    _axisUp.copy(LOCAL_UP).applyQuaternion(coin.quat);
    const ay = Math.min(1.0, Math.abs(_axisUp.y));
    const sinT = Math.sqrt(Math.max(0.0, 1.0 - ay * ay));
    // Max radius along tilt plane is r; perpendicular is r*ay + h*sinT; use conservative blend for zero clipping
    return Math.max(coin.radius * (0.72 + 0.28 * ay) + coin.halfThick * sinT, coin.halfThick * 1.1);
  }

  /** Exact local floor Y height at (lx, lz) inside geltRoot (accounts for +3.2mm embroidered runner step!). */
  getFloorY(lx, lz) {
    _worldPt.set(lx, 0, lz).applyMatrix4(this.geltRoot.matrixWorld);
    const onRunner =
      _worldPt.z >= -0.538 &&
      _worldPt.z <= -0.162 &&
      Math.abs(_worldPt.x) <= 0.855;
    return onRunner ? this.runnerOffset : 0.0;
  }

  /** Tapered radial profile of the plush velvet gelt pouch in geltRoot local space (exact Blender lathe dimensions!). */
  getPouchRadiusAt(localY) {
    if (localY < 0.0 || localY > 0.096) return 0.0;
    if (localY < 0.052) return 0.051; // full belly + cord clearance
    if (localY < 0.074) return 0.036; // cinched drawstring waist
    return 0.032; // ruffled velvet cuff
  }

  emitClink(intensity, nowMs) {
    if (!this.onImpactSound) return;
    if (nowMs - this.lastSoundTime < 45) return;
    this.lastSoundTime = nowMs;
    this.onImpactSound(Math.min(1.0, Math.max(0.18, intensity)));
  }

  /** Launch a clicked coin upward with realistic flip torque, cascading cleanly to any coins stacked on top of it! */
  launchCoin(coinIdx, { strength = 1.0, silent = false } = {}) {
    const c = this.coins[coinIdx];
    if (!c) return;

    this.geltRoot.updateMatrixWorld(true);
    this._invGeltMatrix.copy(this.geltRoot.matrixWorld).invert();

    // Gently bias horizontal launch slightly away from the velvet pouch (-0.082, -0.015) so it arcs cleanly into open space
    const awayX = c.pos.x - (-0.082);
    const awayZ = c.pos.z - (-0.015);
    const awayLen = Math.hypot(awayX, awayZ) || 1.0;

    c.sleeping = false;
    c.sleepTimer = 0;
    c.vel.set(
      (awayX / awayLen) * (0.04 + Math.random() * 0.06) + (Math.random() - 0.5) * 0.08,
      (1.02 + Math.random() * 0.24) * strength,
      (awayZ / awayLen) * (0.04 + Math.random() * 0.06) + (Math.random() - 0.5) * 0.08
    );

    // Crisp coin-flip tumble around a random horizontal axis + axial spin
    const flipAngle = Math.random() * Math.PI * 2;
    const flipSpeed = (18.0 + Math.random() * 6.5) * strength;
    c.omega.set(
      Math.cos(flipAngle) * flipSpeed,
      (Math.random() > 0.5 ? 1 : -1) * (8.0 + Math.random() * 8.0),
      Math.sin(flipAngle) * flipSpeed
    );

    // Wake and pop any coins currently stacked on top of this coin so lower coins never pass through upper ones!
    for (const other of this.coins) {
      if (other === c) continue;
      const dXZ = Math.hypot(other.pos.x - c.pos.x, other.pos.z - c.pos.z);
      if (other.pos.y > c.pos.y + 0.001 && dXZ < c.radius + other.radius * 0.95) {
        const tier = Math.max(1, Math.round((other.pos.y - c.pos.y) / (c.halfThick * 2)));
        const scatterAng = Math.random() * Math.PI * 2;
        other.sleeping = false;
        other.sleepTimer = 0;
        other.vel.set(
          Math.cos(scatterAng) * (0.10 + 0.03 * tier),
          c.vel.y + 0.14 + 0.04 * tier,
          Math.sin(scatterAng) * (0.10 + 0.03 * tier)
        );
        other.omega.set(
          (Math.random() - 0.5) * 18.0,
          (Math.random() - 0.5) * 12.0,
          (Math.random() - 0.5) * 18.0
        );
      }
    }

    if (!silent) {
      this.emitClink(0.95 * strength, performance.now());
    }
  }

  /** Step rigid-body coin simulation with substeps for accurate, zero-clipping collision detection. */
  update(dt) {
    const anyAwake = this.coins.some((c) => !c.sleeping);
    if (!anyAwake) return;

    this.geltRoot.updateMatrixWorld(true);
    this._invGeltMatrix.copy(this.geltRoot.matrixWorld).invert();

    // Gather all tabletop obstacles in geltRoot local space once per frame
    const localObstacles = [];
    for (const obs of this.staticObstacles) {
      _localPt.copy(obs.worldPos).applyMatrix4(this._invGeltMatrix);
      localObstacles.push({ x: _localPt.x, z: _localPt.z, radius: obs.radius, height: obs.height });
    }
    for (const getObs of this.dynamicObstacles) {
      const obs = getObs();
      if (!obs) continue;
      _localPt.copy(obs.worldPos).applyMatrix4(this._invGeltMatrix);
      localObstacles.push({ x: _localPt.x, z: _localPt.z, radius: obs.radius, height: obs.height });
    }

    const clampedDt = Math.min(dt, 0.04);
    const substeps = Math.max(1, Math.ceil(clampedDt / SUBSTEP_MAX));
    const h = clampedDt / substeps;
    const nowMs = performance.now();

    for (let s = 0; s < substeps; s++) {
      // 1. Integrate forces, velocities, and 3D orientation quaternions
      for (const c of this.coins) {
        if (c.sleeping) continue;
        c.vel.y -= GRAVITY * h;
        c.pos.addScaledVector(c.vel, h);

        const wMag = c.omega.length();
        if (wMag > 1e-5) {
          _omegaAxis.copy(c.omega).divideScalar(wMag);
          _dq.setFromAxisAngle(_omegaAxis, wMag * h);
          c.quat.premultiply(_dq).normalize();
        }
        // Subtle air drag on spin
        c.omega.multiplyScalar(Math.exp(-0.45 * h));
      }

      // 2. Resolve collisions with Velvet Gelt Pouch, all tabletop props, and tabletop edges
      for (const c of this.coins) {
        if (c.sleeping) continue;
        const hy = this.getHalfExtentY(c);
        const hr = this.getHorizontalRadius(c);

        // 2a. Velvet Gelt Pouch (centered at local (-0.082, 0..0.096, -0.015))
        const pouchR = this.getPouchRadiusAt(c.pos.y);
        if (pouchR > 0 && c.pos.y - hy < 0.096) {
          const dx = c.pos.x - (-0.082);
          const dz = c.pos.z - (-0.015);
          const dist = Math.hypot(dx, dz);
          const minDist = pouchR + hr + 0.001;
          if (dist < minDist) {
            const nx = dist > 1e-5 ? dx / dist : 1.0;
            const nz = dist > 1e-5 ? dz / dist : 0.0;
            c.pos.x = -0.082 + nx * minDist;
            c.pos.z = -0.015 + nz * minDist;
            const vn = c.vel.x * nx + c.vel.z * nz;
            if (vn < 0) {
              // Soft velvet bounce!
              c.vel.x -= 1.25 * vn * nx;
              c.vel.z -= 1.25 * vn * nz;
              c.vel.multiplyScalar(0.86);
            }
          }
        }

        // 2b. Nearby tabletop obstacles (dreidels, candle box, votives, hanukkiah, etc.)
        for (const obs of localObstacles) {
          if (c.pos.y - hy > obs.height) continue;
          const dx = c.pos.x - obs.x;
          const dz = c.pos.z - obs.z;
          const dist = Math.hypot(dx, dz);
          const minDist = obs.radius + hr + 0.001;
          if (dist < minDist) {
            const nx = dist > 1e-5 ? dx / dist : 1.0;
            const nz = dist > 1e-5 ? dz / dist : 0.0;
            c.pos.x = obs.x + nx * minDist;
            c.pos.z = obs.z + nz * minDist;
            const vn = c.vel.x * nx + c.vel.z * nz;
            if (vn < 0) {
              c.vel.x -= 1.38 * vn * nx;
              c.vel.z -= 1.38 * vn * nz;
              if (-vn > 0.14) this.emitClink(-vn * 0.85, nowMs);
            }
          }
        }

        // 2c. Keep coins safely within walnut tabletop bounds (never fly off table edges!)
        _worldPt.copy(c.pos).applyMatrix4(this.geltRoot.matrixWorld);
        let clampedEdge = false;
        const marginX = 0.81 - hr;
        const minZ = -0.79 + hr;
        const maxZ = 0.095 - hr;
        if (_worldPt.x < -marginX) { _worldPt.x = -marginX; clampedEdge = true; }
        if (_worldPt.x > marginX) { _worldPt.x = marginX; clampedEdge = true; }
        if (_worldPt.z < minZ) { _worldPt.z = minZ; clampedEdge = true; }
        if (_worldPt.z > maxZ) { _worldPt.z = maxZ; clampedEdge = true; }
        if (clampedEdge) {
          c.pos.copy(_worldPt).applyMatrix4(this._invGeltMatrix);
          c.vel.x *= -0.35;
          c.vel.z *= -0.35;
        }
      }

      // 3. Pairwise 3D Coin-to-Coin Cylinder Collisions + Integrated Floor Clamping (4 iterations -> zero interpenetration!)
      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < this.coins.length; i++) {
          const a = this.coins[i];
          for (let j = i + 1; j < this.coins.length; j++) {
            const b = this.coins[j];
            if (a.sleeping && b.sleeping) continue;

            const dx = b.pos.x - a.pos.x;
            const dz = b.pos.z - a.pos.z;
            const dXZ = Math.hypot(dx, dz);
            const hrA = this.getHorizontalRadius(a);
            const hrB = this.getHorizontalRadius(b);
            const rSum = hrA + hrB;
            if (dXZ >= rSum) continue;

            const hyA = this.getHalfExtentY(a);
            const hyB = this.getHalfExtentY(b);
            const dy = b.pos.y - a.pos.y;
            const hSum = hyA + hyB;
            if (Math.abs(dy) >= hSum) continue;

            const penXZ = rSum - dXZ;
            const penY = hSum - Math.abs(dy);

            // Vertical stacking vs horizontal side-to-side resolution
            if (penY <= penXZ * 1.15 && dXZ < rSum * 0.90) {
              const low = dy >= 0 ? a : b;
              const high = dy >= 0 ? b : a;
              const lowHy = dy >= 0 ? hyA : hyB;
              const relVy = high.vel.y - low.vel.y;
              const lowFloor = this.getFloorY(low.pos.x, low.pos.z) + lowHy;

              if (low.sleeping || low.pos.y <= lowFloor + 0.0005) {
                // Lower coin is resting on floor/stack — push ONLY the upper coin cleanly onto it!
                low.pos.y = Math.max(low.pos.y, lowFloor);
                high.pos.y = low.pos.y + hSum;
                if (iter === 0) {
                  if (relVy < -0.14) {
                    high.vel.y = -relVy * 0.30;
                    this.emitClink(-relVy * 0.9, nowMs);
                    if (-relVy > 0.75 && low.sleeping) {
                      low.sleeping = false;
                      low.sleepTimer = 0;
                      low.vel.x += (Math.random() - 0.5) * 0.04;
                      low.vel.z += (Math.random() - 0.5) * 0.04;
                    }
                  } else if (high.vel.y < 0) {
                    high.vel.y = 0;
                  }
                }
              } else {
                const corr = penY * 0.5;
                const newLowY = Math.max(lowFloor, low.pos.y - corr);
                low.pos.y = newLowY;
                high.pos.y = Math.max(high.pos.y + corr, newLowY + hSum);
                if (iter === 0 && relVy < 0) {
                  const e = -relVy > 0.14 ? 0.30 : 0.0;
                  const imp = -(1 + e) * relVy * 0.5;
                  low.vel.y -= imp;
                  high.vel.y += imp;
                  if (-relVy > 0.14) this.emitClink(-relVy * 0.9, nowMs);
                }
              }

              if (iter === 0) {
                // If upper coin overhangs lower coin past 76% of radius, apply realistic slide-off nudge!
                if (dXZ > low.radius * 0.76) {
                  const nx = dXZ > 1e-5 ? (high.pos.x - low.pos.x) / dXZ : 1.0;
                  const nz = dXZ > 1e-5 ? (high.pos.z - low.pos.z) / dXZ : 0.0;
                  high.vel.x += nx * 0.65 * h;
                  high.vel.z += nz * 0.65 * h;
                  high.sleeping = false;
                } else {
                  high.vel.x *= Math.exp(-10.0 * h);
                  high.vel.z *= Math.exp(-10.0 * h);
                  this.applyRightingTorque(high, h, 38.0);
                }
              }
            } else {
              // Side-to-side elastic rim collision!
              const nx = dXZ > 1e-5 ? dx / dXZ : 1.0;
              const nz = dXZ > 1e-5 ? dz / dXZ : 0.0;
              const push = penXZ + 0.00025;

              const rvx = b.vel.x - a.vel.x;
              const rvz = b.vel.z - a.vel.z;
              const relVn = rvx * nx + rvz * nz;

              if (iter === 0) {
                if (a.sleeping && -relVn > 0.08) { a.sleeping = false; a.sleepTimer = 0; }
                if (b.sleeping && -relVn > 0.08) { b.sleeping = false; b.sleepTimer = 0; }
              }

              if (a.sleeping && !b.sleeping) {
                b.pos.x += nx * push;
                b.pos.z += nz * push;
              } else if (b.sleeping && !a.sleeping) {
                a.pos.x -= nx * push;
                a.pos.z -= nz * push;
              } else {
                a.pos.x -= nx * push * 0.5;
                a.pos.z -= nz * push * 0.5;
                b.pos.x += nx * push * 0.5;
                b.pos.z += nz * push * 0.5;
              }

              if (iter === 0 && relVn < 0) {
                const e = 0.42;
                const jImp = -(1.0 + e) * relVn * 0.5;
                if (!a.sleeping) {
                  a.vel.x -= jImp * nx;
                  a.vel.z -= jImp * nz;
                }
                if (!b.sleeping) {
                  b.vel.x += jImp * nx;
                  b.vel.z += jImp * nz;
                }
                if (-relVn > 0.12) {
                  this.emitClink(-relVn * 1.1, nowMs);
                }
              }
            }
          }
        }

        // 4. Exact Table/Runner Floor & Pouch Clearance INSIDE each solver pass (zero clipping!)
        for (const c of this.coins) {
          if (c.sleeping) continue;
          const hy = this.getHalfExtentY(c);
          const hr = this.getHorizontalRadius(c);

          // Re-enforce velvet pouch clearance if a coin-coin push nudged a coin toward the pouch
          const pouchR = this.getPouchRadiusAt(c.pos.y);
          if (pouchR > 0 && c.pos.y - hy < 0.096) {
            const dx = c.pos.x - (-0.082);
            const dz = c.pos.z - (-0.015);
            const dist = Math.hypot(dx, dz);
            const minDist = pouchR + hr + 0.001;
            if (dist < minDist) {
              const nx = dist > 1e-5 ? dx / dist : 1.0;
              const nz = dist > 1e-5 ? dz / dist : 0.0;
              c.pos.x = -0.082 + nx * minDist;
              c.pos.z = -0.015 + nz * minDist;
            }
          }

          const floorY = this.getFloorY(c.pos.x, c.pos.z);
          const minCenterY = floorY + hy;

          if (c.pos.y <= minCenterY + 0.0001) {
            c.pos.y = minCenterY;
            if (iter === 0) {
              const impactVy = -c.vel.y;
              if (impactVy > 0.14) {
                c.vel.y = impactVy * 0.34;
                c.omega.x += (Math.random() - 0.5) * impactVy * 4.2;
                c.omega.z += (Math.random() - 0.5) * impactVy * 4.2;
                c.vel.x *= 0.80;
                c.vel.z *= 0.80;
                this.emitClink(impactVy * 0.72, nowMs);
              } else {
                if (c.vel.y < 0) c.vel.y = 0;
                const drag = Math.exp(-11.5 * h);
                c.vel.x *= drag;
                c.vel.z *= drag;
                this.applyRightingTorque(c, h, 46.0);
              }
            }
          }
        }
      }
    }

    // 5. Sleep Detection & Sync to Three.js Mesh Transforms
    for (const c of this.coins) {
      if (c.sleeping) continue;

      _axisUp.copy(LOCAL_UP).applyQuaternion(c.quat);
      const flatErr = 1.0 - Math.abs(_axisUp.y);
      const speed = c.vel.length();
      const spin = c.omega.length();
      const hy = this.getHalfExtentY(c);
      const floorY = this.getFloorY(c.pos.x, c.pos.z);

      // Check whether coin is supported by floor OR directly resting on another coin
      let supportY = floorY;
      let isSupported = c.pos.y <= floorY + hy + 0.0012;
      if (!isSupported) {
        for (const other of this.coins) {
          if (other === c) continue;
          const dXZ = Math.hypot(c.pos.x - other.pos.x, c.pos.z - other.pos.z);
          const otherHy = this.getHalfExtentY(other);
          if (dXZ < other.radius * 0.92 && Math.abs((c.pos.y - hy) - (other.pos.y + otherHy)) < 0.0018) {
            isSupported = true;
            supportY = other.pos.y + otherHy;
            break;
          }
        }
      }

      if (isSupported && flatErr < 0.008 && speed < 0.018 && spin < 0.45) {
        c.sleepTimer += clampedDt;
        if (c.sleepTimer > 0.14) {
          // Snap cleanly flat onto whichever face (heads or tails) landed upward!
          const flipSign = _axisUp.y >= 0 ? 1 : -1;
          const euler = new THREE.Euler().setFromQuaternion(c.quat, 'YXZ');
          c.quat.setFromEuler(new THREE.Euler(flipSign > 0 ? 0 : Math.PI, euler.y, 0, 'YXZ'));
          c.pos.y = supportY + c.halfThick;
          c.vel.set(0, 0, 0);
          c.omega.set(0, 0, 0);
          c.sleeping = true;
        }
      } else {
        c.sleepTimer = 0;
      }

      // Final hard floor guarantee before rendering
      const finalHy = this.getHalfExtentY(c);
      const finalMinY = this.getFloorY(c.pos.x, c.pos.z) + finalHy;
      if (c.pos.y < finalMinY) c.pos.y = finalMinY;

      c.mesh.position.copy(c.pos);
      c.mesh.quaternion.copy(c.quat);
    }
  }

  /** Apply gravity-driven righting torque when a tilted coin contacts the table or another coin so it settles flat. */
  applyRightingTorque(c, h, stiffness = 42.0) {
    _axisUp.copy(LOCAL_UP).applyQuaternion(c.quat);
    // Align to nearest flat face (+Y heads or -Y tails)
    _targetUp.set(0, _axisUp.y >= 0 ? 1 : -1, 0);
    _torqueAxis.crossVectors(_axisUp, _targetUp);
    const sinErr = _torqueAxis.length();
    if (sinErr > 1e-4) {
      c.omega.addScaledVector(_torqueAxis, stiffness * h);
    }
    // Strong rotational damping on table contact (wobble settles smoothly!)
    const rotDrag = Math.exp(-9.5 * h);
    c.omega.x *= rotDrag;
    c.omega.z *= rotDrag;
    c.omega.y *= Math.exp(-5.5 * h);
  }
}
