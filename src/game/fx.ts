import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
} from 'three';

export type Mood = 'calm' | 'scared' | 'happy' | 'sleepy' | 'faint' | 'wait';

let glowTex: CanvasTexture | null = null;
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

export function makeGlow(color: number, scale: number, opacity: number): Sprite {
  const s = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: new Color(color),
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.scale.setScalar(scale);
  return s;
}

let faces: Record<Mood, CanvasTexture> | null = null;
export function faceTextures(): Record<Mood, CanvasTexture> {
  if (faces) return faces;
  const make = (mood: Mood): CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    // flame-tipped teardrop body
    const grad = g.createRadialGradient(64, 78, 6, 64, 78, 50);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#f2f6ff');
    grad.addColorStop(1, '#c9d4ff');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(64, 80, 40, 0, Math.PI * 2);
    g.moveTo(34, 62);
    g.quadraticCurveTo(58, 40, 64, 6);
    g.quadraticCurveTo(72, 40, 94, 62);
    g.fill();
    g.fillStyle = '#12162e';
    g.strokeStyle = '#12162e';
    g.lineWidth = 5;
    g.lineCap = 'round';
    const eye = (x: number, y: number, rx: number, ry: number) => {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };
    switch (mood) {
      case 'scared':
        eye(50, 78, 8, 11);
        eye(78, 78, 8, 11);
        g.fillStyle = '#fff';
        eye(48, 74, 3, 3);
        eye(76, 74, 3, 3);
        g.fillStyle = '#12162e';
        g.beginPath();
        g.ellipse(64, 100, 6, 8, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'happy':
        g.beginPath();
        g.arc(50, 80, 8, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
        g.beginPath();
        g.arc(78, 80, 8, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
        g.beginPath();
        g.arc(64, 90, 10, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
        g.fillStyle = 'rgba(255,120,150,0.55)';
        eye(38, 92, 7, 4);
        eye(90, 92, 7, 4);
        break;
      case 'sleepy':
        g.beginPath();
        g.moveTo(42, 82);
        g.lineTo(58, 82);
        g.moveTo(70, 82);
        g.lineTo(86, 82);
        g.stroke();
        break;
      case 'faint':
        g.lineWidth = 4;
        for (const x of [50, 78]) {
          g.beginPath();
          g.moveTo(x - 7, 73);
          g.lineTo(x + 7, 87);
          g.moveTo(x + 7, 73);
          g.lineTo(x - 7, 87);
          g.stroke();
        }
        break;
      case 'wait':
        eye(52, 76, 7, 9);
        eye(80, 76, 7, 9);
        g.fillStyle = '#fff';
        eye(54, 72, 3, 3);
        eye(82, 72, 3, 3);
        break;
      default:
        eye(50, 80, 7, 9);
        eye(78, 80, 7, 9);
        g.fillStyle = '#fff';
        eye(48, 77, 2.5, 2.5);
        eye(76, 77, 2.5, 2.5);
    }
    return new CanvasTexture(c);
  };
  faces = {
    calm: make('calm'),
    scared: make('scared'),
    happy: make('happy'),
    sleepy: make('sleepy'),
    faint: make('faint'),
    wait: make('wait'),
  };
  return faces;
}

/** Pooled additive sparks: wisp trails, hearth fireworks, bridge ripples, wind streaks. One draw call. */
export class Particles {
  readonly points: Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private base: Float32Array;
  private head = 0;
  private tmp = new Color();
  constructor(readonly N = 1600, size = 0.012) {
    this.pos = new Float32Array(N * 3).fill(99);
    this.col = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N).fill(1);
    this.base = new Float32Array(N * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    this.points = new Points(
      g,
      new PointsMaterial({ size, map: glowTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  emit(x: number, y: number, z: number, color: number, vx: number, vy: number, vz: number, life: number): void {
    const i = this.head++ % this.N;
    this.tmp.setHex(color);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = this.tmp.r; this.base[i * 3 + 1] = this.tmp.g; this.base[i * 3 + 2] = this.tmp.b;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number, life: number, up = 0.6): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, color, Math.cos(a) * s, up * speed * (0.3 + Math.random()), Math.sin(a) * s, life * (0.6 + Math.random() * 0.4));
    }
  }

  update(dt: number): void {
    const gp = this.points.geometry.getAttribute('position') as Float32BufferAttribute;
    const gc = this.points.geometry.getAttribute('color') as Float32BufferAttribute;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 0.12 * dt;
      this.vel[i * 3] *= 1 - dt * 1.2;
      this.vel[i * 3 + 2] *= 1 - dt * 1.2;
      const f = k * k;
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = 99;
    }
    gp.needsUpdate = true;
    gc.needsUpdate = true;
  }
}

/** Ambient fireflies drifting above the valley. */
export class Fireflies {
  readonly points: Points;
  private base: Float32Array;
  private pos: Float32Array;
  private col: Float32Array;
  private ph: Float32Array;
  constructor(readonly N = 42, w = 0.7, d = 0.42) {
    this.base = new Float32Array(N * 3);
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.base[i * 3] = (Math.random() - 0.5) * w;
      this.base[i * 3 + 1] = 0.03 + Math.random() * 0.2;
      this.base[i * 3 + 2] = (Math.random() - 0.5) * d;
      this.ph[i] = Math.random() * 10;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    this.points = new Points(
      g,
      new PointsMaterial({ size: 0.011, map: glowTexture(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  update(t: number, tint: number): void {
    const c = new Color(tint);
    for (let i = 0; i < this.N; i++) {
      const p = this.ph[i];
      this.pos[i * 3] = this.base[i * 3] + Math.sin(t * 0.4 + p) * 0.03;
      this.pos[i * 3 + 1] = this.base[i * 3 + 1] + Math.sin(t * 0.7 + p * 2) * 0.015;
      this.pos[i * 3 + 2] = this.base[i * 3 + 2] + Math.cos(t * 0.33 + p) * 0.03;
      const tw = 0.25 + 0.75 * Math.max(0, Math.sin(t * 1.3 + p * 3));
      this.col[i * 3] = c.r * tw;
      this.col[i * 3 + 1] = c.g * tw;
      this.col[i * 3 + 2] = c.b * tw;
    }
    (this.points.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as Float32BufferAttribute).needsUpdate = true;
  }
}

let gloomTex: CanvasTexture | null = null;
/** A spiky shadow blob with ember eyes. */
export function gloomTexture(): CanvasTexture {
  if (gloomTex) return gloomTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0612';
  g.beginPath();
  const cx = 64, cy = 70;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = i % 2 ? 34 : 50;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.85;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(180,60,255,0.55)';
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#ff5a2a';
  for (const x of [50, 78]) {
    g.beginPath();
    g.ellipse(x, 66, 7, 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffe9a8';
  for (const x of [50, 78]) {
    g.beginPath();
    g.ellipse(x, 64, 2.5, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  gloomTex = new CanvasTexture(c);
  return gloomTex;
}
