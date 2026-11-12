import { Color, Group, Sprite, SpriteMaterial, Vector2 } from 'three';
import { faceTextures, makeGlow, Mood } from './fx.js';
import { D, Valley, W } from './valley.js';

const MW = 12;
const MD = 8;

export type Goal = 'hearth' | 'bank' | 'cap' | 'wander' | 'friend' | 'shelter' | 'flee' | 'call';

/** What a wisp can perceive about the world each decision tick. */
export interface Perception {
  valley: Valley;
  wisps: Wisp[];
  raining: boolean;
  homeMode: boolean;
  /** Is (x,z) covered by an open palm / dome / mushroom cap? */
  covered: (x: number, z: number) => boolean;
  shelterSpot: (x: number, z: number) => Vector2 | null;
  threats: { x: number; z: number; speed: number }[];
}

/**
 * A wisp is a tiny autonomous agent: it decides what it wants with a utility score
 * (home, healing, shelter, company, curiosity), remembers where it got rained on,
 * and learns where bridges are. The player never steers it directly -- you shape the
 * world and it reacts.
 */
export class Wisp {
  pos = new Vector2();
  vel = new Vector2();
  y = 0.025;
  glow = 1;
  mood: Mood = 'calm';
  state: 'live' | 'held' | 'home' | 'faint' = 'live';
  goal: Goal = 'wander';
  target = new Vector2();
  heldBy = -1;
  heldTime = 0;
  covered = false;
  stuckTime = 0;
  hue: number;
  speed: number;
  private next = 0;
  private fleeUntil = 0;
  callUntil = 0;
  private happyUntil = 0;
  private memory = new Float32Array(MW * MD);
  private phase = Math.random() * 6;
  readonly group = new Group();
  private body: Sprite;
  private halo: Sprite;
  private color = new Color();
  homeT = 0;

  constructor(
    public name: string,
    hue: number,
    x: number,
    z: number,
  ) {
    this.hue = hue;
    this.speed = 0.055 + Math.random() * 0.02;
    this.pos.set(x, z);
    this.target.set(x, z);
    this.color.setHSL(hue, 0.85, 0.62);
    this.body = new Sprite(new SpriteMaterial({ map: faceTextures().calm, color: this.color, transparent: true, depthWrite: false }));
    this.body.scale.setScalar(0.05);
    this.halo = makeGlow(this.color.getHex(), 0.16, 0.7);
    this.group.add(this.halo, this.body);
    this.body.renderOrder = 3;
  }

  private cell(x: number, z: number): number {
    const cx = Math.max(0, Math.min(MW - 1, Math.floor(((x + W / 2) / W) * MW)));
    const cz = Math.max(0, Math.min(MD - 1, Math.floor(((z + D / 2) / D) * MD)));
    return cz * MW + cx;
  }

  startle(now: number, fromX: number, fromZ: number): void {
    if (this.state !== 'live') return;
    this.fleeUntil = now + 1.1;
    const dx = this.pos.x - fromX;
    const dz = this.pos.y - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    this.target.set(this.pos.x + (dx / l) * 0.1, this.pos.y + (dz / l) * 0.1);
    this.goal = 'flee';
    this.vel.set((dx / l) * 0.16, (dz / l) * 0.16);
  }

  cheer(now: number): void {
    this.happyUntil = now + 1.6;
  }

