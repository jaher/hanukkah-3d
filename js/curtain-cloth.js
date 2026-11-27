/**
 * Live Real-Fabric Velvet Curtain Simulation (Three.js)
 *
 * Interactive window curtains that toggle between:
 *  - Tied back to the side (gathered tightly at waist with braided gold tieback cord,
 *    graceful hourglass swag, deep accordion pleats, and bunched silver rod rings)
 *  - Drawn closed across the window (tieback cord unhooks and drops to hang from the
 *    outer wall hook, silver rings glide smoothly across the rod to the window center,
 *    pleats unfurl naturally, and heavy velvet billows & settles with real fabric lag).
 */

import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class VelvetCurtainPanel {
  /**
   * @param {THREE.Object3D} parent
   * @param {{
   *   side: -1 | 1,
   *   fabricMat: THREE.Material,
   *   tieMat: THREE.Material,
   *   ringMat: THREE.Material,
   * }} opts
   */
  constructor(parent, { side, fabricMat, tieMat, ringMat }) {
    this.side = side; // -1 = left panel, +1 = right panel
    this.label = side < 0 ? 'Left Curtain' : 'Right Curtain';

    // Exact room geometry coordinates matching build_room_table.py (Blender Y_WIN=2.20 -> Three Z=-2.20)
    this.yBot = 0.014;
    this.yTop = 2.610;
    this.height = this.yTop - this.yBot;
    this.zBase = -2.055; // -(Y_WIN - 0.145)
    this.zRod = -2.045;  // -(Y_WIN - 0.155)
    this.yRod = 2.620;
    this.tieVt = 0.36;
    this.yTie = this.yBot + this.tieVt * this.height; // ~0.948 m

    // Horizontal extents: outer edge stays anchored near rod finial (1.49 m, clear of sconces at ±1.71 m)
    this.xOuter = side * 1.49;
    this.xInnerOpen = side * 1.03;    // 0.46 m gathered width when tied back
    this.xInnerClosed = -side * 0.012; // 1.50 m drawn width (slight 1.2 cm center overlap when both closed)

    // Grid resolution (39 x 35 = 1,365 vertices -> smooth velvet folds at 60 FPS)
    this.nx = 38;
    this.ny = 34;
    this.cols = this.nx + 1;
    this.rows = this.ny + 1;
    this.count = this.cols * this.rows;

    // Interactive state: false = tied back (open), true = drawn closed across window
    this.isClosed = false;
    this.drawBlend = 0.0; // 0 = gathered at side, 1 = extended across window
    this.tieBlend = 1.0;  // 1 = tied & cinched, 0 = untied & hanging loose
    this.prevDrawBlend = 0.0;
    this.prevTieBlend = 1.0;
    this.rippleImpulse = 0.0;
    this.phaseSeed = side < 0 ? 0.0 : 2.35;

    // Per-vertex spring-damper cloth state for real fabric momentum, hem lag, and billowing folds
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.target = new Float32Array(this.count * 3);
    this.tmpSmooth = new Float32Array(this.count * 3);

    this.group = new THREE.Group();
    this.group.name = side < 0 ? 'LiveCurtain_Left' : 'LiveCurtain_Right';

    // 1. Velvet fabric mesh
    this.geometry = this._buildFabricGeometry();
    this.fabricMesh = new THREE.Mesh(this.geometry, fabricMat);
    this.fabricMesh.name = side < 0 ? 'LiveCurtain_Left_Fabric' : 'LiveCurtain_Right_Fabric';
    this.fabricMesh.castShadow = true;
    this.fabricMesh.receiveShadow = true;
    this.group.add(this.fabricMesh);

    // 2. Nine brushed-silver curtain rings that slide physically along the curtain rod
    this.rings = [];
    this.ringCount = 9;
    const ringGeo = new THREE.TorusGeometry(0.022, 0.0038, 10, 20);
    ringGeo.rotateY(Math.PI * 0.5); // orient ring around X-axis rod
    for (let k = 0; k < this.ringCount; k++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.castShadow = true;
      ring.receiveShadow = true;
      ring.position.set(this.xOuter, this.yRod, this.zRod);
      this.rings.push(ring);
      this.group.add(ring);
    }

    // 3. Outer wall tieback rosette/hook (anchored cleanly to wall trim beside window)
    this.hookPos = new THREE.Vector3(this.side * 1.495, this.yTie + 0.015, -2.175);
    const hookMesh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), ringMat);
    hookMesh.scale.set(1.0, 1.0, 0.65);
    hookMesh.position.copy(this.hookPos);
    hookMesh.castShadow = true;
    this.group.add(hookMesh);

    // 4. Live animated braided gold tieback cord (wraps waist when tied, drops in a natural U-loop when untied!)
    this.tieSegs = 22;
    this.tieRadSegs = 8;
    this.tieRadius = 0.0092;
    this.tieGeo = this._buildTiebackTubeGeometry();
    this.tieMesh = new THREE.Mesh(this.tieGeo, tieMat);
    this.tieMesh.name = side < 0 ? 'LiveCurtain_Left_Tieback' : 'LiveCurtain_Right_Tieback';
    this.tieMesh.castShadow = true;
    this.tieMesh.receiveShadow = true;
    this.group.add(this.tieMesh);

    // Initialize directly into exact settled open/tied-back pose
    this._computeTargetPose(0.0);
    this.pos.set(this.target);
    this._syncFabricGeometry();
    this._syncRings();
    this._syncTiebackCord(0.0);

    parent.add(this.group);
  }

  _buildFabricGeometry() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const uvs = new Float32Array(this.count * 2);
    const uRep = 2.8;
    const vRep = 8.2;

    for (let j = 0; j < this.rows; j++) {
      const vt = j / this.ny;
      for (let i = 0; i < this.cols; i++) {
        const ut = i / this.nx;
        const idx = j * this.cols + i;
        uvs[idx * 2] = ut * uRep;
        uvs[idx * 2 + 1] = vt * vRep;
      }
    }

    const indices = [];
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const a = j * this.cols + i;
        const b = a + 1;
        const c = a + this.cols;
        const d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  _buildTiebackTubeGeometry() {
    const segs = this.tieSegs;
    const rSegs = this.tieRadSegs;
    const vertCount = (segs + 1) * (rSegs + 1);
    const positions = new Float32Array(vertCount * 3);
    const indices = [];
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < rSegs; j++) {
        const a = i * (rSegs + 1) + j;
        const b = (i + 1) * (rSegs + 1) + j;
        const c = (i + 1) * (rSegs + 1) + (j + 1);
        const d = i * (rSegs + 1) + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }

  /** Toggle between tied-back (open) and closed across window. */
  toggle() {
    this.isClosed = !this.isClosed;
    this.rippleImpulse = 1.0;
    // Give the fabric an immediate subtle physical tug impulse along the direction of motion!
    const dirX = this.isClosed ? -this.side : this.side;
    for (let j = 0; j < this.rows; j++) {
      const vt = j / this.ny;
      const midWeight = Math.sin(vt * Math.PI);
      const lowWeight = 1.0 - vt;
      for (let i = 0; i < this.cols; i++) {
        const idx3 = (j * this.cols + i) * 3;
        this.vel[idx3] += dirX * (0.22 * midWeight + 0.08 * lowWeight);
        this.vel[idx3 + 2] += (this.isClosed ? 0.34 : -0.18) * midWeight;
      }
    }
    return this.isClosed;
  }

  setClosed(closed, instant = false) {
    this.isClosed = Boolean(closed);
    if (instant) {
      this.drawBlend = this.isClosed ? 1.0 : 0.0;
      this.tieBlend = this.isClosed ? 0.0 : 1.0;
      this.prevDrawBlend = this.drawBlend;
      this.prevTieBlend = this.tieBlend;
      this.vel.fill(0);
      this._computeTargetPose(0.0);
      this.pos.set(this.target);
      this._syncFabricGeometry();
      this._syncRings();
      this._syncTiebackCord(0.0);
    }
  }

  /**
   * Compute physically-grounded target fabric surface for current (drawBlend, tieBlend).
   * ut = 0 is the OUTER fixed edge (near finial), ut = 1 is the INNER leading edge (moves to center).
   */
  _computeTargetPose(elapsed) {
    const draw = smoothstep(0.0, 1.0, this.drawBlend);
    const tie = smoothstep(0.0, 1.0, this.tieBlend);
    const s = this.side;

    // Header edge endpoints along rod
    const xOuter = this.xOuter;
    const xInnerHeader = this.xInnerOpen + (this.xInnerClosed - this.xInnerOpen) * draw;
    const headerSpan = Math.abs(xInnerHeader - xOuter); // 0.46 m open -> 1.50 m closed

    // Real drapery arc-length conservation: deep narrow pleats when bunched, softer wider pleats when drawn closed!
    const pleatDepthBase = 0.050 * (1.0 - 0.56 * draw); // 5.0 cm deep open -> 2.2 cm soft folds closed
    const swaySpeed = (this.drawBlend - this.prevDrawBlend) * 28.0; // signed glide velocity for dynamic wave

    for (let j = 0; j < this.rows; j++) {
      const vt = j / this.ny; // 0 = floor hem, 1 = top rod header
      const invVt = 1.0 - vt;

      // Graceful hourglass waist cinch centered at tieVt (only active while tie > 0!)
      const dyTie = (vt - this.tieVt) / 0.165;
      const cinchEnv = Math.exp(-dyTie * dyTie) * tie;
      // Soft swooped catenary gather above the tieback (upper inner edge curves gracefully outward to waist)
      const upperSwag = vt > this.tieVt
        ? Math.sin(((vt - this.tieVt) / (1.0 - this.tieVt)) * Math.PI) * tie
        : 0.0;
      // Gentle floor-kissing fullness at the bottom hem
      const floorFlare = 0.095 * Math.exp(-Math.pow(vt / 0.14, 2)) * (0.45 + 0.55 * tie);
      const topPinch = Math.exp(-Math.pow(invVt / 0.08, 2));

      // Local horizontal span narrows strongly at cinched waist and flares gently at bottom hem
      const localSpan = headerSpan * (1.0 - 0.42 * cinchEnv + floorFlare - 0.04 * topPinch);

      // Outer edge pulls slightly toward wall hook at tieback; inner edge sweeps gracefully toward outer wall!
      const outerPull = -s * 0.015 * (1.0 - cinchEnv);
      const xStart = xOuter + outerPull;
      // Moving inward from xOuter is direction (-s)
      const inwardDir = -s;

      // Natural vertical gravity sag in the upper gathered swag above the tieback cord
      const baseY = this.yBot + vt * this.height;

      for (let i = 0; i < this.cols; i++) {
        const ut = i / this.nx; // 0 = outer edge, 1 = inner leading edge
        const idx3 = (j * this.cols + i) * 3;

        // Multi-harmonic organic drapery pleats (7 primary pleats + secondary folds + micro fabric crinkle)
        const wavePhase = ut * Math.PI * 13.0; // ~6.5 deep full S-folds across panel
        const primary = Math.sin(wavePhase + 0.22 * Math.sin(vt * Math.PI * 2.0));
        const secondary = 0.26 * Math.sin(ut * Math.PI * 25.0 - vt * 2.4 + s * 0.8);
        const micro = 0.07 * Math.cos(ut * Math.PI * 37.0 + vt * 5.0) * (1.0 - 0.65 * topPinch);
        const edgeCurl = 0.012 * (Math.exp(-ut / 0.05) + Math.exp(-(1.0 - ut) / 0.05));

        const pleatAmp = pleatDepthBase * (0.72 + 0.32 * invVt + 0.20 * cinchEnv);
        const pleatZ = pleatAmp * (primary + secondary + micro) + edgeCurl;

        // Subtle accordion horizontal gather in troughs
        const xGather = inwardDir * 0.008 * Math.cos(wavePhase) * (0.35 + 0.65 * (1.0 - draw) + 0.4 * cinchEnv);

        // Waist cinch pulls the inner half strongly toward the outer wall tieback point!
        const cinchShift = -inwardDir * (0.068 * cinchEnv * Math.pow(ut, 0.85));

        // Subtle live air-draft breathing along the lower hem
        const breeze = Math.sin(elapsed * 1.15 + this.phaseSeed + ut * 4.2 + vt * 1.8) * 0.0045 * invVt;

        // Slight outward (+Z) billow while fabric is actively sweeping or un-cinching
        const motionBillow = Math.abs(swaySpeed) * 0.045 * Math.sin(vt * Math.PI) * (0.4 + 0.6 * ut);

        const tx = xStart + inwardDir * (ut * localSpan) + xGather + cinchShift;
        // Upper swag droops gently downward near the inner gathered edge when tied back
        const swagDrop = -0.042 * upperSwag * ut * ut;
        const ty = baseY + swagDrop;
        // Pull fabric slightly toward the room (+Z) at waist & floor flare, staying cleanly proud of window trim (-2.197)
        const tz = this.zBase + pleatZ + 0.022 * cinchEnv + 0.012 * floorFlare + breeze + motionBillow;

        this.target[idx3] = tx;
        this.target[idx3 + 1] = ty;
        this.target[idx3 + 2] = Math.max(-2.165, tz);
      }
    }
  }

  _syncFabricGeometry() {
    const posAttr = this.geometry.attributes.position;
    posAttr.array.set(this.pos);
    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  _syncRings() {
    const draw = smoothstep(0.0, 1.0, this.drawBlend);
    const xOuter = this.xOuter;
    const xInner = this.xInnerOpen + (this.xInnerClosed - this.xInnerOpen) * draw;
    for (let k = 0; k < this.ringCount; k++) {
      const f = k / (this.ringCount - 1);
      // Keep rings inset 2 cm from edges so they sit squarely on top pleat crests
      const rx = xOuter + (xInner - xOuter) * (0.04 + 0.92 * f);
      this.rings[k].position.set(rx, this.yRod, this.zRod);
    }
  }

  _syncTiebackCord(elapsed) {
    const tie = smoothstep(0.0, 1.0, this.tieBlend);
    const s = this.side;

    // Sample actual live waist row (jTie) of the fabric so the cord hugs the REAL moving cloth!
    const jTie = Math.round(this.tieVt * this.ny);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < this.cols; i++) {
      const idx3 = (jTie * this.cols + i) * 3;
      const x = this.pos[idx3];
      const z = this.pos[idx3 + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }

    const waistCenterX = 0.5 * (minX + maxX);
    const waistHalfW = Math.max(0.11, 0.5 * (maxX - minX) + 0.016);
    const frontZ = Math.max(this.zBase + 0.068, maxZ + 0.015);
    const backZ = this.hookPos.z;

    // Build centerline points blending smoothly between:
    //   tie = 1: wrapped snugly around gathered fabric waist from hook -> front -> inner edge -> back -> hook
    //   tie = 0: dangling naturally downward in a gravity catenary U-loop from the outer wall hook!
    const segs = this.tieSegs;
    const pts = [];
    const sway = Math.sin(elapsed * 2.1 + this.phaseSeed) * 0.006 * (1.0 - tie + 0.35 * this.rippleImpulse);

    for (let k = 0; k <= segs; k++) {
      const u = k / segs; // 0 -> 1 along cord loop starting & ending at wall hook

      // Tied pose: smooth 3D wrap around the cinched fabric bundle
      // u=0: wall hook, u=0.5: inner edge of gathered curtain, u=1: wall hook
      const wrapAng = u * Math.PI; // 0 (outer) -> pi/2 (front) -> pi (inner) -> back via bulge
      // Parametric wrap: front half (0..0.55) bows forward around frontZ, back half (0.55..1.0) returns behind cloth to hook
      let tiedX, tiedY, tiedZ;
      if (u <= 0.55) {
        const f = u / 0.55; // 0 = outer hook -> 1 = inner edge
        const a = f * Math.PI;
        const innerEdgeX = s < 0 ? maxX + 0.016 : minX - 0.016;
        tiedX = this.hookPos.x + (innerEdgeX - this.hookPos.x) * (0.5 - 0.5 * Math.cos(a));
        tiedZ = backZ + (frontZ - backZ) * Math.sin(a * 0.85);
        // Gentle graceful dip across the front of the velvet waist
        tiedY = this.yTie - 0.022 * Math.sin(a) + 0.012 * (1.0 - f);
      } else {
        const f = (u - 0.55) / 0.45; // 0 = inner edge -> 1 = back to outer hook
        const innerEdgeX = s < 0 ? maxX + 0.016 : minX - 0.016;
        tiedX = innerEdgeX + (this.hookPos.x - innerEdgeX) * f;
        tiedZ = backZ + (frontZ - backZ) * 0.35 * (1.0 - f) * Math.sin((1.0 - f) * Math.PI * 0.5);
        tiedY = this.yTie + 0.015 * f;
      }

      // Untied / hanging pose: gravity-draped U-loop hanging freely down from outer wall hook!
      const hangArc = Math.sin(u * Math.PI);
      const hangX = this.hookPos.x - s * (0.028 * Math.sin(u * Math.PI * 2.0) * 0.5 + 0.014 * hangArc) + sway * hangArc;
      const hangY = this.hookPos.y - 0.28 * Math.pow(hangArc, 1.15);
      const hangZ = this.hookPos.z + 0.028 * hangArc;

      // Blend with a gentle outward swing arc during mid-transition so the cord visually loops up & around!
      const midSwing = Math.sin(tie * Math.PI) * Math.sin(u * Math.PI);
      const px = hangX + (tiedX - hangX) * tie;
      const py = hangY + (tiedY - hangY) * tie - 0.04 * midSwing;
      const pz = hangZ + (tiedZ - hangZ) * tie + 0.065 * midSwing;
      pts.push(new THREE.Vector3(px, py, pz));
    }

    // Rebuild tube vertices around centerline using parallel transport frames
    const posAttr = this.tieGeo.attributes.position;
    const arr = posAttr.array;
    const rSegs = this.tieRadSegs;
    const r = this.tieRadius;
    const tan = new THREE.Vector3();
    const norm = new THREE.Vector3();
    const binorm = new THREE.Vector3();
    const refUp = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segs; i++) {
      const p = pts[i];
      if (i === 0) tan.subVectors(pts[1], pts[0]);
      else if (i === segs) tan.subVectors(pts[segs], pts[segs - 1]);
      else tan.subVectors(pts[i + 1], pts[i - 1]);
      if (tan.lengthSq() < 1e-10) tan.set(0, -1, 0);
      else tan.normalize();

      if (Math.abs(tan.dot(refUp)) > 0.95) {
        norm.crossVectors(tan, new THREE.Vector3(0, 0, 1)).normalize();
      } else {
        norm.crossVectors(tan, refUp).normalize();
      }
      binorm.crossVectors(tan, norm).normalize();

      for (let j = 0; j <= rSegs; j++) {
        const ang = (j / rSegs) * Math.PI * 2.0;
        const ca = Math.cos(ang) * r;
        const sa = Math.sin(ang) * r;
        const vIdx = (i * (rSegs + 1) + j) * 3;
        arr[vIdx] = p.x + norm.x * ca + binorm.x * sa;
        arr[vIdx + 1] = p.y + norm.y * ca + binorm.y * sa;
        arr[vIdx + 2] = p.z + norm.z * ca + binorm.z * sa;
      }
    }
    posAttr.needsUpdate = true;
    this.tieGeo.computeVertexNormals();
  }

  /** Advance real-time curtain ring glide, tieback cinch/release, and spring-damper velvet cloth physics! */
  update(dt, elapsed) {
    const step = Math.min(Math.max(dt, 0.001), 0.04);
    this.prevDrawBlend = this.drawBlend;
    this.prevTieBlend = this.tieBlend;

    // Choreographed two-stage physical motion:
    //  Closing: untie cord first -> rings glide across rod to center
    //  Opening: rings gather back to side -> tieback cord wraps up and cinches waist!
    if (this.isClosed) {
      this.tieBlend = Math.max(0.0, this.tieBlend - step * 1.75);
      if (this.tieBlend < 0.78) {
        this.drawBlend = Math.min(1.0, this.drawBlend + step * 0.88);
      }
    } else {
      this.drawBlend = Math.max(0.0, this.drawBlend - step * 0.88);
      if (this.drawBlend < 0.44) {
        this.tieBlend = Math.min(1.0, this.tieBlend + step * 1.45);
      }
    }

    this.rippleImpulse = Math.max(0.0, this.rippleImpulse - step * 0.7);

    // 1. Update desired target draped surface
    this._computeTargetPose(elapsed);

    // 2. Integrate per-vertex spring-damper cloth dynamics (stiffer near rings, heavy trailing inertia at hem!)
    const subSteps = 2;
    const h = step / subSteps;
    for (let s = 0; s < subSteps; s++) {
      for (let j = 0; j < this.rows; j++) {
        const vt = j / this.ny;
        // Top row pinned directly to rod rings; lower rows lag & sway organically like heavy lined velvet!
        if (j === this.rows - 1) {
          for (let i = 0; i < this.cols; i++) {
            const k3 = (j * this.cols + i) * 3;
            this.pos[k3] = this.target[k3];
            this.pos[k3 + 1] = this.target[k3 + 1];
            this.pos[k3 + 2] = this.target[k3 + 2];
            this.vel[k3] = this.vel[k3 + 1] = this.vel[k3 + 2] = 0.0;
          }
          continue;
        }

        // Stiffness tapers smoothly from top header down to floor hem -> natural diagonal trailing sweep!
        const kSpring = 22.0 + 95.0 * vt * vt;
        const damping = 5.4 + 4.8 * vt;

        for (let i = 0; i < this.cols; i++) {
          const k3 = (j * this.cols + i) * 3;
          const dx = this.target[k3] - this.pos[k3];
          const dy = this.target[k3 + 1] - this.pos[k3 + 1];
          const dz = this.target[k3 + 2] - this.pos[k3 + 2];

          let vx = this.vel[k3] + (dx * kSpring - this.vel[k3] * damping) * h;
          let vy = this.vel[k3 + 1] + (dy * kSpring - this.vel[k3 + 1] * damping) * h;
          let vz = this.vel[k3 + 2] + (dz * kSpring - this.vel[k3 + 2] * damping) * h;

          // Subtle fabric ripple impulse wave when touched
          if (this.rippleImpulse > 0.01) {
            const ut = i / this.nx;
            const wave = Math.sin(elapsed * 9.5 - vt * 8.0 + ut * 6.0) * 0.45 * this.rippleImpulse * (1.0 - vt);
            vz += wave * h;
          }

          this.vel[k3] = vx;
          this.vel[k3 + 1] = vy;
          this.vel[k3 + 2] = vz;

          this.pos[k3] += vx * h;
          this.pos[k3 + 1] += vy * h;
          this.pos[k3 + 2] = Math.max(-2.172, this.pos[k3 + 2] + vz * h);
        }
      }

      // Light vertical neighbor coupling pass so folds travel smoothly downward without kinks
      this.tmpSmooth.set(this.pos);
      for (let j = 1; j < this.rows - 1; j++) {
        for (let i = 0; i < this.cols; i++) {
          const k3 = (j * this.cols + i) * 3;
          const up3 = ((j + 1) * this.cols + i) * 3;
          const dn3 = ((j - 1) * this.cols + i) * 3;
          this.pos[k3] = this.tmpSmooth[k3] * 0.84 + (this.tmpSmooth[up3] + this.tmpSmooth[dn3]) * 0.08;
          this.pos[k3 + 2] = this.tmpSmooth[k3 + 2] * 0.86 + (this.tmpSmooth[up3 + 2] + this.tmpSmooth[dn3 + 2]) * 0.07;
        }
      }
    }

    this._syncFabricGeometry();
    this._syncRings();
    this._syncTiebackCord(elapsed);
  }

  /** Closure factor in [0..1] (0 = open/tied back, 1 = fully drawn across window). */
  getClosureFactor() {
    return smoothstep(0.0, 1.0, this.drawBlend);
  }
}
