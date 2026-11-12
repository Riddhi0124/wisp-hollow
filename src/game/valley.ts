import {
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  TorusGeometry,
} from 'three';
import { makeGlow } from './fx.js';
import { mulberry32 } from './save.js';

export const W = 0.72;
export const D = 0.44;
export const LOG_LEN = 0.16;

export interface RiverDef { x: number; w: number }
export interface Level {
  seed: number;
  home: boolean;
  tutorial: boolean;
  rivers: RiverDef[];
  nest: { x: number; z: number };
  hearth: { x: number; z: number };
  rocks: { x: number; z: number; r: number }[];
  caps: { x: number; z: number }[];
  wisps: number;
  logs: number;
  storms: number[];
  duration: number;
}
export interface Rock { x: number; z: number; r: number; obj: Object3D; stamped: boolean }
export interface Cap { x: number; z: number; obj: Group; glow: Sprite; phase: number }
export interface Log { group: Group; x: number; z: number; yaw: number; y: number; bridge: Bridge | null; heldBy: number }
export interface Bridge { river: number; z: number; log: Log }

export const PALETTES = {
  normal: { ground: 0x0b1430, rim: 0x35d0ff, river: 0x1b7fe0, riverGlow: 0x66e0ff, rock: 0x3b4170, rockEdge: 0x9aa3ff, hearth: 0xffa640, cap: 0xff5fa8, log: 0xb87a3a, logEdge: 0xffd38a, tree: 0x2fbf8f, dots: 0x35d0ff },
  contrast: { ground: 0x000000, rim: 0xffffff, river: 0x0030ff, riverGlow: 0xffffff, rock: 0x000000, rockEdge: 0xffff00, hearth: 0xffff00, cap: 0xff00ff, log: 0x000000, logEdge: 0xffaa00, tree: 0x00ff66, dots: 0xffffff },
};

export function makeLevel(seed: number, difficulty: number, tutorial: boolean): Level {
  const r = mulberry32(seed);
  const rivers: RiverDef[] = [];
  if (tutorial || difficulty < 2) rivers.push({ x: (r() - 0.5) * 0.1, w: 0.09 });
  else {
    rivers.push({ x: -0.13 + (r() - 0.5) * 0.04, w: 0.075 });
    rivers.push({ x: 0.12 + (r() - 0.5) * 0.04, w: 0.075 });
  }
  const nest = { x: -0.3, z: (r() - 0.5) * 0.16 };
  const hearth = { x: 0.3, z: (r() - 0.5) * 0.16 };
  const free = (x: number, z: number, pad: number) =>
    rivers.every((v) => Math.abs(x - v.x) > v.w / 2 + pad) &&
    Math.hypot(x - nest.x, z - nest.z) > 0.09 &&
    Math.hypot(x - hearth.x, z - hearth.z) > 0.09;
  const rocks: Level['rocks'] = [];
  const caps: Level['caps'] = [];
  const nRocks = tutorial ? 0 : 4 + Math.min(4, difficulty * 2);
  for (let tries = 0; rocks.length < nRocks && tries < 200; tries++) {
    const x = (r() - 0.5) * (W - 0.1);
    const z = (r() - 0.5) * (D - 0.1);
    const rad = 0.022 + r() * 0.016;
    if (free(x, z, rad + 0.02) && rocks.every((k) => Math.hypot(k.x - x, k.z - z) > k.r + rad + 0.04)) rocks.push({ x, z, r: rad });
  }
  for (let tries = 0; caps.length < (tutorial ? 2 : 5) && tries < 200; tries++) {
    const x = (r() - 0.5) * (W - 0.12);
    const z = (r() - 0.5) * (D - 0.12);
    if (free(x, z, 0.04) && rocks.every((k) => Math.hypot(k.x - x, k.z - z) > k.r + 0.04)) caps.push({ x, z });
  }
  return {
    seed,
    home: false,
    tutorial,
    rivers,
    nest,
    hearth,
    rocks,
    caps,
    wisps: tutorial ? 2 : Math.min(6, 3 + difficulty),
    logs: rivers.length + (tutorial ? 0 : 1),
    storms: tutorial ? [26] : [34 + r() * 6, 82 + r() * 8, 128 + r() * 8],
    duration: tutorial ? 100 : 180,
  };
}

export function makeHomeLevel(): Level {
  return {
    seed: 1, home: true, tutorial: false, rivers: [], nest: { x: -2, z: 0 }, hearth: { x: 0, z: 0 },
    rocks: [], caps: [{ x: -0.2, z: 0.1 }, { x: 0.22, z: -0.1 }, { x: -0.05, z: -0.15 }],
    wisps: 0, logs: 0, storms: [], duration: 0,
  };
}

