const root = document.documentElement;
const canvas = document.querySelector('.world');
const ctx = canvas.getContext('2d', { alpha: false });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── noise (reseeded every visit, so the cave is never the same twice) ──

const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const hash = (x, y) => perm[(x & 255) + perm[y & 255]] / 255;

const vnoise = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const fbm = (x, y, oct) => {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(x, y);
    n += a;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    a *= 0.5;
  }
  return s / n;
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const bumps = (list, y) => list.reduce((s, l) => s + l.amp * Math.exp(-(((y - l.y) / l.w) ** 2)), 0);

// ── rock types by depth ──

const STYLE = {
  entrance:  { f: 1 / 70,  sx: 1,   sy: 1,   cf: 1 / 50,  crack: 0.5,  grit: 0.2,  pits: 0.1,  alb: 0.62, band: 0 },
  strata:    { f: 1 / 110, sx: 0.3, sy: 2.4, cf: 1 / 90,  crack: 0.18, grit: 0.1,  pits: 0,    alb: 0.58, band: 0.1 },
  granite:   { f: 1 / 60,  sx: 1,   sy: 1,   cf: 1 / 45,  crack: 0.6,  grit: 0.16, pits: 0,    alb: 0.6,  band: 0 },
  flowstone: { f: 1 / 80,  sx: 2.6, sy: 0.3, cf: 1 / 70,  crack: 0.12, grit: 0.06, pits: 0,    alb: 0.6,  band: 0 },
  limestone: { f: 1 / 95,  sx: 1,   sy: 1,   cf: 1 / 70,  crack: 0.28, grit: 0.14, pits: 0.4,  alb: 0.56, band: 0 },
  cavern:    { f: 1 / 120, sx: 1,   sy: 1,   cf: 1 / 90,  crack: 0.3,  grit: 0.12, pits: 0.05, alb: 0.62, band: 0 },
};

let outH = 0;
let outD = 0;
let outA = 0;

const rock = (X, Y, s) => {
  const b = fbm(X * s.f * s.sx, Y * s.f * s.sy, 5);
  const low = fbm(X * s.f * 0.35 + 31, Y * s.f * 0.35 + 17, 2);
  const cr = 1 - Math.abs(2 * fbm(X * s.cf + 91, Y * s.cf + 47, 3) - 1);
  const crack = cr ** 8 * s.crack;
  const grit = (vnoise(X * 0.5 + 7, Y * 0.5 + 3) - 0.5) * s.grit;
  const pits = s.pits ? smooth(0.64, 0.76, vnoise(X / 10 + 5, Y / 10 + 9)) * s.pits : 0;
  outD = b - 0.5 - crack - pits;
  outH = b * 0.9 + low * 0.8 - crack - pits + grit;
  let a = s.alb + (fbm(X / 240 + 3, Y / 240 + 8, 2) - 0.5) * 0.4 + grit * 0.8;
  if (s.band) a += Math.sin(Y / 6 + fbm(X / 90, Y / 90, 2) * 8) * s.band;
  outA = a;
};

let SA;
let SB;
let ST;

const styleAt = docY => {
  const BL = 90;
  for (let k = 0; k < bounds.length; k++) {
    const b = bounds[k];
    if (docY < b - BL) {
      SA = SB = zones[k].s;
      ST = 0;
      return;
    }
    if (docY < b + BL) {
      SA = zones[k].s;
      SB = zones[k + 1].s;
      ST = smooth(b - BL, b + BL, docY);
      return;
    }
  }
  SA = SB = zones[zones.length - 1].s;
  ST = 0;
};

const rockBlend = (X, Y) => {
  rock(X, Y, SA);
  if (ST > 0 && SB !== SA) {
    const h = outH;
    const d = outD;
    const a = outA;
    rock(X, Y, SB);
    outH = h + (outH - h) * ST;
    outD = d + (outD - d) * ST;
    outA = a + (outA - a) * ST;
  }
};

// ── world state ──

const PARALLAX = 0.8;
const NK = 4;
const sections = [...document.querySelectorAll('[data-zone]')];
const cavernEl = document.getElementById('connect');

