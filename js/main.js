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
import { HanukkahMusicPlayer } from './hanukkah-music.js';

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
  { key: 'rebbe_portrait', type: 'glb', url: 'assets/models/rebbe_portrait.glb', label: 'Framed Portrait of the Lubavitcher Rebbe' },
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

// Axial spin angle (radians) that puts each Hebrew letter facing straight UP
// when the dreidel topples sideways (+X tilt ~ 82.5 deg) onto the table!
const DREIDEL_OUTCOMES = [
  { letter: 'נ', name: 'Nun (נ)', meaning: 'Nes — Nothing happens · "A great miracle happened there"', spinAngle: Math.PI },
  { letter: 'ג', name: 'Gimel (ג)', meaning: 'Gadol — Take the whole pot of gelt!', spinAngle: Math.PI / 2 },
  { letter: 'ה', name: 'Hey (ה)', meaning: 'Hayah — Take half the pot!', spinAngle: 0 },
  { letter: 'ש', name: 'Shin (ש)', meaning: 'Sham — Put one piece of gelt in the pot', spinAngle: -Math.PI / 2 },
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

    // Interactive playable dreidels scattered across the table (2-node gyroscopic rig: pivot + spinNode)
    this.primaryDreidel = null;
    this.interactiveDreidels = []; // [{ pivot, spinNode, baseX, baseY, baseZ, fallen }]
    this.dreidelSpin = {
      active: false,
      rig: null,
      time: 0,
      duration: 3.4,
      wasFallen: false,
      startTilt: 0,
      startPrecession: 0,
      endPrecession: 0,
      startSpin: 0,
      targetSpin: 0,
      outcome: null,
    };
    this.toastTimer = null;

    // Interactive sufganiyot bite states & kiddush cup wine sip state
    this.sufganiyotItems = []; // [{ id, states: [obj0..obj3], state: 0..4, popTimer: 0 }]
    this.sufganiyotPlatter = null;
    this.kiddushRoot = null;
    this.wineLevels = {}; // { 1: mesh, 2: mesh, 3: mesh, 4: mesh }
    this.wineLevel = 4;   // 4 = full .. 0 = empty
    this.wineSipAnim = 0;

    // Subtle traditional Hanukkah music player (starts on first click/tap anywhere, toggleable on/off)
    this.musicPlayer = new HanukkahMusicPlayer((state) => this.updateMusicHUD(state));
    this.musicFirstTouchHandled = false;
    this.bindFirstTouchMusic();

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
      biteSufganiyah: (idx = 4) => this.biteSufganiyah(idx),
      sipWine: () => this.sipKiddushWine(),
      toggleMusic: () => this.musicPlayer.toggle(),
      nextTrack: () => this.musicPlayer.nextTrack(),
      getState: () => ({
        isLoaded: this.isLoaded,
        mode: this.mode,
        activeNight: this.activeNight,
        calendar: this.calendarInfo,
        musicPlaying: this.musicPlayer.isPlaying,
        musicTrack: this.musicPlayer.currentTrack.title,
        wineLevel: this.wineLevel,
        sufganiyotStates: this.sufganiyotItems.map((s) => s.state),
      }),
    };
  }

  bindFirstTouchMusic() {
    // Start traditional Hanukkah holiday music automatically on the user's very first click/tap/key anywhere
    // (unless they directly clicked the Music Off button itself).
    const onFirstTouch = (e) => {
      if (this.musicFirstTouchHandled) return;
      if (e.target && e.target.closest && (e.target.closest('#btn-music') || e.target.closest('#btn-cancel'))) {
        return;
      }
      this.musicFirstTouchHandled = true;
      window.removeEventListener('pointerdown', onFirstTouch, true);
      window.removeEventListener('touchstart', onFirstTouch, true);
      window.removeEventListener('keydown', onFirstTouch, true);
      if (!this.musicPlayer.isPlaying) {
        this.musicPlayer.start().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', onFirstTouch, { capture: true, passive: true });
    window.addEventListener('touchstart', onFirstTouch, { capture: true, passive: true });
    window.addEventListener('keydown', onFirstTouch, { capture: true, passive: true });
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
    if (!this.suppressInitialHud) {
      this.hud.classList.remove('hidden');
    }
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

    // Interactive playable dreidels scattered naturally across the table:
    // Every dreidel rests naturally tilted/lying on its side by default (like a real dreidel at rest!).
    // Clicking ANY playable dreidel (or pressing Space / "Spin Dreidel") lifts it upright onto its tip,
    // spins it rapidly, wobbles as momentum fades, and topples it back down tilted with the rolled letter facing UP!
    const blueProto = assets.models.dreidel_blue.scene;
    const woodProto = assets.models.dreidel_wood.scene;
    const FLAT_TILT = Math.PI / 2 - 0.13;

    const createInteractiveDreidel = (meshObj, x, surfaceY, z, restYaw, restLetterSpin) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, surfaceY + 0.0155, z);
      pivot.rotation.order = 'YXZ';
      pivot.rotation.set(FLAT_TILT, restYaw, 0); // tilted/resting naturally on its side by default!

      const spinNode = new THREE.Group();
      spinNode.rotation.y = restLetterSpin;
      spinNode.add(meshObj);
      pivot.add(spinNode);
      this.scene.add(pivot);

      const rig = { pivot, spinNode, baseX: x, baseY: surfaceY, baseZ: z, fallen: true };
      this.interactiveDreidels.push(rig);
      return rig;
    };

    // 6 playable dreidels scattered naturally across the entire walnut table (all tilted at rest, all clickable to spin!)
    this.primaryDreidel = createInteractiveDreidel(enableShadows(blueProto, 1.15), -0.17, TABLE_Y, -0.06, 0.35, Math.PI / 2); // Gimel up
    createInteractiveDreidel(enableShadows(woodProto, 1.10), 0.13, TABLE_Y, -0.02, -0.82, Math.PI); // Nun up
    createInteractiveDreidel(enableShadows(blueProto.clone(), 1.15), 0.61, TABLE_Y, 0.02, 1.28, -Math.PI / 2); // Shin up
    createInteractiveDreidel(enableShadows(woodProto.clone(), 1.10), -0.51, TABLE_Y, 0.02, 0.72, 0); // Hey up
    createInteractiveDreidel(enableShadows(woodProto.clone(), 1.10), -0.58, TABLE_Y, -0.62, 2.25, Math.PI / 2); // Gimel up
    createInteractiveDreidel(enableShadows(blueProto.clone(), 1.15), 0.22, RUNNER_Y, -0.26, -0.48, Math.PI); // Nun up

    // Embossed Gold & Silver Chocolate Gelt + Royal-Blue Drawstring Pouch (left foreground)
    const gelt = enableShadows(assets.models.gelt.scene, 1.45);
    gelt.position.set(-0.37, TABLE_Y, -0.14);
    gelt.rotation.y = 0.24;
    this.scene.add(gelt);

    // Sufganiyot Jelly Doughnuts on Blue-and-White Porcelain Platter (right foreground)
    // Each doughnut has 4 sculpted bite states (0=whole, 1=1 bite, 2=2 bites, 3=final morsel, 4=eaten)
    const sufganiyot = enableShadows(assets.models.sufganiyot.scene, 1.1);
    sufganiyot.position.set(0.39, TABLE_Y, -0.09);
    sufganiyot.rotation.y = -0.35;
    this.sufganiyotPlatter = sufganiyot.getObjectByName('PorcelainPlatter') || sufganiyot;
    for (let i = 1; i <= 5; i++) {
      const states = [0, 1, 2, 3].map((st) => sufganiyot.getObjectByName(`Suf_${i}_State${st}`)).filter(Boolean);
      states.forEach((obj, idx) => {
        obj.visible = idx === 0;
        obj.userData.sufIndex = i - 1;
      });
      if (states.length) {
        this.sufganiyotItems.push({ id: i, states, state: 0, popTimer: 0 });
      }
    }
    this.scene.add(sufganiyot);

    // Sterling Silver Kiddush Cup & Saucer filled with Sip-by-Sip Physically-Based Transparent Red Wine!
    const kiddush = enableShadows(assets.models.kiddush_cup.scene, 1.48);
    kiddush.position.set(0.31, RUNNER_Y, -0.46);
    this.kiddushRoot = kiddush;
    const redWineMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x4a040e),
      roughness: 0.025,
      metalness: 0.0,
      transmission: 0.66,
      ior: 1.335,
      thickness: 0.042,
      attenuationColor: new THREE.Color(0x9e081c),
      attenuationDistance: 0.022,
      clearcoat: 1.0,
      clearcoatRoughness: 0.015,
      reflectivity: 0.92,
      envMapIntensity: 2.1,
      transparent: true,
    });
    kiddush.traverse((obj) => {
      if (!obj.isMesh) return;
      const m = obj.name.match(/KosherWine_Level(\d)/);
      if (m) {
        const lvl = Number(m[1]);
        obj.material = redWineMat;
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.visible = lvl === 4;
        this.wineLevels[lvl] = obj;
      }
    });
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

    // Respectful Ornate Baroque Gilded Framed Portrait of the Lubavitcher Rebbe (Rabbi Menachem Mendel Schneerson)
    // Mounted prominently on the left-back wall under the warm sconce light!
    const rebbePortrait = enableShadows(assets.models.rebbe_portrait.scene, 1.35);
    rebbePortrait.position.set(-1.92, 1.44, -2.18);
    rebbePortrait.traverse((obj) => {
      if (obj.isMesh && obj.name.includes('Portrait_Glass')) {
        obj.material.transparent = true;
        obj.material.opacity = 0.08;
        obj.material.roughness = 0.05;
        obj.material.depthWrite = false;
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
    this.scene.add(rebbePortrait);

    // Ornate Brushed-Silver & Cobalt Star of David Wall Medallion symmetrically on right side of window
    const starWallR = enableShadows(assets.models.star_wall.scene, 1.35);
    starWallR.position.set(1.88, 1.40, -2.18);
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

  triggerDreidelSpin(targetRig = null) {
    const rig = targetRig || this.primaryDreidel;
    if (!rig) return;
    const outcome = DREIDEL_OUTCOMES[Math.floor(Math.random() * DREIDEL_OUTCOMES.length)];
    const fullSpins = 9 + Math.floor(Math.random() * 4);
    const currentSpin = rig.spinNode.rotation.y;
    const baseRev = Math.ceil(currentSpin / (Math.PI * 2)) * (Math.PI * 2);
    const targetSpin = baseRev + fullSpins * Math.PI * 2 + outcome.spinAngle;

    const fallDir = (Math.random() * 1.4 - 0.7); // natural forward-facing fall angle so top letter is easy to read!
    this.dreidelSpin = {
      active: true,
      rig,
      time: 0,
      duration: 3.3,
      wasFallen: rig.fallen,
      startTilt: rig.pivot.rotation.x,
      startPrecession: rig.pivot.rotation.y,
      endPrecession: fallDir + Math.PI * 2 * 3,
      startSpin: currentSpin,
      targetSpin,
      outcome,
    };

    const toast = document.getElementById('dreidel-toast');
    toast.classList.add('hidden');
  }

  updateMusicHUD({ isPlaying, trackTitle }) {
    const btn = document.getElementById('btn-music');
    const nextBtn = document.getElementById('btn-next-track');
    if (!btn) return;
    btn.classList.toggle('playing', isPlaying);
    btn.setAttribute('aria-pressed', String(isPlaying));
    btn.textContent = isPlaying ? '♪ Music: On' : '♪ Music: Off';
    btn.title = isPlaying ? `Playing: ${trackTitle} — Click to turn off (M)` : 'Turn Hanukkah music on (M)';
    if (nextBtn) {
      nextBtn.classList.toggle('hidden', !isPlaying);
      nextBtn.title = `Playing: ${trackTitle} — Next melody`;
    }
  }

  showActionToast(symbol, title, detail) {
    const toast = document.getElementById('dreidel-toast');
    document.getElementById('dreidel-letter').textContent = symbol;
    document.getElementById('dreidel-name').textContent = title;
    document.getElementById('dreidel-meaning').textContent = detail;
    toast.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
  }

  showDreidelToast(outcome) {
    this.showActionToast(outcome.letter, outcome.name, outcome.meaning);
  }

  biteSufganiyah(index) {
    const item = this.sufganiyotItems[index];
    if (!item) return;
    if (item.state >= 4) return;

    item.state += 1;
    item.popTimer = 0.24;
    item.states.forEach((obj, idx) => {
      obj.visible = idx === item.state;
    });

    const msgs = [
      null,
      ['🍩', 'First Bite!', 'Fluffy brioche & ruby strawberry jam inside — click again for another bite'],
      ['🍩', 'Second Bite!', 'Halfway through this fresh sufganiyah'],
      ['🍩', 'Almost Gone!', 'One last powdered-sugar morsel left'],
      ['✨', 'Sufganiyah Finished!', 'Click another doughnut—or click the platter when empty to serve more'],
    ];
    const [sym, title, desc] = msgs[item.state];
    this.showActionToast(sym, title, desc);
  }

  refillSufganiyotIfEmpty() {
    if (!this.sufganiyotItems.length) return;
    const allEaten = this.sufganiyotItems.every((s) => s.state >= 4);
    if (!allEaten) return;
    for (const item of this.sufganiyotItems) {
      item.state = 0;
      item.popTimer = 0.28;
      item.states.forEach((obj, idx) => {
        obj.visible = idx === 0;
      });
    }
    this.showActionToast('🍩', 'Fresh Sufganiyot Served!', 'Five warm powdered-sugar jelly doughnuts ready to enjoy');
  }

  sipKiddushWine() {
    if (this.wineLevel > 0) {
      this.wineLevel -= 1;
      this.wineSipAnim = 0.36;
      for (const [lvlStr, mesh] of Object.entries(this.wineLevels)) {
        mesh.visible = Number(lvlStr) === this.wineLevel;
      }
      const labels = {
        3: ["🍷", "L'Chaim! (1st Sip)", 'Kiddush cup is ¾ full — click again for another sip'],
        2: ["🍷", "L'Chaim! (2nd Sip)", 'Half a cup of kosher red wine remaining'],
        1: ["🍷", "L'Chaim! (3rd Sip)", 'One last sip left in the silver goblet'],
        0: ["✨", "L'Chaim! Cup Empty", 'Every drop enjoyed — click the Kiddush cup again to refill'],
      };
      const [sym, title, desc] = labels[this.wineLevel];
      this.showActionToast(sym, title, desc);
    } else {
      // Refill cup smoothly when clicked while empty
      this.wineLevel = 4;
      this.wineSipAnim = 0.36;
      for (const [lvlStr, mesh] of Object.entries(this.wineLevels)) {
        mesh.visible = Number(lvlStr) === 4;
      }
      this.showActionToast('🍷', 'Kiddush Cup Refilled', 'Brimming with deep ruby kosher red wine');
    }
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

    document.getElementById('btn-music').addEventListener('click', () => {
      this.musicFirstTouchHandled = true;
      this.musicPlayer.toggle();
    });

    document.getElementById('btn-next-track').addEventListener('click', () => {
      this.musicFirstTouchHandled = true;
      this.musicPlayer.nextTrack();
    });

    const toggleHud = () => {
      const hidden = this.hud.classList.toggle('hidden');
      document.getElementById('btn-show-hud').classList.toggle('hidden', !hidden);
    };
    document.getElementById('btn-toggle-hud').addEventListener('click', toggleHud);
    document.getElementById('btn-show-hud').addEventListener('click', toggleHud);

    // Click directly on any interactive object in the room:
    // 1. Playable dreidel -> spin upright & topple sideways
    // 2. Sufganiyah -> take progressive bites exposing crumb & ruby jam (or refill empty platter)
    // 3. Kiddush cup / wine -> sip the red wine down level by level until empty (click again to refill)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = null;

    const getInteractiveTargets = () => {
      const targets = [];
      for (const rig of this.interactiveDreidels) targets.push(rig.pivot);
      for (const item of this.sufganiyotItems) {
        if (item.state < 4 && item.states[item.state]) targets.push(item.states[item.state]);
      }
      if (this.sufganiyotPlatter) targets.push(this.sufganiyotPlatter);
      if (this.kiddushRoot) targets.push(this.kiddushRoot);
      return targets;
    };

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isLoaded) return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, this.camera);
      const hits = raycaster.intersectObjects(getInteractiveTargets(), true);
      this.canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (!pointerDownPos) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, this.camera);

      const hits = raycaster.intersectObjects(getInteractiveTargets(), true);
      if (!hits.length) return;
      const hitObj = hits[0].object;

      // Check Kiddush cup / wine first if hit
      if (this.kiddushRoot) {
        let cur = hitObj;
        while (cur) {
          if (cur === this.kiddushRoot) {
            this.sipKiddushWine();
            return;
          }
          cur = cur.parent;
        }
      }

      // Check individual sufganiyot (visible bite states)
      let curSuf = hitObj;
      while (curSuf) {
        if (typeof curSuf.userData?.sufIndex === 'number') {
          this.biteSufganiyah(curSuf.userData.sufIndex);
          return;
        }
        if (curSuf === this.sufganiyotPlatter) {
          this.refillSufganiyotIfEmpty();
          return;
        }
        curSuf = curSuf.parent;
      }

      // Check interactive dreidels
      for (const rig of this.interactiveDreidels) {
        let cur = hitObj;
        while (cur) {
          if (cur === rig.pivot) {
            this.triggerDreidelSpin(rig);
            return;
          }
          cur = cur.parent;
        }
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
      } else if (e.key === 'm' || e.key === 'M') {
        this.musicPlayer.toggle();
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

    if (params.get('clean') === '1') {
      this.suppressInitialHud = true;
      this.hud.classList.add('hidden');
      document.getElementById('btn-show-hud').classList.add('hidden');
    } else if (hudParam === '0' || hudParam === 'false') {
      this.suppressInitialHud = true;
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

    // 3. Realistic Gyroscopic Dreidel Physics: Stand Upright -> Fast Spin -> Precession Wobble -> Sideways Topple!
    if (this.dreidelSpin.active && this.dreidelSpin.rig) {
      const st = this.dreidelSpin;
      const { pivot, spinNode, baseX, baseY, baseZ } = st.rig;
      st.time += dt;
      const p = Math.min(1.0, st.time / st.duration);
      const flatTilt = Math.PI / 2 - 0.13; // flush side-lying contact angle on table

      // Axial spin decelerates smoothly to stop right as it topples (p ~ 0.90)
      const spinP = Math.min(1.0, p / 0.90);
      const spinEase = 1.0 - Math.pow(1.0 - spinP, 2.7);
      spinNode.rotation.y = st.startSpin + (st.targetSpin - st.startSpin) * spinEase;

      let tilt = 0.0;
      let yLift = 0.0;
      let wobbleRadius = 0.0;
      let precAngle = st.startPrecession;

      if (p < 0.08 && st.wasFallen) {
        // Phase 1: Lift smoothly back upright onto its spinning tip
        const u = p / 0.08;
        const ease = 1.0 - Math.pow(1.0 - u, 2.0);
        tilt = st.startTilt * (1.0 - ease);
        yLift = 0.0155 * (1.0 - ease);
      } else if (p < 0.62) {
        // Phase 2: Fast, stable upright spin on its tip
        const u = (p - 0.08) / 0.54;
        tilt = 0.025 + 0.06 * u * u;
        precAngle = st.startPrecession + u * Math.PI * 5.0;
        wobbleRadius = 0.002 * u;
      } else if (p < 0.84) {
        // Phase 3: Losing angular momentum — widening gyroscopic precession wobble
        const u = (p - 0.62) / 0.22;
        tilt = 0.085 + 0.38 * (u * u);
        precAngle = st.startPrecession + Math.PI * 5.0 + u * (st.endPrecession - (st.startPrecession + Math.PI * 5.0));
        wobbleRadius = 0.002 + 0.011 * u;
        yLift = 0.004 * u;
      } else {
        // Phase 4: Topple sideways onto the table with a subtle natural wood-settle bounce!
        const u = (p - 0.84) / 0.16;
        const fallEase = 1.0 - Math.pow(1.0 - Math.min(1.0, u * 1.18), 2.4);
        const bounce = u > 0.72 ? -0.045 * Math.sin(((u - 0.72) / 0.28) * Math.PI) : 0.0;
        tilt = 0.465 + (flatTilt - 0.465) * fallEase + bounce;
        precAngle = st.endPrecession;
        wobbleRadius = 0.013 * (1.0 - fallEase * 0.35);
        yLift = 0.004 + (0.0155 - 0.004) * fallEase;
      }

      pivot.rotation.y = precAngle;
      pivot.rotation.x = tilt;
      pivot.rotation.z = 0.0;
      pivot.position.set(
        baseX + Math.sin(precAngle) * wobbleRadius,
        baseY + yLift,
        baseZ + Math.cos(precAngle) * wobbleRadius
      );

      if (p >= 1.0) {
        st.active = false;
        st.rig.fallen = true;
        pivot.rotation.x = flatTilt;
        pivot.rotation.z = 0.0;
        pivot.position.y = baseY + 0.0155;
        this.showDreidelToast(st.outcome);
      }
    }

    // 3b. Subtle playful bounce feedback on bitten sufganiyot & gentle sip motion on Kiddush cup
    for (const item of this.sufganiyotItems) {
      if (item.popTimer > 0) {
        item.popTimer = Math.max(0, item.popTimer - dt);
        const s = 1.0 + 0.08 * Math.sin((item.popTimer / 0.24) * Math.PI);
        const curMesh = item.states[item.state];
        if (curMesh) curMesh.scale.setScalar(s);
      }
    }
    if (this.wineSipAnim > 0 && this.kiddushRoot) {
      this.wineSipAnim = Math.max(0, this.wineSipAnim - dt);
      const u = this.wineSipAnim / 0.36;
      const lift = Math.sin(u * Math.PI);
      this.kiddushRoot.position.y = RUNNER_Y + 0.012 * lift;
      this.kiddushRoot.rotation.z = 0.06 * lift;
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
