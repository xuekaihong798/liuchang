import { createNoise, type Noise3 } from "@/lib/flow/noise";
import {
  buildRamp,
  fadeColor,
  findPalette,
  solidBg,
  type ColorRamp,
  type Palette,
} from "@/lib/flow/palettes";

export type FlowParams = {
  speed: number;
  /** 0 = short streaks, 1 = long lingering trails. */
  trail: number;
  paletteId: string;
  seed: number;
  paused: boolean;
};

const STRIDE = 8;
const X = 0;
const Y = 1;
const PX = 2;
const PY = 3;
const ANGLE = 4;
const JITTER = 5;
const LAYER = 6;
const SKIP = 7;

type Field = {
  noise: Noise3;
  ox: number;
  oy: number;
  bias: number;
  scale: number;
};

function fieldFromSeed(seed: number): Field {
  const s = seed >>> 0 || 1;
  return {
    noise: createNoise(s),
    ox: (s % 997) * 0.173,
    oy: ((s * 13) % 991) * 0.191,
    bias: ((s % 628) / 100) * 0.85,
    scale: 0.00058 + ((s % 100) / 100) * 0.00048,
  };
}

function fbm(noise: Noise3, x: number, y: number, z: number): number {
  const a = noise(x, y, z);
  const b = noise(x * 2.02 + 13.2, y * 2.02 + 7.7, z * 1.15);
  return a * 0.78 + b * 0.22;
}