let PX, vw, vh, cols, rows, docH, scrollMax;
let zones, bounds, backBounds, cTop;
let back, front, WL, WR, ent, fg, fire;
let jobs = [];
let build = 0;

const docTop = el => el.getBoundingClientRect().top + window.scrollY;

const makeLayer = (n, isBack) => ({
  rows: n,
  H: new Float32Array(n * cols),
  A: new Float32Array(n * cols),
  O: new Float32Array(n * cols),
  E: isBack ? new Float32Array(n * cols) : null,
  M: isBack ? null : new Uint8Array(n * cols),
  ready: new Uint8Array(n),
});

// ── the entrance: a rough opening with rocks pushing in and worn uneven steps ──

const makeEntrance = () => {
  const hw = Math.min(vw * 0.19, 125);
  const top = vh * 0.04;
  const bottom = vh * 0.42;
  const stairsEnd = vh * 0.88;
  const lumps = () => Array.from({ length: ri(2, 4) }, () => ({ y: rand(top + hw * 0.5, bottom), amp: rand(0.06, 0.18), w: rand(30, 70) }));
  const steps = [];
  for (let y = bottom; y < stairsEnd;) {
    const t = (y - bottom) / (stairsEnd - bottom);
    const h = (9 + 34 * t) * rand(0.6, 1.4);
    steps.push({ y0: y, h, tilt: rand(-0.08, 0.08), wL: rand(0.8, 1.25), wR: rand(0.8, 1.25), shift: rand(-0.14, 0.14), seed: rand(0, 99) });
    y += h;
  }
  return {
    cx: vw * rand(0.46, 0.54),
    hw,
    top,
    bottom,
    stairsEnd,
    capR: hw * rand(0.8, 1.3),
    L: lumps(),
    R: lumps(),
    sL: rand(0, 99),
    sR: rand(0, 99),
    steps,
    midY: (top + bottom) / 2,
  };
};

const openingEdge = (Y, right) => {
  const s = right ? ent.sR : ent.sL;
  let w = ent.hw * (1 + (fbm(Y / 80 + s, s, 2) - 0.5) * 0.25);
  w -= ent.hw * bumps(right ? ent.R : ent.L, Y);
  w += (vnoise(Y / 9 + s, 3.3) - 0.5) * 3;
  const capY = ent.top + ent.capR;
  if (Y < capY) {
    const k = (capY - Y) / ent.capR;
    w *= Math.sqrt(Math.max(0, 1 - k * k));
  }
  return right ? ent.cx + w : ent.cx - w;
};

let ch;
let ca;
let cao;
let ce;

const applyEntrance = (X, Y, xl, xr) => {
  if (Y > ent.top - 12 && Y < ent.bottom) {
    const inside = X > xl && X < xr && Y > ent.top + (vnoise(X / 30 + ent.sL, 5.1) - 0.5) * 6;
    if (inside) {
      const t = (Y - ent.top) / (ent.bottom - ent.top);
      const u = Math.abs((X - (xl + xr) / 2) / Math.max(1, (xr - xl) / 2));
      ce = (0.8 + 0.3 * (1 - t)) * (0.82 + 0.18 * (1 - u)) - fbm(X / 24, Y / 24, 3) * 0.24;
      if (t > 0.8) ce *= 0.5 + 0.5 * smooth(1, 0.8, t);
      ca = 0;
      return;
    }
    const d = X < xl ? xl - X : X > xr ? X - xr : 99;
    if (d < 70) {
      const fade = 1 - d / 70;
      const ring = Math.max(0, Math.sin(d / 9 + vnoise(X / 24, Y / 24) * 3));
      ca += 0.2 * ring * fade + (d < 8 ? 0.3 * (1 - d / 8) : 0);
      ch += 0.3 * ring * fade;
    }
  }
  if (Y < ent.bottom || Y >= ent.stairsEnd) return;
  for (let k = 0; k < ent.steps.length; k++) {
    const s = ent.steps[k];
    const local = Y - (s.y0 + s.tilt * (X - ent.cx)) + (vnoise(X / 6 + s.seed, s.seed) - 0.5) * 7;
    if (local < 0 || local >= s.h) continue;
    const t = (s.y0 - ent.bottom) / (ent.stairsEnd - ent.bottom);
    const base = ent.hw * (0.8 + 1.9 * t);
    const c = ent.cx + s.shift * base;
    const wob = (vnoise(Y / 10, s.seed + 3) - 0.5) * 0.3;
    const halfL = base * s.wL * (1 + wob);
    const halfR = base * s.wR * (1 - wob);
    if (X < c - halfL || X > c + halfR) return;
    const fr = local / s.h;
    const n = vnoise(X / 5 + s.seed, Y / 5);
    const tread = fr < 0.32;
    ca = (tread ? 0.68 : 0.28) + (n - 0.5) * 0.32;
    ch = -k * 0.05 + (tread ? 0.14 : 0) + (ch - 1) * 0.3;
    if (vnoise(X / 4 + 7, Y / 4 + s.seed) > 0.78) {
      ca *= 0.4;
      ch -= 0.12;
    }
    if (tread && vnoise(X / 2.5 + 3, Y / 2.5) > 0.85) {
      ch += 0.2;
      ca += 0.14;
    }
    const edgeFade = smooth(0, base * 0.2, Math.min(X - (c - halfL), c + halfR - X));
    cao *= 0.35 + 0.65 * edgeFade;
    const spill = (1 - t) ** 1.3 * (0.55 + 0.45 * n) * edgeFade;
    ce = (tread ? 0.3 * (1 - fr / 0.32) + 0.06 : 0.03) * spill;
    return;
  }
};

