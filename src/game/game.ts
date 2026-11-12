import {
  AdditiveBlending,
  DoubleSide,
  Euler,
  Group,
  LineBasicMaterial,
  LineLoop,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  SphereGeometry,
  Sprite,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Sound } from './audio.js';
import { makeGlow } from './fx.js';
import { HandTracker, Hand } from './hands.js';
import {
  dayKey, hashSeed, loadSave, NAMES, persist, SaveData, yesterdayKey,
} from './save.js';
import { Btn, Panel, text } from './ui.js';
import { D, Level, Log, makeHomeLevel, makeLevel, Valley, W } from './valley.js';
import { Perception, Wisp } from './wisp.js';

type Phase = 'calibrate' | 'home' | 'dusk' | 'result';
interface Zone { x: number; z: number; r: number; y: number; until: number; kind: 'palm' | 'dome' | 'temp' }

const STORM_WARN = 3.5;
const STORM_LEN = 8;
const DWELL = 1.1;

export class Game {
  valley = new Valley();
  hands: HandTracker;
  snd = new Sound();
  save: SaveData = loadSave();
  phase: Phase = 'calibrate';
  wisps: Wisp[] = [];
  root = new Group();

  private renderer: WebGLRenderer;
  private camera: PerspectiveCamera;
  private scene: Object3D;
  private player: Object3D;
  private t = 0;
  private duskT = 0;
  private level: Level = makeHomeLevel();
  private daily = false;
  private paused = false;

  // placement
  private est = { pos: new Vector3(0, 0.75, -0.5), yaw: 0, scale: 1, havePlane: false };
  private placedK = 0;
  private tableY = 0.75;
  private ghost: LineLoop;
  private calibProg = 0;
  private calibWait = 0;
  private planeScan = 0;
  private meshScan = 0;
  private sensed = new Map<object, import('./valley.js').Rock>();
  sensedCount = 0;

  // ui
  private main = new Panel(0.36, 0.23);
  private hud = new Panel(0.27, 0.095);
  private hudPos = new Vector3();
  private hint = '';
  private hover: Btn | null = null;
  private dwellBtn: Btn | null = null;
  private dwell = 0;
  private armed = new Map<Hand, boolean>();
  private rayHit = new Set<Hand>();
  private autoStart = false;
  private cursors: Sprite[] = [];
  private reticle: Sprite;
  private guide: Sprite;
  private domes: Mesh[] = [];
  private zones: Zone[] = [];
  private tempZones: Zone[] = [];
  private rain: Points;
  private rainPos: Float32Array;
  private raining = false;
  private warning = false;
  private stormIdx = -1;
  private shelteredOnce = false;
  private lastThink = 0;
  private homeCount = 0;
  private lostCount = 0;
  private resultStars = 0;
  private resultNew = 0;
  private welcome = '';
  private ray = new Raycaster();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private gazeHit = new Vector3();
  private recog: any = null;
  private voiceStatus = '';
  private tutStart = 0;
  private bridgesEver = 0;