export function createEngine(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D unavailable");

  let params: FlowParams = {
    speed: 1,
    trail: 0.74,
    paletteId: "ink",
    seed: 1,
    paused: false,
  };
  let field = fieldFromSeed(1);
  let palette: Palette = findPalette("ink");
  let ramp: ColorRamp = buildRamp(palette);
  let particles = new Float32Array(0);
  let count = 0;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let time = 0;
  let lastTick = 0;
  let raf = 0;
  let running = false;
  let appliedSeed = -1;
  let appliedPalette = "";

  let cell = 24;
  let gridCols = 0;
  let gridRows = 0;
  let flowX = new Float32Array(0);
  let flowY = new Float32Array(0);
  let tone = new Float32Array(0);

  const pointer = { x: 0, y: 0, active: false };
  const bucketsFine: number[][] = Array.from({ length: 20 }, () => []);
  const bucketsSoft: number[][] = Array.from({ length: 20 }, () => []);

  function fillSolid() {
    ctx!.fillStyle = solidBg(palette);
    ctx!.fillRect(0, 0, canvas.width, canvas.height);
  }

  function spawn(i: number, cols: number, rows: number) {
    const base = i * STRIDE;
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const jx = ((i * 17) % 100) / 100;
    const jy = ((i * 43) % 100) / 100;
    const x = ((col + jx) / cols) * cssW;
    const y = ((row + jy) / rows) * cssH;
    particles[base + X] = x;
    particles[base + Y] = y;
    particles[base + PX] = x;
    particles[base + PY] = y;
    particles[base + ANGLE] = 0;
    particles[base + JITTER] = ((i * 97) % 1000) / 1000;
    particles[base + LAYER] = i % 4 === 0 ? 1 : 0;
    particles[base + SKIP] = 1;
  }

  function allocate() {
    const area = Math.max(1, cssW * cssH);
    const density = area < 600_000 ? 0.005 : 0.00255;
    count = Math.max(640, Math.min(5600, Math.round(area * density)));
    particles = new Float32Array(count * STRIDE);
    const aspect = cssW / Math.max(1, cssH);
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    const rows = Math.max(1, Math.ceil(count / cols));
    for (let i = 0; i < count; i++) spawn(i, cols, rows);
  }

  function respawnAt(i: number) {
    const base = i * STRIDE;
    const x = Math.random() * cssW;
    const y = Math.random() * cssH;
    particles[base + X] = x;
    particles[base + Y] = y;
    particles[base + PX] = x;
    particles[base + PY] = y;
    particles[base + SKIP] = 1;
  }

  function resize(keepImage: boolean) {
    const rect = canvas.getBoundingClientRect();
    const nextW = Math.max(1, rect.width);
    const nextH = Math.max(1, rect.height);
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.floor(nextW * nextDpr));
    const bh = Math.max(1, Math.floor(nextH * nextDpr));
    if (canvas.width === bw && canvas.height === bh && cssW > 0) return;

    let snapshot: HTMLCanvasElement | null = null;
    if (keepImage && canvas.width > 0 && canvas.height > 0) {
      snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
    }

    const prevW = cssW;
    const prevH = cssH;
    canvas.width = bw;
    canvas.height = bh;
    cssW = nextW;
    cssH = nextH;
    dpr = nextDpr;
    gridCols = 0;

    if (snapshot && prevW > 0 && prevH > 0 && count > 0) {
      ctx!.drawImage(snapshot, 0, 0, bw, bh);
      const sx = nextW / prevW;
      const sy = nextH / prevH;
      for (let i = 0; i < count; i++) {
        const b = i * STRIDE;
        particles[b + X]! *= sx;
        particles[b + Y]! *= sy;
        particles[b + PX]! *= sx;
        particles[b + PY]! *= sy;
      }
      return;
    }

    fillSolid();
    allocate();
  }

  function applyIdentity() {
    if (params.seed !== appliedSeed) {
      field = fieldFromSeed(params.seed);
      time = 0;
      appliedSeed = params.seed;
      palette = findPalette(params.paletteId);
      appliedPalette = params.paletteId;
      ramp = buildRamp(palette);
      gridCols = 0;
      if (cssW > 0) {
        fillSolid();
        allocate();
      }
      return;
    }
    if (params.paletteId !== appliedPalette) {
      palette = findPalette(params.paletteId);
      appliedPalette = params.paletteId;
      ramp = buildRamp(palette);
      if (cssW > 0) fillSolid();
    }
  }

  function rebuildGrid() {
    cell = Math.max(18, Math.min(cssW, cssH) / 30);
    const cols = Math.ceil(cssW / cell) + 2;
    const rows = Math.ceil(cssH / cell) + 2;
    if (cols !== gridCols || rows !== gridRows) {
      gridCols = cols;
      gridRows = rows;
      flowX = new Float32Array(cols * rows);
      flowY = new Float32Array(cols * rows);
      tone = new Float32Array(cols * rows);
    }
    const z = time * 0.00002 * (0.5 + params.speed * 0.22);
    const { noise, ox, oy, bias, scale } = field;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const wx = gx * cell;
        const wy = gy * cell;
        const n = fbm(noise, wx * scale + ox, wy * scale + oy, z);
        const ang = n * Math.PI * 2 + bias;
        const i = gy * cols + gx;
        flowX[i] = Math.cos(ang);
        flowY[i] = Math.sin(ang);
        const cn = noise(wx * scale * 0.48 + ox + 48, wy * scale * 0.48 + oy + 9, z * 0.35);
        tone[i] = Math.min(1, Math.max(0, (cn + 1) * 0.5));
      }
    }
  }

  function sample(x: number, y: number) {
    let gx = x / cell;
    let gy = y / cell;
    let x0 = Math.floor(gx);
    let y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x0 > gridCols - 2) x0 = gridCols - 2;
    if (y0 > gridRows - 2) y0 = gridRows - 2;
    const i00 = y0 * gridCols + x0;
    const i10 = i00 + 1;
    const i01 = i00 + gridCols;
    const i11 = i01 + 1;
    const s00 = (1 - tx) * (1 - ty);
    const s10 = tx * (1 - ty);
    const s01 = (1 - tx) * ty;
    const s11 = tx * ty;
    return {
      vx: flowX[i00]! * s00 + flowX[i10]! * s10 + flowX[i01]! * s01 + flowX[i11]! * s11,
      vy: flowY[i00]! * s00 + flowY[i10]! * s10 + flowY[i01]! * s01 + flowY[i11]! * s11,
      tone: tone[i00]! * s00 + tone[i10]! * s10 + tone[i01]! * s01 + tone[i11]! * s11,
    };
  }

  function simulate(dt: number) {
    rebuildGrid();
    const follow = 0.12 + Math.min(params.speed, 2.6) * 0.05;
    const speed = params.speed;
    const px = pointer.x;
    const py = pointer.y;
    const stirring = pointer.active;
    const margin = 12;
    const { bias } = field;

    for (let c = 0; c < 20; c++) {
      bucketsFine[c]!.length = 0;
      bucketsSoft[c]!.length = 0;
    }

    for (let i = 0; i < count; i++) {
      const b = i * STRIDE;
      let x = particles[b + X]!;
      let y = particles[b + Y]!;
      const flow = sample(x, y);
      const target = Math.atan2(flow.vy, flow.vx);
      const prev = particles[b + ANGLE]!;
      let da = target - prev;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const angle = prev + da * follow;
      particles[b + ANGLE] = angle;

      let vx = Math.cos(angle);
      let vy = Math.sin(angle);
      vx += Math.cos(bias) * 0.08;
      vy += Math.sin(bias) * 0.08;

      if (stirring) {
        const dx = x - px;
        const dy = y - py;
        const dist = Math.hypot(dx, dy);
        const radius = 180;
        if (dist < radius && dist > 0.001) {
          const inf = (1 - dist / radius) ** 2;
          vx += (-dy / dist) * inf * 2.8;
          vy += (dx / dist) * inf * 2.8;
          vx += (-dx / dist) * inf * 0.45;
          vy += (-dy / dist) * inf * 0.45;
        }
      }

      const mag = Math.hypot(vx, vy) || 1;
      const jitter = particles[b + JITTER]!;
      const stepLen = (0.95 + jitter * 0.8) * speed * (dt / 16.67);
      const prevX = x;
      const prevY = y;
      x += (vx / mag) * stepLen;
      y += (vy / mag) * stepLen;

      if (x < -margin || y < -margin || x > cssW + margin || y > cssH + margin) {
        respawnAt(i);
        continue;
      }

      particles[b + PX] = prevX;
      particles[b + PY] = prevY;
      particles[b + X] = x;
      particles[b + Y] = y;

      if (particles[b + SKIP]! > 0) {
        particles[b + SKIP] = 0;
        continue;
      }
      if (Math.hypot(x - prevX, y - prevY) > 16) continue;

      const ci = Math.min(19, Math.max(0, (flow.tone * 20) | 0));
      const bucket = particles[b + LAYER]! > 0 ? bucketsSoft[ci]! : bucketsFine[ci]!;
      bucket.push(i);
    }
  }

  function draw() {
    const fade = 0.17 * Math.pow(0.038, params.trail);
    ctx!.globalCompositeOperation = "source-over";
    ctx!.fillStyle = fadeColor(palette, fade);
    ctx!.fillRect(0, 0, canvas.width, canvas.height);
    ctx!.globalCompositeOperation = palette.composite;
    ctx!.lineCap = "round";
    strokeBuckets(bucketsSoft, ramp.soft, 2.35 * dpr);
    strokeBuckets(bucketsFine, ramp.fine, 1.15 * dpr);
  }

  function strokeBuckets(buckets: number[][], colors: string[], width: number) {
    ctx!.lineWidth = width;
    for (let c = 0; c < buckets.length; c++) {
      const list = buckets[c]!;
      if (list.length === 0) continue;
      ctx!.strokeStyle = colors[c]!;
      ctx!.beginPath();
      for (let k = 0; k < list.length; k++) {
        const b = list[k]! * STRIDE;
        ctx!.moveTo(particles[b + PX]! * dpr, particles[b + PY]! * dpr);
        ctx!.lineTo(particles[b + X]! * dpr, particles[b + Y]! * dpr);
      }
      ctx!.stroke();
    }
  }

  function frame(now: number) {
    if (!running) return;
    if (!params.paused && document.visibilityState !== "hidden") {
      const dt = lastTick === 0 ? 16.67 : Math.min(34, now - lastTick);
      lastTick = now;
      time += dt;
      if (cssW > 1 && count > 0) {
        simulate(dt);
        draw();
      }
    } else {
      lastTick = 0;
    }
    raf = requestAnimationFrame(frame);
  }

  function onPointer(event: PointerEvent, active: boolean) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = active;
  }

  function onMouseMove(event: PointerEvent) {
    if (event.pointerType === "mouse") onPointer(event, true);
    else if (pointer.active) onPointer(event, true);
  }

  function onDown(event: PointerEvent) {
    if (event.pointerType !== "mouse") {
      canvas.setPointerCapture(event.pointerId);
      onPointer(event, true);
    }
  }

  function onUp(event: PointerEvent) {
    if (event.pointerType !== "mouse") pointer.active = false;
  }

  function onLeave(event: PointerEvent) {
    if (event.pointerType === "mouse") pointer.active = false;
  }

  const ro = new ResizeObserver(() => resize(true));

  return {
    setParams(next: FlowParams) {
      params = next;
      applyIdentity();
    },
    start() {
      if (running) return;
      running = true;
      resize(false);
      applyIdentity();
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMouseMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      canvas.addEventListener("pointerleave", onLeave);
      ro.observe(canvas);
      lastTick = 0;
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMouseMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    },
  };
}
