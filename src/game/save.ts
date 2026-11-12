export interface Resident {
  hue: number;
  name: string;
  born: number;
}
export interface Settings {
  gaze: boolean;
  voice: boolean;
  contrast: boolean;
}
export interface SaveData {
  v: 1;
  streak: number;
  best: number;
  lastDay: string;
  dusks: number;
  stars: number;
  residents: Resident[];
  tutorialDone: boolean;
  unlocked: number;
  levelStars: number[];
  settings: Settings;
  lastSeen: number;
}

const KEY = 'wisp-hollow-v1';
export const NAMES = [
  'Pip', 'Nim', 'Oru', 'Tali', 'Bram', 'Sol', 'Fen', 'Mox', 'Ula', 'Kit',
  'Wren', 'Dov', 'Lumi', 'Ash', 'Bix', 'Cove', 'Dew', 'Ember', 'Fizz', 'Gleam',
];

function fresh(): SaveData {
  return {
    v: 1,
    streak: 0,
    best: 0,
    lastDay: '',
    dusks: 0,
    stars: 0,
    residents: [],
    tutorialDone: false,
    unlocked: 1,
    levelStars: [0, 0, 0, 0, 0, 0, 0],
    settings: { gaze: false, voice: false, contrast: false },
    lastSeen: Date.now(),
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as SaveData;
      if (d && d.v === 1) return { ...fresh(), ...d, settings: { ...fresh().settings, ...d.settings } };
    }
  } catch {
    /* storage unavailable: play without persistence */
  }
  return fresh();
}

export function persist(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