const stalLen = X => {
  const k = Math.floor(X / 30);
  const tri = 1 - Math.abs(2 * (X / 30 - k) - 1);
  return 14 + tri ** 1.6 * (18 + 80 * hash(k, 41) ** 2);
};

const stagLen = X => {
  if (Math.abs(X - vw / 2) < 120) return 38 + (vnoise(X / 9, 3) - 0.5) * 6;
  const k = Math.floor(X / 26);
  const tri = 1 - Math.abs(2 * (X / 26 - k) - 1);
  return 30 + tri ** 1.4 * (14 + 70 * hash(k, 53) ** 2);
};

const computeBack = r => {
  const Y = r * PX;
  const docY = (Y - vh / 2) / PARALLAX + vh / 2;
  styleAt(docY);
  const base = r * cols;
  const nearLedges = backBounds.filter(b => Math.abs(Y - b) < 70);
  const inEntrance = Y < ent.stairsEnd + 20;
  const hasEdges = Y > ent.top - 12 && Y < ent.bottom;
  const xl = hasEdges ? openingEdge(Y, false) : 0;
  const xr = hasEdges ? openingEdge(Y, true) : 0;

  for (let c = 0; c < cols; c++) {
    const X = c * PX;
    rockBlend(X, Y);
    ch = outH;
    ca = outA;
    cao = 0.5 + 0.5 * smooth(-0.24, 0.18, outD);
    ce = 0;

    for (const b of nearLedges) {
      const dist = Y - (b + (fbm(X / 70, b * 0.01, 2) - 0.5) * 40);
      ch += 0.6 * Math.exp(-(dist * dist) / 100);
      ca += 0.1 * Math.exp(-(dist * dist) / 36);
      if (dist > 0) cao *= 1 - 0.6 * Math.exp(-((dist - 18) ** 2) / 200);
    }

    if (inEntrance) applyEntrance(X, Y, xl, xr);

    back.H[base + c] = ch;
    back.A[base + c] = ca * 0.82;
    back.O[base + c] = cao;
    back.E[base + c] = ce;
  }
};

const computeFront = r => {
  const docY = r * PX;
  const wl = WL[r];
  const wr = vw - WR[r];
  styleAt(docY);
  const base = r * cols;
  const ceil = docY > cTop - 60 && docY < cTop + 130;
  const floor = docY > docH - 160;

  for (let c = 0; c < cols; c++) {
    const X = c * PX;
    let edge = -1;
    if (X < wl) edge = wl - X;
    else if (X > wr) edge = X - wr;
    if (edge < 0 && ceil) {
      const tip = cTop + stalLen(X);
      if (docY < tip) edge = tip - docY;
    }
    if (edge < 0 && floor) {
      const top = docH - stagLen(X);
      if (docY > top) edge = docY - top;
    }
    if (edge < 0) {
      front.M[base + c] = 0;
      continue;
    }
    front.M[base + c] = 1;
    rockBlend(X + 517, docY + 311);
    front.H[base + c] = outH * 0.9 - (1 - smooth(0, 22, edge)) * 0.9;
    front.A[base + c] = outA * 0.92;
    front.O[base + c] = 0.6 + 0.4 * smooth(-0.24, 0.18, outD);
  }
};