export class Valley {
  group = new Group();
  content = new Group();
  level: Level = makeHomeLevel();
  rocks: Rock[] = [];
  caps: Cap[] = [];
  logs: Log[] = [];
  bridges: Bridge[] = [];
  riverTex: CanvasTexture;
  private fire: Sprite[] = [];
  private beam?: Mesh;
  private trees: Object3D[] = [];
  private contrast = false;
  private m = {
    ground: new MeshBasicMaterial({ transparent: true, opacity: 0.78, depthWrite: false }),
    rim: new LineBasicMaterial({}),
    river: new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide }),
    riverGlow: new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }),
    rock: new MeshBasicMaterial({}),
    rockEdge: new LineBasicMaterial({}),
    hearth: new MeshBasicMaterial({}),
    cap: new MeshBasicMaterial({}),
    log: new MeshBasicMaterial({}),
    logEdge: new LineBasicMaterial({}),
    tree: new MeshBasicMaterial({}),
    dots: new MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }),
  };

  constructor() {
    const g = this.group;
    const ground = new Mesh(new PlaneGeometry(W + 0.04, D + 0.04), this.m.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.0005;
    g.add(ground);
    const pts: number[] = [];
    const hw = W / 2 + 0.02;
    const hd = D / 2 + 0.02;
    pts.push(-hw, 0.002, -hd, hw, 0.002, -hd, hw, 0.002, hd, -hw, 0.002, hd);
    const rg = new BufferGeometry();
    rg.setAttribute('position', new Float32BufferAttribute(pts, 3));
    g.add(new LineLoop(rg, this.m.rim));
    // dotted grid reads as "this is a surface" even in bright rooms
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(32, 32, 3, 0, Math.PI * 2);
    x.fill();
    const dt = new CanvasTexture(c);
    dt.wrapS = dt.wrapT = RepeatWrapping;
    dt.repeat.set(W / 0.04, D / 0.04);
    this.m.dots.map = dt;
    const dots = new Mesh(new PlaneGeometry(W + 0.04, D + 0.04), this.m.dots);
    dots.rotation.x = -Math.PI / 2;
    dots.position.y = 0.001;
    g.add(dots);
    // flowing river stripes
    const rc = document.createElement('canvas');
    rc.width = 64;
    rc.height = 128;
    const rx = rc.getContext('2d')!;
    rx.fillStyle = '#fff';
    rx.fillRect(0, 0, 64, 128);
    rx.strokeStyle = 'rgba(0,30,80,0.35)';
    rx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      rx.beginPath();
      rx.moveTo(10 + i * 14, 0);
      rx.bezierCurveTo(22 + i * 14, 40, -2 + i * 14, 90, 10 + i * 14, 128);
      rx.stroke();
    }
    this.riverTex = new CanvasTexture(rc);
    this.riverTex.wrapS = this.riverTex.wrapT = RepeatWrapping;
    this.riverTex.repeat.set(1, 3);
    this.m.river.map = this.riverTex;
    g.add(this.content);
    this.applyPalette(false);
  }

  applyPalette(contrast: boolean): void {
    this.contrast = contrast;
    const p = contrast ? PALETTES.contrast : PALETTES.normal;
    this.m.ground.color.setHex(p.ground);
    this.m.ground.opacity = contrast ? 0.92 : 0.78;
    this.m.rim.color.setHex(p.rim);
    this.m.river.color.setHex(p.river);
    this.m.riverGlow.color.setHex(p.riverGlow);
    this.m.rock.color.setHex(p.rock);
    this.m.rockEdge.color.setHex(p.rockEdge);
    this.m.hearth.color.setHex(p.hearth);
    this.m.cap.color.setHex(p.cap);
    this.m.log.color.setHex(p.log);
    this.m.logEdge.color.setHex(p.logEdge);
    this.m.tree.color.setHex(p.tree);
    this.m.dots.color.setHex(p.dots);
  }

  private clear(): void {
    this.content.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.content.clear();
    this.rocks = [];
    this.caps = [];
    this.logs = [];
    this.bridges = [];
    this.fire = [];
    this.trees = [];
  }

  load(level: Level, residents = 0, growth = 0): void {
    this.clear();
    this.level = level;
    level.rivers.forEach((rv) => {
      const water = new Mesh(new PlaneGeometry(rv.w, D + 0.04), this.m.river);
      water.rotation.x = -Math.PI / 2;
      water.position.set(rv.x, 0.004, 0);
      this.content.add(water);
      for (const s of [-1, 1]) {
        const bank = new Mesh(new PlaneGeometry(0.004, D + 0.04), this.m.riverGlow);
        bank.rotation.x = -Math.PI / 2;
        bank.position.set(rv.x + (s * rv.w) / 2, 0.005, 0);
        this.content.add(bank);
      }
    });
    level.rocks.forEach((r) => this.addRock(r.x, r.z, r.r, false));
    level.caps.forEach((c, i) => this.addCap(c.x, c.z, i));
    if (!level.home) this.addNest(level.nest.x, level.nest.z);
    this.addHearth(level.hearth.x, level.hearth.z);
    for (let i = 0; i < level.logs; i++) this.addLog(-0.3 + i * 0.12, D / 2 - 0.04);
    for (let i = 0; i < residents; i++) {
      const ring = Math.floor(i / 8);
      const a = (i % 8) * (Math.PI / 4) + ring * 0.4;
      this.addLantern(Math.cos(a) * (0.12 + ring * 0.045), Math.sin(a) * (0.12 + ring * 0.045) * 0.8);
    }
    for (let i = 0; i < growth; i++) {
      const a = i * 2.399;
      this.addTree(Math.cos(a) * (0.22 + (i % 3) * 0.04), Math.sin(a) * 0.16 + 0.02, 0.6 + (i % 4) * 0.15);
    }
  }

  private edged(geo: BufferGeometry, mat: MeshBasicMaterial, edge: LineBasicMaterial): Group {
    const g = new Group();
    g.add(new Mesh(geo, mat));
    g.add(new LineSegments(new EdgesGeometry(geo), edge));
    return g;
  }

  addRock(x: number, z: number, r: number, stamped: boolean): Rock {
    const obj = this.edged(new IcosahedronGeometry(r, 0), this.m.rock, this.m.rockEdge);
    obj.scale.y = 1.15;
    obj.position.set(x, r * 0.8, z);
    obj.rotation.y = x * 31;
    this.content.add(obj);
    if (stamped) {
      const ring = makeGlow(0xffffff, r * 4.2, 0.6);
      ring.position.set(x, r * 0.8, z);
      this.content.add(ring);
      setTimeout(() => ring.parent?.remove(ring), 450);
    }
    const rock = { x, z, r, obj, stamped };
    this.rocks.push(rock);
    return rock;
  }

  removeOldestStamp(max: number): void {
    const stamps = this.rocks.filter((r) => r.stamped);
    while (stamps.length >= max) {
      const old = stamps.shift()!;
      this.content.remove(old.obj);
      this.rocks.splice(this.rocks.indexOf(old), 1);
    }
  }

  private addCap(x: number, z: number, i: number): void {
    const g = new Group();
    const stalk = new Mesh(new CylinderGeometry(0.004, 0.006, 0.026, 6), this.m.log);
    stalk.position.y = 0.013;
    const head = new Mesh(new SphereGeometry(0.02, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.m.cap);
    head.position.y = 0.026;
    const glow = makeGlow(0xff5fa8, 0.1, 0.55);
    glow.position.y = 0.03;
    g.add(stalk, head, glow);
    g.position.set(x, 0, z);
    this.content.add(g);
    this.caps.push({ x, z, obj: g, glow, phase: i * 1.7 });
  }

  private addNest(x: number, z: number): void {
    const t = new Mesh(new TorusGeometry(0.04, 0.007, 6, 20), this.m.rock);
    t.rotation.x = Math.PI / 2;
    t.position.set(x, 0.007, z);
    const glow = makeGlow(0x7fe0ff, 0.2, 0.5);
    glow.position.set(x, 0.03, z);
    this.content.add(t, glow);
  }

  private addHearth(x: number, z: number): void {
    const ring = new Mesh(new TorusGeometry(0.036, 0.008, 6, 16), this.m.rock);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.008, z);
    const flame = new Mesh(new ConeGeometry(0.018, 0.05, 8), this.m.hearth);
    flame.position.set(x, 0.03, z);
    this.content.add(ring, flame);
    for (let i = 0; i < 3; i++) {
      const s = makeGlow(0xffa640, 0.16 + i * 0.07, 0.5 - i * 0.12);
      s.position.set(x, 0.04 + i * 0.01, z);
      this.content.add(s);
      this.fire.push(s);
    }
    // vertical beacon so the goal is findable from anywhere in the valley
    const beam = new Mesh(
      new CylinderGeometry(0.012, 0.03, 0.34, 12, 1, true),
      new MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.12, depthWrite: false, side: DoubleSide }),
    );
    beam.position.set(x, 0.17, z);
    this.content.add(beam);
    this.beam = beam;
  }

  private addLantern(x: number, z: number): void {
    const post = new Mesh(new CylinderGeometry(0.002, 0.002, 0.05, 4), this.m.log);
    post.position.set(x, 0.025, z);
    const glow = makeGlow(0xffd27a, 0.07, 0.8);
    glow.position.set(x, 0.055, z);
    this.content.add(post, glow);
  }

  addTree(x: number, z: number, s: number): void {
    const g = new Group();
    for (let i = 0; i < 3; i++) {
      const c = new Mesh(new ConeGeometry(0.026 - i * 0.006, 0.04, 7), this.m.tree);
      c.position.y = 0.02 + i * 0.026;
      g.add(c);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    this.content.add(g);
    this.trees.push(g);
  }

  addLog(x: number, z: number): Log {
    const geo = new CylinderGeometry(0.011, 0.011, LOG_LEN, 8);
    geo.rotateZ(Math.PI / 2);
    const g = this.edged(geo, this.m.log, this.m.logEdge);
    const glow = makeGlow(0xffd38a, 0.12, 0.4);
    g.add(glow);
    g.position.set(x, 0.012, z);
    this.content.add(g);
    const log: Log = { group: g, x, z, yaw: 0, y: 0.012, bridge: null, heldBy: -1 };
    this.logs.push(log);
    return log;
  }

  riverAt(x: number, pad = 0): number {
    return this.level.rivers.findIndex((r) => Math.abs(x - r.x) < r.w / 2 + pad);
  }

  inBounds(x: number, z: number, m = 0): boolean {
    return Math.abs(x) < W / 2 - m && Math.abs(z) < D / 2 - m;
  }

  /** Can a wisp stand here? Water blocks unless a bridge corridor crosses it. */
  blocked(x: number, z: number): boolean {
    if (!this.inBounds(x, z, 0.012)) return true;
    for (const r of this.rocks) if (Math.hypot(x - r.x, z - r.z) < r.r + 0.008) return true;
    const ri = this.riverAt(x);
    if (ri >= 0) {
      const b = this.bridges.find((br) => br.river === ri);
      if (!b || Math.abs(z - b.z) > 0.036) return true;
    }
    return false;
  }

  logDistance(log: Log, x: number, z: number): number {
    const dx = Math.cos(log.yaw);
    const dz = -Math.sin(log.yaw);
    const px = x - log.x;
    const pz = z - log.z;
    const t = Math.max(-LOG_LEN / 2, Math.min(LOG_LEN / 2, px * dx + pz * dz));
    return Math.hypot(px - dx * t, pz - dz * t);
  }

  /** Called when a log is released: if it spans a river, it becomes a bridge. */
  tryBridge(log: Log): boolean {
    this.removeBridge(log);
    const ri = this.riverAt(log.x, 0.03);
    if (ri < 0) return false;
    const crossing = Math.abs(Math.cos(log.yaw));
    if (crossing < 0.62) return false;
    const rv = this.level.rivers[ri];
    log.x = rv.x;
    log.yaw = 0;
    log.z = Math.max(-D / 2 + 0.05, Math.min(D / 2 - 0.05, log.z));
    log.y = 0.012;
    const b: Bridge = { river: ri, z: log.z, log };
    log.bridge = b;
    this.bridges = this.bridges.filter((x) => x.river !== ri);
    this.bridges.push(b);
    this.syncLog(log);
    return true;
  }

  removeBridge(log: Log): void {
    if (log.bridge) this.bridges = this.bridges.filter((b) => b !== log.bridge);
    log.bridge = null;
  }

  syncLog(log: Log): void {
    log.group.position.set(log.x, log.y, log.z);
    log.group.rotation.y = log.yaw;
  }

  update(dt: number, t: number): void {
    this.riverTex.offset.y -= dt * 0.35;
    this.fire.forEach((s, i) => {
      const f = 1 + Math.sin(t * (7 + i * 3) + i) * 0.12;
      s.scale.setScalar((0.16 + i * 0.07) * f);
    });
    if (this.beam) (this.beam.material as MeshBasicMaterial).opacity = (this.contrast ? 0.3 : 0.12) + Math.sin(t * 2) * 0.03;
    for (const c of this.caps) c.glow.material.opacity = 0.45 + Math.sin(t * 2.2 + c.phase) * 0.15;
    this.trees.forEach((tr, i) => (tr.rotation.z = Math.sin(t * 0.8 + i) * 0.03));
  }
}