  /** Utility AI: pick the most attractive goal, then a concrete target for it. */
  think(now: number, p: Perception): void {
    if (this.state !== 'live') return;
    if (now < this.fleeUntil) return;
    const v = p.valley;
    const hearth = v.level.hearth;
    let best: Goal = 'wander';
    let bestScore = 0.28 + Math.random() * 0.12;
    let tx = this.pos.x;
    let tz = this.pos.y;

    const consider = (g: Goal, score: number, x: number, z: number) => {
      if (g === this.goal) score += 0.12; // hysteresis: don't dither
      if (score > bestScore) {
        bestScore = score;
        best = g;
        tx = x;
        tz = z;
      }
    };

    // 0. The player (by gaze or voice) asked me to head home.
    if (now < this.callUntil && !p.homeMode) {
      const r = this.route(v, hearth.x, hearth.z);
      consider(r.waiting ? 'bank' : 'call', 4, r.x, r.z);
    }
    // 1. Shelter when it rains and I'm exposed.
    if (p.raining && !this.covered) {
      const s = p.shelterSpot(this.pos.x, this.pos.y);
      if (s) consider('shelter', 1.5, s.x, s.y);
    }
    // 2. Heal at a glowcap when hurt.
    if (this.glow < 0.85) {
      let bd = 1e9;
      let bx = 0;
      let bz = 0;
      for (const c of v.caps) {
        const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.y);
        if (d < bd && this.reachable(v, c.x)) {
          bd = d;
          bx = c.x;
          bz = c.z;
        }
      }
      if (bd < 1e9) consider('cap', (1 - this.glow) * 1.4 - bd * 0.6, bx, bz);
    }
    // 3. Go home (the hearth) -- the actual objective, routed over bridges I've learned about.
    if (!p.homeMode) {
      const route = this.route(v, hearth.x, hearth.z);
      consider(route.waiting ? 'bank' : 'hearth', 0.75, route.x, route.z);
    }
    // 4. Company.
    const friends = p.wisps.filter((w) => w !== this && w.state === 'live');
    if (friends.length) {
      const f = friends[Math.floor(Math.random() * friends.length)];
      if (this.reachable(v, f.pos.x)) consider('friend', 0.32, f.pos.x, f.pos.y);
    }
    // 5. Curiosity -- but avoid places that got me wet before.
    for (let i = 0; i < 4; i++) {
      const x = (Math.random() - 0.5) * (W - 0.1);
      const z = (Math.random() - 0.5) * (D - 0.1);
      if (this.memory[this.cell(x, z)] > 0.4 || v.blocked(x, z) || !this.reachable(v, x)) continue;
      consider('wander', 0.3 + Math.random() * 0.1, x, z);
      break;
    }
    this.goal = best;
    this.target.set(tx, tz);
  }

  private reachable(v: Valley, x: number): boolean {
    // same side of every unbridged river
    for (let i = 0; i < v.level.rivers.length; i++) {
      const rx = v.level.rivers[i].x;
      if ((this.pos.x < rx) !== (x < rx) && !v.bridges.some((b) => b.river === i)) return false;
    }
    return true;
  }

  /** Waypoint toward (gx,gz): across a bridge if one exists, else wait at the bank. */
  private route(v: Valley, gx: number, gz: number): { x: number; z: number; waiting: boolean } {
    const x = this.pos.x;
    let best: { i: number; d: number } | null = null;
    v.level.rivers.forEach((r, i) => {
      const between = (x < r.x && gx > r.x) || (x > r.x && gx < r.x);
      if (between) {
        const d = Math.abs(r.x - x);
        if (!best || d < best.d) best = { i, d };
      }
    });
    if (!best) return { x: gx, z: gz, waiting: false };
    const i = (best as { i: number }).i;
    const r = v.level.rivers[i];
    const dir = gx > x ? 1 : -1;
    const bridge = v.bridges.find((b) => b.river === i);
    if (bridge) {
      // line up with the plank, then walk straight across it
      const inside = Math.abs(x - r.x) < r.w / 2 + 0.012;
      const aligned = Math.abs(this.pos.y - bridge.z) < 0.022;
      const exit = inside || aligned;
      return { x: exit ? r.x + dir * (r.w / 2 + 0.06) : r.x - dir * (r.w / 2 + 0.03), z: bridge.z, waiting: false };
    }
    // no bridge: pace the bank looking for one
    return { x: r.x - dir * (r.w / 2 + 0.035), z: this.pos.y + (Math.random() - 0.5) * 0.12, waiting: true };
  }

  step(dt: number, now: number, v: Valley, raining: boolean, threats: Perception['threats']): void {
    this.phase += dt;
    if (this.state === 'held') return;
    if (this.state !== 'live') return;

    // steering
    let dx = this.target.x - this.pos.x;
    let dz = this.target.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    const flee = now < this.fleeUntil;
    const sp = (flee ? 0.16 : this.speed) * (this.goal === 'shelter' ? 1.8 : 1) * (0.6 + 0.4 * Math.min(1, dist / 0.04));
    if (dist > 0.006) {
      dx = (dx / dist) * sp;
      dz = (dz / dist) * sp;
    } else {
      dx = dz = 0;
    }
    // avoid rocks & fingertips
    for (const r of v.rocks) {
      const rx = this.pos.x - r.x;
      const rz = this.pos.y - r.z;
      const d = Math.hypot(rx, rz);
      const reach = r.r + 0.035;
      if (d < reach && d > 1e-4) {
        const f = ((reach - d) / reach) * sp * 2.2;
        dx += (rx / d) * f;
        dz += (rz / d) * f;
      }
    }
    for (const th of threats) {
      const rx = this.pos.x - th.x;
      const rz = this.pos.y - th.z;
      const d = Math.hypot(rx, rz);
      if (d < 0.045 && d > 1e-4) {
        dx += (rx / d) * 0.1;
        dz += (rz / d) * 0.1;
      }
    }
    this.vel.x += (dx - this.vel.x) * Math.min(1, dt * 6);
    this.vel.y += (dz - this.vel.y) * Math.min(1, dt * 6);

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.y + this.vel.y * dt;
    let moved = false;
    if (!v.blocked(nx, nz)) {
      this.pos.set(nx, nz);
      moved = true;
    } else if (!v.blocked(nx, this.pos.y)) {
      this.pos.x = nx;
      moved = true;
    } else if (!v.blocked(this.pos.x, nz)) {
      this.pos.y = nz;
      moved = true;
    }
    this.stuckTime = moved ? 0 : this.stuckTime + dt;

    // mood + memory
    if (raining && !this.covered) this.memory[this.cell(this.pos.x, this.pos.y)] = 1;
    for (let i = 0; i < this.memory.length; i++) this.memory[i] *= 1 - dt * 0.03;
    let mood: Mood = 'calm';
    if (now < this.happyUntil) mood = 'happy';
    else if (flee) mood = 'scared';
    else if (raining && !this.covered) mood = 'scared';
    else if (this.goal === 'bank') mood = 'wait';
    else if (this.glow < 0.35) mood = 'sleepy';
    this.mood = mood;
  }

  render(t: number, camQuatYaw = 0): void {
    void camQuatYaw;
    const g = this.group;
    const bob = Math.sin(this.phase * 3) * 0.004;
    const lift = this.state === 'held' ? 0.07 : 0.026;
    this.y += (lift - this.y) * 0.25;
    if (this.state === 'home') {
      this.homeT += 0.016;
      const k = Math.min(1, this.homeT / 0.7);
      g.position.set(this.pos.x, this.y + k * 0.14, this.pos.y);
      this.body.scale.setScalar(Math.max(0.001, 0.05 * (1 - k)));
      this.halo.scale.setScalar(0.16 + k * 0.3);
      this.halo.material.opacity = 0.7 * (1 - k);
      return;
    }
    g.position.set(this.pos.x, this.y + bob, this.pos.y);
    const faint = this.state === 'faint';
    const m = faint ? 'faint' : this.mood;
    const mat = this.body.material as SpriteMaterial;
    mat.map = faceTextures()[m];
    const s = 0.04 + 0.014 * this.glow;
    this.body.scale.setScalar(faint ? 0.034 : s * (1 + Math.sin(t * 6 + this.phase) * 0.03));
    this.halo.scale.setScalar(faint ? 0.05 : 0.08 + 0.1 * this.glow);
    this.halo.material.opacity = faint ? 0.15 : 0.25 + 0.55 * this.glow;
    mat.opacity = faint ? 0.6 : 1;
  }

  setContrast(on: boolean): void {
    this.color.setHSL(this.hue, on ? 1 : 0.85, on ? 0.55 : 0.62);
    (this.body.material as SpriteMaterial).color.copy(this.color);
    this.halo.material.color.copy(this.color);
    this.body.scale.setScalar(on ? 0.06 : 0.05);
  }
}