  constructor(
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    scene: Object3D,
    player: Object3D,
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;
    this.player = player;
    this.hands = new HandTracker(renderer, camera, player);
    scene.add(this.root);
    this.root.add(this.valley.group);
    this.valley.group.visible = false;

    // ghost outline shown while you place your table
    const g = new BufferGeometry();
    const hw = (W + 0.04) / 2;
    const hd = (D + 0.04) / 2;
    g.setAttribute('position', new Float32BufferAttribute([-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd], 3));
    this.ghost = new LineLoop(g, new LineBasicMaterial({ color: 0x35d0ff, transparent: true, opacity: 0.9 }));
    this.root.add(this.ghost);

    // cursors for hands
    for (let i = 0; i < 3; i++) {
      const c = makeGlow(0xffffff, 0.035, 0.9);
      c.visible = false;
      c.renderOrder = 20;
      this.root.add(c);
      this.cursors.push(c);
    }
    this.reticle = makeGlow(0xffffff, 0.04, 0.9);
    this.reticle.renderOrder = 21;
    this.reticle.visible = false;
    this.root.add(this.reticle);
    this.guide = makeGlow(0xfff2a0, 0.12, 0.9);
    this.guide.renderOrder = 15;
    this.guide.visible = false;
    this.valley.group.add(this.guide);

    // shelter domes
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(
        new SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
        new MeshBasicMaterial({ color: 0x66e8ff, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      );
      const wf = new Mesh(
        new SphereGeometry(1.002, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new MeshBasicMaterial({ color: 0xb8f6ff, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      m.add(wf);
      m.visible = false;
      this.valley.group.add(m);
      this.domes.push(m);
    }

    // rain
    const N = 260;
    this.rainPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * W;
      this.rainPos[i * 3 + 1] = Math.random() * 0.3;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * D;
    }
    const rg = new BufferGeometry();
    rg.setAttribute('position', new Float32BufferAttribute(this.rainPos, 3));
    this.rain = new Points(rg, new PointsMaterial({ color: 0x9fd8ff, size: 0.006, transparent: true, opacity: 0.8, depthWrite: false }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.valley.group.add(this.rain);

    this.root.add(this.hud.group);
    this.valley.group.add(this.main.group);
    this.main.group.position.set(0, 0.14, -D / 2 - 0.03);
    this.main.group.rotation.x = -0.45;
    this.hudPos.set(0, 1.2, -0.5);

    try {
      this.autoStart = new URLSearchParams(location.search).get('auto') === '1';
    } catch {
      /* no URL access */
    }
    this.applySettings();
    this.setupInput();
    renderer.xr.addEventListener('sessionstart', () => {
      this.snd.ensure();
      this.toCalibrate();
    });
    renderer.xr.addEventListener('sessionend', () => this.autoPlaceDesktop());

    if (!renderer.xr.isPresenting) this.autoPlaceDesktop();
    this.makeWelcome();
  }

  // ---------- setup -------------------------------------------------------

  private setupInput(): void {
    const el = this.renderer.domElement;
    const first = () => this.snd.ensure();
    el.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
    el.addEventListener('pointerdown', (e) => {
      if (this.renderer.xr.isPresenting) return;
      const r = el.getBoundingClientRect();
      const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      if (!this.main.group.visible) return;
      const hit = this.ray.intersectObject(this.main.mesh, false)[0];
      if (hit) {
        this.main.mesh.worldToLocal(this.tmp.copy(hit.point));
        const b = this.main.btnAt(this.tmp);
        if (b) {
          this.hands.cancelMouse();
          this.press(b);
        }
      }
    });
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.valley.applyPalette(s.contrast);
    this.main.contrast = s.contrast;
    this.hud.contrast = s.contrast;
    this.wisps.forEach((w) => w.setContrast(s.contrast));
    if (s.voice) this.startVoice();
    else this.stopVoice();
  }

  private autoPlaceDesktop(): void {
    this.est.pos.set(0, 0.75, -0.5);
    this.est.yaw = 0;
    this.est.scale = 1;
    this.tableY = 0.75;
    this.hands.tableY = 0.75;
    this.place();
  }

  private toCalibrate(): void {
    this.phase = 'calibrate';
    this.valley.group.visible = false;
    this.main.group.visible = false;
    this.calibProg = 0;
    this.calibWait = 0;
    this.placedK = 0;
    this.clearWisps();
    this.ghost.visible = true;
  }

  private place(): void {
    this.valley.group.position.set(this.est.pos.x, this.tableY, this.est.pos.z);
    this.valley.group.rotation.y = this.est.yaw;
    this.valley.group.visible = true;
    this.valley.group.scale.setScalar(0.01);
    this.ghost.visible = false;
    this.placedK = 0;
    this.enterHome();
    if (this.autoStart) {
      // ?auto=1 skips the menu (handy for demos / recording)
      this.autoStart = false;
      setTimeout(() => this.phase === 'home' && this.startDusk(false), 2500);
    }
    this.snd.chime(4, 0.2);
    setTimeout(() => this.snd.chime(7, 0.2), 140);
    setTimeout(() => this.snd.chime(9, 0.2), 280);
  }

  private makeWelcome(): void {
    const away = (Date.now() - this.save.lastSeen) / 3600000;
    if (this.save.residents.length && away > 1) {
      const n = Math.min(12, Math.floor(away / 3));
      this.welcome = n > 0 ? `${n} sapling${n > 1 ? 's' : ''} sprouted while you were away` : 'Your valley missed you';
    } else if (this.save.streak > 1) {
      this.welcome = `${this.save.streak}-day streak. The valley glows brighter`;
    }
  }

  private growth(): number {
    const first = this.save.residents[0]?.born ?? Date.now();
    return Math.min(14, Math.floor((Date.now() - first) / (3 * 3600000)));
  }

  // ---------- phases ------------------------------------------------------

  private clearWisps(): void {
    this.sensed.clear();
    this.wisps.forEach((w) => this.valley.group.remove(w.group));
    this.wisps = [];
    this.hands.hands.forEach((h) => (h.grabbed = null));
    this.hands.mouseHand.grabbed = null;
  }

  private enterHome(): void {
    this.phase = 'home';
    this.clearWisps();
    this.raining = false;
    this.warning = false;
    this.level = makeHomeLevel();
    const res = this.save.residents;
    this.valley.load(this.level, res.length, res.length ? this.growth() : 0);
    res.slice(0, 18).forEach((r) => {
      const w = new Wisp(r.name, r.hue, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.25);
      this.addWisp(w);
    });
    this.rebuildMain();
  }

  private startDusk(daily: boolean): void {
    const tutorial = !this.save.tutorialDone;
    this.daily = daily && !tutorial;
    const diff = Math.min(3, Math.floor(this.save.dusks / 2));
    const seed = daily ? hashSeed(dayKey()) : (Math.random() * 1e9) | 0;
    this.level = makeLevel(seed, diff, tutorial);
    this.clearWisps();
    this.valley.load(this.level, 0, 0);
    const lv = this.level;
    for (let i = 0; i < lv.wisps; i++) {
      const hue = (0.5 + i * 0.137 + (seed % 100) / 400) % 1;
      const w = new Wisp(NAMES[(seed + i * 7) % NAMES.length], hue, lv.nest.x + (Math.random() - 0.5) * 0.04, lv.nest.z + (Math.random() - 0.5) * 0.06);
      this.addWisp(w);
    }
    this.phase = 'dusk';
    this.duskT = 0;
    this.homeCount = 0;
    this.lostCount = 0;
    this.stormIdx = -1;
    this.raining = false;
    this.warning = false;
    this.shelteredOnce = false;
    this.bridgesEver = 0;
    this.tutStart = this.t;
    this.tempZones = [];
    this.main.group.visible = false;
    this.snd.chime(2, 0.15);
  }

  private addWisp(w: Wisp): void {
    w.setContrast(this.save.settings.contrast);
    this.valley.group.add(w.group);
    this.wisps.push(w);
  }

  private finishDusk(): void {
    const total = this.level.wisps;
    this.wisps.forEach((w) => {
      if (w.state === 'live' || w.state === 'held') w.state = 'faint';
    });
    const homeW = this.wisps.filter((w) => w.state === 'home');
    const frac = homeW.length / total;
    const avg = homeW.reduce((a, w) => a + w.glow, 0) / Math.max(1, homeW.length);
    this.resultStars = frac >= 1 ? (avg > 0.55 ? 3 : 2) : frac >= 0.5 ? 1 : 0;
    this.resultNew = 0;
    const s = this.save;
    homeW.forEach((w) => {
      if (s.residents.length < 24) {
        s.residents.push({ hue: w.hue, name: w.name, born: Date.now() });
        this.resultNew++;
      }
    });
    const today = dayKey();
    if (s.lastDay !== today && (this.daily || s.lastDay === '' || !s.tutorialDone || true)) {
      s.streak = s.lastDay === yesterdayKey() ? s.streak + 1 : 1;
      s.lastDay = today;
      s.best = Math.max(s.best, s.streak);
    }
    s.dusks++;
    s.stars += this.resultStars;
    s.tutorialDone = true;
    s.lastSeen = Date.now();
    persist(s);
    this.phase = 'result';
    this.raining = false;
    this.rebuildMain();
    this.snd.fanfare();
    this.snd.setRain(0);
    this.snd.setTension(0);
  }

  // ---------- panels ------------------------------------------------------

  private press(b: Btn): void {
    this.snd.ensure();
    this.snd.chime(5, 0.12);
    b.on();
  }

  private toggle(key: 'gaze' | 'voice' | 'contrast'): void {
    this.save.settings[key] = !this.save.settings[key];
    persist(this.save);
    this.applySettings();
    this.rebuildMain();
  }

  private rebuildMain(): void {
    const p = this.main;
    const { w, h } = p.px();
    p.group.visible = true;
    const bw = (w - 90) / 2;
    if (this.phase === 'home') {
      const today = this.save.lastDay === dayKey();
      p.btns = [
        { id: 'daily', x: 30, y: h * 0.3, w: bw, h: h * 0.2, label: today ? 'Daily Dusk ✓' : 'Daily Dusk', on: () => this.startDusk(true), accent: '#ffd27a' },
        { id: 'quick', x: 60 + bw, y: h * 0.3, w: bw, h: h * 0.2, label: this.save.tutorialDone ? 'Quick Dusk' : 'Begin', on: () => this.startDusk(false) },
        { id: 'gaze', x: 30, y: h * 0.56, w: (w - 120) / 3, h: h * 0.16, label: 'Gaze', on: () => this.toggle('gaze'), active: () => this.save.settings.gaze },
        { id: 'voice', x: 60 + (w - 120) / 3, y: h * 0.56, w: (w - 120) / 3, h: h * 0.16, label: 'Voice', on: () => this.toggle('voice'), active: () => this.save.settings.voice },
        { id: 'contrast', x: 90 + (2 * (w - 120)) / 3, y: h * 0.56, w: (w - 120) / 3, h: h * 0.16, label: 'Contrast', on: () => this.toggle('contrast'), active: () => this.save.settings.contrast },
        { id: 'replace', x: 30, y: h * 0.78, w: w - 60, h: h * 0.14, label: 'Re-place valley on my table', on: () => (this.renderer.xr.isPresenting ? this.toCalibrate() : this.autoPlaceDesktop()) },
      ];
    } else if (this.phase === 'result') {
      p.btns = [
        { id: 'again', x: 30, y: h * 0.7, w: bw, h: h * 0.2, label: 'Another Dusk', on: () => this.startDusk(false), accent: '#ffd27a' },
        { id: 'home', x: 60 + bw, y: h * 0.7, w: bw, h: h * 0.2, label: 'My Valley', on: () => this.enterHome() },
      ];
    } else p.btns = [];
    p.draw = (c, pw, ph) => this.drawMain(c, pw, ph);
  }

  private drawMain(c: CanvasRenderingContext2D, w: number, h: number): void {
    const hc = this.save.settings.contrast;
    if (this.phase === 'home') {
      text(c, 'WISP HOLLOW', w / 2, h * 0.11, h * 0.1, hc ? '#ff0' : '#7fe8ff');
      const r = this.save.residents.length;
      const sub = r ? `${r} wisp${r > 1 ? 's' : ''} live here` + (this.save.streak > 0 ? `  ·  ${this.save.streak}-day streak` : '') : 'Guide the wisps home across your table';
      text(c, sub, w / 2, h * 0.22, h * 0.06, '#cfe3ff', 'center', 500, w * 0.92);
      if (this.welcome) text(c, this.welcome, w / 2, h * 0.975, h * 0.05, '#ffd27a', 'center', 600, w * 0.92);
    } else if (this.phase === 'result') {
      text(c, this.resultNew && this.resultStars > 0 ? 'They made it home!' : this.resultStars > 0 ? 'Some made it home' : 'The rain won this time', w / 2, h * 0.13, h * 0.09, hc ? '#ff0' : '#7fe8ff');
      text(c, '★'.repeat(this.resultStars) + '☆'.repeat(3 - this.resultStars), w / 2, h * 0.34, h * 0.17, '#ffd27a');
      text(c, `${this.homeCount} of ${this.level.wisps} home` + (this.resultNew ? `  ·  ${this.resultNew} joined your valley` : ''), w / 2, h * 0.52, h * 0.06, '#cfe3ff', 'center', 500);
      text(c, `${this.save.streak}-day streak · come back tomorrow to see what grows`, w / 2, h * 0.62, h * 0.045, '#9fb4e8', 'center', 500, w * 0.92);
    }
  }

  private drawHud(): void {
    const hc = this.save.settings.contrast;
    this.hud.draw = (c, w, h) => {
      if (this.phase === 'dusk') {
        const left = Math.max(0, this.level.duration - this.duskT);
        const m = Math.floor(left / 60);
        const s = String(Math.floor(left % 60)).padStart(2, '0');
        text(c, `🔥 ${this.homeCount}/${this.level.wisps}`, w * 0.22, h * 0.28, h * 0.3, hc ? '#ff0' : '#ffd27a');
        text(c, `${m}:${s}`, w * 0.78, h * 0.28, h * 0.3, '#fff');
      }
      text(c, this.hint, w / 2, h * (this.phase === 'dusk' ? 0.72 : 0.5), h * 0.2, hc ? '#fff' : '#cfeaff', 'center', 600, w * 0.92);
    };
    const left = Math.floor(Math.max(0, this.level.duration - this.duskT));
    this.hud.btns = [];
    this.hud.render(`${this.phase}|${this.hint}|${this.homeCount}|${left}`, null, 0);
  }

  // ---------- main loop ---------------------------------------------------

  update(dtRaw: number, time: number): void {
    const dt = Math.min(0.05, dtRaw);
    this.t = time;
    this.hands.update(dt);
    this.valley.update(dt, time);
    const xr = this.renderer.xr.isPresenting;

    if (this.phase === 'calibrate' && xr) this.updateCalibrate(dt);
    else this.updateWorld(dt, time);

    this.updateHud(dt);
    this.updateCursors();
  }

  private updateCalibrate(dt: number): void {
    const h = this.hands;
    const head = h.gazeOrigin;
    this.scanPlanes();
    // estimate where the table is until a palm confirms it
    if (!this.est.havePlane) {
      const fwd = this.tmp.copy(h.gazeDir).setY(0).normalize();
      this.est.pos.set(head.x + fwd.x * 0.55, head.y - 0.5, head.z + fwd.z * 0.55);
      this.est.yaw = Math.atan2(head.x - this.est.pos.x, head.z - this.est.pos.z);
    }
    this.calibWait += dt;
    let flat: Hand | null = null;
    for (const hd of h.active) {
      const down = hd.palmNormal.y < -0.78 || hd.palmNormal.y > 0.78;
      const lowAndStill = hd.speed < 0.06 && hd.palm.y < head.y - 0.2 && hd.palm.y > 0.15;
      // a flat palm anywhere low, or ANY steady hand touching the detected table surface
      const onPlane = this.est.havePlane && Math.abs(hd.palm.y - this.est.pos.y) < 0.1;
      if (lowAndStill && ((hd.spread < 0.04 && down) || onPlane)) flat = hd;
    }
    if (flat) this.calibProg = Math.min(1, this.calibProg + dt / 0.9);
    else this.calibProg = Math.max(0, this.calibProg - dt * 2);
    // No palm needed if the table is detected: after a few seconds it just places itself.
    const autoLeft = this.est.havePlane ? Math.ceil(5 - this.calibWait) : Math.ceil(12 - this.calibWait);
    this.hint = flat
      ? 'Hold still…'
      : this.est.havePlane
        ? `Table found — rest a hand on it (or wait ${Math.max(0, autoLeft)})`
        : `Rest your palm flat on your table (or wait ${Math.max(0, autoLeft)})`;
    this.ghost.position.set(this.est.pos.x, flat ? flat.palm.y - 0.012 : this.est.pos.y, this.est.pos.z);
    this.ghost.rotation.y = this.est.yaw;
    this.ghost.scale.setScalar(this.est.scale);
    (this.ghost.material as LineBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(this.t * 4) + this.calibProg * 0.5;
    if (this.calibProg >= 1 && flat) {
      this.tableY = flat.palm.y - 0.012;
      this.hands.tableY = this.tableY;
      if (!this.est.havePlane) {
        // valley extends away from the palm, toward the far side of the table
        const away = this.tmp.set(flat.palm.x - head.x, 0, flat.palm.z - head.z).normalize();
        this.est.pos.set(flat.palm.x + away.x * 0.26, this.tableY, flat.palm.z + away.z * 0.26);
        this.est.yaw = Math.atan2(head.x - this.est.pos.x, head.z - this.est.pos.z);
      }
      this.est.pos.y = this.tableY;
      this.place();
    } else if ((this.est.havePlane && this.calibWait > 5) || this.calibWait > 12) {
      // hands-free placement: on the detected table, or in front of you as a last resort
      this.tableY = this.est.pos.y;
      this.hands.tableY = this.tableY;
      this.place();
    }
  }

  private scanPlanes(): void {
    if (this.t - this.planeScan < 0.6) return;
    this.planeScan = this.t;
    const xr = this.renderer.xr;
    const frame = xr.getFrame() as any;
    const ref = xr.getReferenceSpace();
    const planes = frame?.detectedPlanes;
    if (!planes || !ref) return;
    let best: { score: number; c: Vector3; long: number; short: number } | null = null;
    const m = new Matrix4();
    for (const p of planes as Iterable<any>) {
      if (p.orientation !== 'horizontal') continue;
      const pose = frame.getPose(p.planeSpace, ref);
      if (!pose) continue;
      const y = pose.transform.position.y;
      if (y < 0.3 || y > 1.3) continue;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const pt of p.polygon as DOMPointReadOnly[]) {
        x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x);
        z0 = Math.min(z0, pt.z); z1 = Math.max(z1, pt.z);
      }
      m.fromArray(pose.transform.matrix);
      const c = new Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2).applyMatrix4(m);
      this.player.localToWorld(c);
      const d = Math.hypot(c.x - this.hands.gazeOrigin.x, c.z - this.hands.gazeOrigin.z);
      if (d > 1.3) continue;
      const wd = x1 - x0, dp = z1 - z0;
      const score = Math.min(wd, dp) * Math.max(wd, dp) - d * 0.2;
      if (!best || score > best.score) best = { score, c, long: Math.max(wd, dp), short: Math.min(wd, dp) };
    }
    if (best && best.short > 0.3) {
      this.est.havePlane = true;
      this.est.pos.copy(best.c);
      this.est.scale = Math.max(0.6, Math.min(1.1, Math.min(best.long / W, best.short / D)));
      this.est.yaw = Math.atan2(this.hands.gazeOrigin.x - best.c.x, this.hands.gazeOrigin.z - best.c.z);
    } else {
      this.est.havePlane = false;
      this.est.scale = 1;
    }
  }

  private toLocal(world: Vector3, out: Vector3): Vector3 {
    return this.valley.group.worldToLocal(out.copy(world));
  }

  private updateWorld(dt: number, time: number): void {
    const v = this.valley;
    const g = v.group;
    // bloom animation after placement
    if (this.placedK < 1 && g.visible) {
      this.placedK = Math.min(1, this.placedK + dt / 0.9);
      const k = this.placedK;
      const ease = 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08;
      g.scale.setScalar(Math.max(0.01, ease * this.est.scale));
    }
    if (!g.visible) return;
    g.updateMatrixWorld(true);
    const sc = g.scale.x || 1;
    void sc;

    const dusk = this.phase === 'dusk';
    if (dusk && !this.paused) this.duskT += dt;

    // storms
    this.updateStorm(dt);

    // shelter zones from hands + temp zones
    this.updateZones(time);

    this.scanMeshes();

    // interaction
    this.updatePanels(dt);
    this.updateGrabs(dt);
    if (this.save.settings.gaze) this.updateGaze(dt);
    else this.reticle.visible = false;

    // agents
    const threats: Perception['threats'] = [];
    for (const h of this.hands.active) {
      const l = this.toLocal(h.tip, this.tmp2);
      if (l.y < 0.1 && !h.pinch) threats.push({ x: l.x, z: l.z, speed: h.tipSpeed });
    }
    const perception: Perception = {
      valley: v,
      wisps: this.wisps,
      raining: this.raining,
      homeMode: this.phase !== 'dusk',
      covered: (x, z) => this.covered(x, z),
      shelterSpot: (x, z) => this.shelterSpot(x, z),
      threats,
    };
    const thinkNow = time - this.lastThink > 0.6;
    if (thinkNow) this.lastThink = time;
    for (const w of this.wisps) {
      w.covered = this.covered(w.pos.x, w.pos.y);
      if (this.paused) { w.render(time); continue; }
      if (thinkNow) w.think(time, perception);
      w.step(dt, time, v, this.raining, threats);
      if (w.state === 'live' && w.stuckTime > 0.8) this.unstick(w);
      if (dusk) this.rules(w, dt, time);
      w.render(time);
    }
    // pokes
    for (const h of this.hands.active) {
      if (h.pinch || h.tipSpeed < 0.35) continue;
      const l = this.toLocal(h.tip, this.tmp2);
      for (const w of this.wisps) {
        if (w.state !== 'live') continue;
        if (Math.hypot(w.pos.x - l.x, w.pos.y - l.z) < 0.03 && Math.abs(l.y - 0.03) < 0.045) {
          w.startle(time, l.x, l.z);
          this.snd.pop(l.x / W);
        }
      }
    }

    if (dusk) {
      if (this.wisps.every((w) => w.state === 'home' || w.state === 'faint') || this.duskT >= this.level.duration) this.finishDusk();
      this.snd.setTension(this.raining ? 1 : this.warning ? 0.6 : 0);
    }
    this.guideUpdate(time);
    // result/home panels stay readable: face the viewer slightly
    this.main.render(`${this.phase}|${this.save.residents.length}|${this.resultStars}|${this.homeCount}`, this.hover, this.dwellBtn === this.hover ? this.dwell / DWELL : 0);
  }

  private rules(w: Wisp, dt: number, time: number): void {
    const v = this.valley;
    if (w.state === 'live' || w.state === 'held') {
      if (this.raining && !w.covered) w.glow -= 0.1 * dt;
      if (w.state === 'held') {
        w.heldTime += dt;
        if (w.heldTime > 2.5) w.glow -= 0.05 * dt;
      } else w.heldTime = 0;
      for (const c of v.caps) {
        if (Math.hypot(c.x - w.pos.x, c.z - w.pos.y) < 0.04) w.glow = Math.min(1, w.glow + 0.2 * dt);
      }
      if (w.glow <= 0) {
        w.glow = 0;
        w.state = 'faint';
        this.lostCount++;
        this.snd.thud(w.pos.x / W);
      }
    }
    if (w.state === 'live') {
      const hr = v.level.hearth;
      if (Math.hypot(w.pos.x - hr.x, w.pos.y - hr.z) < 0.05) {
        w.state = 'home';
        w.homeT = 0;
        this.homeCount++;
        this.snd.chime(this.homeCount * 2, 0.2, w.pos.x / W);
        this.wisps.forEach((o) => o.cheer(time));
      }
    }
  }

  private unstick(w: Wisp): void {
    const v = this.valley;
    for (let r = 0.01; r < 0.2; r += 0.01) {
      for (let a = 0; a < 6.28; a += 0.5) {
        const x = w.pos.x + Math.cos(a) * r;
        const z = w.pos.y + Math.sin(a) * r;
        if (!v.blocked(x, z)) {
          w.pos.set(x, z);
          w.stuckTime = 0;
          return;
        }
      }
    }
  }

  // ---------- storms & shelter -------------------------------------------

  private updateStorm(dt: number): void {
    const storms = this.level.storms;
    const t = this.duskT;
    let rain = false;
    let warn = false;
    if (this.phase === 'dusk') {
      storms.forEach((s, i) => {
        if (t >= s - STORM_WARN && t < s) warn = true;
        if (t >= s && t < s + STORM_LEN) {
          rain = true;
          if (this.stormIdx < i) {
            this.stormIdx = i;
            this.snd.thunder();
          }
        }
      });
    }
    this.raining = rain;
    this.warning = warn;
    this.rain.visible = rain;
    this.snd.setRain(rain ? 1 : 0);
    if (rain) {
      const a = this.rain.geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 0.9;
        if (y < 0) y += 0.3;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    }
  }


  /**
   * Scene understanding: labelled objects Quest has detected (laptops, lamps, plants, storage...)
   * that sit on the table inside the valley become mountains, so your real clutter reshapes the map.
   * Falls back gracefully (and the manual pinch-stamp still works) when no meshes are available.
   */
  private scanMeshes(): void {
    if (!this.renderer.xr.isPresenting || this.t - this.meshScan < 1.5) return;
    this.meshScan = this.t;
    const xr = this.renderer.xr;
    const frame = xr.getFrame() as any;
    const ref = xr.getReferenceSpace();
    const meshes = frame?.detectedMeshes;
    if (!meshes || !ref) return;
    const v = this.valley;
    const skip = /table|floor|wall|ceiling|global|door|window/i;
    const seen = new Set<object>();
    const m = new Matrix4();
    const p = new Vector3();
    for (const mesh of meshes as Iterable<any>) {
      const label = String(mesh.semanticLabel ?? '');
      if (skip.test(label) || !mesh.vertices || mesh.vertices.length < 9) continue;
      const pose = frame.getPose(mesh.meshSpace, ref);
      if (!pose) continue;
      m.fromArray(pose.transform.matrix);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
      const verts = mesh.vertices as Float32Array;
      const stride = Math.max(3, Math.floor(verts.length / 3 / 64) * 3);
      for (let i = 0; i + 2 < verts.length; i += stride) {
        p.set(verts[i], verts[i + 1], verts[i + 2]).applyMatrix4(m);
        this.player.localToWorld(p);
        this.toLocal(p, p);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const r = Math.max(0.02, Math.min(0.07, Math.max(x1 - x0, z1 - z0) / 2));
      // must rest on the table (not hover or be a wall-sized thing) and sit inside the valley
      const onTable = y0 > -0.05 && y0 < 0.08 && y1 - y0 > 0.015 && y1 - y0 < 0.5 && x1 - x0 < 0.35 && z1 - z0 < 0.35;
      if (!onTable || !v.inBounds(cx, cz, 0.03)) continue;
      const lv = v.level;
      if (v.riverAt(cx, 0.03) >= 0 || Math.hypot(cx - lv.hearth.x, cz - lv.hearth.z) < 0.08 || Math.hypot(cx - lv.nest.x, cz - lv.nest.z) < 0.07) continue;
      seen.add(mesh);
      const have = this.sensed.get(mesh);
      if (have) {
        have.x = cx;
        have.z = cz;
        have.obj.position.set(cx, have.r * 0.8, cz);
      } else if (this.sensed.size < 6) {
        this.sensed.set(mesh, v.addRock(cx, cz, r, false, true));
        this.sensedCount++;
        this.snd.thud(cx / W);
        this.wisps.forEach((w) => { if (v.blocked(w.pos.x, w.pos.y)) this.unstick(w); });
      }
    }
    for (const [k, rock] of this.sensed) {
      if (!seen.has(k)) {
        v.removeRock(rock);
        this.sensed.delete(k);
      }
    }
  }

  private updateZones(time: number): void {
    this.zones.length = 0;
    const scale = this.valley.group.scale.x || 1;
    const act = this.hands.active;
    const used: Hand[] = [];
    for (const h of act) {
      const l = this.toLocal(h.palm, this.tmp2);
      const down = h.palmNormal.y < -0.62;
      if (down && h.spread < 0.09 && l.y > 0.03 && l.y < 0.3 / scale) {
        this.zones.push({ x: l.x, z: l.z, r: 0.075, y: l.y, until: 0, kind: 'palm' });
        used.push(h);
      }
    }
    // two cupped hands make a bigger dome
    if (act.length >= 2 && this.hands.hands[0].present && this.hands.hands[1].present) {
      const a = this.toLocal(this.hands.hands[0].palm, new Vector3());
      const b = this.toLocal(this.hands.hands[1].palm, new Vector3());
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.2 / scale && a.y > 0.03 && b.y > 0.03 && a.y < 0.3 && b.y < 0.3) {
        this.zones.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: 0.12, y: (a.y + b.y) / 2, until: 0, kind: 'dome' });
      }
    }
    this.tempZones = this.tempZones.filter((z) => z.until > time);
    this.tempZones.forEach((z) => this.zones.push(z));
    this.domes.forEach((d, i) => {
      const z = this.zones[i];
      d.visible = !!z;
      if (z) {
        d.position.set(z.x, 0, z.z);
        d.scale.set(z.r, Math.max(0.05, Math.min(0.14, z.y + 0.02)), z.r);
      }
    });
  }

  private covered(x: number, z: number): boolean {
    for (const zn of this.zones) if (Math.hypot(zn.x - x, zn.z - z) < zn.r) {
      if (this.raining) this.shelteredOnce = true;
      return true;
    }
    for (const c of this.valley.caps) if (Math.hypot(c.x - x, c.z - z) < 0.034) return true;
    return false;
  }

  private shelterSpot(x: number, z: number): Vector2 | null {
    let best: Vector2 | null = null;
    let bd = 0.45;
    const consider = (sx: number, sz: number) => {
      const d = Math.hypot(sx - x, sz - z);
      if (d < bd && this.canReach(x, sx)) {
        bd = d;
        best = new Vector2(sx, sz);
      }
    };
    this.zones.forEach((zn) => consider(zn.x, zn.z));
    this.valley.caps.forEach((c) => consider(c.x, c.z));
    return best;
  }

  private canReach(x0: number, x1: number): boolean {
    const v = this.valley;
    return v.level.rivers.every((r, i) => (x0 < r.x) === (x1 < r.x) || v.bridges.some((b) => b.river === i));
  }

  // ---------- grabbing ----------------------------------------------------

  private updateGrabs(dt: number): void {
    const v = this.valley;
    const l = this.tmp;
    for (const h of this.hands.active) {
      if (h.justPinched && !this.overPanel(h) && !this.rayHit.has(h)) this.tryGrab(h);
      if (h.grabbed) {
        if (!h.present || !h.pinch) {
          this.release(h);
        } else this.dragGrabbed(h, dt);
      } else if (h.justReleased && h.lastPinchTime < 0.45 && h.lastPinchTravel < 0.03 && !this.overPanel(h) && !this.rayHit.has(h)) {
        // quick pinch on empty air = raise a mountain exactly where your real object sits
        this.toLocal(h.pinchPoint, l);
        const s = v.level;
        if (this.phase === 'dusk' || this.phase === 'home') {
          if (v.inBounds(l.x, l.z, 0.04) && l.y < 0.2 / (v.group.scale.x || 1) && v.riverAt(l.x, 0.03) < 0 && Math.hypot(l.x - s.hearth.x, l.z - s.hearth.z) > 0.08 && Math.hypot(l.x - s.nest.x, l.z - s.nest.z) > 0.07) {
            v.removeOldestStamp(5);
            v.addRock(l.x, l.z, 0.03, true);
            this.snd.thud(l.x / W);
            this.wisps.forEach((w) => { if (v.blocked(w.pos.x, w.pos.y)) this.unstick(w); });
          }
        }
      }
    }
    // hands lost mid-grab
    for (const h of [...this.hands.hands, this.hands.mouseHand]) if (h.grabbed && !h.present) this.release(h);
  }

  private overPanel(h: Hand): boolean {
    if (!this.main.group.visible) return false;
    this.main.mesh.worldToLocal(this.tmp2.copy(h.pinchPoint));
    return this.main.inside(this.tmp2) && Math.abs(this.tmp2.z) < 0.1;
  }

  private tryGrab(h: Hand): void {
    const v = this.valley;
    const l = this.toLocal(h.pinchPoint, new Vector3());
    let best: Wisp | Log | null = null;
    let bd = 0.055;
    for (const w of this.wisps) {
      if (w.state !== 'live' && w.state !== 'faint') continue;
      if (w.state === 'faint') continue;
      const d = Math.hypot(w.pos.x - l.x, w.pos.y - l.z) + Math.abs(l.y - 0.04) * 0.4;
      if (d < bd) { bd = d; best = w; }
    }
    if (this.phase === 'dusk') {
      for (const lg of v.logs) {
        if (lg.heldBy >= 0) continue;
        const d = v.logDistance(lg, l.x, l.z) + Math.abs(l.y - lg.y) * 0.3;
        if (d < Math.min(bd, 0.045)) { bd = d; best = lg; }
      }
    }
    if (best) {
      h.grabbed = best;
      if (best instanceof Wisp) {
        this.lastGrabX.set(best, best.pos.x);
        best.state = 'held';
        best.heldBy = h.id;
        best.startle(this.t, l.x, l.z);
        best.state = 'held';
        this.snd.pop(l.x / W);
      } else {
        best.heldBy = h.id;
        v.removeBridge(best);
        this.snd.chime(3, 0.1, l.x / W);
      }
    }
  }

  private dragGrabbed(h: Hand, dt: number): void {
    const l = this.toLocal(h.pinchPoint, new Vector3());
    const o = h.grabbed;
    const k = Math.min(1, dt * 18);
    if (o instanceof Wisp) {
      o.pos.x += (Math.max(-W / 2 + 0.02, Math.min(W / 2 - 0.02, l.x)) - o.pos.x) * k;
      o.pos.y += (Math.max(-D / 2 + 0.02, Math.min(D / 2 - 0.02, l.z)) - o.pos.y) * k;
      o.vel.set(0, 0);
    } else if (o) {
      const lg = o as Log;
      lg.x += (l.x - lg.x) * k;
      lg.z += (l.z - lg.z) * k;
      lg.y += (Math.max(0.02, Math.min(0.2, l.y)) - lg.y) * k;
      if (h.kind === 'xr') {
        const a = this.toLocal(h.wrist, new Vector3());
        const dx = l.x - a.x;
        const dz = l.z - a.z;
        if (Math.hypot(dx, dz) > 0.02) {
          let target = Math.atan2(-dz, dx);
          let diff = target - lg.yaw;
          diff = ((((diff + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2;
          target = lg.yaw + diff;
          lg.yaw += diff * k;
        }
      }
      this.valley.syncLog(lg);
    }
  }

  private release(h: Hand): void {
    const v = this.valley;
    const o = h.grabbed;
    h.grabbed = null;
    if (o instanceof Wisp) {
      const startSide = o.pos.x;
      o.state = 'live';
      o.heldBy = -1;
      // dropped in water: splash and wash to the bank
      const ri = v.riverAt(o.pos.x);
      if (ri >= 0 && (!v.bridges.some((b) => b.river === ri) || Math.abs(o.pos.y - (v.bridges.find((b) => b.river === ri)?.z ?? 0)) > 0.036)) {
        const r = v.level.rivers[ri];
        o.pos.x = r.x + (o.pos.x < r.x ? -1 : 1) * (r.w / 2 + 0.03);
        o.glow = Math.max(0.05, o.glow - 0.2);
        this.snd.splash(o.pos.x / W);
      } else if (v.blocked(o.pos.x, o.pos.y)) this.unstick(o);
      // ferrying a wisp over unbridged water is allowed (accessible!) but they hate it
      if (this.phase === 'dusk') {
        const from = this.lastGrabX.get(o) ?? startSide;
        const crossed = v.level.rivers.some((r, i) => (from < r.x) !== (o.pos.x < r.x) && !v.bridges.some((b) => b.river === i));
        if (crossed) o.glow = Math.max(0.05, o.glow - 0.3);
      }
      this.lastGrabX.delete(o);
      o.cheer(this.t);
    } else if (o) {
      const lg = o as Log;
      lg.heldBy = -1;
      lg.y = 0.012;
      if (v.tryBridge(lg)) {
        this.bridgesEver++;
        this.snd.chime(7, 0.2, lg.x / W);
        setTimeout(() => this.snd.chime(11, 0.18), 120);
      } else {
        lg.x = Math.max(-W / 2 + 0.08, Math.min(W / 2 - 0.08, lg.x));
        lg.z = Math.max(-D / 2 + 0.03, Math.min(D / 2 - 0.03, lg.z));
        this.snd.thud(lg.x / W);
        v.syncLog(lg);
      }
    }
  }
  private lastGrabX = new Map<Wisp, number>();

  // ---------- panels, gaze, voice ----------------------------------------

  private updatePanels(dt: number): void {
    this.rayHit.clear();
    if (!this.main.group.visible) return;
    this.hover = null;
    // point-and-pinch (hand) / point-and-trigger (controller) at the menu
    for (const h of this.hands.active) {
      if (!h.hasRay) continue;
      this.ray.set(h.rayOrigin, h.rayDir);
      const hit = this.ray.intersectObject(this.main.mesh, false)[0];
      if (!hit) continue;
      this.main.mesh.worldToLocal(this.tmp2.copy(hit.point));
      const b = this.main.btnAt(this.tmp2);
      if (!b) continue;
      this.hover = b;
      this.rayHit.add(h);
      if (h.justPinched) {
        this.press(b);
        return;
      }
    }
    const dwellOwner = this.dwellBtn;
    void dwellOwner;
    for (const h of this.hands.active) {
      if (h.kind !== 'xr') continue;
      this.main.mesh.worldToLocal(this.tmp2.copy(h.tip));
      const l = this.tmp2;
      const scaleZ = this.valley.group.scale.x || 1;
      const lz = l.z * scaleZ;
      const inside = this.main.inside(l) && lz > -0.04 && lz < 0.07;
      const b = inside ? this.main.btnAt(l) : null;
      if (b) this.hover = b;
      const armed = this.armed.get(h) ?? true;
      if (b && armed && lz < 0.014) {
        this.armed.set(h, false);
        this.press(b);
        return;
      }
      if (!b || lz > 0.045) this.armed.set(h, true);
    }
    void dt;
  }

  private updateGaze(dt: number): void {
    const h = this.hands;
    const sc = this.valley.group.scale.x || 1;
    let target: { kind: 'btn' | 'wisp' | 'log' | 'ground'; ref: any; p: Vector3 } | null = null;
    // panel buttons first
    if (this.main.group.visible) {
      this.ray.set(h.gazeOrigin, h.gazeDir);
      const hit = this.ray.intersectObject(this.main.mesh, false)[0];
      if (hit) {
        this.main.mesh.worldToLocal(this.tmp2.copy(hit.point));
        const b = this.main.btnAt(this.tmp2);
        if (b) target = { kind: 'btn', ref: b, p: hit.point.clone() };
      }
    }
    if (!target && h.gazeOnPlane(this.tableY + 0.025 * sc, this.gazeHit)) {
      const l = this.toLocal(this.gazeHit, new Vector3());
      if (this.valley.inBounds(l.x, l.z, 0)) {
        let bd = 0.05;
        for (const w of this.wisps) {
          if (w.state !== 'live') continue;
          const d = Math.hypot(w.pos.x - l.x, w.pos.y - l.z);
          if (d < bd) { bd = d; target = { kind: 'wisp', ref: w, p: this.gazeHit.clone() }; }
        }
        if (!target && this.phase === 'dusk') {
          for (const lg of this.valley.logs) {
            if (lg.bridge) continue;
            if (this.valley.logDistance(lg, l.x, l.z) < 0.05) target = { kind: 'log', ref: lg, p: this.gazeHit.clone() };
          }
        }
        if (!target && this.raining) target = { kind: 'ground', ref: l, p: this.gazeHit.clone() };
      }
    }
    if (!target) {
      this.dwell = 0;
      this.dwellBtn = null;
      this.reticle.visible = false;
      return;
    }
    const same = this.dwellRef === target.ref;
    this.dwellRef = target.ref;
    this.dwell = same ? this.dwell + dt : 0;
    if (target.kind === 'btn') {
      this.hover = target.ref as Btn;
      this.dwellBtn = target.ref as Btn;
    }
    this.reticle.visible = true;
    this.reticle.position.copy(target.p);
    this.reticle.scale.setScalar(0.03 + 0.05 * Math.min(1, this.dwell / DWELL));
    if (this.dwell >= DWELL) {
      this.dwell = 0;
      this.dwellRef = null;
      this.gazeAct(target.kind, target.ref);
    }
  }
  private dwellRef: unknown = null;

  private gazeAct(kind: string, ref: any): void {
    const now = this.t;
    if (kind === 'btn') this.press(ref as Btn);
    else if (kind === 'wisp') {
      (ref as Wisp).callUntil = now + 6;
      this.snd.chime(6, 0.14);
    } else if (kind === 'log') this.autoBridge(ref as Log);
    else if (kind === 'ground') {
      this.tempZones.push({ x: ref.x, z: ref.z, r: 0.1, y: 0.1, until: now + 3, kind: 'temp' });
      this.snd.chime(4, 0.14);
    }
  }

  private autoBridge(lg?: Log): void {
    const v = this.valley;
    const log = lg ?? v.logs.find((x) => !x.bridge && x.heldBy < 0);
    if (!log) return;
    const ri = v.level.rivers.findIndex((_, i) => !v.bridges.some((b) => b.river === i));
    if (ri < 0) return;
    // put it where wisps are already waiting, else mid-valley
    const waiting = this.wisps.filter((w) => w.goal === 'bank' && w.state === 'live');
    log.x = v.level.rivers[ri].x;
    log.z = waiting.length ? waiting[0].pos.y : 0;
    log.yaw = 0;
    if (v.tryBridge(log)) {
      this.bridgesEver++;
      this.snd.chime(7, 0.2);
    }
  }

  private startVoice(): void {
    if (this.recog) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      this.voiceStatus = 'Voice not supported here';
      return;
    }
    try {
      const r = new SR();
      r.continuous = true;
      r.interimResults = false;
      r.lang = 'en-US';
      r.onresult = (e: any) => {
        const said = String(e.results[e.results.length - 1][0].transcript).toLowerCase();
        this.voiceCommand(said);
      };
      r.onend = () => {
        if (this.recog === r && this.save.settings.voice) try { r.start(); } catch { /* already started */ }
      };
      r.start();
      this.recog = r;
      this.voiceStatus = 'Say: home · shelter · bridge';
    } catch {
      this.voiceStatus = 'Voice unavailable';
    }
  }

  private stopVoice(): void {
    if (this.recog) {
      const r = this.recog;
      this.recog = null;
      try { r.stop(); } catch { /* ignore */ }
    }
    this.voiceStatus = '';
  }

  private voiceCommand(said: string): void {
    const now = this.t;
    if (this.phase !== 'dusk') return;
    if (/home|go|follow/.test(said)) this.wisps.forEach((w) => (w.callUntil = now + 6));
    else if (/shelter|umbrella|cover|rain/.test(said)) {
      const live = this.wisps.filter((w) => w.state === 'live');
      if (live.length) {
        const cx = live.reduce((a, w) => a + w.pos.x, 0) / live.length;
        const cz = live.reduce((a, w) => a + w.pos.y, 0) / live.length;
        this.tempZones.push({ x: cx, z: cz, r: 0.15, y: 0.12, until: now + 5, kind: 'temp' });
      }
    } else if (/bridge|log|plank/.test(said)) this.autoBridge();
    else if (/pause|wait|stop/.test(said)) this.paused = true;
    else if (/resume|play|continue/.test(said)) this.paused = false;
    this.snd.chime(8, 0.12);
  }

  // ---------- HUD, guide, cursors ----------------------------------------

  private updateHud(dt: number): void {
    // lazy-follow, narrow-FoV placement: low and centred, so it works on any headset
    const cam = this.hands.gazeOrigin;
    // gaze direction with limited pitch, then pushed down so it never covers what you're looking at
    const dir = this.tmp.copy(this.hands.gazeDir);
    dir.y = Math.max(-0.55, Math.min(0.15, dir.y)) - 0.38;
    dir.normalize();
    const want = this.tmp2.set(cam.x + dir.x * 0.7, cam.y + dir.y * 0.7, cam.z + dir.z * 0.7);
    this.hudPos.lerp(want, 1 - Math.exp(-5 * dt));
    this.hud.group.position.copy(this.hudPos);
    this.hud.group.lookAt(cam.x, cam.y - 0.05, cam.z);
    this.updateHint();
    this.hud.group.visible = this.hint !== '' || this.phase === 'dusk';
    this.hud.group.scale.setScalar(this.phase === 'calibrate' ? 1.8 : 1);
    this.drawHud();
  }

  private updateHint(): void {
    if (this.phase === 'calibrate') return;
    const lvl = this.level;
    if (this.phase === 'home') {
      this.hint = this.voiceStatus || (this.save.residents.length ? 'Poke a wisp · pinch the air to raise a mountain' : 'Press Begin with a finger');
      if (this.save.settings.gaze) this.hint = 'Look at a button to select it';
      return;
    }
    if (this.phase === 'result') {
      this.hint = '';
      return;
    }
    const waiting = this.wisps.some((w) => w.goal === 'bank' && w.state === 'live');
    const t = this.t - this.tutStart;
    if (this.raining) this.hint = this.shelteredOnce ? 'Keep them covered!' : 'Rain! Hold an open palm over your wisps';
    else if (this.warning) this.hint = 'Storm coming — get ready to cover them';
    else if (lvl.tutorial && this.bridgesEver === 0) this.hint = this.save.settings.gaze ? 'Look at the log to lay it across' : 'Pinch the glowing log, lay it over the river';
    else if (waiting && this.valley.bridges.length < lvl.rivers.length) this.hint = 'Wisps are waiting — bridge the river';
    else if (lvl.tutorial && t > 40 && this.raining === false && this.valley.rocks.length === 0 && this.hands.hasRealHands) this.hint = 'Tip: pinch the air over a real object for a mountain';
    else if (this.voiceStatus) this.hint = this.voiceStatus;
    else this.hint = 'Guide them home to the fire';
  }

  private guideUpdate(time: number): void {
    const v = this.valley;
    let show = false;
    if (this.phase === 'dusk' && this.level.tutorial) {
      const held = v.logs.find((l) => l.heldBy >= 0);
      const free = v.logs.find((l) => !l.bridge);
      if (this.bridgesEver === 0 && held) {
        this.guide.position.set(v.level.rivers[0].x, 0.03, held.z);
        show = true;
      } else if (this.bridgesEver === 0 && free) {
        this.guide.position.set(free.x, 0.06, free.z);
        show = true;
      } else if (this.raining && !this.shelteredOnce) {
        const w = this.wisps.find((x) => x.state === 'live' && !x.covered);
        if (w) {
          this.guide.position.set(w.pos.x, 0.12, w.pos.y);
          show = true;
        }
      }
    }
    this.guide.visible = show;
    if (show) this.guide.scale.setScalar(0.09 + Math.sin(time * 6) * 0.025);
  }

  private updateCursors(): void {
    const hands = [this.hands.hands[0], this.hands.hands[1], this.hands.mouseHand];
    hands.forEach((h, i) => {
      const c = this.cursors[i];
      c.visible = h.present && h.kind === 'mouse' ? true : h.present;
      if (!c.visible) return;
      c.position.copy(h.pinch ? h.pinchPoint : h.tip);
      c.scale.setScalar(h.pinch ? 0.05 : 0.028);
      c.material.opacity = h.pinch ? 1 : 0.7;
    });
  }
}

void Object3D;
void Euler;