const runJobs = id => {
  if (id !== build) return;
  const end = performance.now() + 10;
  while (jobs.length && performance.now() < end) {
    const j = jobs[0];
    if (j.r >= j.to) {
      jobs.shift();
      continue;
    }
    if (!j.layer.ready[j.r]) {
      j.fn(j.r);
      j.layer.ready[j.r] = 1;
      dirty = true;
    }
    j.r++;
  }
  if (jobs.length) setTimeout(() => runJobs(id), 0);
};

const computeNow = (layer, fn, from, to) => {
  for (let r = Math.max(0, from); r < Math.min(layer.rows, to); r++) {
    if (!layer.ready[r]) {
      fn(r);
      layer.ready[r] = 1;
    }
  }
};

const rebuild = () => {
  build++;
  vw = window.innerWidth;
  PX = vw < 720 ? 3 : 4;
  cols = Math.ceil(vw / PX) + 1;
  resizeCanvas();

  docH = root.scrollHeight;
  scrollMax = Math.max(0, docH - vh);
  zones = sections.map(s => ({ s: STYLE[s.dataset.zone], top: docTop(s), bottom: docTop(s) + s.offsetHeight }));
  bounds = [];
  for (let k = 1; k < zones.length; k++) bounds.push((zones[k - 1].bottom + zones[k].top) / 2);
  backBounds = bounds.map(b => (b - vh / 2) * PARALLAX + vh / 2);
  cTop = docTop(cavernEl) - 150;
  ent = makeEntrance();

  const frontRows = Math.ceil(docH / PX) + 2;
  const backRows = Math.ceil((scrollMax * PARALLAX + vh) / PX) + 2;
  WL = new Float32Array(frontRows);
  WR = new Float32Array(frontRows);
  const wallBase = vw < 720 ? 30 : vw * 0.08;
  const rockLumps = () => Array.from({ length: ri(2, 4) }, () => ({ y: rand(vh * 0.04, vh * 0.85), amp: rand(0.03, 0.09), w: rand(40, 90) }));
  const fL = { a: rand(0.85, 1.2), s: rand(0, 99), lumps: rockLumps() };
  const fR = { a: rand(0.85, 1.2), s: rand(0, 99), lumps: rockLumps() };
  const frame = (docY, f) => {
    const env = 1 - smooth(ent.stairsEnd * 0.8, vh * 1.05, docY);
    if (env <= 0) return 0;
    return vw * env * ((0.1 + 0.2 * fbm(docY / 110 + f.s, 1.3, 2)) * f.a + bumps(f.lumps, docY));
  };
  const openGap = docY => {
    if (docY < ent.bottom) return ent.hw * 2 * 1.08;
    if (docY < ent.stairsEnd) {
      const t = (docY - ent.bottom) / (ent.stairsEnd - ent.bottom);
      return ent.hw * (0.8 + 1.9 * t) * 2 * 1.02;
    }
    return vw * 0.16;
  };

  for (let r = 0; r < frontRows; r++) {
    const docY = r * PX;
    let l = wallBase * (0.65 + 0.7 * fbm(docY / 160, 11.3, 3)) + frame(docY, fL);
    let rt = wallBase * (0.65 + 0.7 * fbm(docY / 160, 23.7, 3)) + frame(docY, fR);
    for (const b of bounds.slice(0, -1)) {
      const pinch = vw * 0.12 * Math.exp(-(((docY - b) / 55) ** 2));
      l += pinch;
      rt += pinch;
    }
    const minGap = Math.min(vw * 0.9, Math.max(vw * 0.16, openGap(docY)));
    if (vw - l - rt < minGap) {
      const k = (vw - minGap) / (l + rt);
      l *= k;
      rt *= k;
    }
    const open = 1 - 0.65 * smooth(cTop - 100, cTop + 80, docY);
    WL[r] = l * open + (vnoise(docY / 22, 5.5) - 0.5) * 8;
    WR[r] = rt * open + (vnoise(docY / 22, 9.1) - 0.5) * 8;
  }

  back = makeLayer(backRows, true);
  front = makeLayer(frontRows, false);

  fg = [];
  for (let y = vh * 0.9; y < (cTop - 250) * 1.3; y += rand(200, 420)) {
    fg.push({ y, side: Math.random() < 0.5 ? 0 : 1, rx: rand(14, vw < 720 ? 30 : 56), ry: rand(40, 120), seed: rand(0, 100) });
  }

  fire = { x: vw / 2, y: docH - 44, w: 84, h: 124, r: vw < 720 ? 520 : 680 };

  const sY = window.scrollY;
  computeNow(front, computeFront, Math.floor(sY / PX) - 2, Math.ceil((sY + vh) / PX) + 2);
  computeNow(back, computeBack, Math.floor((sY * PARALLAX) / PX) - 2, Math.ceil((sY * PARALLAX + vh) / PX) + 2);
  jobs = [
    { layer: front, fn: computeFront, r: 0, to: front.rows },
    { layer: back, fn: computeBack, r: 0, to: back.rows },
  ];
  setTimeout(() => runJobs(build), 0);
  dirty = true;
};

