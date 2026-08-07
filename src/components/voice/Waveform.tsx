'use client';

/**
 * THE WAVEFORM.
 *
 * A large, calm bar spectrum driven by the live mic level (0..1). It reads the
 * level from a ref updated every frame by the transport, so React never
 * re-renders on audio — the canvas animates itself at the display's refresh
 * rate. Under `prefers-reduced-motion` it collapses to a single static level
 * bar and runs no animation loop at all. All browser access is inside effects,
 * so it renders to inert markup on the server.
 */
import { useEffect, useRef } from 'react';

const BARS = 48;

export function Waveform({ level, active }: { level: number; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(0);
  levelRef.current = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    const phases = Array.from({ length: BARS }, (_, i) => i * 0.5);

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (t: number): void => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);
      const mid = h / 2;
      const gap = 3;
      const barW = Math.max(2, (w - gap * (BARS - 1)) / BARS);
      const lvl = levelRef.current;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#2f6bff');
      grad.addColorStop(0.5, active ? '#7aa8ff' : '#3a4660');
      grad.addColorStop(1, '#2f6bff');
      ctx.fillStyle = grad;
      for (let i = 0; i < BARS; i++) {
        // A soft bell so the centre bars swing widest, plus a per-bar wobble.
        const bell = Math.sin((i / (BARS - 1)) * Math.PI);
        const wobble = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t / 260 + phases[i]!);
        const amp = (0.06 + lvl * 0.94) * bell * (0.35 + 0.65 * wobble);
        const barH = Math.max(barW, amp * (h - 6));
        const x = i * (barW + gap);
        const y = mid - barH / 2;
        const r = barW / 2;
        ctx.beginPath();
        ctx.roundRect?.(x, y, barW, barH, r);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    if (reduce) {
      draw(0);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="h-24 w-full sm:h-28"
      data-testid="waveform"
      role="img"
      aria-label={active ? 'Listening' : 'Microphone idle'}
    />
  );
}
