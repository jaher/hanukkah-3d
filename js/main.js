/**
 * Hanukkah 3D — Photorealistic Interactive Three.js Room
 *
 * - Gated asset loading with real AbortController Cancel & Retry
 * - Blender-modeled heirloom 925 sterling silver hanukkiah & traditional Judaica
 * - Cycles-baked GI/AO lightmaps paired with dynamic flickering candlelight & soft shadows
 * - Automatic Hanukkah 2026 calendar (Dec 4–12) with traditional right-to-left placement
 *   and sequential left-to-right lighting; shamash stays lit at all times
 * - Interactive dreidel spin physics & smooth eased camera presets
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GatedAssetLoader } from './asset-loader.js';
import { computeHanukkahNight, HANUKKAH_2026_NIGHT_DATES } from './hanukkah-calendar.js';
import { CandleFlameRig } from './flames.js';
import { createWinterNightExterior } from './winter-window.js';

// Exact world heights matching Blender exports (1 unit = 1 meter)
const TABLE_Z = -0.35;
const TABLE_Y = 0.760;
const RUNNER_Y = 0.7632;

const ASSET_MANIFEST = [
  { key: 'room', type: 'glb', url: 'assets/models/room.glb', label: 'Hanukkah Room Architecture' },
  { key: 'table', type: 'glb', url: 'assets/models/table.glb', label: 'Walnut Table & Embroidered Runner' },
  { key: 'hanukkiah', type: 'glb', url: 'assets/models/hanukkiah.glb', label: 'Sterling Silver Hanukkiah' },
  { key: 'hanukkiah_meta', type: 'json', url: 'assets/models/hanukkiah_meta.json', label: 'Candle Geometry Metadata' },
  { key: 'dreidel_large', type: 'glb', url: 'assets/models/dreidel_large.glb', label: 'Heirloom Filigree Dreidel' },
  { key: 'dreidel_blue', type: 'glb', url: 'assets/models/dreidel_blue.glb', label: 'Blue & Silver Dreidel' },
  { key: 'dreidel_wood', type: 'glb', url: 'assets/models/dreidel_wood.glb', label: 'Carved Wooden Dreidel' },
  { key: 'gelt', type: 'glb', url: 'assets/models/gelt.glb', label: 'Gold & Silver Chocolate Gelt' },
  { key: 'sufganiyot', type: 'glb', url: 'assets/models/sufganiyot.glb', label: 'Sufganiyot Porcelain Platter' },
  { key: 'kiddush_cup', type: 'glb', url: 'assets/models/kiddush_cup.glb', label: 'Sterling Silver Kiddush Cup' },
  { key: 'challah', type: 'glb', url: 'assets/models/challah.glb', label: 'Braided Challah & Embroidered Cover' },
  { key: 'votive', type: 'glb', url: 'assets/models/votive.glb', label: 'Cobalt & Silver Votive Candles' },
  { key: 'candle_box', type: 'glb', url: 'assets/models/candle_box.glb', label: 'Hanukkah Candle Box & Matches' },
  { key: 'star_wall', type: 'glb', url: 'assets/models/star_wall.glb', label: 'Star of David Wall Medallion' },
  { key: 'star_window', type: 'glb', url: 'assets/models/star_window.glb', label: 'Window Star of David Ornament' },
  { key: 'room_lightmap', type: 'texture', url: 'assets/textures/room_lightmap.jpg', label: 'Room GI/AO Lightmap', flipY: false },
  { key: 'table_lightmap', type: 'texture', url: 'assets/textures/table_lightmap.jpg', label: 'Table GI/AO Lightmap', flipY: false },
  { key: 'winter_backdrop', type: 'texture', url: 'assets/textures/winter_night_backdrop.jpg', label: 'Winter Night Sky Panorama', flipY: true },
];

const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(0.06, 1.38, 1.22),
    target: new THREE.Vector3(0.0, 0.97, -0.44),
  },
  hanukkiah: {
    pos: new THREE.Vector3(0.05, 1.11, 0.48),
    target: new THREE.Vector3(0.0, 0.97, -0.40),
  },
  dreidel: {
    pos: new THREE.Vector3(-0.34, 1.12, 0.52),
    target: new THREE.Vector3(-0.38, 0.80, -0.18),
  },
  feast: {
    pos: new THREE.Vector3(0.70, 1.18, 0.46),
    target: new THREE.Vector3(0.45, 0.80, -0.28),
  },
  window: {
    pos: new THREE.Vector3(-0.24, 1.24, 0.86),
    target: new THREE.Vector3(0.0, 1.44, -1.95),
  },
};

const DREIDEL_OUTCOMES = [
  { letter: 'נ', name: 'Nun (נ)', meaning: 'Nes — Nothing happens · "A great miracle happened there"', yaw: 0 },
  { letter: 'ג', name: 'Gimel (ג)', meaning: 'Gadol — Take the whole pot of gelt!', yaw: -Math.PI / 2 },
  { letter: 'ה', name: 'Hey (ה)', meaning: 'Hayah — Take half the pot!', yaw: Math.PI },
  { letter: 'ש', name: 'Shin (ש)', meaning: 'Sham — Put one piece of gelt in the pot', yaw: Math.PI / 2 },
];

/**
 * Build a rich procedural warm-room + cool-winter-window PMREM environment map
 * so sterling silver, cobalt enamel, wine, and gold foil gelt gleam with photographic reflections.
 */
function buildHanukkahEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x060a14);

  // High-contrast warm-lit interior studio box so polished sterling silver gleams brightly with rich depth!
  const roomBox = new THREE.Mesh(
    new THREE.BoxGeometry(10, 6, 10),
    new THREE.MeshBasicMaterial({ color: 0x242c42, side: THREE.BackSide })
  );
  envScene.add(roomBox);

  const addPanel = (w, h, color, pos, rotY = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.rotation.y = rotY;
    envScene.add(m);
  };

  // Broad warm golden horizon & candlelight softboxes (so curved silver goblets & branches gleam sterling silver!)
  addPanel(5.2, 1.4, new THREE.Color(2.4, 1.75, 0.95), [0.0, 1.0, 4.4], Math.PI);
  addPanel(2.8, 0.85, new THREE.Color(3.6, 2.45, 1.15), [0.4, 1.45, 4.3], Math.PI);
  addPanel(1.6, 2.8, new THREE.Color(2.6, 1.85, 0.98), [-4.4, 1.4, 1.0], Math.PI * 0.62);
  addPanel(1.6, 2.8, new THREE.Color(2.6, 1.85, 0.98), [4.4, 1.4, 1.0], -Math.PI * 0.62);
  // Crisp thin specular hot-bars for razor-sharp metallic highlights on carved silver!
  addPanel(0.35, 3.2, new THREE.Color(5.5, 4.2, 2.4), [-2.8, 1.6, 3.4], Math.PI * 0.78);
  addPanel(0.35, 3.2, new THREE.Color(5.5, 4.2, 2.4), [2.8, 1.6, 3.4], -Math.PI * 0.78);
  // Cool sapphire winter night window reflection behind menorah (rim-lights the silver edges!)
  addPanel(3.4, 2.6, new THREE.Color(0.65, 1.15, 2.35), [0, 1.6, -4.6], 0);
  // Soft warm overhead ceiling reflection
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 6.5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.60, 0.48), side: THREE.DoubleSide })
  );
  ceil.position.set(0, 2.95, 0);
  ceil.rotation.x = Math.PI / 2;
  envScene.add(ceil);

  const rt = pmrem.fromScene(envScene, 0.022);
  pmrem.dispose();
  return rt.texture;
}

class HanukkahApp {
  constructor() {
    this.canvas = document.getElementById('scene-canvas');
    this.overlay = document.getElementById('loading-overlay');
    this.hud = document.getElementById('hud');
    this.btnCancel = document.getElementById('btn-cancel');
    this.btnRetry = document.getElementById('btn-retry');
    this.progressFill = document.getElementById('progress-fill');
    this.progressTrack = document.getElementById('progress-track');
    this.loadingStatus = document.getElementById('loading-status');
    this.loadingDetail = document.getElementById('loading-detail');
    this.loadingPct = document.getElementById('loading-pct');

    this.loader = new GatedAssetLoader(ASSET_MANIFEST);
    this.isLoaded = false;
    this.mode = 'auto'; // 'auto' or 'manual'
    this.activeNight = 0; // 0..8 (0 = shamash only)
    this.calendarInfo = computeHanukkahNight(new Date());

    // Scene references populated after gated load completes
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.flameRig = null;
    this.winterExterior = null;
    this.candleMeshes = []; // 1..8 (index 0 = Night 1 rightmost .. index 7 = Night 8 leftmost)
    this.wickMeshes = [];
    this.candleFlames = [];
    this.shamashFlame = null;
    this.votiveFlames = [];
    this.lights = {};
    this.windowStar = null;

    // Camera transition state
    this.camLerp = null;

    // Interactive playable dreidel spin state
    this.spinDreidelObj = null;
    this.dreidelSpin = { active: false, time: 0, duration: 2.8, startYaw: 0, targetYaw: 0, outcome: null };
    this.toastTimer = null;

    this.clock = new THREE.Clock();

    this.bindLoadingUI();
    this.startLoad();

    // Expose clean API for automated verification & date inspection
    window.hanukkahApp = {
      computeNight: (dateInput) => computeHanukkahNight(dateInput ? new Date(dateInput) : new Date()),
      setNight: (n, instant = false) => this.selectNight(n, { instant }),
      setAutoNight: () => this.selectAutoNight(),
      setCamera: (preset, instant = false) => this.goToCamera(preset, instant),
      spinDreidel: () => this.triggerDreidelSpin(),
      getState: () => ({
        isLoaded: this.isLoaded,
        mode: this.mode,
        activeNight: this.activeNight,
        calendar: this.calendarInfo,
      }),
    };
  }