// ── rendering: steady light, then dither down to a few greys ──

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const LEVELS = [4, 15, 30, 52, 86, 140, 214, 246];
const NL = LEVELS.length - 1;
const GREY = LEVELS.map(g => ((255 << 24) | (g << 16) | (g << 8) | g) >>> 0);

let img, buf;

const resizeCanvas = () => {
  vh = window.innerHeight;
  rows = Math.ceil(vh / PX) + 1;
  canvas.width = cols;
  canvas.height = rows;
  canvas.style.width = `${cols * PX}px`;
  canvas.style.height = `${rows * PX}px`;
  img = ctx.createImageData(cols, rows);
  buf = new Uint32Array(img.data.buffer);
};

const LX = new Float32Array(6);
const LY = new Float32Array(6);
const LZ = new Float32Array(6);
const LI = new Float32Array(6);
const LC = new Float32Array(6);
const LR = new Float32Array(6);
let nL = 0;

const addLight = (x, y, z, r, i) => {
  if (nL >= 6) return;
  LX[nL] = x;
  LY[nL] = y;
  LZ[nL] = z;
  LI[nL] = i;
  LR[nL] = 1 / (r * 2.5);
  LC[nL] = (r * 2.5) ** 2;
  nL++;
};

const target = { x: window.innerWidth * 0.55, y: window.innerHeight * 0.5 };
const lamp = { ...target };

const dither = (lum, x, y) => {
  let s = lum * NL;
  if (s < 0) s = 0;
  else if (s > NL) s = NL;
  const b = s | 0;
  const lv = b + (s - b > BAYER[((y & 3) << 2) + (x & 3)] ? 1 : 0);
  return GREY[lv > NL ? NL : lv];
};

const fireVisible = sY => fire.y - sY > -fire.h - 40 && fire.y - sY < vh + 40;

