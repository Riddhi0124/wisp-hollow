import {
  Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

/** One tracked hand (or the desktop mouse standing in for a hand). All positions are world space. */
export class Hand {
  present = false;
  kind: 'xr' | 'mouse' = 'xr';
  tip = new Vector3();
  thumb = new Vector3();
  palm = new Vector3();
  wrist = new Vector3();
  palmNormal = new Vector3(0, -1, 0);
  pinch = false;
  pinchPoint = new Vector3();
  justPinched = false;
  justReleased = false;
  pinchTime = 0;
  pinchTravel = 0;
  lastPinchTime = 0;
  lastPinchTravel = 0;
  speed = 0;
  tipSpeed = 0;
  vel = new Vector3();
  spread = 1;
  flatTime = 0;
  grabbed: unknown = null;
  private prevPalm = new Vector3();
  private prevTip = new Vector3();
  private pinchStart = new Vector3();
  constructor(readonly id: number) {}

  beginFrame(): void {
    this.justPinched = false;
    this.justReleased = false;
  }

  setPinch(next: boolean, dt: number): void {
    if (next && !this.pinch) {
      this.pinch = true;
      this.justPinched = true;
      this.pinchTime = 0;
      this.pinchTravel = 0;
      this.pinchStart.copy(this.pinchPoint);
    } else if (!next && this.pinch) {
      this.pinch = false;
      this.justReleased = true;
      this.lastPinchTime = this.pinchTime;
      this.lastPinchTravel = this.pinchTravel;
    }
    if (this.pinch) {
      this.pinchTime += dt;
      this.pinchTravel = this.pinchPoint.distanceTo(this.pinchStart);
    }
  }

  motion(dt: number): void {
    if (dt <= 0) return;
    this.vel.copy(this.palm).sub(this.prevPalm).divideScalar(dt);
    this.speed += (this.vel.length() - this.speed) * Math.min(1, dt * 12);
    this.tipSpeed += (this.tip.distanceTo(this.prevTip) / dt - this.tipSpeed) * Math.min(1, dt * 20);
    this.prevPalm.copy(this.palm);
    this.prevTip.copy(this.tip);
  }
}

const J = {
  wrist: 'wrist',
  thumb: 'thumb-tip',
  index: 'index-finger-tip',
  middle: 'middle-finger-tip',
  ring: 'ring-finger-tip',
  pinky: 'pinky-finger-tip',
  indexMeta: 'index-finger-metacarpal',
  pinkyMeta: 'pinky-finger-metacarpal',
  knuckle: 'middle-finger-phalanx-proximal',
};

/** Reads WebXR hand joints directly, with a mouse fallback so the game is testable on any desktop. */
export class HandTracker {
  hands = [new Hand(0), new Hand(1)];
  mouseHand = new Hand(2);
  gazeOrigin = new Vector3();
  gazeDir = new Vector3(0, 0, -1);
  xrActive = false;
  hasRealHands = false;
  tableY = 0.75;

  private tmp = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private ray = new Raycaster();
  private ndc = new Vector2();
  private plane = new Plane(new Vector3(0, 1, 0), 0);
  private mouse = { x: 0, y: 0, down: false, umbrella: false, h: 0.045, moved: false };
  private fwd = new Vector3();

  constructor(
    private renderer: WebGLRenderer,
    private camera: PerspectiveCamera,
    private player: Object3D,
  ) {
    const el = renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.mouse.moved = true;
    });
    el.addEventListener('pointerdown', () => (this.mouse.down = true));
    window.addEventListener('pointerup', () => (this.mouse.down = false));
    el.addEventListener(
      'wheel',
      (e) => {
        this.mouse.h = Math.max(0.01, Math.min(0.3, this.mouse.h - e.deltaY * 0.0002));
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 's' || e.key === 'S') this.mouse.umbrella = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 's' || e.key === 'S') this.mouse.umbrella = false;
    });
  }

  /** Lets UI clicks swallow the mouse press so it doesn't also act as a pinch. */
  cancelMouse(): void {
    this.mouse.down = false;
  }

  /** Every hand that is currently usable as input. */
  get active(): Hand[] {
    const out: Hand[] = [];
    for (const h of this.hands) if (h.present) out.push(h);
    if (this.mouseHand.present) out.push(this.mouseHand);
    return out;
  }

  update(dt: number): void {
    this.hands.forEach((h) => h.beginFrame());
    this.mouseHand.beginFrame();
    this.camera.getWorldPosition(this.gazeOrigin);
    this.camera.getWorldDirection(this.gazeDir);

    const xr = this.renderer.xr;
    const session = xr.isPresenting ? (xr.getSession() as any) : null;
    const frame = xr.isPresenting ? (xr.getFrame() as any) : null;
    const ref = xr.isPresenting ? xr.getReferenceSpace() : null;
    this.xrActive = !!session;

    let any = false;
    if (session && frame && ref) {
      const seen = [false, false];
      for (const src of session.inputSources as any[]) {
        if (!src.hand) continue;
        const idx = src.handedness === 'left' ? 0 : 1;
        if (this.readHand(this.hands[idx], src, frame, ref, src.handedness, dt)) {
          seen[idx] = true;
          any = true;
        }
      }
      this.hands.forEach((h, i) => {
        if (!seen[i] && h.present) {
          h.present = false;
          h.setPinch(false, dt);
        }
      });
    } else {
      this.hands.forEach((h) => (h.present = false));
    }
    this.hasRealHands = any;

    // Desktop mouse stands in for a hand outside of XR.
    const m = this.mouseHand;
    if (!session) {
      m.kind = 'mouse';
      this.ndc.set(this.mouse.x, this.mouse.y);
      this.ray.setFromCamera(this.ndc, this.camera);
      const h = this.mouse.umbrella ? 0.14 : this.mouse.h;
      this.plane.constant = -(this.tableY + h);
      const hit = this.ray.ray.intersectPlane(this.plane, this.tmp[0]);
      if (hit) {
        m.present = true;
        m.tip.copy(hit);
        m.thumb.copy(hit);
        m.palm.copy(hit);
        m.wrist.copy(hit);
        m.pinchPoint.copy(hit);
        m.palmNormal.set(0, this.mouse.umbrella ? -1 : 0.2, 0).normalize();
        m.spread = this.mouse.umbrella ? 0 : 0.2;
        m.setPinch(this.mouse.down && !this.mouse.umbrella, dt);
        m.motion(dt);
        m.flatTime = this.mouse.umbrella ? m.flatTime + dt : 0;
      }
    } else {
      m.present = false;
      m.setPinch(false, dt);
    }
  }

  private jp(frame: any, ref: any, hand: any, name: string, out: Vector3): boolean {
    const sp = hand.get(name);
    if (!sp) return false;
    const pose = frame.getJointPose(sp, ref);
    if (!pose) return false;
    const p = pose.transform.position;
    out.set(p.x, p.y, p.z);
    this.player.localToWorld(out);
    return true;
  }

  private readHand(h: Hand, src: any, frame: any, ref: any, handed: string, dt: number): boolean {
    const [wrist, thumb, index, a, b, c] = this.tmp;
    const hand = src.hand;
    if (!this.jp(frame, ref, hand, J.wrist, wrist)) return false;
    if (!this.jp(frame, ref, hand, J.thumb, thumb)) return false;
    if (!this.jp(frame, ref, hand, J.index, index)) return false;
    h.kind = 'xr';
    h.present = true;
    h.wrist.copy(wrist);
    h.thumb.copy(thumb);
    h.tip.copy(index);

    // Palm centre = midway between wrist and middle knuckle.
    if (this.jp(frame, ref, hand, J.knuckle, a)) h.palm.copy(wrist).add(a).multiplyScalar(0.5);
    else h.palm.copy(wrist);

    // Palm normal from the wrist / index-base / pinky-base triangle (mirrored per hand).
    if (this.jp(frame, ref, hand, J.indexMeta, a) && this.jp(frame, ref, hand, J.pinkyMeta, b)) {
      a.sub(wrist);
      b.sub(wrist);
      h.palmNormal.copy(a).cross(b).normalize();
      if (handed === 'left') h.palmNormal.negate();
    }

    // Open-hand test: fingertip heights vs the wrist.
    let minY = wrist.y;
    let maxY = wrist.y;
    for (const n of [J.middle, J.ring, J.pinky]) {
      if (this.jp(frame, ref, hand, n, c)) {
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
      }
    }
    minY = Math.min(minY, index.y);
    maxY = Math.max(maxY, index.y);
    h.spread = maxY - minY;

    h.pinchPoint.copy(thumb).add(index).multiplyScalar(0.5);
    const d = thumb.distanceTo(index);
    h.setPinch(h.pinch ? d < 0.042 : d < 0.024, dt);
    h.motion(dt);
    return true;
  }

  /** Forward gaze ray intersected with a horizontal plane at world height y. */
  gazeOnPlane(y: number, out: Vector3): boolean {
    this.plane.constant = -y;
    this.fwd.copy(this.gazeDir);
    this.ray.set(this.gazeOrigin, this.fwd);
    return !!this.ray.ray.intersectPlane(this.plane, out);
  }
}
