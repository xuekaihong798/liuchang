export type Rgb = readonly [number, number, number];

export type Palette = {
  id: string;
  name: string;
  bg: Rgb;
  colors: readonly Rgb[];
  /** Stroke opacity for the fine ribbon layer. */
  alpha: number;
  softAlpha: number;
  composite: GlobalCompositeOperation;
};

export const PALETTES: readonly Palette[] = [
  {
    id: "ink",
    name: "墨金",
    bg: [14, 12, 10],
    colors: [
      [248, 240, 224],
      [228, 186, 108],
      [176, 104, 58],
      [96, 62, 42],
    ],
    alpha: 0.22,
    softAlpha: 0.1,
    composite: "source-over",
  },
  {
    id: "aurora",
    name: "极光",
    bg: [6, 9, 16],
    colors: [
      [226, 255, 246],
      [112, 220, 198],
      [132, 170, 255],
      [214, 196, 255],
    ],
    alpha: 0.16,
    softAlpha: 0.08,
    composite: "lighter",
  },
  {
    id: "ember",
    name: "余烬",
    bg: [16, 8, 6],
    colors: [
      [255, 236, 216],
      [255, 178, 112],
      [255, 98, 56],
      [188, 40, 32],
    ],
    alpha: 0.2,
    softAlpha: 0.09,
    composite: "lighter",
  },
  {
    id: "glacier",
    name: "冰川",
    bg: [6, 14, 18],
    colors: [
      [240, 250, 252],
      [170, 222, 234],
      [86, 164, 182],
      [206, 236, 224],
    ],
    alpha: 0.2,
    softAlpha: 0.09,
    composite: "source-over",
  },
  {
    id: "nocturne",
    name: "夜航",
    bg: [7, 7, 9],
    colors: [
      [255, 255, 255],
      [214, 214, 220],
      [148, 148, 160],
      [232, 232, 238],
    ],
    alpha: 0.18,
    softAlpha: 0.08,
    composite: "source-over",
  },
  {
    id: "xuan",
    name: "宣纸",
    bg: [232, 226, 214],
    colors: [
      [26, 22, 18],
      [64, 48, 36],
      [112, 74, 46],
      [36, 48, 56],
    ],
    alpha: 0.2,
    softAlpha: 0.09,
    composite: "source-over",
  },
];

export const DEFAULT_PALETTE_ID = "ink";

export function findPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function paletteGradient(palette: Palette): string {
  const stops = palette.colors
    .map((c) => `rgb(${c[0]} ${c[1]} ${c[2]})`)
    .join(", ");
  return `linear-gradient(90deg, ${stops})`;
}

const RAMP_STEPS = 20;

export type ColorRamp = {
  fine: string[];
  soft: string[];
};

export function buildRamp(palette: Palette): ColorRamp {
  const fine: string[] = [];
  const soft: string[] = [];
  const colors = palette.colors;
  const segments = colors.length - 1;
  for (let i = 0; i < RAMP_STEPS; i++) {
    const t = i / (RAMP_STEPS - 1);
    const pos = t * segments;
    const i0 = Math.min(segments - 1, Math.floor(pos));
    const f = pos - i0;
    const a = colors[i0]!;
    const b = colors[i0 + 1]!;
    const r = Math.round(a[0] + (b[0] - a[0]) * f);
    const g = Math.round(a[1] + (b[1] - a[1]) * f);
    const bl = Math.round(a[2] + (b[2] - a[2]) * f);
    fine.push(`rgba(${r},${g},${bl},${palette.alpha})`);
    soft.push(`rgba(${r},${g},${bl},${palette.softAlpha})`);
  }
  return { fine, soft };
}

export function fadeColor(palette: Palette, alpha: number): string {
  const [r, g, b] = palette.bg;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function solidBg(palette: Palette): string {
  const [r, g, b] = palette.bg;
  return `rgb(${r},${g},${b})`;
}