const drawFire = (t, sY) => {
  const f = fire;
  const sy = f.y - sY;
  if (!fireVisible(sY)) return;
  const x0 = Math.floor((f.x - f.w) / PX);
  const x1 = Math.ceil((f.x + f.w) / PX);
  const y0 = Math.floor((sy - f.h) / PX);
  const y1 = Math.ceil((sy + 10) / PX);
  for (let y = Math.max(0, y0); y < Math.min(rows, y1); y++) {
    const Ys = y * PX;
    for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++) {
      const X = x * PX;
      const u = (X - f.x) / (f.w / 2);
      const v = (sy - Ys) / f.h;
      if (v < 0.08 && v > -0.16) {
        const lx = X - f.x;
        if (Math.abs(lx) < f.w * 0.8 && (Math.abs(lx * 0.3 - (Ys - sy)) < 3 || Math.abs(-lx * 0.3 - (Ys - sy)) < 3)) {
          buf[y * cols + x] = dither(0.22, x, y);
          continue;
        }
      }
      if (v < 0 || v > 1) continue;
      const tt = reduceMotion ? 0 : t;
      const wob = 0.5 + 0.5 * vnoise(v * 4 - tt * 4, u * 2 + 8);
      const tongues = vnoise(u * 3.5 + 20, v * 3 - tt * 3);
      const width = (1 - v) ** 0.9 * (0.5 + 0.5 * wob) * (0.7 + 0.6 * tongues);
      if (Math.abs(u) < width) {
        const core = 1 - Math.abs(u) / width;
        buf[y * cols + x] = dither(0.55 + core * 0.6 - v * 0.45, x, y);
      }
    }
  }
  if (!reduceMotion) {
    for (let k = 0; k < 18; k++) {
      const ph = (t * 0.22 + k * 0.0731) % 1;
      const px = f.x + Math.sin(k * 12.9 + t * 0.9) * 28 * ph + (hash(k, 9) - 0.5) * 44;
      const py = sy - 14 - ph * 230;
      const x = Math.round(px / PX);
      const y = Math.round(py / PX);
      if (x >= 0 && x < cols && y >= 0 && y < rows && ph < 0.75) buf[y * cols + x] = dither(1.05 - ph, x, y);
    }
  }
};

const render = t => {
  const sY = window.scrollY;
  nL = 0;
  addLight(lamp.x, lamp.y, 46, 185, 2);
  const ey = ent.midY - sY * PARALLAX;
  if (ey > -vh * 1.2) addLight(ent.cx, ey, 170, vh * 0.42, 1.15);
  const fy = fire.y - 24 - sY;
  if (fy > -fire.r * 2.5 && fy < vh + fire.r * 2.5) addLight(fire.x, fy - 60, 320, fire.r, 1.45);

  const blobs = fg
    .map(b => ({ ...b, sy: b.y - sY * 1.3, x: b.side ? vw + b.rx * 0.25 : -b.rx * 0.25 }))
    .filter(b => b.sy > -b.ry * 1.5 && b.sy < vh + b.ry * 1.5);
  const fgEdge = vw < 720 ? 44 : 80;

  const backOff = sY * PARALLAX;
  for (let y = 0; y < rows; y++) {
    const Ys = y * PX;
    const docY = sY + Ys;
    const fr = Math.floor(docY / PX);
    const br = Math.floor((backOff + Ys) / PX);
    const fOK = fr > 0 && fr < front.rows - 1 && front.ready[fr];
    const bOK = br > 0 && br < back.rows - 1 && back.ready[br];
    const wl = fOK ? WL[fr] : 0;
    const wr = fOK ? vw - WR[fr] : vw;
    const amb = 0.008 + 0.14 * Math.exp(-docY / (vh * 0.8)) + 0.16 * smooth(cTop - 100, cTop + 250, docY);
    const rowBlobs = blobs.filter(b => Math.abs(Ys - b.sy) < b.ry * 1.3);
    const rowBase = y * cols;
    const fBase = fr * cols;
    const bBase = br * cols;

    for (let x = 0; x < cols; x++) {
      const X = x * PX;

      if (rowBlobs.length && (X < fgEdge || X > vw - fgEdge)) {
        let hit = -1;
        for (const b of rowBlobs) {
          const dx = (X - b.x) / b.rx;
          const dy = (Ys - b.sy) / b.ry;
          let q = dx * dx + dy * dy;
          if (q < 1.6) {
            q *= 0.75 + 0.5 * vnoise(X / 9 + b.seed, Ys / 9);
            if (q < 1) hit = q;
          }
        }
        if (hit >= 0) {
          const d = Math.hypot(lamp.x - X, lamp.y - Ys);
          const rim = hit > 0.7 ? (hit - 0.7) * 2.4 * Math.max(0, 1 - d / 320) : 0;
          buf[rowBase + x] = dither(0.01 + rim * 0.5, x, y);
          continue;
        }
      }

      let L;
      let i;
      let aoW = 1;
      let E = 0;
      if (fOK && front.M[fBase + x]) {
        L = front;
        i = fBase + x;
      } else if (bOK) {
        L = back;
        i = bBase + x;
        E = back.E[i];
        const dmin = Math.min(X - wl, wr - X);
        aoW = 0.28 + 0.72 * smooth(0, 70, dmin);
      } else {
        buf[rowBase + x] = GREY[0];
        continue;
      }

      const H = L.H;
      let nx = (H[i - 1] - H[i + 1]) * NK;
      let ny = (H[i - cols] - H[i + cols]) * NK;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv;
      ny *= inv;

      let light = amb;
      for (let k = 0; k < nL; k++) {
        const dx = LX[k] - X;
        const dy = LY[k] - Ys;
        const d2 = dx * dx + dy * dy;
        if (d2 > LC[k]) continue;
        const q = 1 - Math.sqrt(d2) * LR[k];
        const dz = LZ[k];
        const ndl = (nx * dx + ny * dy + inv * dz) / Math.sqrt(d2 + dz * dz);
        light += LI[k] * q * Math.sqrt(q) * (ndl > 0 ? ndl * 0.85 + 0.15 : 0.15 + ndl * 0.15);
      }

      buf[rowBase + x] = dither(L.A[i] * L.O[i] * aoW * light + E, x, y);
    }
  }

  drawFire(t, sY);
  ctx.putImageData(img, 0, 0);
};

