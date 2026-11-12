import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial } from 'three';

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
