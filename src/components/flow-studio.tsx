import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, Pause, Play, Shuffle } from "lucide-react";
import { createEngine, type FlowParams } from "@/lib/flow/engine";
import { DEFAULT_PALETTE_ID, PALETTES, findPalette, paletteGradient } from "@/lib/flow/palettes";

const STORAGE_KEY = "flowfield-settings";

type Saved = {
  speed: number;
  trail: number;
  paletteId: string;
  seed: number;
};

function randomSeed() {
  return 100000 + Math.floor(Math.random() * 900000);
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Saved>;
    if (
      typeof data.speed !== "number" ||
      typeof data.trail !== "number" ||
      typeof data.paletteId !== "string" ||
      typeof data.seed !== "number"
    ) {
      return null;
    }
    if (!PALETTES.some((p) => p.id === data.paletteId)) return null;
    return {
      speed: clamp(data.speed, 0.25, 2.6),
      trail: clamp(data.trail, 0, 1),
      paletteId: data.paletteId,
      seed: Math.round(data.seed),
    };
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function trailLabel(trail: number) {
  if (trail < 0.34) return "短";
  if (trail < 0.67) return "中";
  return "长";
}

export function FlowStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const paramsRef = useRef<FlowParams>({
    speed: 1,
    trail: 0.74,
    paletteId: DEFAULT_PALETTE_ID,
    seed: 0,
    paused: false,
  });

  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trail, setTrail] = useState(0.74);
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);
  const [seed, setSeed] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(true);
  const [hint, setHint] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  paramsRef.current = {
    speed,
    trail,
    paletteId,
    seed: seed ?? 0,
    paused,
  };

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setSpeed(saved.speed);
      setTrail(saved.trail);
      setPaletteId(saved.paletteId);
      setSeed(saved.seed);
    } else {
      setSeed(randomSeed());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || seed == null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createEngine(canvas);
    engineRef.current = engine;
    engine.setParams(paramsRef.current);
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // Engine is created once; later param changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || seed == null) return;
    engineRef.current?.setParams(paramsRef.current);
    const payload: Saved = { speed, trail, paletteId, seed };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [ready, speed, trail, paletteId, seed, paused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPaused((v) => !v);
      } else if (event.key === "r" || event.key === "R") {
        setSeed(randomSeed());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(false), 6400);
    return () => window.clearTimeout(id);
  }, [hint]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(id);
  }, [notice]);

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas || seed == null) return;
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setNotice("导出失败");
        return;
      }
      const file = new File([blob], `flowfield-${seed}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "流场" });
          setNotice("已打开分享");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("已导出 PNG");
    }, "image/png");
  }

  const palette = findPalette(paletteId);

  return (
    <main className="flow-root">
      <canvas
        ref={canvasRef}
        className="flow-canvas"
        aria-label="流场生成画布"
        onPointerDown={() => setHint(false)}
      />

      <header className="flow-mark">
        <p className="flow-title">流场</p>
        <p className="flow-seed tabular-nums">
          种子 {seed == null ? "——" : String(seed)}
          {paused ? <span className="flow-paused">已暂停</span> : null}
        </p>
        {hint ? <p className="flow-hint">按住画面，搅动流向</p> : null}
      </header>

      {notice ? (
        <p className="flow-notice" role="status">
          {notice}
        </p>
      ) : null}

      {open ? (
        <section className="flow-panel" aria-label="画面调节">
          <div className="flow-panel-head">
            <h1 className="flow-panel-title">画面</h1>
            <button type="button" className="flow-text-btn" onClick={() => setOpen(false)}>
              收起
              <ChevronDown aria-hidden="true" />
            </button>
          </div>

          <label className="flow-slider">
            <span className="flow-slider-label">
              速度
              <span className="tabular-nums">{speed.toFixed(1)}×</span>
            </span>
            <input
              type="range"
              min={0.25}
              max={2.6}
              step={0.05}
              value={speed}
              aria-valuetext={`${speed.toFixed(1)} 倍`}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>

          <label className="flow-slider">
            <span className="flow-slider-label">
              轨迹
              <span>{trailLabel(trail)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={trail}
              aria-valuetext={trailLabel(trail)}
              onChange={(e) => setTrail(Number(e.target.value))}
            />
          </label>

          <div className="flow-palettes">
            <p className="flow-slider-label">配色</p>
            <div className="flow-swatches" role="radiogroup" aria-label="配色方案">
              {PALETTES.map((item) => {
                const selected = item.id === palette.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "flow-swatch is-selected" : "flow-swatch"}
                    onClick={() => setPaletteId(item.id)}
                  >
                    <span
                      className="flow-swatch-chip"
                      style={{ background: paletteGradient(item) }}
                    />
                    <span className="flow-swatch-name">{item.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flow-actions">
            <button type="button" className="flow-btn" onClick={() => setPaused((v) => !v)}>
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              {paused ? "继续" : "暂停"}
            </button>
            <button type="button" className="flow-btn" onClick={() => setSeed(randomSeed())}>
              <Shuffle aria-hidden="true" />
              随机种子
            </button>
            <button type="button" className="flow-btn flow-btn-primary" onClick={exportPng}>
              <Download aria-hidden="true" />
              导出 PNG
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className="flow-pill" onClick={() => setOpen(true)}>
          <ChevronUp aria-hidden="true" />
          调节画面
        </button>
      )}
    </main>
  );
}