// ── shadows cast by the headings ──

const casters = [...document.querySelectorAll('h1, h2')];

const castShadows = () => {
  casters.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const dx = r.left + Math.min(r.width, 160) / 2 - lamp.x;
    const dy = r.top + r.height / 2 - lamp.y;
    const dist = Math.hypot(dx, dy) || 1;
    const len = Math.min(4 + dist / 28, 22);
    const blur = 2 + dist / 60;
    const alpha = Math.max(0.35, 0.95 - dist / 1400);
    el.style.textShadow = `${(dx / dist) * len}px ${(dy / dist) * len}px ${blur}px rgba(0, 0, 0, ${alpha}), 0 0 12px rgba(0, 0, 0, 0.8)`;
  });
};

// ── input ──

let dirty = true;

const moveTo = (x, y) => {
  target.x = x;
  target.y = y;
  if (reduceMotion) Object.assign(lamp, target);
  dirty = true;
};

window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') moveTo(e.clientX, e.clientY);
}, { passive: true });

const onTouch = e => {
  const t = e.touches[0];
  if (t) moveTo(t.clientX, t.clientY);
};
window.addEventListener('touchstart', onTouch, { passive: true });
window.addEventListener('touchmove', onTouch, { passive: true });

let resizeTimer;
window.addEventListener('resize', () => {
  if (Math.ceil(window.innerWidth / PX) + 1 === cols) {
    resizeCanvas();
    dirty = true;
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth !== vw || Math.abs(root.scrollHeight - docH) > 40) rebuild();
  }, 200);
});

window.addEventListener('load', () => {
  if (Math.abs(root.scrollHeight - docH) > 40) rebuild();
});

// ── top bar ──

const topbar = document.querySelector('.topbar');
new IntersectionObserver(([e]) => {
  topbar.classList.toggle('is-shown', !e.isIntersecting);
}, { threshold: 0.25 }).observe(document.getElementById('home'));

// ── loop: redraw on movement, and slowly for the fire when it is on screen ──

let lastFrame = 0;
let lastScroll = -1;

const loop = now => {
  const ex = target.x - lamp.x;
  const ey = target.y - lamp.y;
  if (Math.abs(ex) + Math.abs(ey) > 0.5) {
    lamp.x += ex * 0.14;
    lamp.y += ey * 0.14;
    dirty = true;
  }
  if (window.scrollY !== lastScroll) {
    lastScroll = window.scrollY;
    dirty = true;
  }
  const animateFire = !reduceMotion && fireVisible(window.scrollY) && now - lastFrame > 80;
  if (dirty || animateFire) {
    render(now / 1000);
    castShadows();
    lastFrame = now;
    dirty = false;
  }
  requestAnimationFrame(loop);
};

rebuild();
requestAnimationFrame(loop);