  bindLoadingUI() {
    this.btnCancel.addEventListener('click', () => {
      this.loader.cancel();
      this.loadingStatus.textContent = 'Loading cancelled. Click Retry Load whenever you are ready.';
      this.loadingStatus.classList.add('error');
      this.btnCancel.hidden = true;
      this.btnRetry.hidden = false;
    });

    this.btnRetry.addEventListener('click', () => {
      this.startLoad();
    });
  }

  async startLoad() {
    this.loadingStatus.classList.remove('error');
    this.loadingStatus.textContent = 'Loading 3D room, sterling silver hanukkiah & Judaica…';
    this.btnCancel.hidden = false;
    this.btnRetry.hidden = true;
    this.updateProgress({ completed: 0, total: ASSET_MANIFEST.length, pct: 0, label: 'Initializing…' });

    try {
      const assets = await this.loader.loadAll((p) => this.updateProgress(p));
      this.loadingStatus.textContent = 'Assembling lighting & shaders…';
      this.initScene(assets);
      this.isLoaded = true;
      this.revealScene();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return; // already handled by Cancel button
      }
      console.error('[Hanukkah 3D] Asset loading failed:', err);
      this.loadingStatus.textContent = `Load failed: ${err?.message || 'Network error'}`;
      this.loadingStatus.classList.add('error');
      this.btnCancel.hidden = true;
      this.btnRetry.hidden = false;
    }
  }

  updateProgress({ completed, total, pct, label }) {
    this.progressFill.style.width = `${pct}%`;
    this.progressTrack.setAttribute('aria-valuenow', String(pct));
    this.loadingDetail.textContent = `${completed} / ${total} assets · ${label}`;
    this.loadingPct.textContent = `${pct}%`;
  }

  revealScene() {
    this.canvas.classList.add('ready');
    this.overlay.classList.add('dismissed');
    this.hud.classList.remove('hidden');
    this.clock.start();
    this.animate();
  }

  initScene(assets) {
    // 1. Renderer setup — photorealistic ACES Filmic tone mapping + PCF Soft Shadows
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Scene & Environment IBL
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060b18);
    this.scene.environment = buildHanukkahEnvironment(this.renderer);
    this.scene.environmentIntensity = 1.05;

    // 3. Camera & Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 30);
    this.camera.position.copy(CAMERA_PRESETS.overview.pos);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(CAMERA_PRESETS.overview.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 0.36;
    this.controls.maxDistance = 2.65;
    this.controls.maxPolarAngle = Math.PI * 0.54;
    this.controls.minPolarAngle = 0.22;
    this.controls.minAzimuthAngle = -Math.PI * 0.44;
    this.controls.maxAzimuthAngle = Math.PI * 0.44;
    this.controls.panSpeed = 0.55;
    this.controls.addEventListener('start', () => {
      this.camLerp = null; // user takes over smoothly
    });
    this.controls.update();

    // 4. Room Shell + Cycles GI/AO Lightmap
    const roomRoot = assets.models.room.scene;
    roomRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.receiveShadow = true;
      if (obj.name.includes('Window_Glass')) {
        obj.material.transparent = true;
        obj.material.opacity = 0.14;
        obj.material.roughness = 0.06;
        obj.material.metalness = 0.1;
        obj.material.depthWrite = false;
        obj.castShadow = false;
        obj.receiveShadow = false;
      } else if (obj.name.includes('Room_Architecture')) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m.lightMap = assets.textures.room_lightmap;
          m.lightMapIntensity = 0.45;
          m.needsUpdate = true;
        }
      } else if (obj.name.includes('Curtain') || obj.name.includes('LightingFixtures')) {
        obj.castShadow = true;
      }
    });
    this.scene.add(roomRoot);

    // 5. Dining Table + Embroidered Runner + Table Lightmap
    const tableRoot = assets.models.table.scene;
    tableRoot.position.set(0, 0, TABLE_Z);
    tableRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.name.includes('DiningTable_Wood')) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m.lightMap = assets.textures.table_lightmap;
          m.lightMapIntensity = 0.30;
          m.needsUpdate = true;
        }
      }
    });
    this.scene.add(tableRoot);

    // 6. Winter Night Exterior Panorama + Falling 3D Snow
    this.winterExterior = createWinterNightExterior(this.scene, assets.textures.winter_backdrop);

    // 7. Hero Centerpiece — Ornate 925 Sterling Silver Hanukkiah
    const hanukkiahRoot = assets.models.hanukkiah.scene;
    hanukkiahRoot.position.set(0.0, RUNNER_Y, -0.40);
    hanukkiahRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && m.metalness > 0.7) {
          m.envMapIntensity = 1.65;
          if (m.normalMap) {
            m.normalScale = new THREE.Vector2(1.45, 1.45);
          }
          m.needsUpdate = true;
        }
      }
    });
    this.scene.add(hanukkiahRoot);

    // Build Flames Rig & Attach Exact Flame Coordinates from hanukkiah_meta.json
    this.flameRig = new CandleFlameRig();
    const meta = assets.json.hanukkiah_meta;

    // Shamash candle & flame — ALWAYS LIT!
    const shTip = new THREE.Vector3(...meta.shamash.wickTip);
    this.shamashFlame = this.flameRig.createFlame(hanukkiahRoot, shTip, {
      scale: 1.14,
      seed: 1.37,
      isShamash: true,
    });
    const shCandleObj = hanukkiahRoot.getObjectByName(meta.shamash.candleMesh);
    if (shCandleObj && shCandleObj.material) {
      shCandleObj.material = shCandleObj.material.clone();
      shCandleObj.material.emissive = new THREE.Color(0xff9b32);
      shCandleObj.material.emissiveIntensity = 0.04;
    }

    // 8 Night Candles (Night 1 = index 0 rightmost .. Night 8 = index 7 leftmost)
    for (let i = 0; i < meta.candles.length; i++) {
      const cInfo = meta.candles[i];
      const cMesh = hanukkiahRoot.getObjectByName(cInfo.candleMesh);
      const wMesh = hanukkiahRoot.getObjectByName(cInfo.wickMesh);
      if (cMesh && cMesh.material) {
        cMesh.material = cMesh.material.clone();
        cMesh.material.emissive = new THREE.Color(0xff9028);
        cMesh.material.emissiveIntensity = 0.0;
      }
      this.candleMeshes.push(cMesh);
      this.wickMeshes.push(wMesh);

      const tip = new THREE.Vector3(...cInfo.wickTip);
      const flame = this.flameRig.createFlame(hanukkiahRoot, tip, {
        scale: 0.96 + (i % 3) * 0.03,
        seed: 4.2 + i * 7.13,
        isShamash: false,
      });
      this.candleFlames.push(flame);
    }

    // 8. Place All Traditional Judaica Props Flush on Table / Runner / Walls
    const enableShadows = (root, envBoost = 1.15) => {
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && m.metalness > 0.7) {
            m.envMapIntensity = envBoost;
          }
        }
      });
      return root;
    };

    // Large Decorative Heirloom Silver & Cobalt Dreidel on Stand (back-left on runner)
    const dreidelLarge = enableShadows(assets.models.dreidel_large.scene, 1.45);
    dreidelLarge.position.set(-0.45, RUNNER_Y, -0.44);
    dreidelLarge.rotation.y = 0.42;
    this.scene.add(dreidelLarge);

    // Playable Upright Blue Dreidel (front-left on clean walnut wood, interactive spin!)
    const dreidelSpin = enableShadows(assets.models.dreidel_blue.scene, 1.15);
    dreidelSpin.position.set(-0.17, TABLE_Y, -0.08);
    dreidelSpin.rotation.y = 0.35;
    this.scene.add(dreidelSpin);
    this.spinDreidelObj = dreidelSpin;

    // Second Resting Wooden Dreidel leaning naturally on its side near the gelt
    const dreidelWood = enableShadows(assets.models.dreidel_wood.scene, 1.1);
    dreidelWood.position.set(-0.46, TABLE_Y + 0.017, 0.01);
    dreidelWood.rotation.set(Math.PI / 2 - 0.16, 0.45, 0.85);
    this.scene.add(dreidelWood);

    // Third Resting Blue Dreidel tilted casually nearby
    const dreidelBlue2 = enableShadows(assets.models.dreidel_blue.scene.clone(), 1.15);
    dreidelBlue2.position.set(-0.14, TABLE_Y + 0.017, 0.02);
    dreidelBlue2.rotation.set(Math.PI / 2 - 0.15, -0.7, -1.1);
    this.scene.add(dreidelBlue2);

    // Embossed Gold & Silver Chocolate Gelt + Royal-Blue Drawstring Pouch (left foreground)
    const gelt = enableShadows(assets.models.gelt.scene, 1.45);
    gelt.position.set(-0.37, TABLE_Y, -0.14);
    gelt.rotation.y = 0.24;
    this.scene.add(gelt);

    // Sufganiyot Jelly Doughnuts on Blue-and-White Porcelain Platter (right foreground)
    const sufganiyot = enableShadows(assets.models.sufganiyot.scene, 1.1);
    sufganiyot.position.set(0.39, TABLE_Y, -0.09);
    sufganiyot.rotation.y = -0.35;
    this.scene.add(sufganiyot);

    // Sterling Silver Kiddush Cup & Saucer filled with Kosher Wine (right of hanukkiah on runner)
    const kiddush = enableShadows(assets.models.kiddush_cup.scene, 1.4);
    kiddush.position.set(0.31, RUNNER_Y, -0.46);
    this.scene.add(kiddush);

    // Braided Challah on Carved Walnut Board with Draped Embroidered Challah Cover (back-right)
    const challah = enableShadows(assets.models.challah.scene, 1.05);
    challah.position.set(0.60, TABLE_Y, -0.49);
    challah.rotation.y = -0.42;
    this.scene.add(challah);

    // Hanukkah Candle Box + Spare Twisted Candles + Wooden Matches (front-far-left)
    const candleBox = enableShadows(assets.models.candle_box.scene, 1.05);
    candleBox.position.set(-0.67, TABLE_Y, -0.08);
    candleBox.rotation.y = 0.38;
    this.scene.add(candleBox);

    // Twin Frosted Cobalt & Silver Votive Candle Holders with Warm Lit Flames (flanking table ends!)
    const votivePositions = [
      new THREE.Vector3(-0.69, RUNNER_Y, -0.48),
      new THREE.Vector3(0.71, TABLE_Y, -0.14),
    ];
    votivePositions.forEach((vPos, idx) => {
      const vObj = enableShadows(idx === 0 ? assets.models.votive.scene : assets.models.votive.scene.clone(), 1.25);
      vObj.position.copy(vPos);
      // Make frosted cobalt glass translucent cleanly
      vObj.traverse((c) => {
        if (c.isMesh && c.material && c.material.name && c.material.name.includes('Glass')) {
          c.material.transparent = true;
          c.material.opacity = 0.62;
          c.material.depthWrite = false;
          c.castShadow = false;
        }
      });
      this.scene.add(vObj);

      // Lit votive flame inside each cobalt glass holder
      const vf = this.flameRig.createFlame(vObj, new THREE.Vector3(0.0, 0.058, 0.0), {
        scale: 0.82,
        seed: 55.0 + idx * 19.3,
        isShamash: true,
      });
      this.votiveFlames.push(vf);
    });

    // Ornate Brushed-Silver & Cobalt Star of David Wall Medallions (cleanly clear of outer curtain folds!)
    const starWall = enableShadows(assets.models.star_wall.scene, 1.35);
    starWall.position.set(-1.84, 1.28, -2.18);
    this.scene.add(starWall);

    const starWallR = enableShadows(assets.models.star_wall.scene.clone(), 1.35);
    starWallR.position.set(1.84, 1.28, -2.18);
    this.scene.add(starWallR);

    // Hanging Crystalline & Silver Star of David Ornament in the Winter Window
    const starWin = enableShadows(assets.models.star_window.scene, 1.45);
    starWin.position.set(0.0, 2.04, -2.06);
    this.scene.add(starWin);
    this.windowStar = starWin;

    // 9. Photorealistic Dynamic Lighting Rig (Warm Candlelight + Cool Winter Moonlight)
    this.setupLighting();

    // 10. Wire HUD controls, keyboard shortcuts, and URL query parameters (?night=N&cam=preset)
    this.bindHUD();
    this.applyInitialStateFromURL();

    window.addEventListener('resize', () => this.onResize());
  }

  setupLighting() {
    // Soft ambient hemisphere: cozy candlelit evening contrast (warm ceiling vs deep sapphire floor)
    const hemi = new THREE.HemisphereLight(0xffe0b5, 0x101c36, 0.24);
    this.scene.add(hemi);

    // Primary Shamash Shadow-Casting PointLight (ALWAYS LIT! Warm 2200K firelight)
    const shamashLight = new THREE.PointLight(0xffa442, 1.55, 5.2, 1.72);
    shamashLight.position.set(0.0, RUNNER_Y + 0.455, -0.38);
    shamashLight.castShadow = true;
    shamashLight.shadow.mapSize.set(1024, 1024);
    shamashLight.shadow.bias = -0.0005;
    shamashLight.shadow.normalBias = 0.024;
    shamashLight.shadow.radius = 4.0;
    this.scene.add(shamashLight);

    // Dynamic Menorah 8-Candle Collective Warm Light (scales smoothly from Night 0 -> Night 8!)
    const menorahLight = new THREE.PointLight(0xff9630, 0.0, 5.8, 1.58);
    menorahLight.position.set(0.0, RUNNER_Y + 0.385, -0.34);
    menorahLight.castShadow = true;
    menorahLight.shadow.mapSize.set(1024, 1024);
    menorahLight.shadow.bias = -0.0006;
    menorahLight.shadow.normalBias = 0.024;
    menorahLight.shadow.radius = 5.0;
    this.scene.add(menorahLight);

    // Crisp specular key light right in front of the carved Hanukkiah so the 925 silver engravings gleam!
    const silverAccent = new THREE.PointLight(0xffd6a8, 0.95, 2.4, 2.0);
    silverAccent.position.set(0.14, RUNNER_Y + 0.30, 0.14);
    this.scene.add(silverAccent);

    // Second soft fill from front-left to catch the carved branches & Star of David crest from both angles
    const silverRimFill = new THREE.PointLight(0xd2e4ff, 0.42, 2.4, 2.0);
    silverRimFill.position.set(-0.22, RUNNER_Y + 0.24, 0.12);
    this.scene.add(silverRimFill);

    // Warm tabletop votive candle pools (left & right ends of table)
    const votiveL = new THREE.PointLight(0xff9f42, 0.48, 2.6, 2.0);
    votiveL.position.set(-0.69, RUNNER_Y + 0.12, -0.48);
    this.scene.add(votiveL);

    const votiveR = new THREE.PointLight(0xff9f42, 0.52, 2.6, 2.0);
    votiveR.position.set(0.71, TABLE_Y + 0.12, -0.14);
    this.scene.add(votiveR);

    // Warm wall sconce glow pools flanking window + sideboard lamp
    const sconceL = new THREE.PointLight(0xffbe74, 0.72, 4.2, 1.8);
    sconceL.position.set(-1.62, 1.78, -1.96);
    this.scene.add(sconceL);

    const sconceR = new THREE.PointLight(0xffbe74, 0.72, 4.2, 1.8);
    sconceR.position.set(1.62, 1.78, -1.96);
    this.scene.add(sconceR);

    const sideboardLamp = new THREE.PointLight(0xffb866, 0.65, 3.8, 1.8);
    sideboardLamp.position.set(2.38, 1.24, -0.88);
    this.scene.add(sideboardLamp);

    // Cool sapphire winter moonlight streaming softly through the snowy window!
    const moonLight = new THREE.DirectionalLight(0x74a4ff, 0.68);
    moonLight.position.set(-0.7, 2.55, -3.4);
    moonLight.target.position.set(0.15, 0.75, 0.25);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 8.0;
    moonLight.shadow.camera.left = -2.2;
    moonLight.shadow.camera.right = 2.2;
    moonLight.shadow.camera.top = 2.2;
    moonLight.shadow.camera.bottom = -1.5;
    moonLight.shadow.bias = -0.0008;
    moonLight.shadow.radius = 4.0;
    this.scene.add(moonLight);
    this.scene.add(moonLight.target);

    this.lights = {
      shamashLight,
      menorahLight,
      silverAccent,
      votiveL,
      votiveR,
      sconceL,
      sconceR,
      sideboardLamp,
      moonLight,
    };
  }

  /**
   * Place candles right-to-left (1..N) and light left-to-right (N down to 1).
   * Shamash is ALWAYS placed and lit.
   */
  applyNightLighting(nightCount, { instant = false } = {}) {
    const n = Math.max(0, Math.min(8, Math.round(nightCount)));
    this.activeNight = n;

    for (let i = 0; i < 8; i++) {
      const candleNum = i + 1; // 1 = far right, 8 = far left
      const isPlaced = candleNum <= n;
      const cMesh = this.candleMeshes[i];
      const wMesh = this.wickMeshes[i];
      const flame = this.candleFlames[i];

      if (cMesh) {
        cMesh.visible = isPlaced;
        if (cMesh.material) {
          cMesh.material.emissiveIntensity = isPlaced ? 0.03 : 0.0;
        }
      }
      if (wMesh) {
        wMesh.visible = isPlaced;
      }

      if (flame) {
        if (isPlaced) {
          flame.targetLit = 1.0;
          if (instant) {
            flame.igniteDelay = 0.0;
            flame.currentLit = 1.0;
          } else {
            // Traditional lighting order: newest (leftmost lit, index n) lights FIRST,
            // then steps rightwards down to candle 1!
            const orderFromLeft = n - candleNum; // 0 for newest leftmost, n-1 for rightmost
            flame.currentLit = 0.0;
            flame.igniteDelay = 0.10 + orderFromLeft * 0.24;
          }
        } else {
          flame.targetLit = 0.0;
          flame.igniteDelay = 0.0;
          if (instant) flame.currentLit = 0.0;
        }
      }
    }

    this.updateNightHUD();
  }

  selectNight(n, opts = {}) {
    this.mode = 'manual';
    this.applyNightLighting(n, opts);
  }

  selectAutoNight(opts = {}) {
    this.mode = 'auto';
    this.calendarInfo = computeHanukkahNight(new Date());
    this.applyNightLighting(this.calendarInfo.night, opts);
  }

  updateNightHUD() {
    const dateStatus = document.getElementById('date-status');
    const nightLabel = document.getElementById('night-label');

    if (this.mode === 'auto') {
      dateStatus.textContent = this.calendarInfo.statusText;
      if (this.activeNight === 0) {
        nightLabel.textContent = 'Auto · Shamash Lit (Select 1–8 to preview)';
      } else {
        nightLabel.textContent = `Night ${this.activeNight} of 8 · ${this.activeNight} + Shamash Lit`;
      }
    } else {
      const dateStr = HANUKKAH_2026_NIGHT_DATES[this.activeNight];
      dateStatus.textContent =
        this.activeNight === 0
          ? 'Preview · Shamash Only (Hanukkah 2026: Dec 4–12)'
          : `Preview · Night ${this.activeNight} (${dateStr})`;
      nightLabel.textContent =
        this.activeNight === 0
          ? 'Shamash Candle Lit (Always On)'
          : `Night ${this.activeNight} · ${this.activeNight} ${this.activeNight === 1 ? 'Candle' : 'Candles'} + Shamash`;
    }

    document.querySelectorAll('.night-btn').forEach((btn) => {
      const val = btn.dataset.night;
      if (val === 'auto') {
        btn.classList.toggle('active', this.mode === 'auto');
      } else {
        btn.classList.toggle('active', Number(val) === this.activeNight);
      }
    });
  }

  goToCamera(presetKey, instant = false) {
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset) return;

    document.querySelectorAll('.camera-bar .pill[data-cam]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cam === presetKey);
    });

    if (instant) {
      this.camLerp = null;
      this.camera.position.copy(preset.pos);
      this.controls.target.copy(preset.target);
      this.controls.update();
      return;
    }

    this.camLerp = {
      startPos: this.camera.position.clone(),
      endPos: preset.pos.clone(),
      startTarget: this.controls.target.clone(),
      endTarget: preset.target.clone(),
      t: 0,
      duration: 1.05,
    };
  }

  triggerDreidelSpin() {
    if (!this.spinDreidelObj) return;
    const outcome = DREIDEL_OUTCOMES[Math.floor(Math.random() * DREIDEL_OUTCOMES.length)];
    this.dreidelSpin = {
      active: true,
      time: 0,
      duration: 2.6,
      startYaw: this.spinDreidelObj.rotation.y,
      targetYaw: outcome.yaw + Math.PI * 2 * (7 + Math.floor(Math.random() * 3)),
      outcome,
    };

    const toast = document.getElementById('dreidel-toast');
    toast.classList.add('hidden');
  }

  showDreidelToast(outcome) {
    const toast = document.getElementById('dreidel-toast');
    document.getElementById('dreidel-letter').textContent = outcome.letter;
    document.getElementById('dreidel-name').textContent = outcome.name;
    document.getElementById('dreidel-meaning').textContent = outcome.meaning;
    toast.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('hidden'), 5200);
  }

  bindHUD() {
    document.querySelectorAll('.night-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.night;
        if (val === 'auto') {
          this.selectAutoNight();
        } else {
          this.selectNight(Number(val));
        }
      });
    });

    document.querySelectorAll('.camera-bar .pill[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => this.goToCamera(btn.dataset.cam));
    });

    document.getElementById('btn-spin-dreidel').addEventListener('click', () => {
      this.triggerDreidelSpin();
    });

    const toggleHud = () => {
      const hidden = this.hud.classList.toggle('hidden');
      document.getElementById('btn-show-hud').classList.toggle('hidden', !hidden);
    };
    document.getElementById('btn-toggle-hud').addEventListener('click', toggleHud);
    document.getElementById('btn-show-hud').addEventListener('click', toggleHud);

    // Click directly on the upright playable dreidel on the table to spin it!
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!pointerDownPos || !this.spinDreidelObj) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, this.camera);
      const hits = raycaster.intersectObject(this.spinDreidelObj, true);
      if (hits.length > 0) {
        this.triggerDreidelSpin();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isLoaded) return;
      if (e.key >= '0' && e.key <= '8') {
        this.selectNight(Number(e.key));
      } else if (e.key === 'a' || e.key === 'A') {
        this.selectAutoNight();
      } else if (e.key === 'r' || e.key === 'R') {
        this.goToCamera('overview');
      } else if (e.key === 'h' || e.key === 'H') {
        toggleHud();
      } else if (e.key === ' ') {
        e.preventDefault();
        this.triggerDreidelSpin();
      }
    });
  }

  applyInitialStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const nightParam = params.get('night');
    const camParam = params.get('cam');
    const hudParam = params.get('hud');

    if (nightParam !== null && !Number.isNaN(Number(nightParam))) {
      this.selectNight(Number(nightParam), { instant: true });
    } else {
      // Automatic calendar calculation from live date!
      this.selectAutoNight({ instant: true });
    }

    if (camParam && CAMERA_PRESETS[camParam]) {
      this.goToCamera(camParam, true);
    }

    if (hudParam === '0' || hudParam === 'false') {
      this.hud.classList.add('hidden');
      document.getElementById('btn-show-hud').classList.remove('hidden');
    }
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    // 1. Update procedural flames & dynamic flickering warm candlelight
    const { shamashFlicker, totalLitEnergy } = this.flameRig.update(elapsed, dt);

    // Shamash light is ALWAYS active and gently flickering
    this.lights.shamashLight.intensity = 1.32 * shamashFlicker;
    this.lights.shamashLight.position.x = 0.004 * Math.sin(elapsed * 5.2);

    // Collective 8-branch light grows warmly from Night 1 through Night 8!
    const collectiveBase = totalLitEnergy > 0.01 ? 0.38 + totalLitEnergy * 0.24 : 0.0;
    this.lights.menorahLight.intensity = collectiveBase;
    this.lights.silverAccent.intensity = 0.48 + totalLitEnergy * 0.055;

    // Subtle organic flicker on table votive candles
    this.lights.votiveL.intensity = 0.48 * (1.0 + 0.06 * Math.sin(elapsed * 6.4 + 1.2));
    this.lights.votiveR.intensity = 0.52 * (1.0 + 0.06 * Math.cos(elapsed * 5.9 + 2.7));

    // 2. Update winter snowfall outside window + subtle swaying crystal window Star of David
    if (this.winterExterior) {
      this.winterExterior.update(elapsed, dt);
    }
    if (this.windowStar) {
      this.windowStar.rotation.y = 0.28 * Math.sin(elapsed * 0.55);
    }

    // 3. Smooth interactive Dreidel spin physics
    if (this.dreidelSpin.active && this.spinDreidelObj) {
      this.dreidelSpin.time += dt;
      const p = Math.min(1.0, this.dreidelSpin.time / this.dreidelSpin.duration);
      const easeOut = 1.0 - Math.pow(1.0 - p, 3.2);
      this.spinDreidelObj.rotation.y =
        this.dreidelSpin.startYaw + (this.dreidelSpin.targetYaw - this.dreidelSpin.startYaw) * easeOut;

      // Realistic gyroscopic wobble that builds slightly as spin slows, then settles upright
      const wobbleAmp = 0.18 * Math.sin(p * Math.PI) * (0.4 + 0.6 * p);
      this.spinDreidelObj.rotation.x = Math.sin(elapsed * 16.0) * wobbleAmp;
      this.spinDreidelObj.rotation.z = Math.cos(elapsed * 16.0) * wobbleAmp;

      if (p >= 1.0) {
        this.dreidelSpin.active = false;
        this.spinDreidelObj.rotation.x = 0;
        this.spinDreidelObj.rotation.z = 0;
        this.showDreidelToast(this.dreidelSpin.outcome);
      }
    }

    // 4. Smooth eased camera transitions
    if (this.camLerp) {
      this.camLerp.t += dt / this.camLerp.duration;
      const p = Math.min(1.0, this.camLerp.t);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      this.camera.position.lerpVectors(this.camLerp.startPos, this.camLerp.endPos, ease);
      this.controls.target.lerpVectors(this.camLerp.startTarget, this.camLerp.endTarget, ease);
      if (p >= 1.0) {
        this.camLerp = null;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new HanukkahApp();
