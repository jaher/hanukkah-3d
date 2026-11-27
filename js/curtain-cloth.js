/**
 * Live Real-Fabric Velvet Curtain Simulation (Three.js)
 *
 * Interactive window curtains that toggle between:
 *  - Tied back to the side (fabric gathered tightly toward the outer side into a
 *    graceful hourglass waist, hugged cleanly along the gathered fold by a braided
 *    gold tieback rope that ties neatly with a side knot & tassels at the outer tie point)
 *  - Drawn closed across the window (tieback rope releases cleanly to hang at the
 *    outer side wall hook before the 9 silver rings glide smoothly across the rod,
 *    unfurling the pleats with real fabric inertia and trailing hem lag).
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
    this.tieVt = 0.37;
    this.yTie = this.yBot + this.tieVt * this.height; // ~0.975 m

    // Horizontal extents: outer edge stays anchored near rod finial (1.49 m, clear of sconces at ±1.71 m)
    this.xOuter = side * 1.49;
    this.xInnerOpen = side * 1.03;     // 0.46 m gathered header width when tied back
    this.xInnerClosed = -side * 0.024; // 1.51 m drawn width (seamless 2.4 cm center overlap top-to-bottom)

    // Grid resolution (39 x 35 = 1,365 vertices -> smooth velvet folds at 60 FPS)
    this.nx = 38;
    this.ny = 34;
    this.cols = this.nx + 1;
    this.rows = this.ny + 1;
    this.count = this.cols * this.rows;

    // Interactive state: false = tied back (open), true = drawn closed across window
    this.isClosed = false;
    this.drawBlend = 0.0; // 0 = gathered at side, 1 = extended across window
    this.tieBlend = 1.0;  // 1 = tied & cinched at side, 0 = untied & hanging at outer hook
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
    ringGeo.rotateY(Math.PI * 0.5);
    for (let k = 0; k < this.ringCount; k++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.castShadow = true;
      ring.receiveShadow = true;
      ring.position.set(this.xOuter, this.yRod, this.zRod);
      this.rings.push(ring);
      this.group.add(ring);
    }

    // 3. Outer wall tieback rosette/hook (sits right beside the outer edge of the curtain on the wall)
    this.hookPos = new THREE.Vector3(this.side * 1.505, this.yTie + 0.032, -2.168);
    const hookMesh = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), ringMat);
    hookMesh.scale.set(1.0, 1.0, 0.65);
    hookMesh.position.copy(this.hookPos);
    hookMesh.castShadow = true;
    this.group.add(hookMesh);

    // 4. Live animated braided gold tieback rope (follows gathered fold tightly & never crosses curtain face!)
    this.tieSegs = 28;
    this.tieRadSegs = 8;
    this.tieRadius = 0.0082;
    this.tieGeo = this._buildTiebackTubeGeometry();
    this.tieMesh = new THREE.Mesh(this.tieGeo, tieMat);
    this.tieMesh.name = side < 0 ? 'LiveCurtain_Left_Tieback' : 'LiveCurtain_Right_Tieback';
    this.tieMesh.castShadow = true;
    this.tieMesh.receiveShadow = true;
    this.group.add(this.tieMesh);

    // 5. Sculpted side tie knot + twin braided gold tassels sitting cleanly in front of the outer side tie point!
    this.knotGroup = this._buildSideKnotAndTassels(tieMat);
    this.group.add(this.knotGroup);

    // Initialize directly into settled open/tied-back pose
    this._computeTargetPose(0.0);
    this.pos.set(this.target);
    this._syncFabricGeometry();
    this._syncRings();
    this._syncTiebackCord(0.0);

    parent.add(this.group);
  }

  _buildSideKnotAndTassels(tieMat) {
    const grp = new THREE.Group();
    grp.name = this.side < 0 ? 'LiveCurtain_Left_TieKnot' : 'LiveCurtain_Right_TieKnot';

    // Neat braided central tie knot sitting cleanly in front of the outer tie point
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 12), tieMat);
    knot.scale.set(1.15, 0.92, 0.95);
    knot.castShadow = true;
    grp.add(knot);

    // Small collar ring wrapping the knot
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0042, 8, 16), tieMat);
    collar.rotation.y = Math.PI * 0.5;
    collar.castShadow = true;
    grp.add(collar);

    // Twin drooping braided tassels hanging naturally downward from the side knot
    this.tassels = [];
    for (const [tx, len, flare] of [
      [-0.009, 0.085, -0.10],
      [0.010, 0.102, 0.11],
    ]) {
      const tPivot = new THREE.Group();
      tPivot.position.set(tx, -0.008, 0.004);
      tPivot.rotation.z = flare;

      // Short braided drop cord
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, len * 0.48, 8), tieMat);
      cord.position.y = -len * 0.24;
      cord.castShadow = true;
      tPivot.add(cord);

      // Decorative tassel bead
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), tieMat);
      bead.position.y = -len * 0.50;
      bead.castShadow = true;
      tPivot.add(bead);

      // Flared fringed tassel skirt
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0135, len * 0.46, 12), tieMat);
      skirt.position.y = -len * 0.76;
      skirt.castShadow = true;
      tPivot.add(skirt);

      grp.add(tPivot);
      this.tassels.push({ pivot: tPivot, baseFlare: flare });
    }
    return grp;
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
    const dirX = this.isClosed ? -this.side : this.side;
    for (let j = 0; j < this.rows; j++) {
      const vt = j / this.ny;
      const midWeight = Math.sin(vt * Math.PI);
      const lowWeight = 1.0 - vt;
      for (let i = 0; i < this.cols; i++) {
        const idx3 = (j * this.cols + i) * 3;
        this.vel[idx3] += dirX * (0.20 * midWeight + 0.08 * lowWeight);
        this.vel[idx3 + 2] += (this.isClosed ? 0.30 : -0.16) * midWeight;
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

    const xOuter = this.xOuter;
    const xInnerHeader = this.xInnerOpen + (this.xInnerClosed - this.xInnerOpen) * draw;
    const headerSpan = Math.abs(xInnerHeader - xOuter); // 0.46 m open -> 1.50 m closed

    // Deep pleats when gathered, softer wider folds when drawn across window
    const pleatDepthBase = 0.048 * (1.0 - 0.54 * draw);
    const swaySpeed = (this.drawBlend - this.prevDrawBlend) * 28.0;

    for (let j = 0; j < this.rows; j++) {
      const vt = j / this.ny; // 0 = floor hem, 1 = top rod header
      const invVt = 1.0 - vt;

      // Tight side-gathered hourglass waist centered at tieVt!
      const dyTie = (vt - this.tieVt) / 0.175;
      const cinchEnv = Math.exp(-dyTie * dyTie) * tie;
      // Soft blouson fullness right ABOVE the tieback where gathered velvet puffs slightly over the rope!
      const blousonEnv = Math.exp(-Math.pow((vt - (this.tieVt + 0.095)) / 0.095, 2)) * tie;
      // Graceful curved swag above tieback
      const upperSwag = vt > this.tieVt
        ? Math.sin(((vt - this.tieVt) / (1.0 - this.tieVt)) * Math.PI) * tie
        : 0.0;
      // Floor-kissing fullness at bottom hem
      const floorFlare = 0.11 * Math.exp(-Math.pow(vt / 0.16, 2)) * (0.40 + 0.60 * tie);
      const topPinch = Math.exp(-Math.pow(invVt / 0.08, 2));

      // Strong waist gather toward outer side: compresses width by 56% right at the tieback!
      const localSpan = headerSpan * (1.0 - 0.56 * cinchEnv + floorFlare - 0.04 * topPinch * (1.0 - draw));

      // Outer edge hugs the outer side tieback anchor cleanly
      const xStart = xOuter - s * 0.008 * (1.0 - cinchEnv);
      const inwardDir = -s;
      const baseY = this.yBot + vt * this.height;

      for (let i = 0; i < this.cols; i++) {
        const ut = i / this.nx; // 0 = outer edge, 1 = inner leading edge
        const idx3 = (j * this.cols + i) * 3;

        // Multi-harmonic organic drapery pleats
        const wavePhase = ut * Math.PI * 13.0;
        const primary = Math.sin(wavePhase + 0.20 * Math.sin(vt * Math.PI * 2.0));
        const secondary = 0.25 * Math.sin(ut * Math.PI * 25.0 - vt * 2.4 + s * 0.8);
        const micro = 0.06 * Math.cos(ut * Math.PI * 37.0 + vt * 5.0) * (1.0 - 0.65 * topPinch);
        const edgeCurl = 0.011 * (Math.exp(-ut / 0.05) + Math.exp(-(1.0 - ut) / 0.05));

        // Squeeze pleats THINNER right under the tieback rope, with lush blouson puffiness just above it!
        const pleatAmp = pleatDepthBase * (0.72 + 0.30 * invVt) * (1.0 - 0.44 * cinchEnv + 0.22 * blousonEnv);
        const pleatZ = pleatAmp * (primary + secondary + micro) + edgeCurl;

        // Round the gathered bundle into a realistic soft cylinder cross-section at the waist!
        const bundleArchZ = 0.024 * Math.sin(ut * Math.PI) * cinchEnv + 0.018 * blousonEnv * Math.sin(ut * Math.PI);

        // Accordion horizontal gather
        const xGather = inwardDir * 0.007 * Math.cos(wavePhase) * (0.35 + 0.65 * (1.0 - draw)) * (1.0 - 0.35 * cinchEnv);

        // Subtle live air-draft breathing along lower hem
        const breeze = Math.sin(elapsed * 1.15 + this.phaseSeed + ut * 4.2 + vt * 1.8) * 0.004 * invVt;
        const motionBillow = Math.abs(swaySpeed) * 0.042 * Math.sin(vt * Math.PI) * (0.4 + 0.6 * ut);

        const tx = xStart + inwardDir * (ut * localSpan) + xGather;
        // Upper swag droops naturally into the side tie cradle
        const swagDrop = -0.052 * upperSwag * ut * ut;
        const ty = baseY + swagDrop;
        // Pull cinched waist gently back toward wall tie hook so fabric tucks cleanly into the side tie!
        const tz = this.zBase + pleatZ + bundleArchZ - 0.024 * cinchEnv + 0.012 * floorFlare + breeze + motionBillow;

        this.target[idx3] = tx;
        this.target[idx3 + 1] = ty;
        this.target[idx3 + 2] = Math.max(-2.160, tz);
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
      const rx = xOuter + (xInner - xOuter) * (0.04 + 0.92 * f);
      this.rings[k].position.set(rx, this.yRod, this.zRod);
    }
  }

  /**
   * Build the braided gold tieback rope + side knot & tassels so that:
   * - When tied back: the rope hugs the exact gathered fold contour tightly around the
   *   narrow cinched waist (never sticking out past the edges, never intersecting velvet pleats,
   *   never cutting across a flat curtain face), sloping neatly toward the outer side tie point
   *   where the sculpted knot & twin tassels sit clearly in front!
   * - When untied / closed: the rope & knot hang neatly down from the outer wall hook beside
   *   the outer curtain edge — NEVER crossing over the curtain fabric!
   */
  _syncTiebackCord(elapsed) {
    const tie = smoothstep(0.0, 1.0, this.tieBlend);
    const s = this.side;
    const jTie = Math.round(this.tieVt * this.ny);

    // Measure exact live gathered waist contour (row jTie) so the rope hugs the real fabric!
    let outerX = this.pos[(jTie * this.cols + 0) * 3];
    let outerZ = this.pos[(jTie * this.cols + 0) * 3 + 2];
    let innerX = this.pos[(jTie * this.cols + this.nx) * 3];
    let innerZ = this.pos[(jTie * this.cols + this.nx) * 3 + 2];
    let maxFrontZ = -Infinity;
    let minBackZ = Infinity;
    for (let i = 0; i < this.cols; i++) {
      const k3 = (jTie * this.cols + i) * 3;
      const z = this.pos[k3 + 2];
      if (z > maxFrontZ) maxFrontZ = z;
      if (z < minBackZ) minBackZ = z;
    }

    // Side tie knot sits clearly in front of the outer side tie point (gathered side edge!)
    const tiedKnotPos = new THREE.Vector3(
      outerX + s * 0.006,
      this.yTie + 0.012,
      Math.max(outerZ, maxFrontZ) + this.tieRadius + 0.006
    );
    // Untied knot hangs neatly at the outer wall hook beside the outer curtain edge (NEVER over the curtain!)
    const sway = Math.sin(elapsed * 2.0 + this.phaseSeed) * 0.005 * (1.0 - tie + 0.35 * this.rippleImpulse);
    const untiedKnotPos = new THREE.Vector3(
      this.hookPos.x + s * 0.008 + sway,
      this.hookPos.y - 0.145,
      this.hookPos.z + 0.022
    );

    const knotPos = untiedKnotPos.clone().lerp(tiedKnotPos, tie);
    this.knotGroup.position.copy(knotPos);
    // Subtle natural pendulum sway on twin tassels
    const tasselSwing = sway * 14.0 + (this.tieBlend - this.prevTieBlend) * 1.6 * s;
    for (const t of this.tassels) {
      t.pivot.rotation.z = t.baseFlare + tasselSwing;
    }

    // Build smooth 3D rope loop:
    //   tie = 1: starts at outer side knot -> follows the gathered fold contour snugly in front of the
    //            cinched waist -> wraps tightly around the inner gathered fold edge -> returns cleanly
    //            BEHIND the fabric (minBackZ - 0.012) back to the outer wall hook & side knot!
    //   tie = 0: hangs neatly in a compact vertical loop from the outer wall hook down to the dangling side knot!
    const segs = this.tieSegs;
    const frontSegs = Math.floor(segs * 0.52);
    const pts = [];

    for (let k = 0; k <= segs; k++) {
      const u = k / segs;

      // --- 1. TIED POSE (conforms tightly to gathered fold, never crosses flat curtain face!) ---
      let tx, ty, tz;
      if (k <= frontSegs) {
        // Front half: follows the exact sampled gathered-fold vertices from outer tie knot -> inner gathered edge!
        const f = k / frontSegs; // 0 = outer knot -> 1 = inner gathered edge
        const colF = f * this.nx;
        const c0 = Math.min(this.nx, Math.floor(colF));
        const c1 = Math.min(this.nx, c0 + 1);
        const frac = colF - c0;
        const k0 = (jTie * this.cols + c0) * 3;
        const k1 = (jTie * this.cols + c1) * 3;
        const fx = this.pos[k0] + (this.pos[k1] - this.pos[k0]) * frac;
        const fz = this.pos[k0 + 2] + (this.pos[k1 + 2] - this.pos[k0 + 2]) * frac;

        // Smooth rounded front cradle hugging the gathered waist envelope (always clearly in front of pleats!)
        const archZ = Math.max(fz, this.zBase - 0.015 + (maxFrontZ - (this.zBase - 0.015)) * Math.sin(f * Math.PI * 0.88 + 0.12));
        // Slight wrap right around the inner gathered fold tip (no floating gap!)
        const edgeWrapX = fx - s * (0.006 * Math.pow(f, 3.0)) + s * (0.006 * Math.pow(1.0 - f, 3.0));
        // Graceful diagonal cradle dipping gently as it catches the inner gathered fold, rising cleanly to the side knot
        const diagDrop = -0.028 * Math.sin(f * Math.PI * 0.72);
        tx = edgeWrapX;
        ty = this.yTie + 0.012 * (1.0 - f) + diagDrop;
        tz = archZ + this.tieRadius + 0.0045;
      } else {
        // Back half: turns smoothly around the inner gathered edge and passes cleanly BEHIND the fabric to the outer hook!
        const f = (k - frontSegs) / (segs - frontSegs); // 0 = inner gathered edge -> 1 = outer tie knot/hook
        const turn = smoothstep(0.0, 0.22, f);
        const backReturn = smoothstep(0.15, 0.92, f);
        const toKnot = smoothstep(0.84, 1.0, f);

        const behindZ = Math.min(minBackZ - 0.012, this.hookPos.z + 0.006);
        const innerFrontZ = innerZ + this.tieRadius + 0.004;

        tx = (innerX - s * 0.006) + (tiedKnotPos.x - (innerX - s * 0.006)) * backReturn;
        ty = (this.yTie - 0.022) + (this.hookPos.y - (this.yTie - 0.022)) * backReturn + (tiedKnotPos.y - this.hookPos.y) * toKnot;
        tz = innerFrontZ + (behindZ - innerFrontZ) * turn + (tiedKnotPos.z - behindZ) * toKnot;
      }

      // --- 2. UNTIED / HANGING POSE (stays neatly at the outer side wall hook, NEVER crosses the curtain!) ---
      const loopAng = u * Math.PI * 2.0; // 0 & 1 = knot at bottom, 0.5 = wall hook at top
      const upFactor = 0.5 - 0.5 * Math.cos(loopAng); // 0 at knot -> 1 at wall hook -> 0 at knot
      const spread = Math.sin(loopAng) * 0.014;
      const hx = this.hookPos.x + s * (0.010 * (1.0 - upFactor)) + spread + sway * (1.0 - upFactor);
      const hy = untiedKnotPos.y + (this.hookPos.y - untiedKnotPos.y) * upFactor;
      const hz = untiedKnotPos.z + (this.hookPos.z - untiedKnotPos.z) * upFactor + 0.008 * Math.sin(upFactor * Math.PI);

      // Blend cleanly between outer hanging loop and gathered side tie!
      const px = hx + (tx - hx) * tie;
      const py = hy + (ty - hy) * tie;
      const pz = hz + (tz - hz) * tie;
      pts.push(new THREE.Vector3(px, py, pz));
    }

    // Rebuild smooth tubular cord geometry using parallel transport frames
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

    // Strict two-stage choreography so the tieback rope NEVER crosses over open/moving curtain fabric:
    //  Closing: rope unties and retracts cleanly to outer side wall hook FIRST -> then rings glide to center!
    //  Opening: rings gather velvet fully back to the side FIRST -> then rope wraps & ties neatly at the side!
    if (this.isClosed) {
      this.tieBlend = Math.max(0.0, this.tieBlend - step * 2.4);
      if (this.tieBlend < 0.15) {
        this.drawBlend = Math.min(1.0, this.drawBlend + step * 0.92);
      }
    } else {
      this.drawBlend = Math.max(0.0, this.drawBlend - step * 0.92);
      if (this.drawBlend < 0.16) {
        this.tieBlend = Math.min(1.0, this.tieBlend + step * 1.95);
      }
    }

    this.rippleImpulse = Math.max(0.0, this.rippleImpulse - step * 0.7);

    // 1. Update desired target draped surface
    this._computeTargetPose(elapsed);

    // 2. Integrate per-vertex spring-damper cloth dynamics
    const subSteps = 2;
    const h = step / subSteps;
    for (let s = 0; s < subSteps; s++) {
      for (let j = 0; j < this.rows; j++) {
        const vt = j / this.ny;
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

        const kSpring = 24.0 + 96.0 * vt * vt;
        const damping = 5.6 + 4.8 * vt;

        for (let i = 0; i < this.cols; i++) {
          const k3 = (j * this.cols + i) * 3;
          const dx = this.target[k3] - this.pos[k3];
          const dy = this.target[k3 + 1] - this.pos[k3 + 1];
          const dz = this.target[k3 + 2] - this.pos[k3 + 2];

          const vx = this.vel[k3] + (dx * kSpring - this.vel[k3] * damping) * h;
          const vy = this.vel[k3 + 1] + (dy * kSpring - this.vel[k3 + 1] * damping) * h;
          let vz = this.vel[k3 + 2] + (dz * kSpring - this.vel[k3 + 2] * damping) * h;

          if (this.rippleImpulse > 0.01) {
            const ut = i / this.nx;
            const wave = Math.sin(elapsed * 9.5 - vt * 8.0 + ut * 6.0) * 0.42 * this.rippleImpulse * (1.0 - vt);
            vz += wave * h;
          }

          this.vel[k3] = vx;
          this.vel[k3 + 1] = vy;
          this.vel[k3 + 2] = vz;

          this.pos[k3] += vx * h;
          this.pos[k3 + 1] += vy * h;
          this.pos[k3 + 2] = Math.max(-2.166, this.pos[k3 + 2] + vz * h);
        }
      }

      // Vertical neighbor coupling so folds flow smoothly downward
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
