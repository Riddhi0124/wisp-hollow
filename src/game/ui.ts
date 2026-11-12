import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';

export interface Btn {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  on: () => void;
  active?: () => boolean;
  accent?: string;
}

/** A flat canvas-textured panel with big, forgiving buttons (poke, gaze-dwell or click). */
export class Panel {
  group = new Group();
  mesh: Mesh;
  btns: Btn[] = [];
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void = () => {};
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private lastKey = '';
  contrast = false;

  constructor(
    public w: number,
    public h: number,
    private ppm = 1800,
  ) {
    this.canvas.width = Math.round(w * ppm);
    this.canvas.height = Math.round(h * ppm);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }),
    );
    this.mesh.renderOrder = 10;
    this.group.add(this.mesh);
  }

  btnAt(local: Vector3): Btn | null {
    const px = (local.x + this.w / 2) * this.ppm;
    const py = (this.h / 2 - local.y) * this.ppm;
    for (const b of this.btns) {
      const pad = 12; // generous hit area
      if (px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) return b;
    }
    return null;
  }

  inside(local: Vector3): boolean {
    return Math.abs(local.x) < this.w / 2 + 0.01 && Math.abs(local.y) < this.h / 2 + 0.01;
  }

  px(): { w: number; h: number } {
    return { w: this.canvas.width, h: this.canvas.height };
  }

  /** Redraws only when something visible changed. */
  render(key: string, hover: Btn | null, dwell: number): void {
    const k = `${key}|${hover?.id ?? ''}|${Math.round(dwell * 20)}|${this.btns.map((b) => (b.active?.() ? 1 : 0)).join('')}`;
    if (k === this.lastKey) return;
    this.lastKey = k;
    const c = this.ctx;
    const { w, h } = this.px();
    c.clearRect(0, 0, w, h);
    const hc = this.contrast;
    c.fillStyle = hc ? '#000' : 'rgba(9,14,36,0.9)';
    this.round(c, 0, 0, w, h, 34);
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = hc ? '#fff' : 'rgba(110,210,255,0.8)';
    c.stroke();
    this.draw(c, w, h);
    for (const b of this.btns) {
      const on = b.active?.() ?? false;
      const hov = hover === b;
      c.fillStyle = on ? (hc ? '#ff0' : '#2ee6a6') : hc ? '#000' : 'rgba(40,60,120,0.9)';
      this.round(c, b.x, b.y, b.w, b.h, 28);
      c.fill();
      c.lineWidth = hov ? 8 : 4;
      c.strokeStyle = hov ? '#fff' : hc ? '#fff' : b.accent ?? 'rgba(150,200,255,0.8)';
      c.stroke();
      if (hov && dwell > 0) {
        c.fillStyle = 'rgba(255,255,255,0.28)';
        this.round(c, b.x, b.y, b.w * Math.min(1, dwell), b.h, 28);
        c.fill();
      }
      c.fillStyle = on ? '#04120c' : '#fff';
      c.font = `700 ${Math.round(b.h * 0.34)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 2);
    }
    this.tex.needsUpdate = true;
  }

  private round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
}

export function text(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color = '#fff',
  align: CanvasTextAlign = 'center',
  weight = 700,
  maxW = 0,
): void {
  c.fillStyle = color;
  c.font = `${weight} ${size}px system-ui, sans-serif`;
  if (maxW > 0) {
    const mw = c.measureText(s).width;
    if (mw > maxW) c.font = `${weight} ${Math.floor((size * maxW) / mw)}px system-ui, sans-serif`;
  }
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillText(s, x, y);
}
